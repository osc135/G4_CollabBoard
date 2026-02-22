// ELK-based layout engine for charts, diagrams, and structured layouts.
// Replaces the custom Kahn's sort with a battle-tested graph layout library.

import ELK, { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';

const elk = new ELK();

// Layout type detection
export type LayoutType = 'flowchart' | 'swot' | 'kanban' | 'mindmap' | 'grid';

// Detect layout type from user prompt keywords
export function detectLayoutType(prompt: string): LayoutType | null {
  const lower = prompt.toLowerCase();
  if (/\bswot\b/.test(lower)) return 'swot';
  if (/\bkanban\b/.test(lower)) return 'kanban';
  if (/\bmind\s*map\b/.test(lower)) return 'mindmap';
  if (/\b(flowchart|flow\s*chart|process|workflow|diagram|steps|pipeline|decision\s*tree)\b/.test(lower)) return 'flowchart';
  return null; // no structured layout detected
}

// Auto-size a node based on its text content.
// Returns { width, height } that fits the text with padding.
export function autoSizeNode(text: string, minWidth = 140, minHeight = 60, maxWidth = 300): { width: number; height: number } {
  const padding = 24;
  // Rough character width estimate (average character ~8px at ~14px font)
  const charWidth = 8;
  const lineHeight = 20;

  // Estimate how many characters fit per line
  const effectiveMaxWidth = maxWidth - padding * 2;
  const charsPerLine = Math.floor(effectiveMaxWidth / charWidth);

  // Word wrap estimation
  const words = text.split(/\s+/);
  let lines = 1;
  let currentLineLength = 0;
  for (const word of words) {
    if (currentLineLength + word.length + (currentLineLength > 0 ? 1 : 0) > charsPerLine) {
      lines++;
      currentLineLength = word.length;
    } else {
      currentLineLength += (currentLineLength > 0 ? 1 : 0) + word.length;
    }
  }

  // Single line width: fit to content
  const textWidth = Math.min(text.length * charWidth, effectiveMaxWidth);
  const width = Math.max(minWidth, Math.min(maxWidth, textWidth + padding * 2));
  const height = Math.max(minHeight, lines * lineHeight + padding * 2);

  return { width, height };
}

interface LayoutNode {
  id: string;
  width: number;
  height: number;
  text?: string;
  type?: string;
  color?: string;
  [key: string]: any;
}

interface LayoutEdge {
  id: string;
  startObjectId: string;
  endObjectId: string;
  [key: string]: any;
}

interface LayoutResult {
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
  edges: Map<string, { startAnchor: string; endAnchor: string }>;
}

// Main layout function: takes nodes + edges, returns positioned coordinates
export async function computeElkLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  layoutType: LayoutType | null,
  centerX: number,
  centerY: number,
): Promise<LayoutResult> {
  const result: LayoutResult = { nodes: new Map(), edges: new Map() };
  if (nodes.length === 0) return result;

  // SWOT and kanban are now handled server-side by template-expander.ts.
  // If we somehow get here with those types, fall through to ELK.

  // Build ELK graph
  const elkNodes: ElkNode[] = nodes.map(n => ({
    id: n.id,
    width: n.width,
    height: n.height,
  }));

  const elkEdges: ElkExtendedEdge[] = edges.map(e => ({
    id: e.id,
    sources: [e.startObjectId],
    targets: [e.endObjectId],
  }));

  // Configure ELK layout algorithm based on type
  const layoutOptions = getElkOptions(layoutType);

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions,
    children: elkNodes,
    edges: elkEdges,
  };

  try {
    const layoutResult = await elk.layout(elkGraph);

    // Find the bounding box to center on viewport
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const child of layoutResult.children || []) {
      const x = child.x || 0;
      const y = child.y || 0;
      const w = child.width || 0;
      const h = child.height || 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;
    const offsetX = centerX - graphWidth / 2 - minX;
    const offsetY = centerY - graphHeight / 2 - minY;

    for (const child of layoutResult.children || []) {
      result.nodes.set(child.id, {
        x: (child.x || 0) + offsetX,
        y: (child.y || 0) + offsetY,
        width: child.width || 0,
        height: child.height || 0,
      });
    }

    // Extract edge routing info for smart anchor selection
    for (const edge of layoutResult.edges || []) {
      const elkEdge = edge as ElkExtendedEdge;
      const sourceId = elkEdge.sources[0];
      const targetId = elkEdge.targets[0];
      const sourcePos = result.nodes.get(sourceId);
      const targetPos = result.nodes.get(targetId);

      if (sourcePos && targetPos) {
        const anchors = computeSmartAnchors(sourcePos, targetPos);
        result.edges.set(elkEdge.id, anchors);
      }
    }
  } catch (error) {
    console.error('[elk-layout] Layout computation failed, falling back to simple stack:', error);
    return computeFallbackLayout(nodes, edges, centerX, centerY);
  }

  return result;
}

// Compute smart anchors based on relative node positions
function computeSmartAnchors(
  source: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number },
): { startAnchor: string; endAnchor: string } {
  const sourceCX = source.x + source.width / 2;
  const sourceCY = source.y + source.height / 2;
  const targetCX = target.x + target.width / 2;
  const targetCY = target.y + target.height / 2;

  const dx = targetCX - sourceCX;
  const dy = targetCY - sourceCY;

  // Choose anchors based on dominant direction
  if (Math.abs(dy) > Math.abs(dx)) {
    // Primarily vertical
    if (dy > 0) {
      return { startAnchor: 'bottom', endAnchor: 'top' };
    } else {
      return { startAnchor: 'top', endAnchor: 'bottom' };
    }
  } else {
    // Primarily horizontal
    if (dx > 0) {
      return { startAnchor: 'right', endAnchor: 'left' };
    } else {
      return { startAnchor: 'left', endAnchor: 'right' };
    }
  }
}

// ELK options per layout type
function getElkOptions(layoutType: LayoutType | null): Record<string, string> {
  const base: Record<string, string> = {
    'elk.algorithm': 'layered',
    'elk.spacing.nodeNode': '60',
    'elk.layered.spacing.nodeNodeBetweenLayers': '80',
    'elk.edgeRouting': 'ORTHOGONAL',
  };

  switch (layoutType) {
    case 'flowchart':
      return {
        ...base,
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '50',
        'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      };

    case 'mindmap':
      return {
        ...base,
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      };

    default:
      // Generic DAG layout
      return {
        ...base,
        'elk.direction': 'DOWN',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      };
  }
}

// Fallback layout if ELK fails: simple vertical stack
function computeFallbackLayout(
  nodes: LayoutNode[],
  _edges: LayoutEdge[],
  centerX: number,
  centerY: number,
): LayoutResult {
  const result: LayoutResult = { nodes: new Map(), edges: new Map() };
  const gap = 60;
  const totalHeight = nodes.reduce((sum, n) => sum + n.height + gap, -gap);
  let currentY = centerY - totalHeight / 2;

  for (const node of nodes) {
    result.nodes.set(node.id, {
      x: centerX - node.width / 2,
      y: currentY,
      width: node.width,
      height: node.height,
    });
    currentY += node.height + gap;
  }

  return result;
}
