import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Board, type Tool, STICKY_COLORS, getRandomStickyColor } from "./Board";
import { useSupabaseBoard } from "./useSupabaseBoard";
import { useAuth } from "./contexts/AuthContext";
import { extractRoomCode } from "./utils/roomCode";
import { AIChat } from "./components/AIChat";
import Konva from "konva";


export function BoardRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { session, loading, displayName, userId } = useAuth();
  const [tool, setTool] = useState<Tool>("pan");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStickyColor, setSelectedStickyColor] = useState<string>(STICKY_COLORS[0]);
  const [selectedShapeColor, setSelectedShapeColor] = useState<string>("#3b82f6");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>("");
  const stageRef = useRef<Konva.Stage | null>(null);

  const { connected, objects, cursors, presence, emitCursor, emitObjectDrag, emitObjectDragEnd, createObject, updateObject, deleteObject } = useSupabaseBoard(
    userId,
    displayName,
    roomId // Pass the room ID to the Supabase hook
  );


  // Extract invite code from room ID
  useEffect(() => {
    if (!roomId) return;
    const code = extractRoomCode(roomId);
    setInviteCode(code);
  }, [roomId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA" || (active as HTMLElement)?.isContentEditable) return;
      if (selectedIds.length === 0) return;
      e.preventDefault();
      selectedIds.forEach((id) => deleteObject(id));
      setSelectedIds([]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, deleteObject]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1e293b" }}>
        <span style={{ color: "white" }}>Loading…</span>
      </div>
    );
  }

  if (!session) {
    navigate("/");
    return null;
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Board
        objects={objects}
        cursors={cursors}
        tool={tool}
        selectedIds={selectedIds}
        onSelect={setSelectedIds}
        onObjectCreate={createObject}
        onObjectUpdate={updateObject}
        onObjectDelete={deleteObject}
        onCursorMove={emitCursor}
        onObjectDrag={emitObjectDrag}
        onObjectDragEnd={emitObjectDragEnd}
        stageRef={stageRef}
        selectedStickyColor={selectedStickyColor}
        selectedShapeColor={selectedShapeColor}
      />
      <div style={{ 
        position: "absolute", 
        top: 16, 
        left: 16, 
        right: 16,
        display: "flex", 
        alignItems: "center", 
        gap: 8, 
        background: "linear-gradient(to bottom, rgba(255,255,255,0.98), rgba(250,250,250,0.98))", 
        backdropFilter: "blur(10px)",
        padding: "10px 16px", 
        borderRadius: 12, 
        boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)", 
        border: "1px solid rgba(0,0,0,0.06)",
        zIndex: 10 
      }}>
        <button
          onClick={() => navigate("/dashboard")}
          style={{ 
            padding: "7px 14px", 
            background: "linear-gradient(135deg, #6b7280, #4b5563)", 
            color: "white", 
            border: "none", 
            borderRadius: 8, 
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            transition: "all 0.2s",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          ← Back
        </button>
        
        <div style={{ width: 1, height: 24, background: "rgba(0,0,0,0.1)" }} />
        
        <button
          onClick={() => setShowInviteModal(true)}
          style={{ 
            padding: "7px 14px", 
            background: "linear-gradient(135deg, #10b981, #059669)", 
            color: "white", 
            border: "none", 
            borderRadius: 8, 
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            transition: "all 0.2s",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          ✨ Invite
        </button>
        
        <div style={{ width: 1, height: 24, background: "rgba(0,0,0,0.1)" }} />
        
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.03)", padding: "4px 8px", borderRadius: 6 }}>
          {(["pan", "sticky", "rectangle", "circle", "line"] as const).map((t, index) => [
              <button
                key={t}
                data-testid={`tool-${t}`}
                onClick={() => setTool(t)}
                title={
                  t === "pan"
                    ? "Drag to pan • Shift+drag to select"
                    : t === "rectangle"
                      ? "Click to add rectangle"
                      : t === "circle"
                        ? "Click to add circle"
                        : t === "line"
                          ? "Click to add line"
                          : "Click to add sticky note"
                }
                style={{ 
                  padding: "6px 12px", 
                  background: tool === t ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "white", 
                  color: tool === t ? "white" : "#4b5563", 
                  border: tool === t ? "none" : "1px solid rgba(0,0,0,0.08)", 
                  borderRadius: 6, 
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: tool === t ? 600 : 500,
                  transition: "all 0.2s",
                  boxShadow: tool === t ? "0 2px 8px rgba(59,130,246,0.3)" : "0 1px 2px rgba(0,0,0,0.05)"
                }}
                onMouseEnter={(e) => {
                  if (tool !== t) {
                    e.currentTarget.style.background = "#f9fafb";
                  }
                }}
                onMouseLeave={(e) => {
                  if (tool !== t) {
                    e.currentTarget.style.background = "white";
                  }
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{t === "pan" ? "✋" : t === "sticky" ? "📝" : t === "rectangle" ? "◻" : t === "circle" ? "⭕" : "⁄"}</span>
                  <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                </span>
              </button>,
              index < 4 && <div key={`sep-${index}`} style={{ width: 1, height: 20, background: "rgba(0,0,0,0.06)" }} />
          ].filter(Boolean))}
        </div>
        
        <div style={{ flex: 1 }} />
        
        {tool === "sticky" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.03)", padding: "4px 8px", borderRadius: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>COLOR</span>
            {STICKY_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedStickyColor(color)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: color,
                  border: selectedStickyColor === color ? "2px solid #1e293b" : "1px solid rgba(0,0,0,0.1)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.15s",
                  boxShadow: selectedStickyColor === color ? "0 0 0 3px rgba(0,0,0,0.1)" : "none"
                }}
                title={color}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              />
            ))}
            <button
              onClick={() => setSelectedStickyColor(getRandomStickyColor())}
              style={{ 
                padding: "4px 10px", 
                fontSize: 11, 
                background: "white", 
                border: "1px solid rgba(0,0,0,0.1)", 
                borderRadius: 6, 
                cursor: "pointer",
                fontWeight: 500,
                color: "#4b5563"
              }}
            >
              🎲
            </button>
          </div>
        )}
        
        {(tool === "rectangle" || tool === "circle" || tool === "line") && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.03)", padding: "4px 8px", borderRadius: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>COLOR</span>
            {["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"].map((color) => (
              <button
                key={color}
                onClick={() => setSelectedShapeColor(color)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: color,
                  border: selectedShapeColor === color ? "2px solid #1e293b" : "1px solid rgba(0,0,0,0.1)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.15s",
                  boxShadow: selectedShapeColor === color ? "0 0 0 3px rgba(0,0,0,0.1)" : "none"
                }}
                title={color}
                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
              />
            ))}
          </div>
        )}
        
        {selectedIds.length > 0 && (
          <button 
            data-testid="delete-btn" 
            onClick={() => { selectedIds.forEach((id) => deleteObject(id)); setSelectedIds([]); }} 
            style={{ 
              padding: "7px 14px", 
              background: "linear-gradient(135deg, #ef4444, #dc2626)", 
              color: "white", 
              border: "none", 
              borderRadius: 8, 
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.2s",
              boxShadow: "0 2px 4px rgba(239,68,68,0.2)"
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
          >
            🗑 Delete ({selectedIds.length})
          </button>
        )}
        
        <div style={{ width: 1, height: 24, background: "rgba(0,0,0,0.1)" }} />
        
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ 
              width: 8, 
              height: 8, 
              borderRadius: "50%", 
              background: connected ? "#10b981" : "#ef4444",
              boxShadow: connected ? "0 0 0 3px rgba(16,185,129,0.2)" : "0 0 0 3px rgba(239,68,68,0.2)"
            }} />
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
              {connected ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          
          <span style={{ fontSize: 12, color: "#6b7280" }}>{displayName}</span>
        </div>
      </div>
      
      <div style={{ 
        position: "absolute", 
        bottom: 20, 
        left: 20, 
        background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95))", 
        backdropFilter: "blur(12px) saturate(180%)",
        padding: "10px 16px", 
        borderRadius: 50, 
        fontSize: 13, 
        zIndex: 10,
        boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.1)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        color: "white"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ position: "relative" }}>
            <div style={{ 
              width: 8, 
              height: 8, 
              borderRadius: "50%", 
              background: "#10b981",
              boxShadow: "0 0 0 2px rgba(16,185,129,0.3)",
              animation: "pulse 2s infinite"
            }} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{presence.length}</span>
          <span style={{ opacity: 0.8, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Active</span>
        </div>
        {presence.length > 0 && (
          <>
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.2)" }} />
            <div style={{ display: "flex", gap: -8 }}>
              {presence.slice(0, 3).map((p, i) => (
                <div key={p.userId} style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${["#3b82f6", "#10b981", "#f59e0b"][i % 3]}, ${["#2563eb", "#059669", "#d97706"][i % 3]})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "white",
                  border: "2px solid rgba(0,0,0,0.2)",
                  marginLeft: i > 0 ? -8 : 0,
                  zIndex: 3 - i
                }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {presence.length > 3 && (
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "white",
                  border: "2px solid rgba(0,0,0,0.2)",
                  marginLeft: -8
                }}>
                  +{presence.length - 3}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
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
            maxWidth: "450px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h2 style={{
              fontSize: "24px",
              fontWeight: "700",
              color: "#1a202c",
              marginBottom: "8px"
            }}>
              Invite Others to Collaborate
            </h2>
            
            <p style={{
              fontSize: "14px",
              color: "#718096",
              marginBottom: "24px"
            }}>
              Share this code with others to let them join this room
            </p>
            
            <div style={{
              background: "#f7fafc",
              border: "2px dashed #cbd5e0",
              borderRadius: "8px",
              padding: "20px",
              textAlign: "center",
              marginBottom: "16px"
            }}>
              <div style={{
                fontSize: "32px",
                fontWeight: "bold",
                letterSpacing: "4px",
                color: "#2d3748",
                fontFamily: "monospace"
              }}>
                {inviteCode || "Loading..."}
              </div>
            </div>
            
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteCode);
                  alert("Code copied to clipboard!");
                }}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                📋 Copy Code
              </button>
              <button
                onClick={() => setShowInviteModal(false)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f7fafc",
                  color: "#4a5568",
                  border: "1px solid #cbd5e0",
                  borderRadius: "8px",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>
            
            <p style={{
              fontSize: "12px",
              color: "#a0aec0",
              marginTop: "16px",
              textAlign: "center"
            }}>
              Anyone with this code can join and collaborate in real-time
            </p>
          </div>
        </div>
      )}
      <AIChat />
    </div>
  );
}