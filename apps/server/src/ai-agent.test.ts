import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIBoardAgent } from './ai-agent';
import type { BoardObject } from '@collabboard/shared';

describe('AIBoardAgent', () => {
  let agent: AIBoardAgent;

  beforeEach(() => {
    agent = new AIBoardAgent();
  });

  describe('initialization', () => {
    it('should create an instance', () => {
      expect(agent).toBeDefined();
      expect(agent).toBeInstanceOf(AIBoardAgent);
    });

    it('should have a unique agent ID', () => {
      const agent2 = new AIBoardAgent();
      expect(agent.getId()).toBeDefined();
      expect(agent2.getId()).toBeDefined();
      expect(agent.getId()).not.toBe(agent2.getId());
    });

    it('should have default name "AI Assistant"', () => {
      expect(agent.getName()).toBe('AI Assistant');
    });

    it('should allow custom name', () => {
      const customAgent = new AIBoardAgent('Board Helper');
      expect(customAgent.getName()).toBe('Board Helper');
    });
  });

  describe('board analysis', () => {
    it('should analyze empty board', async () => {
      const objects: BoardObject[] = [];
      const analysis = await agent.analyzeBoard(objects);
      
      expect(analysis).toBeDefined();
      expect(analysis.objectCount).toBe(0);
      expect(analysis.suggestions).toContain('Board is empty. Try adding some sticky notes to get started.');
    });

    it('should count objects correctly', async () => {
      const objects: BoardObject[] = [
        { id: '1', type: 'sticky', x: 0, y: 0, width: 200, height: 80, text: 'Task 1', color: '#ffeb3b' },
        { id: '2', type: 'sticky', x: 100, y: 0, width: 200, height: 80, text: 'Task 2', color: '#ffeb3b' },
        { id: '3', type: 'rectangle', x: 200, y: 0, width: 100, height: 50, color: '#3b82f6', rotation: 0 }
      ];
      
      const analysis = await agent.analyzeBoard(objects);
      expect(analysis.objectCount).toBe(3);
      expect(analysis.stickyCount).toBe(2);
      expect(analysis.shapeCount).toBe(1);
    });

    it('should identify clusters of objects', async () => {
      const objects: BoardObject[] = [
        // Cluster 1 - close together
        { id: '1', type: 'sticky', x: 0, y: 0, width: 200, height: 80, text: 'Task 1', color: '#ffeb3b' },
        { id: '2', type: 'sticky', x: 50, y: 50, width: 200, height: 80, text: 'Task 2', color: '#ffeb3b' },
        // Cluster 2 - far away
        { id: '3', type: 'sticky', x: 1000, y: 1000, width: 200, height: 80, text: 'Task 3', color: '#4caf50' },
        { id: '4', type: 'sticky', x: 1050, y: 1050, width: 200, height: 80, text: 'Task 4', color: '#4caf50' }
      ];
      
      const analysis = await agent.analyzeBoard(objects);
      expect(analysis.clusters).toBeDefined();
      expect(analysis.clusters.length).toBe(2);
    });
  });

  describe('suggestions', () => {
    it('should suggest organizing scattered notes', async () => {
      const objects: BoardObject[] = [
        { id: '1', type: 'sticky', x: 0, y: 0, width: 200, height: 80, text: 'Random', color: '#ffeb3b' },
        { id: '2', type: 'sticky', x: 500, y: 800, width: 200, height: 80, text: 'Scattered', color: '#4caf50' },
        { id: '3', type: 'sticky', x: 1200, y: 200, width: 200, height: 80, text: 'Notes', color: '#ff9800' },
        { id: '4', type: 'sticky', x: 300, y: 1500, width: 200, height: 80, text: 'Everywhere', color: '#f44336' }
      ];
      
      const suggestions = await agent.getSuggestions(objects);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toMatch(/organizing|organize|group|arrange/i);
    });

    it('should suggest using colors for categorization', async () => {
      const objects: BoardObject[] = Array(10).fill(null).map((_, i) => ({
        id: `${i}`,
        type: 'sticky' as const,
        x: i * 100,
        y: 0,
        width: 200,
        height: 80,
        text: `Task ${i}`,
        color: '#ffeb3b' // All same color
      }));
      
      const suggestions = await agent.getSuggestions(objects);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]).toMatch(/color.*categorize|different colors/i);
    });
  });

  describe('auto-organize', () => {
    it('should group stickies by color', async () => {
      const objects: BoardObject[] = [
        { id: '1', type: 'sticky', x: 0, y: 0, width: 200, height: 80, text: 'Yellow 1', color: '#ffeb3b' },
        { id: '2', type: 'sticky', x: 500, y: 500, width: 200, height: 80, text: 'Green 1', color: '#4caf50' },
        { id: '3', type: 'sticky', x: 200, y: 800, width: 200, height: 80, text: 'Yellow 2', color: '#ffeb3b' },
        { id: '4', type: 'sticky', x: 1000, y: 100, width: 200, height: 80, text: 'Green 2', color: '#4caf50' }
      ];
      
      const organized = await agent.autoOrganize(objects, 'color');
      
      // Yellow stickies should be near each other
      const yellow1 = organized.find(o => o.id === '1');
      const yellow2 = organized.find(o => o.id === '3');
      
      // Type guard to ensure we have positioned objects
      if (yellow1 && yellow2 && 'x' in yellow1 && 'x' in yellow2 && 'y' in yellow1 && 'y' in yellow2) {
        const distance = Math.sqrt(
          Math.pow(yellow1.x - yellow2.x, 2) + 
          Math.pow(yellow1.y - yellow2.y, 2)
        );
        expect(distance).toBeLessThan(300);
      } else {
        expect.fail('Objects should have x,y coordinates');
      }
    });

    it('should create grid layout', async () => {
      const objects: BoardObject[] = Array(9).fill(null).map((_, i) => ({
        id: `${i}`,
        type: 'sticky' as const,
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        width: 200,
        height: 80,
        text: `Note ${i}`,
        color: '#ffeb3b'
      }));
      
      const organized = await agent.autoOrganize(objects, 'grid');
      
      // Check if arranged in 3x3 grid
      const positions = organized
        .filter(o => 'x' in o && 'y' in o)
        .map(o => ({ x: (o as any).x, y: (o as any).y }));
      const uniqueX = [...new Set(positions.map(p => p.x))];
      const uniqueY = [...new Set(positions.map(p => p.y))];
      
      expect(uniqueX.length).toBe(3);
      expect(uniqueY.length).toBe(3);
    });
  });

  describe('natural language commands', () => {
    it('should understand "create a sticky note"', async () => {
      const command = 'Create a sticky note that says "Buy milk"';
      const action = await agent.parseCommand(command);
      
      expect(action.type).toBe('create');
      expect(action.objectType).toBe('sticky');
      expect(action.text).toBe('Buy milk');
    });

    it('should understand "delete all red stickies"', async () => {
      const command = 'Delete all red sticky notes';
      const action = await agent.parseCommand(command);
      
      expect(action.type).toBe('delete');
      expect(action.filter).toEqual({ type: 'sticky', color: 'red' });
    });

    it('should understand "move everything to the left"', async () => {
      const command = 'Move all objects to the left side';
      const action = await agent.parseCommand(command);
      
      expect(action.type).toBe('move');
      expect(action.direction).toBe('left');
      expect(action.target).toBe('all');
    });

    it('should return error for unknown commands', async () => {
      const command = 'Do something impossible';
      const action = await agent.parseCommand(command);
      
      expect(action.type).toBe('error');
      expect(action.message).toContain('understand');
    });
  });

  describe('collaboration features', () => {
    it('should track agent activity', async () => {
      const activity = agent.getActivity();
      expect(activity).toHaveProperty('lastActive');
      expect(activity).toHaveProperty('actionsPerformed');
      expect(activity.actionsPerformed).toBe(0);
    });

    it('should increment action counter', async () => {
      await agent.analyzeBoard([]);
      const activity = agent.getActivity();
      expect(activity.actionsPerformed).toBe(1);
    });

    it('should have a cursor position', () => {
      const cursor = agent.getCursor();
      expect(cursor).toHaveProperty('x');
      expect(cursor).toHaveProperty('y');
      expect(cursor).toHaveProperty('visible');
      expect(cursor.visible).toBe(false); // Hidden by default
    });

    it('should show cursor when active', async () => {
      agent.setActive(true);
      const cursor = agent.getCursor();
      expect(cursor.visible).toBe(true);
    });
  });

  describe('feature availability', () => {
    it('should indicate when features are coming soon', async () => {
      const status = await agent.getFeatureStatus();
      expect(status.available).toBe(false);
      expect(status.message).toBe('AI Board Agent feature coming soon!');
      expect(status.expectedDate).toBeDefined();
    });
  });
});