import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { Langfuse } from 'langfuse';
import type { BoardObject } from '@collabboard/shared';
import { expandSwot, expandKanban, expandFlowchart } from './template-expander';
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
        width: { type: 'number', description: 'Width in px (default 200). Use ~150 for flowchart nodes.' },
        height: { type: 'number', description: 'Height in px (default 200). Use ~80 for flowchart nodes.' },
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
    description: 'Create multiple objects in a single call. Use for scenes, drawings, or any multi-object request that is NOT a SWOT analysis, kanban board, or flowchart (use their dedicated tools instead). Each object has a "type" field plus the same properties as the corresponding individual create tool.',
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
    name: 'create_swot',
    description: 'Create a SWOT analysis on the board. Provide the items for each quadrant — positioning and layout are handled automatically. ALWAYS use this tool for SWOT analyses instead of create_objects_batch.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Optional title (e.g. "SWOT Analysis for Acme Corp")' },
        strengths: { type: 'array', items: { type: 'string' }, description: 'List of strengths' },
        weaknesses: { type: 'array', items: { type: 'string' }, description: 'List of weaknesses' },
        opportunities: { type: 'array', items: { type: 'string' }, description: 'List of opportunities' },
        threats: { type: 'array', items: { type: 'string' }, description: 'List of threats' },
      },
      required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
    },
  },
  {
    name: 'create_kanban',
    description: 'Create a kanban board on the board. Provide column names and cards — positioning and layout are handled automatically. ALWAYS use this tool for kanban boards instead of create_objects_batch.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Optional board title' },
        columns: {
          type: 'array',
          description: 'Array of columns, each with a name and cards',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Column header (e.g. "To Do", "In Progress", "Done")' },
              cards: { type: 'array', items: { type: 'string' }, description: 'Card texts in this column' },
            },
            required: ['name', 'cards'],
          },
        },
      },
      required: ['columns'],
    },
  },
  {
    name: 'create_flowchart',
    description: 'Create a flowchart or process diagram on the board. Provide nodes and edges — positioning is handled automatically by the layout engine. ALWAYS use this tool for flowcharts instead of create_objects_batch.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nodes: {
          type: 'array',
          description: 'Array of nodes in the flowchart',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique ID for this node (used in edges)' },
              text: { type: 'string', description: 'Text label for the node' },
              color: { type: 'string', description: 'Node color (hex code, default #ffeb3b)' },
            },
            required: ['id', 'text'],
          },
        },
        edges: {
          type: 'array',
          description: 'Array of edges connecting nodes',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string', description: 'Source node ID' },
              to: { type: 'string', description: 'Target node ID' },
              label: { type: 'string', description: 'Optional edge label (e.g. "YES", "NO")' },
            },
            required: ['from', 'to'],
          },
        },
      },
      required: ['nodes', 'edges'],
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

// Expand a template tool call into an array of primitive actions.
// Returns null if the tool is not a template tool.
function expandTemplateToolCall(toolName: string, args: any): { tool: string; arguments: any }[] | null {
  if (toolName === 'create_swot') {
    return expandSwot({
      title: args.title,
      strengths: args.strengths || [],
      weaknesses: args.weaknesses || [],
      opportunities: args.opportunities || [],
      threats: args.threats || [],
    });
  }
  if (toolName === 'create_kanban') {
    return expandKanban({
      title: args.title,
      columns: args.columns || [],
    });
  }
  if (toolName === 'create_flowchart') {
    return expandFlowchart({
      nodes: args.nodes || [],
      edges: args.edges || [],
    });
  }
  return null;
}

