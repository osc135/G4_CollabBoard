import React, { useState, useRef, useEffect } from 'react';

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
}

export function AIChat({ callbacks }: { callbacks?: AIActionCallbacks }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);
  
  const processAICommand = async (command: string): Promise<AIResponse> => {
    try {
      const response = await fetch('http://localhost:3001/api/ai/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command, roomId: window.location.pathname.split('/').pop() }),
      });
      
      const data: AIResponse = await response.json();
      
      // Process actions locally if callbacks are provided
      if (data.actions && callbacks) {
        for (const action of data.actions) {
          if (action.tool === 'create_sticky_note' && callbacks.createObject) {
            const stickyNote = {
              id: `sticky-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'sticky' as const,
              x: action.arguments.x || Math.random() * 600 + 100,
              y: action.arguments.y || Math.random() * 400 + 100,
              width: 200,
              height: 200,
              rotation: 0,
              text: action.arguments.text || '',
              color: action.arguments.color || '#ffeb3b',
              layer: 0
            };
            callbacks.createObject(stickyNote);
          }
        }
      }
      
      return data;
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
    
    console.log('Processing AI command:', commandText);
    const response = await processAICommand(commandText);
    
    setIsLoading(false);
    const aiMessage: Message = {
      id: Date.now().toString(),
      text: response.error ? `Error: ${response.error}` : response.message,
      sender: 'ai',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, aiMessage]);
  };
  
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
                    Ask me to help create sticky notes, organize your board, or analyze your content!
                  </p>
                  <p style={{ margin: '8px 0 0 0', fontSize: '12px' }}>
                    Try: "Create a sticky note for our team meeting"
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
                        <p style={{ margin: 0, fontSize: '14px' }}>{message.text}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'flex-start'
                    }}>
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        backgroundColor: '#f3f4f6',
                        color: '#374151'
                      }}>
                        <span style={{ fontSize: '14px' }}>Thinking...</span>
                      </div>
                    </div>
                  )}
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