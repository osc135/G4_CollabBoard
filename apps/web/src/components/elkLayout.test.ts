import { describe, it, expect } from 'vitest';
import { detectLayoutType, autoSizeNode, computeElkLayout } from './elkLayout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, text = id, width = 150, height = 80): any {
  return { id, text, width, height, type: 'sticky' };
}

function makeEdge(from: string, to: string): any {
  return { id: `edge-${from}-${to}`, startObjectId: from, endObjectId: to };
}

/** Check that two rectangles do not overlap (with a small tolerance). */
function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  tolerance = 1,
): boolean {
  return !(
    a.x + a.width <= b.x + tolerance ||
    b.x + b.width <= a.x + tolerance ||
    a.y + a.height <= b.y + tolerance ||
    b.y + b.height <= a.y + tolerance
  );
}

// ===========================================================================
// 1. detectLayoutType
// ===========================================================================

describe('detectLayoutType', () => {
  it('detects "flowchart" keyword', () => {
    expect(detectLayoutType('Create a flowchart for onboarding')).toBe('flowchart');
  });

  it('detects "flow chart" (two words)', () => {
    expect(detectLayoutType('Make a flow chart')).toBe('flowchart');
  });

  it('detects "process"', () => {
    expect(detectLayoutType('Show the process for hiring')).toBe('flowchart');
  });

  it('detects "workflow"', () => {
    expect(detectLayoutType('Design a workflow')).toBe('flowchart');
  });

  it('detects "diagram"', () => {
    expect(detectLayoutType('Draw a diagram of the system')).toBe('flowchart');
  });

  it('detects "steps"', () => {
    expect(detectLayoutType('List the steps to deploy')).toBe('flowchart');
  });

  it('detects "pipeline"', () => {
    expect(detectLayoutType('CI/CD pipeline overview')).toBe('flowchart');
  });

  it('detects "decision tree"', () => {
    expect(detectLayoutType('Build a decision tree')).toBe('flowchart');
  });

  it('detects "swot"', () => {
    expect(detectLayoutType('Create a SWOT analysis')).toBe('swot');
  });

  it('detects "kanban"', () => {
    expect(detectLayoutType('Make a kanban board')).toBe('kanban');
  });

  it('detects "mindmap" (one word)', () => {
    expect(detectLayoutType('Generate a mindmap for brainstorming')).toBe('mindmap');
  });

  it('detects "mind map" (two words)', () => {
    expect(detectLayoutType('Create a mind map')).toBe('mindmap');
  });

  it('is case-insensitive', () => {
    expect(detectLayoutType('SWOT Analysis')).toBe('swot');
    expect(detectLayoutType('KANBAN Board')).toBe('kanban');
    expect(detectLayoutType('FLOWCHART')).toBe('flowchart');
    expect(detectLayoutType('Mind Map')).toBe('mindmap');
  });

  it('returns null for unrecognized prompts', () => {
    expect(detectLayoutType('Hello, how are you?')).toBeNull();
    expect(detectLayoutType('Make a nice picture')).toBeNull();
    expect(detectLayoutType('')).toBeNull();
  });

  it('SWOT takes priority over flowchart keywords', () => {
    // "swot" regex is checked first
    expect(detectLayoutType('Create a SWOT analysis diagram')).toBe('swot');
  });

  it('kanban takes priority over flowchart keywords', () => {
    expect(detectLayoutType('kanban workflow board')).toBe('kanban');
  });
});

// ===========================================================================
// 2. autoSizeNode
// ===========================================================================

describe('autoSizeNode', () => {
  it('returns at least minWidth and minHeight for short text', () => {
    const { width, height } = autoSizeNode('Hi');
    expect(width).toBeGreaterThanOrEqual(140);
    expect(height).toBeGreaterThanOrEqual(60);
  });

  it('returns at least minWidth and minHeight for empty text', () => {
    const { width, height } = autoSizeNode('');
    expect(width).toBeGreaterThanOrEqual(140);
    expect(height).toBeGreaterThanOrEqual(60);
  });

  it('grows width for moderate text', () => {
    const short = autoSizeNode('Hi');
    const longer = autoSizeNode('This is a longer label with more text');
    expect(longer.width).toBeGreaterThanOrEqual(short.width);
  });

  it('does not exceed maxWidth', () => {
    const veryLong = 'A'.repeat(500);
    const { width } = autoSizeNode(veryLong);
    expect(width).toBeLessThanOrEqual(300); // default maxWidth
  });

  it('respects a custom maxWidth', () => {
    const veryLong = 'A'.repeat(500);
    const { width } = autoSizeNode(veryLong, 100, 40, 200);
    expect(width).toBeLessThanOrEqual(200);
  });

  it('respects custom minWidth and minHeight', () => {
    const { width, height } = autoSizeNode('Hi', 200, 100, 400);
    expect(width).toBeGreaterThanOrEqual(200);
    expect(height).toBeGreaterThanOrEqual(100);
  });

  it('increases height for multi-line wrapping text', () => {
    const singleLine = autoSizeNode('Short');
    const multiLine = autoSizeNode(
      'This is a much longer piece of text that will definitely need to wrap across multiple lines inside a node',
    );
    expect(multiLine.height).toBeGreaterThan(singleLine.height);
  });
});

