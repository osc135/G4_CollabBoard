import Anthropic from '@anthropic-ai/sdk';
import { Langfuse } from 'langfuse';
import type { BoardObject } from '@collabboard/shared';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// --- Input Filter: reject off-topic messages before they reach the AI ---
const BOARD_KEYWORDS = [
  // actions
  'create', 'draw', 'make', 'add', 'place', 'put', 'build', 'design', 'generate', 'render', 'spawn', 'paint', 'sketch', 'compose',
  'move', 'organize', 'arrange', 'align', 'layout', 'sort', 'group', 'cluster',
  'delete', 'remove', 'clear', 'clean',
  'resize', 'scale', 'rotate', 'flip',
  'color', 'colour', 'change color', 'recolor',
  // objects
  'sticky', 'note', 'notes', 'rectangle', 'rect', 'circle', 'line', 'shape',
  'square', 'box', 'oval', 'arrow', 'star', 'triangle',
  'text', 'label', 'card',
  // board concepts
  'board', 'canvas', 'whiteboard', 'workspace',
  'objects', 'items', 'elements',
  'grid', 'row', 'column', 'stack', 'scatter',
  'diagram', 'chart', 'flowchart', 'mindmap', 'mind map',
  // scenes / drawing
  'picture', 'scene', 'drawing', 'illustration', 'art',
  'snowman', 'house', 'tree', 'flower', 'face', 'animal', 'car', 'robot',
  'person', 'sun', 'moon', 'landscape', 'building',
  'dragon', 'cat', 'dog', 'fish', 'bird', 'monster', 'castle', 'mountain',
  'pond', 'lake', 'river', 'ocean', 'sky', 'forest', 'city', 'town',
  'skating', 'swimming', 'flying', 'running', 'dancing', 'sitting',
  // meta
  'help', 'what can you', 'how do i', 'can you',
  'analyze', 'analyse', 'summary', 'describe', 'count',
  'undo', 'redo',
  'layer', 'zindex', 'z-index', 'front', 'back', 'behind', 'overlap',
];

// Patterns that strongly indicate off-topic / prompt injection
const REJECTION_PATTERNS = [
  // prompt injection attempts
  /ignore\s+(your|all|previous|prior|above)\s+(instructions|rules|prompt)/i,
  /you\s+are\s+now\s+/i,
  /pretend\s+(you('re|are)|to\s+be)/i,
  /act\s+as\s+(a|an|if)/i,
  /from\s+now\s+on/i,
  /new\s+instructions?/i,
  /override\s+(your|the|system)/i,
  /disregard\s+(your|the|all|previous)/i,
  /forget\s+(your|all|everything|previous)/i,
  /system\s*prompt/i,
  /repeat\s+(your|the)\s+(instructions|prompt|rules)/i,
  /what\s+(are|were)\s+your\s+(instructions|rules|prompt)/i,
  /reveal\s+(your|the)\s+(prompt|instructions|system)/i,
  // jailbreak patterns
  /do\s+anything\s+now/i,
  /DAN\s+mode/i,
  /jailbreak/i,
  /developer\s+mode/i,
];

const REFUSAL_MESSAGE = "I'm your whiteboard assistant — I can only help with creating and organizing objects on the board! Try asking me to draw something, create sticky notes, or organize your board.";

function isBoardRelated(input: string): { allowed: boolean; reason?: string } {
  const lower = input.toLowerCase().trim();

  // Always reject prompt injection attempts
  for (const pattern of REJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { allowed: false, reason: 'prompt_injection' };
    }
  }

  // Very short messages (1-2 words) that aren't greetings — let them through
  // so the AI can ask "What would you like me to create?"
  if (lower.split(/\s+/).length <= 3) {
    // Check if it's a greeting or simple board query — allow it
    if (/^(hi|hey|hello|sup|yo|thanks|thank you|ok|okay|yes|no|sure|please|help)/.test(lower)) {
      return { allowed: true };
    }
  }

  // Check if any board keyword is present
  const hasBoardKeyword = BOARD_KEYWORDS.some(keyword => lower.includes(keyword));
  if (hasBoardKeyword) {
    return { allowed: true };
  }

  // If the message is a question with no board keywords, likely off-topic
  // e.g. "What is the capital of France?"
  if (/^(what|who|when|where|why|how|is|are|was|were|do|does|did|can|could|would|should|tell me|explain)\b/i.test(lower) && !hasBoardKeyword) {
    return { allowed: false, reason: 'off_topic_question' };
  }

  // For anything else that's longer and has no board keywords, reject
  if (lower.split(/\s+/).length > 5 && !hasBoardKeyword) {
    return { allowed: false, reason: 'off_topic' };
  }

  // Default: allow ambiguous short messages through (the system prompt will handle them)
  return { allowed: true };
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Langfuse client for observability
const langfuse = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
  secretKey: process.env.LANGFUSE_SECRET_KEY || '',
  baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
});

