// Template expander: converts structured AI tool data into arrays of primitive board actions.
// SWOT and kanban produce pre-positioned objects with NO connectors (so client ELK won't activate).
// Flowchart produces nodes without positions + connectors (ELK handles positioning on client).
//
// COORDINATE CONVENTIONS (Board.tsx rendering):
//   - Sticky notes & text: obj.x, obj.y = TOP-LEFT corner
//   - Rectangles: obj.x, obj.y = CENTER point (inner Rect rendered at -w/2, -h/2)
// All positions below are computed as top-left, then rectangles are adjusted to center.

interface BoardAction {
  tool: string;
  arguments: Record<string, any>;
}

// --- SWOT Analysis ---

interface SwotInput {
  title?: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export function expandSwot(input: SwotInput): BoardAction[] {
  const actions: BoardAction[] = [];
  const ts = Date.now();
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${ts}-${idCounter++}`;

  // IMPORTANT: The client enforces a 200x200 minimum on sticky notes.
  // All spacing must account for the ACTUAL rendered size (200x200).
  const noteW = 200;
  const noteH = 200;
  const noteGapX = 16;      // horizontal gap between notes in a row
  const noteGapY = 16;      // vertical gap between note rows
  const headerH = 50;       // space for category header text
  const quadrantPad = 20;   // padding inside quadrant edges
  const colGap = 30;        // gap between left/right quadrant columns
  const rowGap = 30;        // gap between top/bottom quadrant rows
  const titleH = 60;        // space for title
  const titleGap = 20;      // gap between title and grid

  // 2 notes per row inside each quadrant for a wider, shorter layout
  const notesPerRow = 2;
  const quadrantW = notesPerRow * noteW + (notesPerRow - 1) * noteGapX + quadrantPad * 2;

  const quadrantDefs: [string, string, string[]][] = [
    ['Strengths', '#4caf50', input.strengths],
    ['Weaknesses', '#f44336', input.weaknesses],
    ['Opportunities', '#2196f3', input.opportunities],
    ['Threats', '#ff9800', input.threats],
  ];

  // Compute quadrant height: header + rows of notes (2 per row)
  const quadrantContentH = (itemCount: number) => {
    const rows = Math.max(Math.ceil(itemCount / notesPerRow), 0);
    return quadrantPad + headerH +
      rows * noteH + Math.max(rows - 1, 0) * noteGapY + quadrantPad;
  };

  const topRowH = Math.max(
    quadrantContentH(input.strengths.length),
    quadrantContentH(input.weaknesses.length),
  );
  const bottomRowH = Math.max(
    quadrantContentH(input.opportunities.length),
    quadrantContentH(input.threats.length),
  );

  const totalW = quadrantW * 2 + colGap;
  const totalH = (input.title ? titleH + titleGap : 0) + topRowH + rowGap + bottomRowH;

  // Center everything at (0,0) — processAction adds centerX/centerY
  const gridX = Math.round(-totalW / 2);
  const gridY = Math.round(-totalH / 2);

  // Title centered above the grid
  if (input.title) {
    actions.push({
      tool: 'create_text',
      arguments: {
        id: nextId('swot-title'),
        text: input.title,
        fontSize: 28,
        color: '#1a1a1a',
        x: gridX,
        y: gridY,
        width: totalW,
        zIndex: 90,
      },
    });
  }

  const topY = gridY + (input.title ? titleH + titleGap : 0);
  const quadrantPositions = [
    { x: gridX, y: topY },
    { x: gridX + quadrantW + colGap, y: topY },
    { x: gridX, y: topY + topRowH + rowGap },
    { x: gridX + quadrantW + colGap, y: topY + topRowH + rowGap },
  ];
  const quadrantHeights = [topRowH, topRowH, bottomRowH, bottomRowH];

  for (let q = 0; q < 4; q++) {
    const [label, color, items] = quadrantDefs[q];
    const pos = quadrantPositions[q];
    const qH = quadrantHeights[q];

    // Background rectangle (Board.tsx uses center-point coordinates for rectangles)
    actions.push({
      tool: 'create_rectangle',
      arguments: {
        id: nextId('swot-bg'),
        color: color + '18',
        x: pos.x + quadrantW / 2,
        y: pos.y + qH / 2,
        width: quadrantW,
        height: qH,
        zIndex: 1,
      },
    });

    // Category header
    actions.push({
      tool: 'create_text',
      arguments: {
        id: nextId('swot-header'),
        text: label,
        fontSize: 22,
        color,
        x: pos.x + quadrantPad,
        y: pos.y + quadrantPad,
        width: quadrantW - quadrantPad * 2,
        zIndex: 80,
      },
    });

    // Sticky notes in a 2-column grid inside the quadrant
    const firstItemY = pos.y + quadrantPad + headerH;

    for (let i = 0; i < items.length; i++) {
      const col = i % notesPerRow;
      const row = Math.floor(i / notesPerRow);
      actions.push({
        tool: 'create_sticky_note',
        arguments: {
          id: nextId('swot-item'),
          text: items[i],
          color,
          x: pos.x + quadrantPad + col * (noteW + noteGapX),
          y: firstItemY + row * (noteH + noteGapY),
          width: noteW,
          height: noteH,
          zIndex: 50 + i,
        },
      });
    }
  }

  return actions;
}

// --- Kanban Board ---

interface KanbanColumn {
  name: string;
  cards: string[];
}

interface KanbanInput {
  title?: string;
  columns: KanbanColumn[];
}

export function expandKanban(input: KanbanInput): BoardAction[] {
  const actions: BoardAction[] = [];
  const ts = Date.now();
  let idCounter = 0;
  const nextId = (prefix: string) => `${prefix}-${ts}-${idCounter++}`;

  const colWidth = 240;
  const colGap = 24;
  const cardH = 70;
  const cardGap = 12;
  const headerH = 50;
  const numCols = input.columns.length;
  const totalW = numCols * colWidth + (numCols - 1) * colGap;
  const startX = -totalW / 2;
  const startY = input.title ? -250 : -200;

  // Title
  if (input.title) {
    actions.push({
      tool: 'create_text',
      arguments: {
        id: nextId('kanban-title'),
        text: input.title,
        fontSize: 28,
        color: '#1a1a1a',
        x: -200,
        y: startY - 50,
        width: 400,
        zIndex: 90,
      },
    });
  }

  // Column colors cycle
  const colColors = ['#2196f3', '#ff9800', '#4caf50', '#9c27b0', '#f44336', '#00bcd4'];

  for (let c = 0; c < numCols; c++) {
    const col = input.columns[c];
    const cx = startX + c * (colWidth + colGap);
    const color = colColors[c % colColors.length];

    // Column background (Board.tsx uses center-point coordinates for rectangles)
    const colHeight = headerH + cardGap + col.cards.length * (cardH + cardGap) + cardGap;
    actions.push({
      tool: 'create_rectangle',
      arguments: {
        id: nextId('kanban-colbg'),
        color: '#f0f0f0',
        x: cx + colWidth / 2,
        y: startY + colHeight / 2,
        width: colWidth,
        height: colHeight,
        zIndex: 1,
      },
    });

    // Column header
    actions.push({
      tool: 'create_text',
      arguments: {
        id: nextId('kanban-header'),
        text: col.name,
        fontSize: 18,
        color: '#1a1a1a',
        x: cx + 12,
        y: startY + 12,
        width: colWidth - 24,
        zIndex: 80,
      },
    });

    // Cards
    for (let i = 0; i < col.cards.length; i++) {
      actions.push({
        tool: 'create_sticky_note',
        arguments: {
          id: nextId('kanban-card'),
          text: col.cards[i],
          color,
          x: cx + 8,
          y: startY + headerH + cardGap + i * (cardH + cardGap),
          width: colWidth - 16,
          height: cardH,
          zIndex: 50 + i,
        },
      });
    }
  }

  return actions;
}

// --- Flowchart ---

interface FlowchartNode {
  id: string;
  text: string;
  color?: string;
}

interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

interface FlowchartInput {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

export function expandFlowchart(input: FlowchartInput): BoardAction[] {
  const actions: BoardAction[] = [];

  // Nodes: sticky notes with NO x/y — client ELK layout handles positioning
  for (const node of input.nodes) {
    actions.push({
      tool: 'create_sticky_note',
      arguments: {
        id: node.id,
        text: node.text,
        color: node.color || '#ffeb3b',
        width: 150,
        height: 80,
        zIndex: 50,
      },
    });
  }

  // Edges: connectors reference node IDs
  for (const edge of input.edges) {
    actions.push({
      tool: 'create_connector',
      arguments: {
        startObjectId: edge.from,
        endObjectId: edge.to,
        style: 'orthogonal',
        ...(edge.label ? { label: edge.label } : {}),
        zIndex: 10,
      },
    });
  }

  return actions;
}
