import type { BoardObject } from '@collabboard/shared';

interface BoardAnalysis {
  objectCount: number;
  stickyCount: number;
  shapeCount: number;
  clusters: Array<{ id: string; objects: BoardObject[] }>;
  suggestions: string[];
}

interface CommandAction {
  type: 'create' | 'delete' | 'move' | 'organize' | 'error';
  objectType?: 'sticky' | 'rectangle' | 'circle' | 'line';
  text?: string;
  filter?: { type?: string; color?: string };
  direction?: 'left' | 'right' | 'up' | 'down';
  target?: 'all' | 'selected';
  message?: string;
}

interface AgentActivity {
  lastActive: Date;
  actionsPerformed: number;
}

interface AgentCursor {
  x: number;
  y: number;
  visible: boolean;
}

interface FeatureStatus {
  available: boolean;
  message: string;
  expectedDate?: string;
}

export class AIBoardAgent {
  private id: string;
  private name: string;
  private actionsPerformed: number = 0;
  private lastActive: Date = new Date();
  private isActive: boolean = false;
  private cursorPosition = { x: 0, y: 0 };

  constructor(name: string = 'AI Assistant') {
    this.id = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = name;
  }

  getId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  async analyzeBoard(objects: BoardObject[]): Promise<BoardAnalysis> {
    this.actionsPerformed++;
    this.lastActive = new Date();

    const stickyCount = objects.filter(o => o.type === 'sticky').length;
    const shapeCount = objects.filter(o => ['rectangle', 'circle', 'line'].includes(o.type)).length;
    
    const clusters = this.identifyClusters(objects);
    const suggestions: string[] = [];

    if (objects.length === 0) {
      suggestions.push('Board is empty. Try adding some sticky notes to get started.');
    }

    return {
      objectCount: objects.length,
      stickyCount,
      shapeCount,
      clusters,
      suggestions
    };
  }

  private identifyClusters(objects: BoardObject[]): Array<{ id: string; objects: BoardObject[] }> {
    if (objects.length === 0) return [];

    const clusters: Array<{ id: string; objects: BoardObject[] }> = [];
    const processed = new Set<string>();
    const clusterDistance = 200; // Objects within 200px are considered clustered

    // Filter only objects that have x,y coordinates
    const positionedObjects = objects.filter(obj => 
      'x' in obj && 'y' in obj
    );

    positionedObjects.forEach(obj => {
      if (processed.has(obj.id)) return;

      const cluster = {
        id: `cluster-${clusters.length + 1}`,
        objects: [obj]
      };

      positionedObjects.forEach(other => {
        if (other.id === obj.id || processed.has(other.id)) return;
        
        const distance = Math.sqrt(
          Math.pow(other.x - obj.x, 2) + 
          Math.pow(other.y - obj.y, 2)
        );

        if (distance < clusterDistance) {
          cluster.objects.push(other);
          processed.add(other.id);
        }
      });

      processed.add(obj.id);
      clusters.push(cluster);
    });

    return clusters;
  }

  async getSuggestions(objects: BoardObject[]): Promise<string[]> {
    const suggestions: string[] = [];

    // Check for scattered notes
    if (objects.length >= 4) {
      const avgDistance = this.calculateAverageDistance(objects);
      if (avgDistance > 500) {
        suggestions.push('Your notes seem scattered. Consider organizing them into groups.');
      }
    }

    // Check for color variety
    const stickyNotes = objects.filter(o => o.type === 'sticky');
    if (stickyNotes.length >= 10) {
      const colors = new Set(stickyNotes.map(s => s.color));
      if (colors.size === 1) {
        suggestions.push('Try using different colors to categorize your sticky notes.');
      }
    }

    return suggestions;
  }

