import OpenAI from 'openai';
import { Langfuse } from 'langfuse';
import type { BoardObject } from '@collabboard/shared';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Langfuse client for observability
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
  secretKey: process.env.LANGFUSE_SECRET_KEY || '',
  baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
});

// Tool definitions for OpenAI function calling
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'create_sticky_note',
      description: 'Create a new sticky note on the board',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text content of the sticky note',
          },
          color: {
            type: 'string',
            enum: ['#ffeb3b', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0'],
            description: 'The color of the sticky note',
          },
          x: {
            type: 'number',
            description: 'X position on the board',
          },
          y: {
            type: 'number',
            description: 'Y position on the board',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'organize_board',
      description: 'Organize existing objects on the board',
      parameters: {
        type: 'object',
        properties: {
          strategy: {
            type: 'string',
            enum: ['grid', 'color', 'cluster'],
            description: 'The organization strategy to use',
          },
        },
        required: ['strategy'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_board',
      description: 'Analyze the current board state and provide insights',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

export class AIService {
  private trace: any = null;

  async processCommand(
    command: string, 
    boardObjects: BoardObject[],
    userId: string
  ): Promise<{
    message: string;
    actions?: any[];
    error?: string;
  }> {
    try {
      // Start a new Langfuse trace
      this.trace = langfuse.trace({
        name: 'board-ai-command',
        userId,
        input: { command, objectCount: boardObjects.length },
      });

      // Create system message with board context
      const systemMessage = `You are an AI assistant helping users manage their collaborative whiteboard. 
The board currently has ${boardObjects.length} objects.
Sticky notes: ${boardObjects.filter(o => o.type === 'sticky').length}
Shapes: ${boardObjects.filter(o => ['rectangle', 'circle', 'line'].includes(o.type)).length}

Available tools:
- create_sticky_note: Create new sticky notes
- organize_board: Arrange objects in patterns
- analyze_board: Provide insights about the board

Be helpful and concise in your responses.`;

      // Call OpenAI with function calling
      const generation = this.trace.generation({
        name: 'openai-completion',
        model: 'gpt-4o-mini',
        input: { command },
      });

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: command }
        ],
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 500,
      });

      generation.end({
        output: completion.choices[0].message,
        usage: {
          promptTokens: completion.usage?.prompt_tokens,
          completionTokens: completion.usage?.completion_tokens,
        },
      });

      const response = completion.choices[0].message;
      const toolCalls = response.tool_calls || [];
      
      // Process tool calls and generate actions
      const actions: any[] = [];
      for (const toolCall of toolCalls) {
        if ('function' in toolCall) {
          const args = JSON.parse(toolCall.function.arguments);
          actions.push({
            tool: toolCall.function.name,
            arguments: args,
          });
        }
      }

      // Update trace with success
      this.trace.update({
        output: { message: response.content, actionCount: actions.length },
        level: 'DEFAULT',
      });

      await langfuse.flush();

      return {
        message: response.content || 'I can help you with that!',
        actions,
      };
    } catch (error) {
      console.error('AI Service error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Update trace with error
      if (this.trace) {
        this.trace.update({
          output: { error: errorMessage },
          level: 'ERROR',
        });
        await langfuse.flush();
      }

      return {
        message: 'Sorry, I encountered an error processing your request.',
        error: errorMessage,
      };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      // Simple test to check if OpenAI API key is valid
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "connected"' }],
        max_tokens: 10,
      });

      console.log('OpenAI connection test successful:', completion.choices[0].message.content);
      return true;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }
}