// Tool definitions for Anthropic tool use
const zIndexDescription = 'Z-order index (0–100). Lower = further back, higher = in front. Example: background/ground=5, large body parts=20, medium parts=35, head=45, small details like eyes/buttons=60, accessories on top=75.';

const tools: Anthropic.Tool[] = [
  {
    name: 'create_sticky_note',
    description: 'Create a sticky note, positioned by x/y offset from the center of the user\'s screen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content of the sticky note' },
        color: { type: 'string', enum: ['#ffeb3b', '#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0'], description: 'The color of the sticky note' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_rectangle',
    description: 'Create a rectangle, positioned by x/y offset from the center of the user\'s screen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        color: { type: 'string', description: 'Fill color (hex code)' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
        width: { type: 'number', description: 'Width in px (default 120)' },
        height: { type: 'number', description: 'Height in px (default 80)' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: [],
    },
  },
  {
    name: 'create_circle',
    description: 'Create a circle, positioned by x/y offset from the center of the user\'s screen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        color: { type: 'string', description: 'Fill color (hex code)' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
        size: { type: 'number', description: 'Diameter in px (default 80)' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: [],
    },
  },
  {
    name: 'create_line',
    description: 'Create a line, positioned by x/y offset from the center of the user\'s screen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        color: { type: 'string', description: 'Stroke color (hex code)' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px) for line start.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px) for line start.' },
        width: { type: 'number', description: 'Horizontal extent in px (default 200)' },
        height: { type: 'number', description: 'Vertical extent in px (default 0 for horizontal)' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: [],
    },
  },
  {
    name: 'create_text',
    description: 'Create a text label on the board. Use this for any readable text, titles, labels, captions, or words. Much better than trying to draw letters with shapes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: 'The text content to display' },
        fontSize: { type: 'number', description: 'Font size in px (default 48). Use 24-32 for labels, 48-72 for titles, 96+ for huge headings.' },
        color: { type: 'string', description: 'Text color (hex code, default #1a1a1a)' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
        width: { type: 'number', description: 'Max width for text wrapping (optional, text auto-sizes if omitted)' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: ['text'],
    },
  },
  {
    name: 'move_object',
    description: 'Move a single existing object to a new position. x/y are offsets from the center of the user\'s screen (same coordinate system as create tools). Use for repositioning one or a few specific objects — NOT for bulk organization (use organize_board instead).',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The ID of the object to move (from the CURRENT OBJECTS list)' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
      },
      required: ['id', 'x', 'y'],
    },
  },
  {
    name: 'organize_board',
    description: 'Rearrange ALL objects on the board into a clean layout. Use this whenever the user asks to organize, arrange, tidy, sort, or lay out their board. This moves every object — much better than calling move_object many times.',
    input_schema: {
      type: 'object' as const,
      properties: {
        strategy: {
          type: 'string',
          enum: ['grid', 'by_type', 'by_color'],
          description: 'Layout strategy: "grid" = neat rows/columns, "by_type" = group stickies/rectangles/circles together, "by_color" = group by color',
        },
      },
      required: ['strategy'],
    },
  },
  {
    name: 'delete_object',
    description: 'Delete a specific object from the board by its ID',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The ID of the object to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'clear_board',
    description: 'Remove all objects from the board',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_board',
    description: 'Analyze the current board state and provide insights',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'update_object',
    description: 'Edit properties of a single existing object. Only the provided fields will be changed; omitted fields stay the same.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'The ID of the object to update (from the CURRENT OBJECTS list)' },
        color: { type: 'string', description: 'New fill/stroke color (hex code)' },
        text: { type: 'string', description: 'New text content (sticky notes and textbox only)' },
        fontSize: { type: 'number', description: 'New font size in px (textbox only)' },
        width: { type: 'number', description: 'New width in px' },
        height: { type: 'number', description: 'New height in px' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: ['id'],
    },
  },
  {
    name: 'bulk_update_objects',
    description: 'Update multiple objects at once. Two modes: (1) Use "filter" to update ALL objects matching a type — best for "change all stickies to blue". (2) Use "updates" array with specific IDs — best when each object gets a different value. You can use both together: filter applies first, then individual updates override.',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: {
          type: 'object',
          description: 'Apply the same changes to ALL objects matching this filter. Much better than listing every ID.',
          properties: {
            type: { type: 'string', enum: ['sticky', 'textbox', 'rectangle', 'circle', 'line'], description: 'Only update objects of this type' },
            color: { type: 'string', description: 'New fill/stroke color (hex code) to apply to all matched objects' },
            text: { type: 'string', description: 'New text content to apply to all matched objects' },
            width: { type: 'number', description: 'New width to apply to all matched objects' },
            height: { type: 'number', description: 'New height to apply to all matched objects' },
            zIndex: { type: 'number', description: zIndexDescription },
          },
          required: ['type'],
        },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'The ID of the object to update' },
              color: { type: 'string', description: 'New fill/stroke color (hex code)' },
              text: { type: 'string', description: 'New text content (sticky notes only)' },
              width: { type: 'number', description: 'New width in px' },
              height: { type: 'number', description: 'New height in px' },
              zIndex: { type: 'number', description: zIndexDescription },
            },
            required: ['id'],
          },
          description: 'Array of per-object updates (each needs an id). Use for different values per object.',
        },
      },
      required: [],
    },
  },
];