  private calculateAverageDistance(objects: BoardObject[]): number {
    // Filter only objects that have x,y coordinates
    const positionedObjects = objects.filter(obj => 
      'x' in obj && 'y' in obj
    );
    
    if (positionedObjects.length < 2) return 0;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < positionedObjects.length; i++) {
      for (let j = i + 1; j < positionedObjects.length; j++) {
        const distance = Math.sqrt(
          Math.pow(positionedObjects[j].x - positionedObjects[i].x, 2) + 
          Math.pow(positionedObjects[j].y - positionedObjects[i].y, 2)
        );
        totalDistance += distance;
        count++;
      }
    }

    return totalDistance / count;
  }

  async autoOrganize(objects: BoardObject[], strategy: 'color' | 'grid' | 'type'): Promise<BoardObject[]> {
    this.actionsPerformed++;
    this.lastActive = new Date();

    const organized = [...objects];

    if (strategy === 'color') {
      // Group by color
      const colorGroups = new Map<string, BoardObject[]>();
      
      objects.forEach(obj => {
        if (obj.type === 'sticky' && 'color' in obj && obj.color) {
          const group = colorGroups.get(obj.color) || [];
          group.push(obj);
          colorGroups.set(obj.color, group);
        }
      });

      let xOffset = 100;
      colorGroups.forEach(group => {
        group.forEach((obj, index) => {
          const idx = organized.findIndex(o => o.id === obj.id);
          if (idx >= 0 && 'x' in organized[idx] && 'y' in organized[idx]) {
            const organizedObj = organized[idx] as any;
            organizedObj.x = xOffset + (index % 3) * 250;
            organizedObj.y = 100 + Math.floor(index / 3) * 150;
          }
        });
        xOffset += 800;
      });
    } else if (strategy === 'grid') {
      // Arrange in grid - only positioned objects
      const positionedObjects = organized.filter(obj => 'x' in obj && 'y' in obj);
      const gridSize = Math.ceil(Math.sqrt(positionedObjects.length));
      
      positionedObjects.forEach((obj, index) => {
        if ('x' in obj && 'y' in obj) {
          (obj as any).x = 100 + (index % gridSize) * 250;
          (obj as any).y = 100 + Math.floor(index / gridSize) * 150;
        }
      });
    }

    return organized;
  }

  async parseCommand(command: string): Promise<CommandAction> {
    const lowerCommand = command.toLowerCase();

    // Create commands
    if (lowerCommand.includes('create') && lowerCommand.includes('sticky')) {
      const textMatch = command.match(/["'](.+?)["']/);
      return {
        type: 'create',
        objectType: 'sticky',
        text: textMatch ? textMatch[1] : undefined
      };
    }

    // Delete commands
    if (lowerCommand.includes('delete')) {
      const colorMatch = lowerCommand.match(/(red|yellow|green|blue|orange|pink)/);
      return {
        type: 'delete',
        filter: {
          type: lowerCommand.includes('sticky') ? 'sticky' : undefined,
          color: colorMatch ? colorMatch[1] : undefined
        }
      };
    }

    // Move commands
    if (lowerCommand.includes('move')) {
      const directionMatch = lowerCommand.match(/(left|right|up|down)/);
      return {
        type: 'move',
        direction: directionMatch ? directionMatch[1] as any : 'left',
        target: lowerCommand.includes('all') ? 'all' : 'selected'
      };
    }

    return {
      type: 'error',
      message: "I don't understand that command yet."
    };
  }

  getActivity(): AgentActivity {
    return {
      lastActive: this.lastActive,
      actionsPerformed: this.actionsPerformed
    };
  }

  getCursor(): AgentCursor {
    return {
      x: this.cursorPosition.x,
      y: this.cursorPosition.y,
      visible: this.isActive
    };
  }

  setActive(active: boolean): void {
    this.isActive = active;
  }

  async getFeatureStatus(): Promise<FeatureStatus> {
    return {
      available: false,
      message: 'AI Board Agent feature coming soon!',
      expectedDate: 'Q2 2024'
    };
  }
}