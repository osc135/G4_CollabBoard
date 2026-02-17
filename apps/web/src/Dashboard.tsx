import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { RoomPreview } from "./RoomPreview";

interface Room {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
  last_accessed?: string;
}

export function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (user) {
      loadRooms();
    }
  }, [user]);

  async function loadRooms() {
    try {
      // Just get rooms I own for now (simpler approach)
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('owner_id', user?.id)
        .order('last_accessed', { ascending: false, nullsFirst: false });

      if (error) {
        console.error('Error loading rooms:', error);
      } else {
        setRooms(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createRoom() {
    if (!newRoomName.trim() || !user) return;

    setCreating(true);
    try {
      const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const { error } = await supabase
        .from('rooms')
        .insert([
          {
            id: roomId,
            name: newRoomName,
            owner_id: user.id,
            created_at: new Date().toISOString(),
            last_accessed: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room');
      } else {
        navigate(`/board/${roomId}`);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  async function enterRoom(roomId: string) {
    await supabase
      .from('rooms')
      .update({ last_accessed: new Date().toISOString() })
      .eq('id', roomId);
    
    navigate(`/board/${roomId}`);
  }

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  async function joinRoomWithCode() {
    if (!joinCode.trim() || !user) return;

    setJoining(true);
    try {
      // Find room with this invite code
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('invite_code', joinCode.toUpperCase())
        .single();

      if (roomError || !room) {
        alert('Invalid room code');
        setJoining(false);
        return;
      }

      // Add user as a member
      const { error: memberError } = await supabase
        .from('room_members')
        .insert([{
          room_id: room.id,
          user_id: user.id,
          role: 'member'
        }]);

      if (!memberError || memberError.code === '23505') { // 23505 = duplicate key (already member)
        // Navigate to the room
        navigate(`/board/${room.id}`);
      } else {
        alert('Failed to join room');
      }
    } catch (err) {
      console.error('Error joining room:', err);
      alert('Failed to join room');
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "white", fontSize: "18px" }}>Loading your workspace...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "72px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ 
                width: "40px", 
                height: "40px", 
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", 
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px"
              }}>🎨</div>
              <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#1a202c", margin: 0 }}>CollabBoard</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ 
                padding: "8px 16px", 
                background: "#f1f5f9", 
                borderRadius: "20px",
                color: "#475569",
                fontSize: "14px",
                fontWeight: "500"
              }}>
                👋 {user?.email?.split('@')[0]}
              </div>
              <button
                onClick={() => setShowNewRoomModal(true)}
                style={{
                  padding: "10px 20px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 4px rgba(102, 126, 234, 0.3)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(102, 126, 234, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(102, 126, 234, 0.3)";
                }}
              >
                + Add New
              </button>
              <button
                onClick={() => setShowJoinModal(true)}
                style={{
                  padding: "10px 20px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 4px rgba(16, 185, 129, 0.3)"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(16, 185, 129, 0.4)";
                  e.currentTarget.style.background = "#059669";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(16, 185, 129, 0.3)";
                  e.currentTarget.style.background = "#10b981";
                }}
              >
                🔑 Join Room
              </button>
              <button
                onClick={handleLogout}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  color: "#64748b",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  fontSize: "14px",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f1f5f9";
                  e.currentTarget.style.color = "#475569";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "#64748b";
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ 
          marginBottom: "40px", 
          textAlign: "center",
          background: "white",
          borderRadius: "16px",
          padding: "48px 32px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0"
        }}>
          <h2 style={{ 
            fontSize: "32px", 
            fontWeight: "700", 
            color: "#1a202c", 
            marginBottom: "12px",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text"
          }}>
            Welcome back{user?.user_metadata?.name ? `, ${user.user_metadata.name}` : ''}! ✨
          </h2>
          <p style={{ 
            fontSize: "16px", 
            color: "#64748b",
            lineHeight: "1.6"
          }}>
            Ready to collaborate? Select a room to continue or create something new.
          </p>
        </div>

        {/* Rooms Section */}
        <div style={{
          marginTop: "32px",
          background: "white",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0"
        }}>
          <h3 style={{ 
            fontSize: "24px", 
            fontWeight: "600", 
            color: "#1a202c", 
            marginBottom: "24px",
            margin: "0 0 24px 0"
          }}>
            Your Workspaces
          </h3>
          
          {rooms.length === 0 ? (
            <div style={{
              padding: "60px 20px",
              textAlign: "center"
            }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
              <p style={{ fontSize: "18px", color: "#4a5568", marginBottom: "8px" }}>No rooms yet</p>
              <p style={{ fontSize: "14px", color: "#718096", marginBottom: "24px" }}>
                Create your first room to start collaborating
              </p>
              <button
                onClick={() => setShowNewRoomModal(true)}
                style={{
                  padding: "16px 32px",
                  background: "white",
                  color: "black",
                  border: "2px solid black",
                  borderRadius: "8px",
                  fontSize: "18px",
                  fontWeight: "800",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "black";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "white";
                  e.currentTarget.style.color = "black";
                }}
              >
                🎯 Create Your First Room
              </button>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "32px",
              marginTop: "32px"
            }}>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  onClick={() => enterRoom(room.id)}
                    style={{
                    background: "#fafbfc",
                    borderRadius: "12px",
                    padding: "20px",
                    cursor: "pointer",
                    border: "1px solid #f1f5f9",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    position: "relative"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)";
                    e.currentTarget.style.background = "white";
                    e.currentTarget.style.borderColor = "#e2e8f0";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.background = "#fafbfc";
                    e.currentTarget.style.borderColor = "#f1f5f9";
                  }}
                >
                  
                  {/* Room Preview */}
                  <div style={{ 
                    marginBottom: "16px", 
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)"
                  }}>
                    <RoomPreview roomId={room.id} width={252} height={140} />
                  </div>
                  
                  <h3 style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    color: "#1a202c",
                    marginBottom: "8px",
                    lineHeight: "1.4"
                  }}>
                    {room.name}
                  </h3>
                  
                  <div style={{ 
                    fontSize: "12px", 
                    color: "#94a3b8", 
                    lineHeight: "1.4"
                  }}>
                    <div>
                      {room.last_accessed 
                        ? `Last accessed ${new Date(room.last_accessed).toLocaleDateString()}`
                        : `Created ${new Date(room.created_at).toLocaleDateString()}`
                      }
                    </div>
                  </div>
                  
                  <div style={{
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid #e2e8f0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}>
                    <span style={{
                      fontSize: "12px",
                      color: "#a0aec0",
                      fontStyle: "italic"
                    }}>
                      Click to enter
                    </span>
                    <span style={{
                      color: "#667eea",
                      fontSize: "20px"
                    }}>
                      →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* New Room Modal */}
      {showNewRoomModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            padding: "32px",
            width: "90%",
            maxWidth: "400px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h2 style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#1a202c",
              marginBottom: "24px"
            }}>
              Create New Room
            </h2>
            
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="Enter room name..."
              autoFocus
              style={{
                width: "100%",
                padding: "12px 16px",
                fontSize: "16px",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
                marginBottom: "24px"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#667eea"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
              onKeyDown={(e) => e.key === 'Enter' && createRoom()}
            />
            
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => {
                  setShowNewRoomModal(false);
                  setNewRoomName("");
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f7fafc",
                  color: "#4a5568",
                  border: "1px solid #cbd5e0",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#edf2f7"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#f7fafc"}
              >
                Cancel
              </button>
              <button
                onClick={createRoom}
                disabled={creating || !newRoomName.trim()}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: creating || !newRoomName.trim() ? "#cbd5e0" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: creating || !newRoomName.trim() ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s"
                }}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {showJoinModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "white",
            borderRadius: "16px",
            padding: "32px",
            width: "90%",
            maxWidth: "400px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h2 style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#1a202c",
              marginBottom: "8px"
            }}>
              Join Existing Room
            </h2>
            
            <p style={{
              fontSize: "14px",
              color: "#718096",
              marginBottom: "24px"
            }}>
              Enter the room code shared with you
            </p>
            
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit code..."
              autoFocus
              maxLength={6}
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "24px",
                fontFamily: "monospace",
                textAlign: "center",
                letterSpacing: "4px",
                border: "2px solid #e2e8f0",
                borderRadius: "8px",
                outline: "none",
                transition: "border-color 0.2s",
                marginBottom: "24px",
                textTransform: "uppercase"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#10b981"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
              onKeyDown={(e) => e.key === 'Enter' && joinRoomWithCode()}
            />
            
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setJoinCode("");
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f7fafc",
                  color: "#4a5568",
                  border: "1px solid #cbd5e0",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#edf2f7"}
                onMouseLeave={(e) => e.currentTarget.style.background = "#f7fafc"}
              >
                Cancel
              </button>
              <button
                onClick={joinRoomWithCode}
                disabled={joining || joinCode.length !== 6}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: joining || joinCode.length !== 6 ? "#cbd5e0" : "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: joining || joinCode.length !== 6 ? "not-allowed" : "pointer",
                  transition: "opacity 0.2s"
                }}
              >
                {joining ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}