import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
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
  'square', 'box', 'oval', 'arrow', 'star', 'triangle', 'connector', 'connect', 'flow',
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
  // frameworks / templates
  'swot', 'analysis', 'kanban', 'retro', 'retrospective', 'brainstorm', 'brainstorming',
  'meeting', 'agenda', 'sprint', 'planning', 'roadmap', 'timeline', 'matrix',
  'workflow', 'process', 'strategy', 'project', 'plan',
  'todo', 'to-do', 'task', 'tasks', 'idea', 'ideas', 'template',
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

// --- Task classifier: route simple tasks to GPT-4o, creative tasks to Anthropic ---
function classifyTask(command: string): 'simple' | 'creative' {
  const lower = command.toLowerCase().trim();

  // Creative keywords take priority — these need spatial planning / artistic composition
  const creativeKeywords = [
    'draw', 'build', 'design', 'sketch', 'paint', 'compose',
    'illustration', 'scene', 'picture',
    // Named scenes / characters that require multi-object composition
    'snowman', 'house', 'landscape', 'robot', 'dragon', 'castle', 'city',
    'tree', 'flower', 'face', 'animal', 'car', 'person', 'monster',
    'mountain', 'forest', 'building', 'diagram', 'flowchart', 'mindmap',
    'mind map', 'bird', 'fish', 'cat', 'dog', 'sun', 'moon',
    'pond', 'lake', 'river', 'ocean', 'sky', 'town',
    // Frameworks / templates that need multi-object spatial layout
    'swot', 'kanban', 'retrospective', 'retro', 'brainstorm', 'brainstorming',
    'meeting', 'agenda', 'roadmap', 'timeline', 'matrix', 'analysis',
    'sprint', 'planning', 'workflow', 'strategy', 'template',
  ];

  for (const keyword of creativeKeywords) {
    if (lower.includes(keyword)) return 'creative';
  }

  // Long descriptive prompts with creative intent
  const words = lower.split(/\s+/);
  if (words.length > 15) {
    // Check for creative intent signals in long prompts
    const creativeSignals = ['with', 'and', 'that has', 'including', 'featuring', 'showing', 'of a', 'of the'];
    const hasCreativeIntent = creativeSignals.some(s => lower.includes(s));
    if (hasCreativeIntent) return 'creative';
  }

  // Everything else is simple — utility/CRUD operations
  return 'simple';
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

// Tool definitions for Anthropic tool use
const zIndexDescription = 'Z-order index (0–100). Lower = further back, higher = in front. Example: background/ground=5, large body parts=20, medium parts=35, head=45, small details like eyes/buttons=60, accessories on top=75.';

const tools: Anthropic.Tool[] = [
  {
    name: 'create_sticky_note',
    description: 'Create a sticky note, positioned by x/y offset from the center of the user\'s screen.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Optional custom ID for this object. Use when you need to reference it later (e.g. as a connector endpoint). Must be unique.' },
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
        id: { type: 'string', description: 'Optional custom ID for this object. Use when you need to reference it later (e.g. as a connector endpoint). Must be unique.' },
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
        id: { type: 'string', description: 'Optional custom ID for this object. Use when you need to reference it later (e.g. as a connector endpoint). Must be unique.' },
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
        id: { type: 'string', description: 'Optional custom ID for this object. Use when you need to reference it later (e.g. as a connector endpoint). Must be unique.' },
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
        id: { type: 'string', description: 'Optional custom ID for this object. Use when you need to reference it later (e.g. as a connector endpoint). Must be unique.' },
        text: { type: 'string', description: 'The text content to display' },
        fontSize: { type: 'number', description: 'Font size in px (default 24). Use 14-18 for small labels, 20-28 for section headers, 32-48 for titles. ALWAYS set this explicitly.' },
        color: { type: 'string', description: 'Text color (hex code, default #1a1a1a)' },
        x: { type: 'number', description: 'Horizontal offset from screen center (px). 0 = center.' },
        y: { type: 'number', description: 'Vertical offset from screen center (px). 0 = center.' },
        width: { type: 'number', description: 'Max width for text wrapping. ALWAYS set this to prevent text overflow — e.g. 400-500 for titles, 200-300 for labels.' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_connector',
    description: 'Create a connector (arrow/line) between two objects or points. Use this for flowcharts, diagrams, and any visual connections. Prefer this over create_line for connecting nodes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'Optional custom ID for this connector.' },
        startObjectId: { type: 'string', description: 'ID of the object to connect from. If provided, startX/startY are ignored.' },
        endObjectId: { type: 'string', description: 'ID of the object to connect to. If provided, endX/endY are ignored.' },
        startX: { type: 'number', description: 'Fallback start X offset from screen center (used if no startObjectId).' },
        startY: { type: 'number', description: 'Fallback start Y offset from screen center (used if no startObjectId).' },
        endX: { type: 'number', description: 'Fallback end X offset from screen center (used if no endObjectId).' },
        endY: { type: 'number', description: 'Fallback end Y offset from screen center (used if no endObjectId).' },
        startAnchor: { type: 'string', enum: ['top', 'right', 'bottom', 'left', 'center'], description: 'Which side of the start object to connect from (default "bottom").' },
        endAnchor: { type: 'string', enum: ['top', 'right', 'bottom', 'left', 'center'], description: 'Which side of the end object to connect to (default "top").' },
        style: { type: 'string', enum: ['straight', 'curved', 'orthogonal'], description: 'Connector routing style (default "orthogonal"). Use orthogonal for flowcharts.' },
        color: { type: 'string', description: 'Stroke color (hex code, default "#333333").' },
        strokeWidth: { type: 'number', description: 'Line thickness in px (default 2).' },
        arrowEnd: { type: 'boolean', description: 'Show arrowhead at the end (default true).' },
        label: { type: 'string', description: 'Text label for the connector (e.g. "YES", "NO"). Will be placed as a separate text object near the midpoint.' },
        zIndex: { type: 'number', description: zIndexDescription },
      },
      required: [],
    },
  },
  {
    name: 'create_objects_batch',
    description: 'Create multiple objects in a single call. ALWAYS use this for flowcharts, diagrams, scenes, or any request needing more than 3 objects. Each object has a "type" field plus the same properties as the corresponding individual create tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        objects: {
          type: 'array',
          description: 'Array of objects to create.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['sticky_note', 'rectangle', 'circle', 'line', 'text', 'connector'] },
              id: { type: 'string' },
              text: { type: 'string' },
              color: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              size: { type: 'number' },
              fontSize: { type: 'number' },
              zIndex: { type: 'number' },
              startObjectId: { type: 'string' },
              endObjectId: { type: 'string' },
              startX: { type: 'number' },
              startY: { type: 'number' },
              endX: { type: 'number' },
              endY: { type: 'number' },
              startAnchor: { type: 'string', enum: ['top', 'right', 'bottom', 'left', 'center'] },
              endAnchor: { type: 'string', enum: ['top', 'right', 'bottom', 'left', 'center'] },
              style: { type: 'string', enum: ['straight', 'curved', 'orthogonal'] },
              strokeWidth: { type: 'number' },
              arrowEnd: { type: 'boolean' },
              label: { type: 'string' },
            },
            required: ['type'],
          },
        },
      },
      required: ['objects'],
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

