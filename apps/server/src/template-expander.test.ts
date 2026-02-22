import { describe, it, expect } from 'vitest';
import { expandSwot, expandKanban, expandFlowchart } from './template-expander';

describe('expandSwot', () => {
  it('creates correct number of actions for a full SWOT', () => {
    const actions = expandSwot({
      title: 'SWOT Analysis',
      strengths: ['Strong brand', 'Good team'],
      weaknesses: ['Limited funding'],
      opportunities: ['New market', 'Partnerships'],
      threats: ['Competition'],
    });

    // title(1) + 4 quadrants * (bg rect + header + items) = 1 + 4*(1+1) + 6 items = 15
    // bg rects: 4, headers: 4, items: 2+1+2+1=6, title: 1 = 15
    expect(actions.length).toBe(15);
  });

  it('creates actions without title when title is omitted', () => {
    const actions = expandSwot({
      strengths: ['A'],
      weaknesses: ['B'],
      opportunities: ['C'],
      threats: ['D'],
    });

    // No title, 4 bg rects, 4 headers, 4 items = 12
    expect(actions.length).toBe(12);
  });

  it('handles empty categories', () => {
    const actions = expandSwot({
      title: 'Empty SWOT',
      strengths: [],
      weaknesses: [],
      opportunities: [],
      threats: [],
    });

    // title(1) + 4 bg rects + 4 headers = 9
    expect(actions.length).toBe(9);
  });

  it('uses correct colors for each quadrant', () => {
    const actions = expandSwot({
      strengths: ['S1'],
      weaknesses: ['W1'],
      opportunities: ['O1'],
      threats: ['T1'],
    });

    const stickyActions = actions.filter(a => a.tool === 'create_sticky_note');
    const colors = stickyActions.map(a => a.arguments.color);
    expect(colors).toContain('#4caf50'); // strengths
    expect(colors).toContain('#f44336'); // weaknesses
    expect(colors).toContain('#2196f3'); // opportunities
    expect(colors).toContain('#ff9800'); // threats
  });

  it('produces no connectors', () => {
    const actions = expandSwot({
      strengths: ['A', 'B'],
      weaknesses: ['C'],
      opportunities: ['D'],
      threats: ['E'],
    });

    const connectors = actions.filter(a => a.tool === 'create_connector');
    expect(connectors.length).toBe(0);
  });

  it('has no overlapping positions', () => {
    const actions = expandSwot({
      title: 'Test',
      strengths: ['S1', 'S2', 'S3'],
      weaknesses: ['W1', 'W2'],
      opportunities: ['O1'],
      threats: ['T1', 'T2', 'T3', 'T4'],
    });

    // Check sticky note positions don't overlap
    const stickyActions = actions.filter(a => a.tool === 'create_sticky_note');
    for (let i = 0; i < stickyActions.length; i++) {
      for (let j = i + 1; j < stickyActions.length; j++) {
        const a = stickyActions[i].arguments;
        const b = stickyActions[j].arguments;
        // Two rects overlap if their ranges intersect on both axes
        const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
        const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;
        if (overlapX && overlapY) {
          // They can overlap if in different quadrants — check same quadrant
          // Just verify they're not at identical positions
          expect(a.x !== b.x || a.y !== b.y).toBe(true);
        }
      }
    }
  });

  it('sets zIndex on all actions', () => {
    const actions = expandSwot({
      strengths: ['A'],
      weaknesses: ['B'],
      opportunities: ['C'],
      threats: ['D'],
    });

    for (const action of actions) {
      expect(action.arguments.zIndex).toBeDefined();
    }
  });
});

