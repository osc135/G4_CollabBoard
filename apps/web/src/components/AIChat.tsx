import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// Animated thinking indicator with object count
function ThinkingIndicator({ objectCount }: { objectCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#94a3b8' }}>
      <span className="ai-thinking-dots" style={{ display: 'inline-flex', gap: 3 }}>
        <span style={{ animation: 'aiBounce 1.2s ease-in-out infinite', animationDelay: '0s' }}>●</span>
        <span style={{ animation: 'aiBounce 1.2s ease-in-out infinite', animationDelay: '0.2s' }}>●</span>
        <span style={{ animation: 'aiBounce 1.2s ease-in-out infinite', animationDelay: '0.4s' }}>●</span>
      </span>
      <span>
        {objectCount === 0
          ? 'Thinking...'
          : `Building — ${objectCount} object${objectCount !== 1 ? 's' : ''} placed`}
      </span>
      <style>{`
        @keyframes aiBounce {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface AIResponse {
  message: string;
  actions?: Array<{
    tool: string;
    arguments: any;
  }>;
  error?: string;
}

interface AIActionCallbacks {
  createObject: (object: any) => void;
  updateObject: (object: any) => void;
  deleteObject: (id: string) => void;
}

interface AIChatProps {
  callbacks?: AIActionCallbacks;
  stageRef?: React.RefObject<any>;
  objects?: any[];
  initialPrompt?: string;
  boardConnected?: boolean;
  onInitialPromptConsumed?: () => void;
}

// Client-side layout engine for flowcharts/diagrams.
// Runs after all AI actions are processed. Only activates when connectors exist.
// Uses Kahn's algorithm (topological sort) to assign layers, then positions nodes.
function applyFlowchartLayout(
  liveObjects: Map<string, any>,
  newIds: Set<string>,
  centerX: number,
  centerY: number,
  updateObject: (obj: any) => void,
) {
  const HORIZONTAL_GAP = 40;
  const VERTICAL_GAP = 60;

  // Separate new connectors and new nodes referenced by connectors
  const connectors: any[] = [];
  const connectedNodeIds = new Set<string>();

  for (const id of newIds) {
    const obj = liveObjects.get(id);
    if (!obj) continue;
    if (obj.type === 'connector' && obj.startObjectId && obj.endObjectId) {
      connectors.push(obj);
      connectedNodeIds.add(obj.startObjectId);
      connectedNodeIds.add(obj.endObjectId);
    }
  }

  // Only activate when connectors exist
  if (connectors.length === 0) return;

  // Only reposition nodes that are both new AND referenced by connectors
  const nodeIds = [...connectedNodeIds].filter(id => newIds.has(id) && liveObjects.has(id));
  if (nodeIds.length === 0) return;

  // Build directed graph: parent → children, compute in-degrees
  const children = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    children.set(id, []);
    inDegree.set(id, 0);
  }
  for (const c of connectors) {
    if (children.has(c.startObjectId) && inDegree.has(c.endObjectId)) {
      children.get(c.startObjectId)!.push(c.endObjectId);
      inDegree.set(c.endObjectId, (inDegree.get(c.endObjectId) || 0) + 1);
    }
  }

  // Kahn's algorithm: BFS from roots (in-degree 0) to assign layers
  const layers: string[][] = [];
  let queue = nodeIds.filter(id => (inDegree.get(id) || 0) === 0);
  const visited = new Set<string>();

  while (queue.length > 0) {
    layers.push(queue);
    for (const id of queue) visited.add(id);
    const next: string[] = [];
    for (const id of queue) {
      for (const child of children.get(id) || []) {
        inDegree.set(child, (inDegree.get(child) || 0) - 1);
        if (inDegree.get(child) === 0 && !visited.has(child)) {
          next.push(child);
        }
      }
    }
    queue = next;
  }

  // Handle cycles: unvisited nodes go to last layer
  const unvisited = nodeIds.filter(id => !visited.has(id));
  if (unvisited.length > 0) layers.push(unvisited);

  // Calculate total height for vertical centering
  let totalHeight = 0;
  const layerHeights: number[] = [];
  for (const layer of layers) {
    const maxH = Math.max(...layer.map(id => liveObjects.get(id)?.height || 80));
    layerHeights.push(maxH);
    totalHeight += maxH;
  }
  totalHeight += (layers.length - 1) * VERTICAL_GAP;

  // Position each layer
  let currentY = centerY - totalHeight / 2;
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const layerH = layerHeights[i];

    // Calculate total width for horizontal centering
    let totalWidth = 0;
    for (const id of layer) {
      totalWidth += liveObjects.get(id)?.width || 150;
    }
    totalWidth += (layer.length - 1) * HORIZONTAL_GAP;

    let currentX = centerX - totalWidth / 2;
    for (const id of layer) {
      const obj = liveObjects.get(id);
      if (!obj) continue;
      const w = obj.width || 150;
      const updated = { ...obj, x: currentX, y: currentY };
      liveObjects.set(id, updated);
      updateObject(updated);
      currentX += w + HORIZONTAL_GAP;
    }
    currentY += layerH + VERTICAL_GAP;
  }
}

export function AIChatContent({ callbacks, stageRef, objects = [], initialPrompt, boardConnected, onInitialPromptConsumed, isVisible }: AIChatProps & { isVisible: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamObjectCount, setStreamObjectCount] = useState(0);
  const initialPromptFired = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isVisible) scrollToBottom();
  }, [messages, isVisible]);
  
  const getViewport = (): { centerX: number; centerY: number; scale: number } => {
    if (stageRef?.current) {
      const stage = stageRef.current;
      const scale = stage.scaleX() || 1;
      const pos = stage.position() || { x: 0, y: 0 };
      const width = stage.width() || window.innerWidth;
      const height = stage.height() || window.innerHeight;
      return {
        centerX: Math.round((-pos.x + width / 2) / scale),
        centerY: Math.round((-pos.y + height / 2) / scale),
        scale,
      };
    }
    return { centerX: 400, centerY: 300, scale: 1 };
  };

  // Compute anchor point on an object for connector attachment
  const getAnchorPoint = (obj: any, anchor: string): { x: number; y: number } => {
    const w = obj.width || 0;
    const h = obj.height || 0;
    // All objects store x,y as top-left; compute center
    const cx = obj.x + w / 2;
    const cy = obj.y + h / 2;
    switch (anchor) {
      case 'top': return { x: cx, y: cy - h / 2 };
      case 'bottom': return { x: cx, y: cy + h / 2 };
      case 'left': return { x: cx - w / 2, y: cy };
      case 'right': return { x: cx + w / 2, y: cy };
      case 'center': default: return { x: cx, y: cy };
    }
  };

  // Process a single action from the AI, applying it to the board.
  // Returns the ID of the created object (if any) so callers can track new IDs.
  // When skipSave=true, builds the object in liveObjects but doesn't call callbacks.createObject.
  const processAction = (action: { tool: string; arguments: any }, liveObjects: Map<string, any>, centerX: number, centerY: number, skipSave = false): string | undefined => {
    if (!callbacks) return undefined;
    const args = action.arguments;
    const offset = (val: number | undefined) => val ?? 0;

    if (action.tool === 'create_sticky_note' && callbacks.createObject) {
      const newObj = {
        id: args.id || `sticky-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'sticky' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        width: Math.max(args.width || 200, 200),
        height: Math.max(args.height || 200, 200),
        rotation: 0,
        text: args.text || '',
        color: args.color || '#ffeb3b',
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
      return newObj.id;
    } else if (action.tool === 'create_rectangle' && callbacks.createObject) {
      const rw = args.width || 160;
      const rh = args.height || 120;
      // AI provides top-left coords; Board.tsx also stores rects as top-left
      const newObj = {
        id: args.id || `rect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'rectangle' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        width: rw,
        height: rh,
        color: args.color || '#2196f3',
        rotation: 0,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
      return newObj.id;
    } else if (action.tool === 'create_circle' && callbacks.createObject) {
      const size = args.size || 140;
      // AI provides top-left coords; Board.tsx renders circles with (x,y) as center
      const newObj = {
        id: args.id || `circle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'circle' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        width: size,
        height: size,
        color: args.color || '#4caf50',
        rotation: 0,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
      return newObj.id;
    } else if (action.tool === 'create_text' && callbacks.createObject) {
      const newObj = {
        id: args.id || `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'textbox' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        text: args.text || '',
        fontSize: args.fontSize || 24,
        color: args.color || '#1a1a1a',
        width: args.width,
        rotation: 0,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
      return newObj.id;
    } else if (action.tool === 'create_line' && callbacks.createObject) {
      const newObj = {
        id: args.id || `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'line' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        width: args.width || 200,
        height: args.height || 0,
        color: args.color || '#333333',
        rotation: 0,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
      return newObj.id;
    } else if (action.tool === 'create_connector' && callbacks.createObject) {
      // Resolve start point
      let startPoint = { x: centerX + offset(args.startX), y: centerY + offset(args.startY) };
      if (args.startObjectId) {
        const startObj = liveObjects.get(args.startObjectId);
        if (startObj) {
          startPoint = getAnchorPoint(startObj, args.startAnchor || 'bottom');
        }
      }
      // Resolve end point
      let endPoint = { x: centerX + offset(args.endX), y: centerY + offset(args.endY) };
      if (args.endObjectId) {
        const endObj = liveObjects.get(args.endObjectId);
        if (endObj) {
          endPoint = getAnchorPoint(endObj, args.endAnchor || 'top');
        }
      }
      const connectorObj = {
        id: args.id || `connector-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'connector' as const,
        startObjectId: args.startObjectId || null,
        endObjectId: args.endObjectId || null,
        startPoint,
        endPoint,
        startAnchor: args.startAnchor || 'bottom',
        endAnchor: args.endAnchor || 'top',
        style: args.style || 'orthogonal',
        color: args.color || '#333333',
        strokeWidth: args.strokeWidth || 2,
        arrowEnd: args.arrowEnd !== false,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(connectorObj.id, connectorObj);
      if (!skipSave) callbacks.createObject(connectorObj);
      // If label is provided, create a text object near the midpoint
      if (args.label) {
        const midX = (startPoint.x + endPoint.x) / 2;
        const midY = (startPoint.y + endPoint.y) / 2;
        const labelObj = {
          id: `label-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'textbox' as const,
          x: midX - 20,
          y: midY - 12,
          text: args.label,
          fontSize: 14,
          color: args.color || '#333333',
          width: 60,
          rotation: 0,
          zIndex: (args.zIndex ?? 0) + 1,
        };
        liveObjects.set(labelObj.id, labelObj);
        if (!skipSave) callbacks.createObject(labelObj);
      }
      return connectorObj.id;
    } else if (action.tool === 'organize_board' && callbacks.updateObject) {
      const gap = 16;
      const groupGap = 60;
      const typeOrder = ['sticky', 'textbox', 'rectangle', 'circle', 'line'];
      const groups: Record<string, any[]> = {};
      for (const obj of liveObjects.values()) {
        const key = obj.type || 'other';
        if (!groups[key]) groups[key] = [];
        groups[key].push(obj);
      }
      const sortedKeys = Object.keys(groups).sort((a, b) =>
        (typeOrder.indexOf(a) === -1 ? 99 : typeOrder.indexOf(a)) -
        (typeOrder.indexOf(b) === -1 ? 99 : typeOrder.indexOf(b))
      );
      let cursorX = centerX - 300;
      const baseY = centerY - 200;
      for (const key of sortedKeys) {
        const group = groups[key];
        const cols = Math.min(Math.ceil(Math.sqrt(group.length)), 6);
        const maxW = Math.max(...group.map((o: any) => o.width || 80));
        const maxH = Math.max(...group.map((o: any) => o.height || 80));
        const cellW = maxW + gap;
        const cellH = maxH + gap;
        group.forEach((obj: any, i: number) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const updated = { ...obj, x: cursorX + col * cellW, y: baseY + row * cellH };
          liveObjects.set(obj.id, updated);
          callbacks.updateObject(updated);
        });
        cursorX += cols * cellW + groupGap;
      }
    } else if (action.tool === 'move_object' && callbacks.updateObject) {
      const existing = liveObjects.get(args.id);
      if (existing) {
        const updated = { ...existing, x: centerX + offset(args.x), y: centerY + offset(args.y) };
        liveObjects.set(args.id, updated);
        callbacks.updateObject(updated);
      }
    } else if (action.tool === 'update_object' && callbacks.updateObject) {
      const existing = liveObjects.get(args.id);
      if (existing) {
        const updated: any = { ...existing };
        if (args.color !== undefined) updated.color = args.color;
        if (args.text !== undefined) updated.text = args.text;
        if (args.fontSize !== undefined) updated.fontSize = args.fontSize;
        if (args.width !== undefined) updated.width = args.width;
        if (args.height !== undefined) updated.height = args.height;
        if (args.zIndex !== undefined) updated.zIndex = args.zIndex;
        liveObjects.set(args.id, updated);
        callbacks.updateObject(updated);
      }
    } else if (action.tool === 'bulk_update_objects' && callbacks.updateObject) {
      if (args.filter) {
        const { type: filterType, ...changes } = args.filter;
        for (const [id, obj] of liveObjects) {
          if (obj.type === filterType) {
            const updated: any = { ...obj };
            if (changes.color !== undefined) updated.color = changes.color;
            if (changes.text !== undefined) updated.text = changes.text;
            if (changes.width !== undefined) updated.width = changes.width;
            if (changes.height !== undefined) updated.height = changes.height;
            if (changes.zIndex !== undefined) updated.zIndex = changes.zIndex;
            liveObjects.set(id, updated);
            callbacks.updateObject(updated);
          }
        }
      }
      const updates = args.updates || [];
      for (const upd of updates) {
        const existing = liveObjects.get(upd.id);
        if (existing) {
          const updated: any = { ...existing };
          if (upd.color !== undefined) updated.color = upd.color;
          if (upd.text !== undefined) updated.text = upd.text;
          if (upd.width !== undefined) updated.width = upd.width;
          if (upd.height !== undefined) updated.height = upd.height;
          if (upd.zIndex !== undefined) updated.zIndex = upd.zIndex;
          liveObjects.set(upd.id, updated);
          callbacks.updateObject(updated);
        }
      }
    } else if (action.tool === 'delete_object' && callbacks.deleteObject) {
      liveObjects.delete(args.id);
      callbacks.deleteObject(args.id);
    } else if (action.tool === 'clear_board' && callbacks.deleteObject) {
      for (const id of liveObjects.keys()) {
        callbacks.deleteObject(id);
      }
      liveObjects.clear();
    }
  };

  const processAICommand = async (command: string, onStreamText?: (text: string) => void, onActionReceived?: () => void): Promise<AIResponse> => {
    try {
      const vp = getViewport();
      const apiBase = import.meta.env.VITE_API_URL || '';
      // Transform object positions to be relative to viewport center
      // so the AI sees the same coordinate space it outputs (0,0 = screen center)
      const relativeObjects = objects.map(obj => ({
        ...obj,
        x: (obj as any).x !== undefined ? (obj as any).x - vp.centerX : undefined,
        y: (obj as any).y !== undefined ? (obj as any).y - vp.centerY : undefined,
      }));
      const response = await fetch(`${apiBase}/api/ai/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          roomId: window.location.pathname.split('/').pop(),
          viewport: { x: vp.centerX, y: vp.centerY },
          history: messages.slice(-20).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
          objects: relativeObjects,
        }),
      });

      const { centerX, centerY } = getViewport();
      const liveObjects = new Map<string, any>();
      for (const obj of objects) {
        liveObjects.set(obj.id, { ...obj });
      }

      // Read the NDJSON stream line by line
      const reader = response.body?.getReader();
      if (!reader) {
        return { message: 'Failed to connect to AI service.' };
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const allActions: any[] = [];
      const newIds = new Set<string>();

      // Unique prefix per request to prevent duplicate IDs across generations
      // (AI reuses generic IDs like "step1", "step2" every time)
      const batchPrefix = `b${Date.now().toString(36)}`;
      const idMap = new Map<string, string>();
      const remapId = (aiId: string): string => {
        if (!idMap.has(aiId)) {
          idMap.set(aiId, `${batchPrefix}-${aiId}`);
        }
        return idMap.get(aiId)!;
      };

      // Collect actions during streaming but DON'T call callbacks yet.
      // We need to save nodes before connectors to satisfy Supabase foreign keys.
      // Track connector IDs so we can save them after nodes are persisted
      const deferredConnectorIds: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'action') {
              // Namespace AI-provided IDs to prevent cross-request collisions
              const args = event.action.arguments;
              if (args) {
                if (args.id) args.id = remapId(args.id);
                if (args.startObjectId) args.startObjectId = remapId(args.startObjectId);
                if (args.endObjectId) args.endObjectId = remapId(args.endObjectId);
              }
              allActions.push(event.action);

              if (event.action.tool === 'create_connector') {
                // Build in liveObjects for layout engine, but defer the actual save
                const createdId = processAction(event.action, liveObjects, centerX, centerY, true);
                if (createdId) {
                  newIds.add(createdId);
                  deferredConnectorIds.push(createdId);
                }
              } else {
                const createdId = processAction(event.action, liveObjects, centerX, centerY);
                if (createdId) newIds.add(createdId);
              }
              onActionReceived?.();
            } else if (event.type === 'text') {
              fullText += (fullText ? ' ' : '') + event.text;
              onStreamText?.(fullText);
            } else if (event.type === 'error') {
              return { message: event.message, error: event.message };
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Apply flowchart layout engine after all objects are created
      if (callbacks?.updateObject) {
        applyFlowchartLayout(liveObjects, newIds, centerX, centerY, callbacks.updateObject);
      }

      // Now save deferred connectors — nodes have already been sent to Supabase,
      // give them a moment to persist before inserting connectors that reference them.
      if (deferredConnectorIds.length > 0 && callbacks?.createObject) {
        await new Promise(resolve => setTimeout(resolve, 500));
        for (const id of deferredConnectorIds) {
          const obj = liveObjects.get(id);
          if (obj) {
            callbacks.createObject(obj);
          }
        }
      }

      // Generate fallback message if none
      if (!fullText && allActions.length > 0) {
        const counts: Record<string, number> = {};
        for (const a of allActions) {
          const name = a.tool.replace('create_', '').replace('_', ' ');
          counts[name] = (counts[name] || 0) + 1;
        }
        const parts = Object.entries(counts).map(([name, count]) =>
          count > 1 ? `${count} ${name}s` : `a ${name}`
        );
        fullText = `Created ${parts.join(', ')}!`;
      } else if (!fullText) {
        fullText = "Sorry, I wasn't able to do that.";
      }

      return { message: fullText, actions: allActions };
    } catch (error) {
      console.error('AI command error:', error);
      return {
        message: 'Sorry, I encountered an error processing your request.',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };
  
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const commandText = inputText;
    setInputText('');
    setIsLoading(true);
    setStreamObjectCount(0);

    // Add a placeholder AI message that shows the thinking indicator
    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMsgId, text: '__THINKING__', sender: 'ai' as const, timestamp: new Date() }]);

    console.log('Processing AI command:', commandText);
    const response = await processAICommand(
      commandText,
      (streamedText) => {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: streamedText } : m));
      },
      () => {
        setStreamObjectCount(c => c + 1);
      },
    );

    setIsLoading(false);
    setStreamObjectCount(0);
    // Final update with complete message
    setMessages(prev => prev.map(m => m.id === aiMsgId
      ? { ...m, text: response.error ? `Error: ${response.error}` : response.message }
      : m
    ));
  };
  
  // Auto-trigger initial prompt (from "Build with AI" on dashboard)
  // Waits until the board connection is established so createObject works
  useEffect(() => {
    if (!initialPrompt || !boardConnected || !isVisible || initialPromptFired.current) return;
    initialPromptFired.current = true;

    // Small delay after connection to ensure everything is stable
    const timer = setTimeout(async () => {

      const userMessage: Message = {
        id: Date.now().toString(),
        text: initialPrompt,
        sender: 'user',
        timestamp: new Date()
      };
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, userMessage, { id: aiMsgId, text: '__THINKING__', sender: 'ai' as const, timestamp: new Date() }]);
      setIsLoading(true);
      setStreamObjectCount(0);

      const response = await processAICommand(
        initialPrompt,
        (streamedText) => {
          setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: streamedText } : m));
        },
        () => {
          setStreamObjectCount(c => c + 1);
        },
      );

      setIsLoading(false);
      setStreamObjectCount(0);
      setMessages(prev => prev.map(m => m.id === aiMsgId
        ? { ...m, text: response.error ? `Error: ${response.error}` : response.message }
        : m
      ));
      onInitialPromptConsumed?.();
    }, 500);

    return () => clearTimeout(timer);
  }, [initialPrompt, boardConnected, isVisible]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* AI Messages */}
      <div style={{
        flex: 1,
        padding: '12px 0',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        {messages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            color: '#64748b',
            padding: '0 24px',
            gap: 8,
          }}>
            <span style={{ fontSize: 28, opacity: 0.6 }}>✨</span>
            <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
              Ask me to create sticky notes, shapes, organize your board, or analyze content.
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>
              Try: "Add a blue rectangle and a red circle"
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  padding: '6px 16px',
                  marginTop: 6,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    background: message.sender === 'ai'
                      ? 'linear-gradient(135deg, #818cf8, #6366f1)'
                      : 'linear-gradient(135deg, #34d399, #10b981)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {message.sender === 'ai' ? 'AI' : 'U'}
                  </div>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: message.sender === 'ai' ? '#818cf8' : '#34d399',
                  }}>
                    {message.sender === 'ai' ? 'CollabBoard AI' : 'You'}
                  </span>
                  <span style={{ fontSize: 11, color: '#475569' }}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ paddingLeft: 32 }}>
                  {message.sender === 'ai' && message.text === '__THINKING__' ? (
                    <ThinkingIndicator objectCount={streamObjectCount} />
                  ) : message.sender === 'ai' ? (
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: '#cbd5e1', wordBreak: 'break-word' }}>
                      <ReactMarkdown components={{
                        p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
                        strong: ({ children }) => <strong style={{ fontWeight: 600, color: '#e2e8f0' }}>{children}</strong>,
                        ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ol>,
                        ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ul>,
                        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                        code: ({ children }) => <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>{children}</code>,
                      }}>{message.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: '#e2e8f0', wordBreak: 'break-word' }}>{message.text}</p>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* AI Input */}
      <div style={{ padding: '0 12px 12px' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Ask AI something..."
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(129,140,248,0.4)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
          disabled={isLoading}
        />
      </div>
    </>
  );
}

export function AIChat(props: AIChatProps) {
  return <AIChatContent {...props} isVisible={true} />;
}