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
const zIndexParam = {
  type: 'number' as const,
  description: 'Z-order index (0–100). Lower = further back, higher = in front. Example: background/ground=5, large body parts=20, medium parts=35, head=45, small details like eyes/buttons=60, accessories on top=75.',
};

const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_sticky_note',
      description: 'Create a sticky note, positioned by x/y offset from the center of the user\'s screen.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The text content of the sticky note' },
          color: { type: 'string', enum: ['#ffeb3b', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0'], description: 'The color of the sticky note' },
          x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
          y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
          zIndex: zIndexParam,
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_rectangle',
      description: 'Create a rectangle, positioned by x/y offset from the center of the user\'s screen.',
      parameters: {
        type: 'object',
        properties: {
          color: { type: 'string', description: 'Fill color (hex code)' },
          x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
          y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
          width: { type: 'number', description: 'Width in px (default 120)' },
          height: { type: 'number', description: 'Height in px (default 80)' },
          zIndex: zIndexParam,
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_circle',
      description: 'Create a circle, positioned by x/y offset from the center of the user\'s screen.',
      parameters: {
        type: 'object',
        properties: {
          color: { type: 'string', description: 'Fill color (hex code)' },
          x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
          y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
          size: { type: 'number', description: 'Diameter in px (default 80)' },
          zIndex: zIndexParam,
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_line',
      description: 'Create a line, positioned by x/y offset from the center of the user\'s screen.',
      parameters: {
        type: 'object',
        properties: {
          color: { type: 'string', description: 'Stroke color (hex code)' },
          x: { type: 'number', description: 'Horizontal offset from screen center (px) for line start.' },
          y: { type: 'number', description: 'Vertical offset from screen center (px) for line start.' },
          width: { type: 'number', description: 'Horizontal extent in px (default 200)' },
          height: { type: 'number', description: 'Vertical extent in px (default 0 for horizontal)' },
          zIndex: zIndexParam,
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
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
    type: 'function',
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
    userId: string,
    history: { role: string; content: string }[] = []
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

POSITIONING: x/y offsets are relative to the CENTER of the user's screen. (0,0) = screen center.
- x: positive = right, negative = left. y: positive = down, negative = up.
- x/y is the TOP-LEFT corner of the object's bounding box.
- The screen is roughly 1200px wide and 800px tall, so offsets can range from -600 to 600 horizontally and -400 to 400 vertically.

CENTERING & ALIGNMENT (CRITICAL):
- To visually center an object on the vertical axis (x=0 line), set x = -(width/2) or x = -(size/2).
- Example: a circle with size=200 centered horizontally → x = -100.
- To center a SMALL object on a LARGER object: smallX = largeX + (largeSize - smallSize) / 2.
- Example: eye (size=20) on head (size=150, x=-75): eyeX = -75 + (150 - 20) / 2 = -10.
- For ALL scenes: pick a single vertical center line and align every object's x to it using the formula above. Symmetric features (eyes, arms) should be equally offset left and right from center.
- ALWAYS compute the math explicitly before placing objects. Do not eyeball positions.

SPACING: When placing multiple objects, you MUST leave enough space so they do NOT overlap unintentionally.
- A circle with size=200 occupies 200x200px from its top-left corner.
- To stack circles vertically with slight overlap (snowman style): nextY = prevY + prevSize - overlapAmount.
- For side-by-side objects, offset x by at least the width of the left object plus a gap.
- Think through your layout BEFORE making tool calls. Sketch the math: top-left corner + size = bottom-right corner.

LAYERING: Use the zIndex parameter (0–100) to control which objects appear in front. Lower = behind, higher = in front.
- 0–10: background surfaces (floors, rinks, sky, tables)
- 15–30: large body parts (torso, base circles)
- 35–50: medium parts (mid sections, heads)
- 55–70: small details (eyes, nose, buttons, mouths)
- 75–100: top accessories (hats, bows, items held)
- Always set zIndex for EVERY object. Each object should have a UNIQUE zIndex so stacking order is unambiguous.

Choose colors that make sense (e.g. white for snow, brown for wood, blue for ice). Be helpful and concise.`;

      // Call OpenAI with function calling
      const generation = this.trace.generation({
        name: 'openai-completion',
        model: 'gpt-4o',
        input: { command },
      });

      // Build messages with conversation history
      const priorMessages: OpenAI.ChatCompletionMessageParam[] = history
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMessage },
          ...priorMessages,
          { role: 'user', content: command }
        ],
        tools,
        tool_choice: 'auto',
        temperature: 0.7,
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
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
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