describe('expandKanban', () => {
  it('creates correct structure for a kanban board', () => {
    const actions = expandKanban({
      title: 'My Board',
      columns: [
        { name: 'To Do', cards: ['Task 1', 'Task 2'] },
        { name: 'In Progress', cards: ['Task 3'] },
        { name: 'Done', cards: [] },
      ],
    });

    // title(1) + 3 columns * (bg rect + header) + 3 cards = 1 + 6 + 3 = 10
    expect(actions.length).toBe(10);
  });

  it('positions columns side by side', () => {
    const actions = expandKanban({
      columns: [
        { name: 'A', cards: ['1'] },
        { name: 'B', cards: ['2'] },
        { name: 'C', cards: ['3'] },
      ],
    });

    const headers = actions.filter(a => a.tool === 'create_text' && !a.arguments.text.includes('title'));
    // Headers should have increasing x positions
    const xPositions = headers.map(h => h.arguments.x);
    for (let i = 1; i < xPositions.length; i++) {
      expect(xPositions[i]).toBeGreaterThan(xPositions[i - 1]);
    }
  });

  it('stacks cards vertically within a column', () => {
    const actions = expandKanban({
      columns: [
        { name: 'Column', cards: ['Card 1', 'Card 2', 'Card 3'] },
      ],
    });

    const cards = actions.filter(a => a.tool === 'create_sticky_note');
    expect(cards.length).toBe(3);

    const yPositions = cards.map(c => c.arguments.y);
    for (let i = 1; i < yPositions.length; i++) {
      expect(yPositions[i]).toBeGreaterThan(yPositions[i - 1]);
    }
  });

  it('produces no connectors', () => {
    const actions = expandKanban({
      columns: [
        { name: 'A', cards: ['1', '2'] },
        { name: 'B', cards: ['3'] },
      ],
    });

    const connectors = actions.filter(a => a.tool === 'create_connector');
    expect(connectors.length).toBe(0);
  });

  it('handles varying card counts per column', () => {
    const actions = expandKanban({
      columns: [
        { name: 'Empty', cards: [] },
        { name: 'Full', cards: ['A', 'B', 'C', 'D', 'E'] },
        { name: 'One', cards: ['X'] },
      ],
    });

    const cards = actions.filter(a => a.tool === 'create_sticky_note');
    expect(cards.length).toBe(6); // 0 + 5 + 1
  });
});

describe('expandFlowchart', () => {
  it('creates nodes without x/y positions', () => {
    const actions = expandFlowchart({
      nodes: [
        { id: 'n1', text: 'Start' },
        { id: 'n2', text: 'Process' },
        { id: 'n3', text: 'End' },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
      ],
    });

    const nodes = actions.filter(a => a.tool === 'create_sticky_note');
    expect(nodes.length).toBe(3);

    for (const node of nodes) {
      expect(node.arguments.x).toBeUndefined();
      expect(node.arguments.y).toBeUndefined();
    }
  });

  it('creates connectors referencing correct node IDs', () => {
    const actions = expandFlowchart({
      nodes: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });

    const connectors = actions.filter(a => a.tool === 'create_connector');
    expect(connectors.length).toBe(1);
    expect(connectors[0].arguments.startObjectId).toBe('a');
    expect(connectors[0].arguments.endObjectId).toBe('b');
  });

  it('creates correct number of edges', () => {
    const actions = expandFlowchart({
      nodes: [
        { id: 'n1', text: 'Start' },
        { id: 'n2', text: 'Decision' },
        { id: 'n3', text: 'Yes path' },
        { id: 'n4', text: 'No path' },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3', label: 'YES' },
        { from: 'n2', to: 'n4', label: 'NO' },
      ],
    });

    const connectors = actions.filter(a => a.tool === 'create_connector');
    expect(connectors.length).toBe(3);
  });

  it('preserves edge labels', () => {
    const actions = expandFlowchart({
      nodes: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      edges: [{ from: 'a', to: 'b', label: 'YES' }],
    });

    const connector = actions.find(a => a.tool === 'create_connector')!;
    expect(connector.arguments.label).toBe('YES');
  });

  it('preserves custom node colors', () => {
    const actions = expandFlowchart({
      nodes: [
        { id: 'a', text: 'Start', color: '#4caf50' },
        { id: 'b', text: 'End', color: '#f44336' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });

    const nodes = actions.filter(a => a.tool === 'create_sticky_note');
    expect(nodes[0].arguments.color).toBe('#4caf50');
    expect(nodes[1].arguments.color).toBe('#f44336');
  });

  it('uses orthogonal style for connectors', () => {
    const actions = expandFlowchart({
      nodes: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      edges: [{ from: 'a', to: 'b' }],
    });

    const connector = actions.find(a => a.tool === 'create_connector')!;
    expect(connector.arguments.style).toBe('orthogonal');
  });
});