// ===========================================================================
// 3. computeElkLayout — flowchart type
// ===========================================================================

describe('computeElkLayout — flowchart', () => {
  it('positions all nodes', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = await computeElkLayout(nodes, edges, 'flowchart', 500, 400);

    expect(result.nodes.size).toBe(3);
    for (const id of ['a', 'b', 'c']) {
      expect(result.nodes.has(id)).toBe(true);
      const pos = result.nodes.get(id)!;
      expect(typeof pos.x).toBe('number');
      expect(typeof pos.y).toBe('number');
    }
  });

  it('assigns smart anchors to edges', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = await computeElkLayout(nodes, edges, 'flowchart', 500, 400);

    expect(result.edges.size).toBe(2);
    for (const [, anchors] of result.edges) {
      expect(['top', 'bottom', 'left', 'right']).toContain(anchors.startAnchor);
      expect(['top', 'bottom', 'left', 'right']).toContain(anchors.endAnchor);
    }
  });

  it('produces non-overlapping nodes', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'd')];
    const result = await computeElkLayout(nodes, edges, 'flowchart', 500, 400);

    const positioned = [...result.nodes.values()];
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        expect(rectsOverlap(positioned[i], positioned[j])).toBe(false);
      }
    }
  });

  it('lays out nodes primarily top-to-bottom (DOWN direction)', async () => {
    const nodes = [makeNode('start'), makeNode('middle'), makeNode('end')];
    const edges = [makeEdge('start', 'middle'), makeEdge('middle', 'end')];
    const result = await computeElkLayout(nodes, edges, 'flowchart', 500, 400);

    const yStart = result.nodes.get('start')!.y;
    const yMiddle = result.nodes.get('middle')!.y;
    const yEnd = result.nodes.get('end')!.y;
    expect(yStart).toBeLessThan(yMiddle);
    expect(yMiddle).toBeLessThan(yEnd);
  });
});

// Note: SWOT and kanban layout are now handled server-side by template-expander.ts.
// computeElkLayout with 'swot' or 'kanban' type now falls through to ELK layout.

// ===========================================================================
// 6. computeElkLayout — mindmap type
// ===========================================================================

describe('computeElkLayout — mindmap', () => {
  it('positions nodes using RIGHT direction', async () => {
    const nodes = [makeNode('center', 'Main Idea'), makeNode('b1', 'Branch 1'), makeNode('b2', 'Branch 2')];
    const edges = [makeEdge('center', 'b1'), makeEdge('center', 'b2')];
    const result = await computeElkLayout(nodes, edges, 'mindmap', 500, 400);

    expect(result.nodes.size).toBe(3);

    const centerPos = result.nodes.get('center')!;
    const b1Pos = result.nodes.get('b1')!;
    const b2Pos = result.nodes.get('b2')!;

    // Branches should be to the right of center node
    expect(b1Pos.x).toBeGreaterThan(centerPos.x);
    expect(b2Pos.x).toBeGreaterThan(centerPos.x);
  });

  it('nodes do not overlap', async () => {
    const nodes = [
      makeNode('root', 'Root'),
      makeNode('a', 'A'),
      makeNode('b', 'B'),
      makeNode('c', 'C'),
    ];
    const edges = [makeEdge('root', 'a'), makeEdge('root', 'b'), makeEdge('root', 'c')];
    const result = await computeElkLayout(nodes, edges, 'mindmap', 500, 400);

    const positioned = [...result.nodes.values()];
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        expect(rectsOverlap(positioned[i], positioned[j])).toBe(false);
      }
    }
  });
});

// ===========================================================================
// 7. computeElkLayout — null type (generic DAG)
// ===========================================================================