// Convert tools to OpenAI function-calling format
const openaiTools: OpenAI.Chat.Completions.ChatCompletionTool[] = tools.map(t => ({
  type: 'function' as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema as Record<string, unknown>,
  },
}));

// Export for testing
export { isBoardRelated, classifyTask, REFUSAL_MESSAGE };

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

      // Route based on task classification
      const taskType = classifyTask(command);
      const modelLabel = taskType === 'simple' ? 'gpt-4o' : 'claude-sonnet-4-6';

      // Start a new Langfuse trace
      this.trace = langfuse.trace({
        name: 'board-ai-command',
        userId,
        input: { command, objectCount: boardObjects.length },
        metadata: { model: modelLabel, taskType },
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

      if (taskType === 'simple') {
        console.log(`[AI Router] "${command.slice(0, 60)}" → GPT-4o (simple)`);
        return await this.processWithOpenAI(command, boardObjects, objectSummary, systemMessage, history);
      }

      console.log(`[AI Router] "${command.slice(0, 60)}" → Anthropic Claude (creative)`);

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

          if (toolUse.name === 'create_objects_batch') {
            for (const obj of (args.objects || [])) {
              const { type, ...objArgs } = obj;
              actions.push({ tool: `create_${type}`, arguments: objArgs });
            }
          } else {
            actions.push({ tool: toolUse.name, arguments: args });
          }

          const toolResult = this.buildToolResult(toolUse.name, args, boardObjects, objectSummary);

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

      langfuse.flush();

      // Generate a fallback message if the model didn't provide text
      let message = finalText;
      if (!message && actions.length > 0) {
        message = this.buildFallbackMessage(actions);
      } else if (!message) {
        message = "Sorry, I wasn't able to do that. I can create sticky notes, rectangles, circles, lines, and connectors on your board.";
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
        langfuse.flush();
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

    // Route based on task classification
    const taskType = classifyTask(command);
    const modelLabel = taskType === 'simple' ? 'gpt-4o' : 'claude-sonnet-4-6';

    this.trace = langfuse.trace({
      name: 'board-ai-command-stream',
      userId,
      input: { command, objectCount: boardObjects.length },
      metadata: { model: modelLabel, taskType },
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

    const systemMessage = this.buildSystemMessage(boardObjects, objectSummary);

    // Route to OpenAI for simple tasks
    if (taskType === 'simple') {
      console.log(`[AI Router] Stream: "${command.slice(0, 60)}" → GPT-4o (simple)`);
      await this.processWithOpenAIStreaming(command, boardObjects, objectSummary, systemMessage, history, onAction, onText);
      return;
    }

    console.log(`[AI Router] Stream: "${command.slice(0, 60)}" → Anthropic Claude (creative)`);

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

        if (toolUse.name === 'create_objects_batch') {
          for (const obj of (args.objects || [])) {
            const { type, ...objArgs } = obj;
            const individualAction = { tool: `create_${type}`, arguments: objArgs };
            actions.push(individualAction);
            onAction(individualAction);
          }
        } else {
          const action = { tool: toolUse.name, arguments: args };
          actions.push(action);
          onAction(action);
        }

        const toolResult = this.buildToolResult(toolUse.name, args, boardObjects, objectSummary);

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
    langfuse.flush();
  }

  private async processWithOpenAI(
    command: string,
    boardObjects: BoardObject[],
    objectSummary: string,
    systemMessage: string,
    history: { role: string; content: string }[] = [],
  ): Promise<{ message: string; actions?: any[]; error?: string }> {
    const generation = this.trace.generation({
      name: 'openai-completion',
      model: 'gpt-4o',
      input: { command },
    });

    const priorMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = history
      .slice(-20)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const MAX_TOOL_ITERATIONS = 15;
    const actions: any[] = [];
    const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMessage },
      ...priorMessages,
      { role: 'user', content: command },
    ];

    let finalText = '';

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: conversationMessages,
        tools: openaiTools,
        tool_choice: 'auto',
        temperature: 0.7,
      });

      const choice = response.choices[0];

      if (iteration === 0) {
        generation.end({
          output: choice.message,
          usage: {
            promptTokens: response.usage?.prompt_tokens,
            completionTokens: response.usage?.completion_tokens,
          },
        });
      }

      // Accumulate text content
      if (choice.message.content) {
        finalText += (finalText ? ' ' : '') + choice.message.content;
      }

      // No tool calls — done
      const toolCalls = choice.message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) break;

      // Add assistant message to conversation
      conversationMessages.push(choice.message);

      // Process each tool call
      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') continue;
        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          console.warn(`Skipping malformed tool call "${toolCall.function.name}": truncated JSON`);
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'Error: malformed arguments, skipped.',
          });
          continue;
        }
        if (toolCall.function.name === 'create_objects_batch') {
          for (const obj of (args.objects || [])) {
            const { type, ...objArgs } = obj;
            actions.push({ tool: `create_${type}`, arguments: objArgs });
          }
        } else {
          actions.push({ tool: toolCall.function.name, arguments: args });
        }

        const toolResult = this.buildToolResult(toolCall.function.name, args, boardObjects, objectSummary);

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }
    }

    this.trace.update({
      output: { message: finalText, actionCount: actions.length },
      level: 'DEFAULT',
    });
    langfuse.flush();

    let message = finalText;
    if (!message && actions.length > 0) {
      message = this.buildFallbackMessage(actions);
    } else if (!message) {
      message = "Sorry, I wasn't able to do that. I can create sticky notes, rectangles, circles, lines, and connectors on your board.";
    }

    return { message, actions };
  }

  private async processWithOpenAIStreaming(
    command: string,
    boardObjects: BoardObject[],
    objectSummary: string,
    systemMessage: string,
    history: { role: string; content: string }[] = [],
    onAction: (action: { tool: string; arguments: any }) => void,
    onText: (text: string) => void,
  ): Promise<void> {
    const generation = this.trace.generation({
      name: 'openai-completion-stream',
      model: 'gpt-4o',
      input: { command },
    });

    const priorMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = history
      .slice(-20)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const MAX_TOOL_ITERATIONS = 15;
    const actions: any[] = [];
    const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMessage },
      ...priorMessages,
      { role: 'user', content: command },
    ];

    let firstIteration = true;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 4096,
        messages: conversationMessages,
        tools: openaiTools,
        tool_choice: 'auto',
        temperature: 0.7,
        stream: true,
      });

      // Accumulate the streamed response
      let contentText = '';
      const toolCallAccumulators: Map<number, { id: string; name: string; arguments: string }> = new Map();
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // Stream text content as it arrives
        if (delta.content) {
          contentText += delta.content;
          onText(delta.content);
        }

        // Accumulate tool call deltas
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const idx = toolCallDelta.index;
            if (!toolCallAccumulators.has(idx)) {
              toolCallAccumulators.set(idx, { id: '', name: '', arguments: '' });
            }
            const acc = toolCallAccumulators.get(idx)!;
            if (toolCallDelta.id) acc.id = toolCallDelta.id;
            if (toolCallDelta.function?.name) acc.name = toolCallDelta.function.name;
            if (toolCallDelta.function?.arguments) acc.arguments += toolCallDelta.function.arguments;
          }
        }

        // Capture usage from the final chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }

      if (firstIteration) {
        firstIteration = false;
        generation.end({
          output: { content: contentText, tool_calls: [...toolCallAccumulators.values()] },
          usage: { promptTokens, completionTokens },
        });
      }

      // No tool calls — done
      if (toolCallAccumulators.size === 0) break;

      // Reconstruct the assistant message for conversation history
      const assistantToolCalls = [...toolCallAccumulators.values()].map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
      conversationMessages.push({
        role: 'assistant',
        content: contentText || null,
        tool_calls: assistantToolCalls,
      });

      // Process completed tool calls and stream actions immediately
      for (const tc of toolCallAccumulators.values()) {
        let args: any;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          console.warn(`Skipping malformed tool call "${tc.name}": truncated JSON`);
          conversationMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: 'Error: malformed arguments, skipped.',
          });
          continue;
        }
        if (tc.name === 'create_objects_batch') {
          for (const obj of (args.objects || [])) {
            const { type, ...objArgs } = obj;
            const individualAction = { tool: `create_${type}`, arguments: objArgs };
            actions.push(individualAction);
            onAction(individualAction);
          }
        } else {
          const action = { tool: tc.name, arguments: args };
          actions.push(action);
          onAction(action);
        }

        const toolResult = this.buildToolResult(tc.name, args, boardObjects, objectSummary);

        conversationMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolResult,
        });
      }
    }

    this.trace.update({
      output: { actionCount: actions.length },
      level: 'DEFAULT',
    });
    langfuse.flush();
  }

  private buildToolResult(toolName: string, args: any, boardObjects: BoardObject[], objectSummary: string): string {
    if (toolName === 'analyze_board') {
      return `Board has ${boardObjects.length} objects.\n${objectSummary || '(empty)'}`;
    } else if (toolName === 'organize_board') {
      return `Organized ${boardObjects.length} objects using "${args.strategy}" strategy.`;
    } else if (toolName === 'clear_board') {
      return `Cleared all ${boardObjects.length} objects from the board.`;
    } else if (toolName === 'delete_object') {
      return `Deleted object ${args.id}.`;
    } else if (toolName === 'create_connector') {
      const from = args.startObjectId || `(${args.startX ?? 0}, ${args.startY ?? 0})`;
      const to = args.endObjectId || `(${args.endX ?? 0}, ${args.endY ?? 0})`;
      return `Created connector from ${from} to ${to}${args.id ? ` with id "${args.id}"` : ''}.`;
    } else if (toolName === 'create_objects_batch') {
      const objects = args.objects || [];
      const typeCounts: Record<string, number> = {};
      for (const obj of objects) {
        typeCounts[obj.type] = (typeCounts[obj.type] || 0) + 1;
      }
      const parts = Object.entries(typeCounts).map(([t, c]) => `${c} ${t}${c > 1 ? 's' : ''}`);
      return `Created ${objects.length} objects (${parts.join(', ')}).`;
    } else if (toolName.startsWith('create_')) {
      return `Created ${toolName.replace('create_', '')} at (${args.x ?? 0}, ${args.y ?? 0})${args.id ? ` with id "${args.id}"` : ''}.`;
    } else if (toolName === 'move_object') {
      return `Moved object ${args.id} to (${args.x}, ${args.y}).`;
    } else if (toolName === 'update_object') {
      return `Updated object ${args.id}.`;
    } else if (toolName === 'bulk_update_objects') {
      const filterCount = args.filter ? boardObjects.filter((o: any) => o.type === args.filter.type).length : 0;
      const idCount = args.updates?.length ?? 0;
      return args.filter
        ? `Applied changes to all ${filterCount} ${args.filter.type} objects${idCount ? `, plus ${idCount} individual updates` : ''}.`
        : `Updated ${idCount} objects.`;
    }
    return `Done: ${toolName}`;
  }

  private buildFallbackMessage(actions: any[]): string {
    const counts: Record<string, number> = {};
    for (const a of actions) {
      const name = a.tool.replace('create_', '').replace('_', ' ');
      counts[name] = (counts[name] || 0) + 1;
    }
    const parts = Object.entries(counts).map(([name, count]) =>
      count > 1 ? `${count} ${name}s` : `a ${name}`
    );
    return `Here's ${parts.join(', ')}!`;
  }

  private buildSystemMessage(boardObjects: BoardObject[], objectSummary: string): string {
    return `You are a whiteboard-only AI assistant for a collaborative board app. Your SOLE purpose is to help users create, organize, and manage objects on their whiteboard.

STRICT SCOPE — You must ONLY respond to requests related to the whiteboard:
- Creating objects (sticky notes, text labels, rectangles, circles, lines, connectors)
- Editing existing objects (changing color, text, size, layering)
- Organizing, arranging, or laying out board objects
- Analyzing or describing what's currently on the board
- Drawing scenes, diagrams, flowcharts, or visual compositions on the board
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
- x/y is the TOP-LEFT corner of the object's bounding box for ALL object types.
- The screen is roughly 1920px wide and 1080px tall, so offsets can range from -960 to 960 horizontally and -540 to 540 vertically. USE THE FULL SPACE.

OBJECT SIZES (CRITICAL):
- Sticky notes are ALWAYS 200x200 px. You CANNOT change their size. Account for this when spacing.
- Rectangles default to 120x80 but you can set width/height. For background sections, use 400-500px wide.
- Text labels auto-size based on content. Set width to control wrapping.
- When creating a SWOT, Kanban, or grid layout, the background rectangles should be at least 450x350 each, and stickies (200x200) should be placed well inside them with 20-40px margins.

CENTERING & ALIGNMENT (CRITICAL):
- To visually center an object on the vertical axis (x=0 line), set x = -(width/2) or x = -(size/2).
- Example: a circle with size=200 centered horizontally → x = -100.
- To center a SMALL object on a LARGER object: smallX = largeX + (largeSize - smallSize) / 2.
- Example: eye (size=20) on head (size=150, x=-75): eyeX = -75 + (150 - 20) / 2 = -10.
- For ALL scenes: pick a single vertical center line and align every object's x to it using the formula above. Symmetric features (eyes, arms) should be equally offset left and right from center.
- ALWAYS compute the math explicitly before placing objects. Do not eyeball positions.

PLANNING (CRITICAL): Before making ANY tool calls for a scene or complex request, plan your layout internally.
DO NOT write planning text in your response — go directly to your create_objects_batch tool call.
Only write a brief summary AFTER all objects are created.

BACKGROUNDS: When creating background or environment elements (sky, ground, water, floors):
- Make them large enough to fill the visible area: at least width=1400, height=900 for a full background
- Center them at x=-700, y=-450 so they cover the entire viewport
- Use a SINGLE large rectangle for each background layer, not multiple small ones

SPACING: When placing multiple objects, you MUST leave enough space so they do NOT overlap unintentionally.
- A circle with size=200 occupies 200x200px from its top-left corner.
- STICKY NOTES are 200x200px EACH — space them at least 230px apart (200 + 30px gap).
- To stack circles vertically with slight overlap (snowman style): nextY = prevY + prevSize - overlapAmount.
- For side-by-side objects, offset x by at least the width of the left object plus 30px gap.
- Think through your layout BEFORE making tool calls. Sketch the math: top-left corner + size = bottom-right corner.
- Make objects BIG and bold — use the full viewport space. Characters should be at least 300-400px tall.
- Use 30px as the MINIMUM gap between any two objects. Never place objects edge-to-edge.

LAYERING: Use the zIndex parameter (0–100) to control which objects appear in front. Lower = behind, higher = in front.
- 0–10: background surfaces (floors, rinks, sky, tables)
- 15–30: large body parts (torso, base circles)
- 35–50: medium parts (mid sections, heads)
- 55–70: small details (eyes, nose, buttons, mouths)
- 75–100: top accessories (hats, bows, items held)
- Always set zIndex for EVERY object. Each object should have a UNIQUE zIndex so stacking order is unambiguous.

Choose colors that make sense (e.g. white for snow, brown for wood, blue for ice).

CONNECTORS & FLOWCHARTS:
- For flowcharts, diagrams, and process flows, create nodes first with custom IDs (using the "id" parameter), then use create_connector to link them.
- Use orthogonal style for clean right-angle routing in flowcharts. Use curved for organic diagrams. Use straight for simple arrows.
- To add YES/NO labels on connectors, use the "label" parameter — it creates a small text object near the midpoint automatically.
- Example flowchart workflow:
  1. create_rectangle with id="start", text via create_text on top
  2. create_rectangle with id="process1"
  3. create_connector with startObjectId="start", endObjectId="process1", style="orthogonal"
  4. For decision diamonds, use a rotated rectangle or a small rectangle with a "?" label.
- Anchors control which side of the object the connector attaches to: top, right, bottom, left, center.
  Default: startAnchor="bottom", endAnchor="top" (good for top-to-bottom flowcharts).
  Use startAnchor="right", endAnchor="left" for left-to-right flows.

TEXT & WORDS: To display readable text, titles, labels, captions, or any words on the board, use the create_text tool. It renders clean, readable text at any size. Use fontSize 24-32 for small labels, 48-72 for titles, 96+ for huge headings. You can also use sticky notes for text that belongs on a note card. You MAY still use shapes (rectangles, lines, circles) to draw artistic/decorative lettering if the user specifically asks for it — but for normal readable text, always prefer create_text.

BATCH CREATION (CRITICAL FOR SPEED):
For ANY request that creates more than 3 objects (flowcharts, diagrams, scenes, SWOT/kanban layouts, drawings, etc.),
you MUST use create_objects_batch to create ALL objects in a single tool call. This is dramatically faster.
Each object in the array has a "type" field (sticky_note, rectangle, circle, line, text, connector)
plus the same properties as the corresponding individual create tool.
Create ALL objects for the entire request in ONE batch call. Connectors can reference IDs of objects earlier in the same batch.
Do NOT output planning text — go straight to the tool call. Output only a brief summary after.

RESPONSE RULES:
- When the user asks you to create or draw ANYTHING, you MUST call the appropriate tools. NEVER just describe what you would do — actually do it.
- COMPLETE EVERY SINGLE TOOL CALL before writing your final response text. Do NOT write "Now let me build..." or "Let me create the next part..." and stop — you MUST make ALL tool calls for the ENTIRE scene in one go.
- For multi-object creations, use create_objects_batch to create everything in one tool call.
- Never stop partway through.
- COMPLETE THE FULL REQUEST: If the user asks for 100 sticky notes, create ALL 100. If they ask for 50 circles, create ALL 50. NEVER create a partial batch and ask "would you like me to continue?" or "shall I add more?". Fulfill the ENTIRE quantity in one go by making multiple tool calls. There is NO limit on how many objects you can create.
- After creating ALL objects, briefly describe what you made (e.g. "Here's a 3x3 grid of blue rectangles!" or "Here's your snowman with a top hat and scarf!"). Only write this summary AFTER all tool calls are done.
- If the user asks for something you cannot do with the available tools, say "Sorry, I'm unable to do that — I can create sticky notes, text labels, rectangles, circles, lines, and connectors, delete objects, or clear the board."
- NEVER respond with just "I can help you with that" — either create the objects or explain why you can't.
- NEVER ask for confirmation before fulfilling a request. Just do it.
- MULTI-TASK: When the user asks for multiple things in one message (e.g. "organize the board and tell me what's on it", "create a red circle and delete the blue one"), handle ALL requests by calling multiple tools in a single response. Do not only address one part of the request.
- To delete specific objects, use delete_object with the object's ID from the CURRENT OBJECTS list above.
- To clear the entire board, use clear_board.
- To move a specific object, use move_object with the object's ID and new x/y offset from screen center.
- To edit an existing object, use update_object with its ID and the fields to change.
- To edit MANY objects at once (e.g. "change all stickies to blue"), use bulk_update_objects with an array of updates. This is much faster and more reliable than calling update_object many times.
- To organize/arrange/tidy the WHOLE board, use organize_board — this is much faster and more reliable than calling move_object many times. Always prefer organize_board for bulk rearrangement.

FRAMEWORK LAYOUTS (SWOT, Kanban, Retrospective, etc.):
When creating structured layouts like SWOT analysis, kanban boards, or meeting notes:
- Title: create_text with fontSize=32, width=900, centered at x=-450, y=-580
- Section labels: create_text with fontSize=20, placed AT THE TOP of each background rectangle with 10px inset. Set width to match the background width.
- Background rectangles: make them VERY LARGE to fit stickies comfortably. Remember stickies are 200x200 EACH.
  - For 2 columns of stickies: width = 2*200 + 3*30(gaps) = 490px minimum, use 500px
  - For 3 rows of stickies: height = label(40) + 3*200 + 4*30(gaps) = 760px minimum, use 780px
- Stickies (200x200 each): place them in a grid INSIDE backgrounds with 30px padding from edges and 30px gaps between stickies
- For a 2x2 grid (SWOT): left column x=-530, right column x=30, top row y=-500, bottom row y=310. Each background 500x780.
- For a 3-column layout (Kanban/Retro): columns at x=-560, x=-170, x=220. Each background 370x780.
- Leave a 30px gap between adjacent background rectangles.
- ALWAYS set width on text labels so they don't overflow.
- Use zIndex: backgrounds=0, stickies=5, labels=10, title=10
- CRITICAL: double-check that every sticky fits fully inside its background rectangle. No sticky should extend beyond the background edge.

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
