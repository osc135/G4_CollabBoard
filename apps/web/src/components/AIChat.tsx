import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

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

export function AIChat({ callbacks, stageRef, objects = [], initialPrompt, boardConnected, onInitialPromptConsumed }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const initialPromptFired = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
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

  // Process a single action from the AI, applying it to the board
  const processAction = (action: { tool: string; arguments: any }, liveObjects: Map<string, any>, centerX: number, centerY: number) => {
    if (!callbacks) return;
    const args = action.arguments;
    const offset = (val: number | undefined) => val ?? 0;

    if (action.tool === 'create_sticky_note' && callbacks.createObject) {
      const newObj = {
        id: `sticky-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'sticky' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        width: 200,
        height: 200,
        rotation: 0,
        text: args.text || '',
        color: args.color || '#ffeb3b',
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
    } else if (action.tool === 'create_rectangle' && callbacks.createObject) {
      const newObj = {
        id: `rect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'rectangle' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        width: args.width || 120,
        height: args.height || 80,
        color: args.color || '#2196f3',
        rotation: 0,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
    } else if (action.tool === 'create_circle' && callbacks.createObject) {
      const size = args.size || 80;
      const newObj = {
        id: `circle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    } else if (action.tool === 'create_text' && callbacks.createObject) {
      const newObj = {
        id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'textbox' as const,
        x: centerX + offset(args.x),
        y: centerY + offset(args.y),
        text: args.text || '',
        fontSize: args.fontSize || 48,
        color: args.color || '#1a1a1a',
        width: args.width,
        rotation: 0,
        zIndex: args.zIndex ?? 0,
      };
      liveObjects.set(newObj.id, newObj);
      callbacks.createObject(newObj);
    } else if (action.tool === 'create_line' && callbacks.createObject) {
      const newObj = {
        id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

  const processAICommand = async (command: string, onStreamText?: (text: string) => void): Promise<AIResponse> => {
    try {
      const vp = getViewport();
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/ai/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          roomId: window.location.pathname.split('/').pop(),
          viewport: { x: vp.centerX, y: vp.centerY },
          history: messages.slice(-20).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
          objects,
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
              allActions.push(event.action);
              processAction(event.action, liveObjects, centerX, centerY);
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

    // Add a placeholder AI message that updates as text streams in
    const aiMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMsgId, text: 'Thinking...', sender: 'ai' as const, timestamp: new Date() }]);

    console.log('Processing AI command:', commandText);
    const response = await processAICommand(commandText, (streamedText) => {
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: streamedText } : m));
    });

    setIsLoading(false);
    // Final update with complete message
    setMessages(prev => prev.map(m => m.id === aiMsgId
      ? { ...m, text: response.error ? `Error: ${response.error}` : response.message }
      : m
    ));
  };
  
  // Auto-trigger initial prompt (from "Build with AI" on dashboard)
  // Waits until the board connection is established so createObject works
  useEffect(() => {
    if (!initialPrompt || !boardConnected || initialPromptFired.current) return;
    initialPromptFired.current = true;

    // Small delay after connection to ensure everything is stable
    const timer = setTimeout(async () => {
      setIsOpen(true);

      const userMessage: Message = {
        id: Date.now().toString(),
        text: initialPrompt,
        sender: 'user',
        timestamp: new Date()
      };
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, userMessage, { id: aiMsgId, text: 'Thinking...', sender: 'ai' as const, timestamp: new Date() }]);
      setIsLoading(true);

      const response = await processAICommand(initialPrompt, (streamedText) => {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: streamedText } : m));
      });

      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === aiMsgId
        ? { ...m, text: response.error ? `Error: ${response.error}` : response.message }
        : m
      ));
      onInitialPromptConsumed?.();
    }, 500);

    return () => clearTimeout(timer);
  }, [initialPrompt, boardConnected]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          backgroundColor: '#2563eb',
          color: 'white',
          borderRadius: '50%',
          border: 'none',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
          transition: 'transform 0.2s, background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.backgroundColor = '#1d4ed8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.backgroundColor = '#2563eb';
        }}
        aria-label="Open AI Assistant"
      >
        {/* Chat Bubble Icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12C2 13.86 2.5 15.6 3.35 17.07L2 22L6.93 20.65C8.4 21.5 10.14 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="16" cy="12" r="1" fill="currentColor" />
        </svg>
      </button>

      {/* Chat Box Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.2)',
              zIndex: 40
            }}
            onClick={() => setIsOpen(false)}
          />
          
          {/* Chat Window */}
          <div style={{
            position: 'fixed',
            bottom: '96px',
            right: '24px',
            width: '384px',
            height: '500px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: '#dbeafe',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '14px' }}>🤖</span>
                </div>
                <h3 style={{ fontWeight: 600, margin: 0 }}>AI Assistant</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#374151'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                aria-label="Close chat"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15 5L5 15M5 5L15 15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Chat Messages */}
            <div style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {messages.length === 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  textAlign: 'center',
                  color: '#6b7280'
                }}>
                  <span style={{ fontSize: '24px', marginBottom: '8px' }}>✨</span>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    Ask me to create sticky notes, rectangles, circles, lines, organize your board, or analyze your content!
                  </p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    Try: "Add a blue rectangle and a red circle"
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        display: 'flex',
                        justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div style={{
                        maxWidth: '70%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: message.sender === 'user' ? '#2563eb' : '#f3f4f6',
                        color: message.sender === 'user' ? 'white' : '#374151',
                        wordBreak: 'break-word'
                      }}>
                        {message.sender === 'ai' ? (
                          <div style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>
                            <ReactMarkdown components={{
                              p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
                              strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                              ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ol>,
                              ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>{children}</ul>,
                              li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
                            }}>{message.text}</ReactMarkdown>
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: '14px' }}>{message.text}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Streaming text updates appear in the AI message bubble directly */}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Footer with Input */}
            <div style={{
              padding: '16px',
              borderTop: '1px solid #e5e7eb',
              backgroundColor: '#f9fafb'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask AI to help with your board..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: 'white',
                    color: '#374151',
                    outline: 'none'
                  }}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isLoading || !inputText.trim() ? '#d1d5db' : '#2563eb',
                    color: isLoading || !inputText.trim() ? '#6b7280' : 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: isLoading || !inputText.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  disabled={isLoading || !inputText.trim()}
                >
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}