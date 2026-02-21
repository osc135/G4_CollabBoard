export interface TemplateObject {
  type: 'sticky' | 'rectangle' | 'textbox' | 'circle' | 'line';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  fontSize?: number;
  zIndex?: number;
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  objects: TemplateObject[];
}

// All templates are centered so the bounding box midpoint is at (0, 0).
// Coordinates are relative offsets from viewport center.
//
// IMPORTANT: Board.tsx renders rectangles and circles with (x, y) as the CENTER
// of the shape, while stickies and textboxes use (x, y) as TOP-LEFT.
// Rectangle/circle coords below are center-based; sticky/textbox are top-left.

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    id: 'swot',
    name: 'SWOT Analysis',
    description: 'Strengths, Weaknesses, Opportunities, Threats',
    emoji: '📊',
    objects: [
      // Title
      { type: 'textbox', x: -120, y: -415, text: 'SWOT Analysis', fontSize: 28, color: '#1a202c', width: 500, zIndex: 10 },
      // Quadrant labels
      { type: 'textbox', x: -400, y: -325, text: 'Strengths', fontSize: 18, color: '#166534', width: 300, zIndex: 10 },
      { type: 'textbox', x: 40, y: -325, text: 'Weaknesses', fontSize: 18, color: '#991b1b', width: 300, zIndex: 10 },
      { type: 'textbox', x: -400, y: 65, text: 'Opportunities', fontSize: 18, color: '#1e40af', width: 300, zIndex: 10 },
      { type: 'textbox', x: 40, y: 65, text: 'Threats', fontSize: 18, color: '#92400e', width: 300, zIndex: 10 },
      // Quadrant backgrounds (center-based: original top-left + width/2, height/2)
      { type: 'rectangle', x: -220, y: -115, width: 400, height: 300, color: '#bbf7d0', zIndex: 0 },
      { type: 'rectangle', x: 220, y: -115, width: 400, height: 300, color: '#fecaca', zIndex: 0 },
      { type: 'rectangle', x: -220, y: 265, width: 400, height: 300, color: '#bfdbfe', zIndex: 0 },
      { type: 'rectangle', x: 220, y: 265, width: 400, height: 300, color: '#fed7aa', zIndex: 0 },
      // Starter stickies (top-left based, centered within visual rect bounds)
      { type: 'sticky', x: -320, y: -225, width: 200, height: 150, text: 'Add strength...', color: '#4ade80', zIndex: 5 },
      { type: 'sticky', x: 120, y: -225, width: 200, height: 150, text: 'Add weakness...', color: '#f87171', zIndex: 5 },
      { type: 'sticky', x: -320, y: 155, width: 200, height: 150, text: 'Add opportunity...', color: '#60a5fa', zIndex: 5 },
      { type: 'sticky', x: 120, y: 155, width: 200, height: 150, text: 'Add threat...', color: '#fb923c', zIndex: 5 },
    ],
  },
  {
    id: 'meeting',
    name: 'Meeting Notes',
    description: 'Agenda, Action Items, Decisions, and Notes',
    emoji: '📝',
    objects: [
      // Title
      { type: 'textbox', x: -120, y: -440, text: 'Meeting Notes', fontSize: 28, color: '#1a202c', width: 500, zIndex: 10 },
      { type: 'textbox', x: -120, y: -380, text: 'Date: ___  |  Attendees: ___', fontSize: 14, color: '#64748b', width: 500, zIndex: 10 },
      // Section headers
      { type: 'textbox', x: -440, y: -310, text: 'Agenda', fontSize: 18, color: '#7c3aed', width: 300, zIndex: 10 },
      { type: 'textbox', x: 40, y: -310, text: 'Decisions', fontSize: 18, color: '#0891b2', width: 300, zIndex: 10 },
      { type: 'textbox', x: -440, y: 90, text: 'Action Items', fontSize: 18, color: '#dc2626', width: 300, zIndex: 10 },
      { type: 'textbox', x: 40, y: 90, text: 'Notes', fontSize: 18, color: '#65a30d', width: 300, zIndex: 10 },
      // Section backgrounds (center-based: original top-left + 220, +150)
      { type: 'rectangle', x: -240, y: -100, width: 440, height: 300, color: '#ede9fe', zIndex: 0 },
      { type: 'rectangle', x: 240, y: -100, width: 440, height: 300, color: '#cffafe', zIndex: 0 },
      { type: 'rectangle', x: -240, y: 290, width: 440, height: 300, color: '#fee2e2', zIndex: 0 },
      { type: 'rectangle', x: 240, y: 290, width: 440, height: 300, color: '#ecfccb', zIndex: 0 },
      // Starter stickies (top-left based)
      { type: 'sticky', x: -340, y: -210, width: 200, height: 150, text: 'Topic 1...', color: '#c4b5fd', zIndex: 5 },
      { type: 'sticky', x: 140, y: -210, width: 200, height: 150, text: 'Decision...', color: '#67e8f9', zIndex: 5 },
      { type: 'sticky', x: -340, y: 180, width: 200, height: 150, text: 'TODO: ...', color: '#fca5a5', zIndex: 5 },
      { type: 'sticky', x: 140, y: 180, width: 200, height: 150, text: 'Note...', color: '#bef264', zIndex: 5 },
    ],
  },
  {
    id: 'retro',
    name: 'Retrospective',
    description: 'What went well, What didn\'t, Action items',
    emoji: '🔄',
    objects: [
      // Title
      { type: 'textbox', x: -175, y: -350, text: 'Sprint Retrospective', fontSize: 28, color: '#1a202c', width: 600, zIndex: 10 },
      // Column headers
      { type: 'textbox', x: -505, y: -260, text: 'What Went Well', fontSize: 18, color: '#166534', width: 300, zIndex: 10 },
      { type: 'textbox', x: -145, y: -260, text: "What Didn't Go Well", fontSize: 18, color: '#991b1b', width: 300, zIndex: 10 },
      { type: 'textbox', x: 225, y: -260, text: 'Action Items', fontSize: 18, color: '#1e40af', width: 300, zIndex: 10 },
      // Column backgrounds (center-based: original top-left + 165, +275)
      { type: 'rectangle', x: -360, y: 75, width: 330, height: 550, color: '#dcfce7', zIndex: 0 },
      { type: 'rectangle', x: 0, y: 75, width: 330, height: 550, color: '#fee2e2', zIndex: 0 },
      { type: 'rectangle', x: 360, y: 75, width: 330, height: 550, color: '#dbeafe', zIndex: 0 },
      // Starter stickies (top-left based)
      { type: 'sticky', x: -460, y: -150, width: 200, height: 150, text: 'Something good...', color: '#4ade80', zIndex: 5 },
      { type: 'sticky', x: -460, y: 40, width: 200, height: 150, text: 'Another win...', color: '#86efac', zIndex: 5 },
      { type: 'sticky', x: -100, y: -150, width: 200, height: 150, text: 'Pain point...', color: '#f87171', zIndex: 5 },
      { type: 'sticky', x: -100, y: 40, width: 200, height: 150, text: 'Could improve...', color: '#fca5a5', zIndex: 5 },
      { type: 'sticky', x: 260, y: -150, width: 200, height: 150, text: 'TODO: ...', color: '#60a5fa', zIndex: 5 },
      { type: 'sticky', x: 260, y: 40, width: 200, height: 150, text: 'Follow up on...', color: '#93c5fd', zIndex: 5 },
    ],
  },
  {
    id: 'brainstorm',
    name: 'Brainstorm',
    description: 'Central topic with surrounding ideas',
    emoji: '💡',
    objects: [
      // Central topic (circle is center-based: original top-left + 100, +100)
      { type: 'circle', x: -10, y: 10, width: 200, height: 200, color: '#8b5cf6', zIndex: 5 },
      { type: 'textbox', x: -90, y: -10, text: 'Main Topic', fontSize: 18, color: '#ffffff', width: 160, zIndex: 10 },
      // Surrounding stickies in a ring
      { type: 'sticky', x: -150, y: -430, width: 200, height: 150, text: 'Idea 1...', color: '#fbbf24', zIndex: 5 },
      { type: 'sticky', x: 210, y: -330, width: 200, height: 150, text: 'Idea 2...', color: '#34d399', zIndex: 5 },
      { type: 'sticky', x: 290, y: 0, width: 200, height: 150, text: 'Idea 3...', color: '#60a5fa', zIndex: 5 },
      { type: 'sticky', x: 130, y: 280, width: 200, height: 150, text: 'Idea 4...', color: '#f472b6', zIndex: 5 },
      { type: 'sticky', x: -330, y: 280, width: 200, height: 150, text: 'Idea 5...', color: '#a78bfa', zIndex: 5 },
      { type: 'sticky', x: -490, y: 0, width: 200, height: 150, text: 'Idea 6...', color: '#fb923c', zIndex: 5 },
      { type: 'sticky', x: -420, y: -330, width: 200, height: 150, text: 'Idea 7...', color: '#2dd4bf', zIndex: 5 },
    ],
  },
  {
    id: 'kanban',
    name: 'Kanban Board',
    description: 'To Do, In Progress, Done columns',
    emoji: '📋',
    objects: [
      // Title
      { type: 'textbox', x: -175, y: -375, text: 'Kanban Board', fontSize: 28, color: '#1a202c', width: 600, zIndex: 10 },
      // Column headers
      { type: 'textbox', x: -505, y: -285, text: 'To Do', fontSize: 18, color: '#6b7280', width: 300, zIndex: 10 },
      { type: 'textbox', x: -145, y: -285, text: 'In Progress', fontSize: 18, color: '#2563eb', width: 300, zIndex: 10 },
      { type: 'textbox', x: 225, y: -285, text: 'Done', fontSize: 18, color: '#16a34a', width: 300, zIndex: 10 },
      // Column backgrounds (center-based: original top-left + 165, +300)
      { type: 'rectangle', x: -360, y: 75, width: 330, height: 600, color: '#f1f5f9', zIndex: 0 },
      { type: 'rectangle', x: 0, y: 75, width: 330, height: 600, color: '#eff6ff', zIndex: 0 },
      { type: 'rectangle', x: 360, y: 75, width: 330, height: 600, color: '#f0fdf4', zIndex: 0 },
      // To Do stickies (top-left based)
      { type: 'sticky', x: -460, y: -175, width: 200, height: 150, text: 'Task 1...', color: '#e2e8f0', zIndex: 5 },
      { type: 'sticky', x: -460, y: 15, width: 200, height: 150, text: 'Task 2...', color: '#e2e8f0', zIndex: 5 },
      { type: 'sticky', x: -460, y: 205, width: 200, height: 150, text: 'Task 3...', color: '#e2e8f0', zIndex: 5 },
      // In Progress stickies
      { type: 'sticky', x: -100, y: -175, width: 200, height: 150, text: 'Working on...', color: '#bfdbfe', zIndex: 5 },
      // Done stickies
      { type: 'sticky', x: 260, y: -175, width: 200, height: 150, text: 'Completed!', color: '#bbf7d0', zIndex: 5 },
    ],
  },
];