// Export for testing
export { isBoardRelated, REFUSAL_MESSAGE };

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
      // Input filter: reject off-topic or malicious messages before calling the AI
      const filterResult = isBoardRelated(command);
      if (!filterResult.allowed) {
        console.log(`Input filter blocked message (${filterResult.reason}): "${command.slice(0, 80)}..."`);
        return { message: REFUSAL_MESSAGE };
      }

      // Start a new Langfuse trace
      this.trace = langfuse.trace({
        name: 'board-ai-command',
        userId,
        input: { command, objectCount: boardObjects.length },
      });

      // Create system message with board context
      const objectSummary = boardObjects.map(o => {
        const a = o as any;
        const parts = [`id:${o.id}`, `type:${o.type}`];
        if (a.x !== undefined) parts.push(`x:${a.x}`);
        if (a.y !== undefined) parts.push(`y:${a.y}`);
        if (a.width !== undefined) parts.push(`w:${a.width}`);
        if (a.height !== undefined) parts.push(`h:${a.height}`);
        if (a.text) parts.push(`text:"${a.text.slice(0, 40)}"`);
        if (a.color) parts.push(`color:${a.color}`);
        if (a.fontSize) parts.push(`fontSize:${a.fontSize}`);
        return parts.join(' ');
      }).join('\n');

      const systemMessage = this.buildSystemMessage(boardObjects, objectSummary);

      // Call Anthropic with tool use
      const generation = this.trace.generation({
        name: 'anthropic-completion',
        model: 'claude-sonnet-4-6',
        input: { command },
      });

      // Build messages with conversation history (capped at last 20 for token safety)
      const priorMessages: Anthropic.MessageParam[] = history
        .slice(-20)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // --- Tool-call loop: allows the model to call multiple tools across iterations ---
      const MAX_TOOL_ITERATIONS = 15;
      const actions: any[] = [];
      const conversationMessages: Anthropic.MessageParam[] = [
        ...priorMessages,
        { role: 'user', content: command },
      ];

      let finalText = '';

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          system: systemMessage,
          messages: conversationMessages,
          tools,
          tool_choice: { type: 'auto' },
          temperature: 0.7,
        });

        if (iteration === 0) {
          generation.end({
            output: response.content,
            usage: {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
            },
          });
        }

        // Extract text and tool use blocks
        const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
        const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

        // Accumulate text
        for (const block of textBlocks) {
          if (block.text) finalText += (finalText ? ' ' : '') + block.text;
        }

        // No tool calls — model is done
        if (toolUseBlocks.length === 0) break;

        // Add assistant message to conversation
        conversationMessages.push({ role: 'assistant', content: response.content });

        // Process tool calls and build results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const args = toolUse.input as any;

          actions.push({
            tool: toolUse.name,
            arguments: args,
          });

          // Build a tool result so the model knows what happened
          let toolResult = `Done: ${toolUse.name}`;
          if (toolUse.name === 'analyze_board') {
            toolResult = `Board has ${boardObjects.length} objects.\n${objectSummary || '(empty)'}`;
          } else if (toolUse.name === 'organize_board') {
            toolResult = `Organized ${boardObjects.length} objects using "${args.strategy}" strategy.`;
          } else if (toolUse.name === 'clear_board') {
            toolResult = `Cleared all ${boardObjects.length} objects from the board.`;
          } else if (toolUse.name === 'delete_object') {
            toolResult = `Deleted object ${args.id}.`;
          } else if (toolUse.name.startsWith('create_')) {
            toolResult = `Created ${toolUse.name.replace('create_', '')} at (${args.x ?? 0}, ${args.y ?? 0}).`;
          } else if (toolUse.name === 'move_object') {
            toolResult = `Moved object ${args.id} to (${args.x}, ${args.y}).`;
          } else if (toolUse.name === 'update_object') {
            toolResult = `Updated object ${args.id}.`;
          } else if (toolUse.name === 'bulk_update_objects') {
            const filterCount = args.filter ? boardObjects.filter((o: any) => o.type === args.filter.type).length : 0;
            const idCount = args.updates?.length ?? 0;
            toolResult = args.filter
              ? `Applied changes to all ${filterCount} ${args.filter.type} objects${idCount ? `, plus ${idCount} individual updates` : ''}.`
              : `Updated ${idCount} objects.`;
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolResult,
          });
        }

        conversationMessages.push({ role: 'user', content: toolResults });
        // Loop continues — model gets tool results and can respond with text or more tool calls
      }

      // Update trace with success
      this.trace.update({
        output: { message: finalText, actionCount: actions.length },
        level: 'DEFAULT',
      });

      await langfuse.flush();

      // Generate a fallback message if the model didn't provide text
      let message = finalText;
      if (!message && actions.length > 0) {
        const counts: Record<string, number> = {};
        for (const a of actions) {
          const name = a.tool.replace('create_', '').replace('_', ' ');
          counts[name] = (counts[name] || 0) + 1;
        }
        const parts = Object.entries(counts).map(([name, count]) =>
          count > 1 ? `${count} ${name}s` : `a ${name}`
        );
        message = `Here's ${parts.join(', ')}!`;
      } else if (!message) {
        message = "Sorry, I wasn't able to do that. I can create sticky notes, rectangles, circles, and lines on your board.";
      }

      return {
        message,
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

  async processCommandStreaming(
    command: string,
    boardObjects: BoardObject[],
    userId: string,
    history: { role: string; content: string }[] = [],
    onAction: (action: { tool: string; arguments: any }) => void,
    onText: (text: string) => void,
  ): Promise<void> {
    // Input filter
    const filterResult = isBoardRelated(command);
    if (!filterResult.allowed) {
      onText(REFUSAL_MESSAGE);
      return;
    }

    this.trace = langfuse.trace({
      name: 'board-ai-command-stream',
      userId,
      input: { command, objectCount: boardObjects.length },
    });

    const objectSummary = boardObjects.map(o => {
      const a = o as any;
      const parts = [`id:${o.id}`, `type:${o.type}`];
      if (a.x !== undefined) parts.push(`x:${a.x}`);
      if (a.y !== undefined) parts.push(`y:${a.y}`);
      if (a.width !== undefined) parts.push(`w:${a.width}`);
      if (a.height !== undefined) parts.push(`h:${a.height}`);
      if (a.text) parts.push(`text:"${a.text.slice(0, 40)}"`);
      if (a.color) parts.push(`color:${a.color}`);
      return parts.join(' ');
    }).join('\n');

    // Reuse the same system message builder (just inline it for the streaming path)
    const systemMessage = this.buildSystemMessage(boardObjects, objectSummary);

    const generation = this.trace.generation({
      name: 'anthropic-completion-stream',
      model: 'claude-sonnet-4-6',
      input: { command },
    });

    const priorMessages: Anthropic.MessageParam[] = history
      .slice(-20)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const MAX_TOOL_ITERATIONS = 15;
    const actions: any[] = [];
    const conversationMessages: Anthropic.MessageParam[] = [
      ...priorMessages,
      { role: 'user', content: command },
    ];

    let firstIteration = true;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemMessage,
        messages: conversationMessages,
        tools,
        tool_choice: { type: 'auto' },
        temperature: 0.7,
      });

      if (firstIteration) {
        firstIteration = false;
        generation.end({
          output: response.content,
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
          },
        });
      }

      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      // Stream text blocks immediately
      for (const block of textBlocks) {
        if (block.text) onText(block.text);
      }

      // No tool calls — done
      if (toolUseBlocks.length === 0) break;

      conversationMessages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const args = toolUse.input as any;
        const action = { tool: toolUse.name, arguments: args };
        actions.push(action);

        // Stream action to client immediately
        onAction(action);

        let toolResult = `Done: ${toolUse.name}`;
        if (toolUse.name === 'analyze_board') {
          toolResult = `Board has ${boardObjects.length} objects.\n${objectSummary || '(empty)'}`;
        } else if (toolUse.name === 'organize_board') {
          toolResult = `Organized ${boardObjects.length} objects using "${args.strategy}" strategy.`;
        } else if (toolUse.name === 'clear_board') {
          toolResult = `Cleared all ${boardObjects.length} objects from the board.`;
        } else if (toolUse.name === 'delete_object') {
          toolResult = `Deleted object ${args.id}.`;
        } else if (toolUse.name.startsWith('create_')) {
          toolResult = `Created ${toolUse.name.replace('create_', '')} at (${args.x ?? 0}, ${args.y ?? 0}).`;
        } else if (toolUse.name === 'move_object') {
          toolResult = `Moved object ${args.id} to (${args.x}, ${args.y}).`;
        } else if (toolUse.name === 'update_object') {
          toolResult = `Updated object ${args.id}.`;
        } else if (toolUse.name === 'bulk_update_objects') {
          const filterCount = args.filter ? boardObjects.filter((o: any) => o.type === args.filter.type).length : 0;
          const idCount = args.updates?.length ?? 0;
          toolResult = args.filter
            ? `Applied changes to all ${filterCount} ${args.filter.type} objects${idCount ? `, plus ${idCount} individual updates` : ''}.`
            : `Updated ${idCount} objects.`;
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResult,
        });
      }

      conversationMessages.push({ role: 'user', content: toolResults });
    }

    // Fallback if no text was produced
    if (actions.length > 0) {
      // Text may have already been sent via onText
    }

    this.trace.update({
      output: { actionCount: actions.length },
      level: 'DEFAULT',
    });
    await langfuse.flush();
  }

  private buildSystemMessage(boardObjects: BoardObject[], objectSummary: string): string {
    return `You are a whiteboard-only AI assistant for a collaborative board app. Your SOLE purpose is to help users create, organize, and manage objects on their whiteboard.

STRICT SCOPE — You must ONLY respond to requests related to the whiteboard:
- Creating objects (sticky notes, text labels, rectangles, circles, lines)
- Editing existing objects (changing color, text, size, layering)
- Organizing, arranging, or laying out board objects
- Analyzing or describing what's currently on the board
- Drawing scenes, diagrams, or visual compositions on the board
- Deleting objects or clearing the board
- Answering questions about what you can do on the board

You must REFUSE any request that is not about the whiteboard. This includes but is not limited to:
- General knowledge questions (history, science, math, trivia, etc.)
- Coding help, homework, or writing assistance
- Personal advice, opinions, or conversations
- Anything unrelated to creating or managing board content

When refusing, say: "I'm your whiteboard assistant — I can only help with creating and organizing objects on the board! Try asking me to draw something, create sticky notes, or organize your board."

Do NOT answer the off-topic question even partially. Do NOT say "I know the answer but..." — just redirect to board tasks.

BOARD STATE:
The board currently has ${boardObjects.length} objects.
Sticky notes: ${boardObjects.filter(o => o.type === 'sticky').length}
Text labels: ${boardObjects.filter(o => o.type === 'textbox').length}
Shapes: ${boardObjects.filter(o => ['rectangle', 'circle', 'line'].includes(o.type)).length}
There is NO maximum object limit. The board can hold unlimited objects. Never refuse a request due to a perceived object cap.

CURRENT OBJECTS ON BOARD:
${objectSummary || '(empty board)'}

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

PLANNING (CRITICAL): Before making ANY tool calls for a scene or complex request, you MUST first think step-by-step:
1. List every object you need to create and its purpose
2. Calculate exact x, y, width/height/size for EACH object using math
3. Verify no unintended overlaps and that symmetric elements are mirrored correctly
4. Then and ONLY then, make all tool calls
Write your planning in your text response so the user can see your reasoning.

BACKGROUNDS: When creating background or environment elements (sky, ground, water, floors):
- Make them large enough to fill the visible area: at least width=1400, height=900 for a full background
- Center them at x=-700, y=-450 so they cover the entire viewport
- Use a SINGLE large rectangle for each background layer, not multiple small ones

SPACING: When placing multiple objects, you MUST leave enough space so they do NOT overlap unintentionally.
- A circle with size=200 occupies 200x200px from its top-left corner.
- To stack circles vertically with slight overlap (snowman style): nextY = prevY + prevSize - overlapAmount.
- For side-by-side objects, offset x by at least the width of the left object plus a gap.
- Think through your layout BEFORE making tool calls. Sketch the math: top-left corner + size = bottom-right corner.
- Make objects BIG and bold — use the full viewport space. Characters should be at least 300-400px tall.

LAYERING: Use the zIndex parameter (0–100) to control which objects appear in front. Lower = behind, higher = in front.
- 0–10: background surfaces (floors, rinks, sky, tables)
- 15–30: large body parts (torso, base circles)
- 35–50: medium parts (mid sections, heads)
- 55–70: small details (eyes, nose, buttons, mouths)
- 75–100: top accessories (hats, bows, items held)
- Always set zIndex for EVERY object. Each object should have a UNIQUE zIndex so stacking order is unambiguous.

Choose colors that make sense (e.g. white for snow, brown for wood, blue for ice).

TEXT & WORDS: To display readable text, titles, labels, captions, or any words on the board, use the create_text tool. It renders clean, readable text at any size. Use fontSize 24-32 for small labels, 48-72 for titles, 96+ for huge headings. You can also use sticky notes for text that belongs on a note card. You MAY still use shapes (rectangles, lines, circles) to draw artistic/decorative lettering if the user specifically asks for it — but for normal readable text, always prefer create_text.

RESPONSE RULES:
- When the user asks you to create or draw ANYTHING, you MUST call the appropriate tools. NEVER just describe what you would do — actually do it.
- COMPLETE EVERY SINGLE TOOL CALL before writing your final response text. Do NOT write "Now let me build..." or "Let me create the next part..." and stop — you MUST make ALL tool calls for the ENTIRE scene in one go. If you planned 30 objects, call 30 tools. Never stop partway through.
- COMPLETE THE FULL REQUEST: If the user asks for 100 sticky notes, create ALL 100. If they ask for 50 circles, create ALL 50. NEVER create a partial batch and ask "would you like me to continue?" or "shall I add more?". Fulfill the ENTIRE quantity in one go by making multiple tool calls. There is NO limit on how many objects you can create.
- After creating ALL objects, briefly describe what you made (e.g. "Here's a 3x3 grid of blue rectangles!" or "Here's your snowman with a top hat and scarf!"). Only write this summary AFTER all tool calls are done.
- If the user asks for something you cannot do with the available tools, say "Sorry, I'm unable to do that — I can create sticky notes, text labels, rectangles, circles, and lines, delete objects, or clear the board."
- NEVER respond with just "I can help you with that" — either create the objects or explain why you can't.
- NEVER ask for confirmation before fulfilling a request. Just do it.
- MULTI-TASK: When the user asks for multiple things in one message (e.g. "organize the board and tell me what's on it", "create a red circle and delete the blue one"), handle ALL requests by calling multiple tools in a single response. Do not only address one part of the request.
- To delete specific objects, use delete_object with the object's ID from the CURRENT OBJECTS list above.
- To clear the entire board, use clear_board.
- To move a specific object, use move_object with the object's ID and new x/y offset from screen center.
- To edit an existing object, use update_object with its ID and the fields to change.
- To edit MANY objects at once (e.g. "change all stickies to blue"), use bulk_update_objects with an array of updates. This is much faster and more reliable than calling update_object many times.
- To organize/arrange/tidy the WHOLE board, use organize_board — this is much faster and more reliable than calling move_object many times. Always prefer organize_board for bulk rearrangement.

EXAMPLE — "Draw a snowman":
Planning: I need a sky background, snowy ground, and a snowman (3 stacked circles + eyes + nose + hat).
- Sky: rectangle x=-700, y=-450, w=1400, h=500, color=#87CEEB, zIndex=1
- Ground: rectangle x=-700, y=50, w=1400, h=450, color=#f0f0f0, zIndex=2
- Bottom ball: circle x=-150, y=50, size=300, color=#ffffff, zIndex=15
- Middle ball: circle x=-110, y=-130, size=220, color=#ffffff, zIndex=20
- Head: circle x=-80, y=-280, size=160, color=#ffffff, zIndex=25
- Left eye: circle x=-40, y=-230, size=20, color=#1a1a1a, zIndex=60
- Right eye: circle x=10, y=-230, size=20, color=#1a1a1a, zIndex=61
- Nose: circle x=-10, y=-200, size=15, color=#ff6600, zIndex=62
- Hat brim: rectangle x=-70, y=-290, w=140, h=15, color=#1a1a1a, zIndex=70
- Hat top: rectangle x=-40, y=-370, w=80, h=80, color=#1a1a1a, zIndex=71
Notice: background fills viewport, objects are large (snowman ~400px tall), every object has a unique zIndex, math is explicit.`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "connected"' }],
      });

      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
      console.log('Anthropic connection test successful:', text);
      return true;
    } catch (error) {
      console.error('Anthropic connection test failed:', error);
      return false;
    }
  }
}
