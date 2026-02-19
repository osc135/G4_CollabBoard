import OpenAI from 'openai';
import { Langfuse } from 'langfuse';
import type { BoardObject } from '@collabboard/shared';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// --- Input Filter: reject off-topic messages before they reach the AI ---
const BOARD_KEYWORDS = [
  // actions
  'create', 'draw', 'make', 'add', 'place', 'put', 'build', 'design',
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
      name: 'move_object',
      description: 'Move a single existing object to a new position. x/y are offsets from the center of the user\'s screen (same coordinate system as create tools). Use for repositioning one or a few specific objects — NOT for bulk organization (use organize_board instead).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The ID of the object to move (from the CURRENT OBJECTS list)' },
          x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
          y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
        },
        required: ['id', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'organize_board',
      description: 'Rearrange ALL objects on the board into a clean layout. Use this whenever the user asks to organize, arrange, tidy, sort, or lay out their board. This moves every object — much better than calling move_object many times.',
      parameters: {
        type: 'object',
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
  },
  {
    type: 'function',
    function: {
      name: 'delete_object',
      description: 'Delete a specific object from the board by its ID',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The ID of the object to delete' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_board',
      description: 'Remove all objects from the board',
      parameters: {
        type: 'object',
        properties: {},
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
  {
    type: 'function',
    function: {
      name: 'update_object',
      description: 'Edit properties of a single existing object. Only the provided fields will be changed; omitted fields stay the same.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The ID of the object to update (from the CURRENT OBJECTS list)' },
          color: { type: 'string', description: 'New fill/stroke color (hex code)' },
          text: { type: 'string', description: 'New text content (sticky notes only)' },
          width: { type: 'number', description: 'New width in px' },
          height: { type: 'number', description: 'New height in px' },
          zIndex: zIndexParam,
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bulk_update_objects',
      description: 'Update multiple objects at once. Two modes: (1) Use "filter" to update ALL objects matching a type — best for "change all stickies to blue". (2) Use "updates" array with specific IDs — best when each object gets a different value. You can use both together: filter applies first, then individual updates override.',
      parameters: {
        type: 'object',
        properties: {
          filter: {
            type: 'object',
            description: 'Apply the same changes to ALL objects matching this filter. Much better than listing every ID.',
            properties: {
              type: { type: 'string', enum: ['sticky', 'rectangle', 'circle', 'line'], description: 'Only update objects of this type' },
              color: { type: 'string', description: 'New fill/stroke color (hex code) to apply to all matched objects' },
              text: { type: 'string', description: 'New text content to apply to all matched objects' },
              width: { type: 'number', description: 'New width to apply to all matched objects' },
              height: { type: 'number', description: 'New height to apply to all matched objects' },
              zIndex: zIndexParam,
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
                zIndex: zIndexParam,
              },
              required: ['id'],
            },
            description: 'Array of per-object updates (each needs an id). Use for different values per object.',
          },
        },
      },
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
      // Input filter: reject off-topic or malicious messages before calling OpenAI
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
      // Build a compact object list for the AI to reference (for deletion, analysis, etc.)
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

      const systemMessage = `You are a whiteboard-only AI assistant for a collaborative board app. Your SOLE purpose is to help users create, organize, and manage objects on their whiteboard.

STRICT SCOPE — You must ONLY respond to requests related to the whiteboard:
- Creating objects (sticky notes, rectangles, circles, lines)
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
Shapes: ${boardObjects.filter(o => ['rectangle', 'circle', 'line'].includes(o.type)).length}

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

Choose colors that make sense (e.g. white for snow, brown for wood, blue for ice).

RESPONSE RULES:
- When the user asks you to create or draw ANYTHING, you MUST call the appropriate tools. NEVER just describe what you would do — actually do it.
- After creating objects, briefly describe what you made (e.g. "Here's a 3x3 grid of blue rectangles!" or "Here's your snowman with a top hat and scarf!").
- If the user asks for something you cannot do with the available tools, say "Sorry, I'm unable to do that — I can create sticky notes, rectangles, circles, and lines, delete objects, or clear the board."
- NEVER respond with just "I can help you with that" — either create the objects or explain why you can't.
- MULTI-TASK: When the user asks for multiple things in one message (e.g. "organize the board and tell me what's on it", "create a red circle and delete the blue one"), handle ALL requests by calling multiple tools in a single response. Do not only address one part of the request.
- To delete specific objects, use delete_object with the object's ID from the CURRENT OBJECTS list above.
- To clear the entire board, use clear_board.
- To move a specific object, use move_object with the object's ID and new x/y offset from screen center.
- To edit an existing object, use update_object with its ID and the fields to change.
- To edit MANY objects at once (e.g. "change all stickies to blue"), use bulk_update_objects with an array of updates. This is much faster and more reliable than calling update_object many times.
- To organize/arrange/tidy the WHOLE board, use organize_board — this is much faster and more reliable than calling move_object many times. Always prefer organize_board for bulk rearrangement.`;

      // Call OpenAI with function calling
      const generation = this.trace.generation({
        name: 'openai-completion',
        model: 'gpt-4o',
        input: { command },
      });

      // Build messages with conversation history (capped at last 20 for token safety)
      const priorMessages: OpenAI.ChatCompletionMessageParam[] = history
        .slice(-20)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      // --- Tool-call loop: allows the model to call multiple tools across iterations ---
      const MAX_TOOL_ITERATIONS = 3;
      const actions: any[] = [];
      const conversationMessages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemMessage },
        ...priorMessages,
        { role: 'user', content: command },
      ];

      let response: OpenAI.ChatCompletionMessage | null = null;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: conversationMessages,
          tools,
          tool_choice: 'auto',
          temperature: 0.7,
        });

        if (iteration === 0) {
          generation.end({
            output: completion.choices[0].message,
            usage: {
              promptTokens: completion.usage?.prompt_tokens,
              completionTokens: completion.usage?.completion_tokens,
            },
          });
        }

        response = completion.choices[0].message;
        const toolCalls = response.tool_calls || [];

        // No tool calls — model is done, has a final text response
        if (toolCalls.length === 0) break;

        // Collect actions and build tool result messages
        conversationMessages.push(response as any);

        for (const toolCall of toolCalls) {
          if ('function' in toolCall) {
            let args: any;
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch (e) {
              console.error(`Failed to parse tool arguments for ${toolCall.function.name}:`, e);
              conversationMessages.push({
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: `Error: malformed arguments — skipped.`,
              });
              continue;
            }

            actions.push({
              tool: toolCall.function.name,
              arguments: args,
            });

            // Build a tool result so the model knows what happened
            let toolResult = `Done: ${toolCall.function.name}`;
            if (toolCall.function.name === 'analyze_board') {
              toolResult = `Board has ${boardObjects.length} objects.\n${objectSummary || '(empty)'}`;
            } else if (toolCall.function.name === 'organize_board') {
              toolResult = `Organized ${boardObjects.length} objects using "${args.strategy}" strategy.`;
            } else if (toolCall.function.name === 'clear_board') {
              toolResult = `Cleared all ${boardObjects.length} objects from the board.`;
            } else if (toolCall.function.name === 'delete_object') {
              toolResult = `Deleted object ${args.id}.`;
            } else if (toolCall.function.name.startsWith('create_')) {
              toolResult = `Created ${toolCall.function.name.replace('create_', '')} at (${args.x ?? 0}, ${args.y ?? 0}).`;
            } else if (toolCall.function.name === 'move_object') {
              toolResult = `Moved object ${args.id} to (${args.x}, ${args.y}).`;
            } else if (toolCall.function.name === 'update_object') {
              toolResult = `Updated object ${args.id}.`;
            } else if (toolCall.function.name === 'bulk_update_objects') {
              const filterCount = args.filter ? boardObjects.filter((o: any) => o.type === args.filter.type).length : 0;
              const idCount = args.updates?.length ?? 0;
              toolResult = args.filter
                ? `Applied changes to all ${filterCount} ${args.filter.type} objects${idCount ? `, plus ${idCount} individual updates` : ''}.`
                : `Updated ${idCount} objects.`;
            }

            conversationMessages.push({
              role: 'tool' as const,
              tool_call_id: toolCall.id,
              content: toolResult,
            });
          }
        }
        // Loop continues — model gets tool results and can respond with text or more tool calls
      }

      // Update trace with success
      this.trace.update({
        output: { message: response?.content, actionCount: actions.length },
        level: 'DEFAULT',
      });

      await langfuse.flush();

      // Generate a fallback message if the model didn't provide text
      let message = response?.content || '';
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