// Detect when the AI ignores the dedicated tools and uses create_objects_batch
// for SWOT/kanban anyway (by inspecting the batch contents), and auto-convert.
function interceptBatchAsTemplate(args: any): { tool: string; arguments: any }[] | null {
  const objects = args.objects as any[] | undefined;
  if (!objects || objects.length < 5) return null;

  // Detect SWOT: look for sticky notes whose text matches S/W/O/T categories
  const texts = objects
    .filter((o: any) => o.type === 'sticky_note' || o.type === 'text')
    .map((o: any) => (o.text || '').toLowerCase());
  const hasStrengths = texts.some((t: string) => /\bstrength/i.test(t));
  const hasWeaknesses = texts.some((t: string) => /\bweakness/i.test(t));
  const hasOpportunities = texts.some((t: string) => /\bopportunit/i.test(t));
  const hasThreats = texts.some((t: string) => /\bthreat/i.test(t));

  if (hasStrengths && hasWeaknesses && hasOpportunities && hasThreats) {
    console.log('[template-intercept] Detected SWOT in create_objects_batch — converting to create_swot');
    // Extract items per category from the batch
    const categoryPatterns: [string, RegExp][] = [
      ['strengths', /\bstrength/i],
      ['weaknesses', /\bweakness/i],
      ['opportunities', /\bopportunit/i],
      ['threats', /\bthreat/i],
    ];

    // Find category header nodes
    const catNodes = new Map<string, any>();
    for (const [key, pattern] of categoryPatterns) {
      const header = objects.find((o: any) =>
        (o.type === 'sticky_note' || o.type === 'text') && pattern.test(o.text || '')
      );
      if (header) catNodes.set(key, header);
    }

    // Find title node (text with "swot" or "analysis")
    const titleNode = objects.find((o: any) =>
      (o.type === 'text' || o.type === 'sticky_note') &&
      /swot|analysis/i.test(o.text || '') &&
      !catNodes.has('strengths') // not a category header
    );

    // Build connector map: parent → children
    const connectors = objects.filter((o: any) => o.type === 'connector');
    const childrenOf = new Map<string, string[]>();
    for (const c of connectors) {
      const parent = c.startObjectId;
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(c.endObjectId);
    }

    // For each category, gather child sticky note texts
    const result: Record<string, string[]> = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
    for (const [key] of categoryPatterns) {
      const header = catNodes.get(key);
      if (!header || !header.id) continue;
      const childIds = childrenOf.get(header.id) || [];
      for (const childId of childIds) {
        const child = objects.find((o: any) => o.id === childId && o.type === 'sticky_note');
        if (child && child.text) result[key].push(child.text);
      }
      // If no connectors found, try proximity: items that aren't headers/title/connectors/rects
      if (result[key].length === 0) {
        // Fall back: just distribute non-header sticky notes evenly
      }
    }

    // If connector-based extraction found items, use template
    const totalItems = Object.values(result).reduce((s, arr) => s + arr.length, 0);
    if (totalItems > 0) {
      return expandSwot({
        title: titleNode?.text,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
        opportunities: result.opportunities,
        threats: result.threats,
      });
    }

    // Fallback: distribute all non-header/non-connector sticky notes evenly across categories
    const contentNotes = objects.filter((o: any) => {
      if (o.type !== 'sticky_note') return false;
      const t = (o.text || '').toLowerCase();
      return !categoryPatterns.some(([, p]) => p.test(t)) && !/swot|analysis/i.test(t);
    });
    const cats = ['strengths', 'weaknesses', 'opportunities', 'threats'];
    for (let i = 0; i < contentNotes.length; i++) {
      result[cats[i % 4]].push(contentNotes[i].text);
    }
    return expandSwot({
      title: titleNode?.text,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      opportunities: result.opportunities,
      threats: result.threats,
    });
  }

  // Detect kanban: look for column-like structure (headers with children)
  const kanbanKeywords = /\b(to\s*do|in\s*progress|doing|done|backlog|review|todo|blocked|ready)\b/i;
  const kanbanHeaders = objects.filter((o: any) =>
    (o.type === 'sticky_note' || o.type === 'text') && kanbanKeywords.test(o.text || '')
  );
  if (kanbanHeaders.length >= 2) {
    console.log('[template-intercept] Detected kanban in create_objects_batch — converting to create_kanban');
    const connectors = objects.filter((o: any) => o.type === 'connector');
    const childrenOf = new Map<string, string[]>();
    for (const c of connectors) {
      if (!childrenOf.has(c.startObjectId)) childrenOf.set(c.startObjectId, []);
      childrenOf.get(c.startObjectId)!.push(c.endObjectId);
    }

    const titleNode = objects.find((o: any) =>
      (o.type === 'text') && !kanbanKeywords.test(o.text || '') && /kanban|board/i.test(o.text || '')
    );

    const columns = kanbanHeaders.map((header: any) => {
      const childIds = childrenOf.get(header.id) || [];
      const cards = childIds
        .map((id: string) => objects.find((o: any) => o.id === id))
        .filter(Boolean)
        .map((o: any) => o.text || '');
      return { name: header.text, cards };
    });

    return expandKanban({ title: titleNode?.text, columns });
  }

  return null;
}

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

          // Template tools: expand into primitive actions
          const expanded = expandTemplateToolCall(toolUse.name, args);
          if (expanded) {
            for (const action of expanded) {
              actions.push(action);
            }
          } else if (toolUse.name === 'create_objects_batch') {
            // Intercept SWOT/kanban built via batch and convert to template
            const intercepted = interceptBatchAsTemplate(args);
            if (intercepted) {
              for (const action of intercepted) actions.push(action);
            } else {
              for (const obj of (args.objects || [])) {
                const { type, ...objArgs } = obj;
                actions.push({ tool: `create_${type}`, arguments: objArgs });
              }
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

        // Template tools: expand into primitive actions
        const expanded = expandTemplateToolCall(toolUse.name, args);
        if (expanded) {
          for (const action of expanded) {
            actions.push(action);
            onAction(action);
          }
        } else if (toolUse.name === 'create_objects_batch') {
          const intercepted = interceptBatchAsTemplate(args);
          if (intercepted) {
            for (const action of intercepted) { actions.push(action); onAction(action); }
          } else {
            for (const obj of (args.objects || [])) {
              const { type, ...objArgs } = obj;
              const individualAction = { tool: `create_${type}`, arguments: objArgs };
              actions.push(individualAction);
              onAction(individualAction);
            }
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
        // Template tools: expand into primitive actions
        const expanded = expandTemplateToolCall(toolCall.function.name, args);
        if (expanded) {
          for (const action of expanded) {
            actions.push(action);
          }
        } else if (toolCall.function.name === 'create_objects_batch') {
          const intercepted = interceptBatchAsTemplate(args);
          if (intercepted) {
            for (const action of intercepted) actions.push(action);
          } else {
            for (const obj of (args.objects || [])) {
              const { type, ...objArgs } = obj;
              actions.push({ tool: `create_${type}`, arguments: objArgs });
            }
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
        // Template tools: expand into primitive actions
        const expanded = expandTemplateToolCall(tc.name, args);
        if (expanded) {
          for (const action of expanded) {
            actions.push(action);
            onAction(action);
          }
        } else if (tc.name === 'create_objects_batch') {
          const intercepted = interceptBatchAsTemplate(args);
          if (intercepted) {
            for (const action of intercepted) { actions.push(action); onAction(action); }
          } else {
            for (const obj of (args.objects || [])) {
              const { type, ...objArgs } = obj;
              const individualAction = { tool: `create_${type}`, arguments: objArgs };
              actions.push(individualAction);
              onAction(individualAction);
            }
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
    } else if (toolName === 'create_swot') {
      const total = (args.strengths?.length || 0) + (args.weaknesses?.length || 0) + (args.opportunities?.length || 0) + (args.threats?.length || 0);
      return `Created SWOT analysis with ${total} items across 4 quadrants.`;
    } else if (toolName === 'create_kanban') {
      const cols = args.columns?.length || 0;
      const cards = (args.columns || []).reduce((s: number, c: any) => s + (c.cards?.length || 0), 0);
      return `Created kanban board with ${cols} columns and ${cards} cards.`;
    } else if (toolName === 'create_flowchart') {
      return `Created flowchart with ${args.nodes?.length || 0} nodes and ${args.edges?.length || 0} edges.`;
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
- For flowcharts and diagrams: Do NOT provide x or y coordinates for nodes — layout is handled automatically by the client. Just provide content, IDs, and connectors.
- For non-flowchart requests (scenes, drawings, individual objects): provide x/y as usual.

OBJECT SIZES:
- Sticky notes default to 200x200 px for regular notes. For flowchart/diagram nodes, set width=150, height=80 — the client will auto-size based on text content.
- Rectangles default to 120x80 but you can set width/height. For background sections, use 400-500px wide.
- Text labels auto-size based on content. Set width to control wrapping.
- IMPORTANT: For flowchart nodes (via create_flowchart), the tool handles sizing automatically.

PLANNING (CRITICAL): Before making ANY tool calls for a scene or complex request, plan your layout internally.
DO NOT write planning text in your response — go directly to your tool call.
Only write a brief summary AFTER all objects are created.

BACKGROUNDS: When creating background or environment elements (sky, ground, water, floors):
- Make them large enough to fill the visible area: at least width=1400, height=900 for a full background
- Center them at x=-700, y=-450 so they cover the entire viewport
- Use a SINGLE large rectangle for each background layer, not multiple small ones

LAYERING: Use the zIndex parameter (0–100) to control which objects appear in front. Lower = behind, higher = in front.
- 0–10: background surfaces (floors, rinks, sky, tables)
- 15–30: large body parts (torso, base circles)
- 35–50: medium parts (mid sections, heads)
- 55–70: small details (eyes, nose, buttons, mouths)
- 75–100: top accessories (hats, bows, items held)
- Always set zIndex for EVERY object. Each object should have a UNIQUE zIndex so stacking order is unambiguous.

Choose colors that make sense (e.g. white for snow, brown for wood, blue for ice).

DEDICATED TEMPLATE TOOLS (CRITICAL):
- For SWOT analyses: ALWAYS use create_swot. Provide title plus strengths/weaknesses/opportunities/threats arrays. Layout is fully automatic.
- For kanban boards: ALWAYS use create_kanban. Provide columns with name and cards. Layout is fully automatic.
- For flowcharts/diagrams: ALWAYS use create_flowchart. Provide nodes (id, text, color) and edges (from, to, label). Layout is fully automatic via ELK.
- NEVER use create_objects_batch for SWOT, kanban, or flowcharts — the dedicated tools produce pixel-perfect layouts.

CONNECTORS & FLOWCHARTS (via create_flowchart):
- Node text should be SHORT and descriptive.
- EVERY node must be connected. For N nodes, provide at least N-1 edges.
- Use color to distinguish node types: green (#4caf50) for start, yellow (#ffeb3b) for process, red (#f44336) for end, blue (#2196f3) for decisions.
- Use edge labels for decision branches (e.g. "YES", "NO").

TEXT & WORDS: To display readable text, titles, labels, captions, or any words on the board, use the create_text tool. It renders clean, readable text at any size. Use fontSize 24-32 for small labels, 48-72 for titles, 96+ for huge headings. You can also use sticky notes for text that belongs on a note card. You MAY still use shapes (rectangles, lines, circles) to draw artistic/decorative lettering if the user specifically asks for it — but for normal readable text, always prefer create_text.

BATCH CREATION (CRITICAL FOR SPEED):
For ANY request that creates more than 3 objects (scenes, drawings, etc.) — but NOT SWOT/kanban/flowcharts (use their dedicated tools) —
you MUST use create_objects_batch to create ALL objects in a single tool call. This is dramatically faster.
Each object in the array has a "type" field (sticky_note, rectangle, circle, line, text, connector)
plus the same properties as the corresponding individual create tool.
Create ALL objects for the entire request in ONE batch call. Connectors can reference IDs of objects earlier in the same batch.
Do NOT output planning text — go straight to the tool call. Output only a brief summary after.

TOOL SELECTION (CRITICAL — read carefully):
- SWOT analysis → ALWAYS use create_swot. NEVER use create_objects_batch for SWOT.
- Kanban board → ALWAYS use create_kanban. NEVER use create_objects_batch for kanban.
- Flowchart / diagram / process → ALWAYS use create_flowchart. NEVER use create_objects_batch for flowcharts.
- Scenes, drawings, multiple shapes → use create_objects_batch.
- Single object → use the individual create tool.

RESPONSE RULES:
- ALWAYS call tools to create objects. NEVER just describe what you would do.
- Fulfill the ENTIRE request — never ask "should I continue?".
- After creating objects, write only a brief summary (e.g. "Here's your SWOT analysis!").
- NEVER ask for confirmation. Just do it.
- Use bulk_update_objects for batch edits, organize_board for rearranging.`;
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