describe('computeElkLayout — null (generic DAG)', () => {
  it('still positions all nodes', async () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('a', 'c')];
    const result = await computeElkLayout(nodes, edges, null, 500, 400);

    expect(result.nodes.size).toBe(3);
    for (const id of ['a', 'b', 'c']) {
      expect(result.nodes.has(id)).toBe(true);
    }
  });

  it('computes edge anchors', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    const result = await computeElkLayout(nodes, edges, null, 500, 400);

    expect(result.edges.size).toBe(1);
    const anchors = result.edges.get('edge-a-b')!;
    expect(anchors).toBeDefined();
    expect(['top', 'bottom', 'left', 'right']).toContain(anchors.startAnchor);
    expect(['top', 'bottom', 'left', 'right']).toContain(anchors.endAnchor);
  });

  it('nodes do not overlap', async () => {
    const nodes = [makeNode('x'), makeNode('y'), makeNode('z')];
    const edges = [makeEdge('x', 'y'), makeEdge('y', 'z')];
    const result = await computeElkLayout(nodes, edges, null, 500, 400);

    const positioned = [...result.nodes.values()];
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        expect(rectsOverlap(positioned[i], positioned[j])).toBe(false);
      }
    }
  });
});

// ===========================================================================
// 8. Smart anchors
// ===========================================================================

describe('smart anchors', () => {
  it('uses bottom->top for vertical (downward) flow', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    // flowchart goes DOWN, so source is above target
    const result = await computeElkLayout(nodes, edges, 'flowchart', 500, 400);

    const anchors = result.edges.get('edge-a-b')!;
    expect(anchors.startAnchor).toBe('bottom');
    expect(anchors.endAnchor).toBe('top');
  });

  it('uses right->left for horizontal (rightward) flow', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];
    // mindmap goes RIGHT
    const result = await computeElkLayout(nodes, edges, 'mindmap', 500, 400);

    const anchors = result.edges.get('edge-a-b')!;
    expect(anchors.startAnchor).toBe('right');
    expect(anchors.endAnchor).toBe('left');
  });
});

// ===========================================================================
// 9. Empty inputs
// ===========================================================================

describe('empty inputs', () => {
  it('returns empty result for empty nodes array', async () => {
    const result = await computeElkLayout([], [], 'flowchart', 500, 400);
    expect(result.nodes.size).toBe(0);
    expect(result.edges.size).toBe(0);
  });

  it('returns empty result for null layout type with no nodes', async () => {
    const result = await computeElkLayout([], [], null, 500, 400);
    expect(result.nodes.size).toBe(0);
    expect(result.edges.size).toBe(0);
  });

  it('returns empty result for swot with no nodes', async () => {
    const result = await computeElkLayout([], [], 'swot', 500, 400);
    expect(result.nodes.size).toBe(0);
    expect(result.edges.size).toBe(0);
  });

  it('returns empty result for kanban with no nodes', async () => {
    const result = await computeElkLayout([], [], 'kanban', 500, 400);
    expect(result.nodes.size).toBe(0);
    expect(result.edges.size).toBe(0);
  });
});

// ===========================================================================
// 10. Centering
// ===========================================================================

describe('centering around centerX/centerY', () => {
  it('graph bounding box is centered on the given coordinates (flowchart)', async () => {
    const cx = 800;
    const cy = 600;
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];
    const result = await computeElkLayout(nodes, edges, 'flowchart', cx, cy);

    const positions = [...result.nodes.values()];
    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x + p.width));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y + p.height));

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    // Should be within a small tolerance of the given center
    expect(Math.abs(graphCenterX - cx)).toBeLessThan(5);
    expect(Math.abs(graphCenterY - cy)).toBeLessThan(5);
  });

  it('graph bounding box is centered on the given coordinates (generic DAG)', async () => {
    const cx = 300;
    const cy = 200;
    const nodes = [makeNode('x'), makeNode('y')];
    const edges = [makeEdge('x', 'y')];
    const result = await computeElkLayout(nodes, edges, null, cx, cy);

    const positions = [...result.nodes.values()];
    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x + p.width));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y + p.height));

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    expect(Math.abs(graphCenterX - cx)).toBeLessThan(5);
    expect(Math.abs(graphCenterY - cy)).toBeLessThan(5);
  });

  it('different center values produce different positions', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result1 = await computeElkLayout(nodes, edges, 'flowchart', 0, 0);
    const result2 = await computeElkLayout(nodes, edges, 'flowchart', 1000, 1000);

    const pos1 = result1.nodes.get('a')!;
    const pos2 = result2.nodes.get('a')!;

    expect(pos2.x).toBeGreaterThan(pos1.x);
    expect(pos2.y).toBeGreaterThan(pos1.y);
  });
});
