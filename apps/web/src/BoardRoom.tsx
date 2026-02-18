import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Board, type Tool, STICKY_COLORS, getRandomStickyColor } from "./Board";
import { useSupabaseBoard } from "./useSupabaseBoard";
import { useAuth } from "./contexts/AuthContext";
import { supabase } from "./lib/supabase";
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

  const { connected, objects, cursors, presence, emitCursor, createObject, updateObject, deleteObject } = useSupabaseBoard(
    userId,
    displayName,
    roomId // Pass the room ID to the Supabase hook
  );


  // Generate or fetch invite code
  useEffect(() => {
    async function fetchOrCreateInviteCode() {
      if (!roomId) return;
      
      // First try to get existing invite code
      const { data: room } = await supabase
        .from('rooms')
        .select('invite_code')
        .eq('id', roomId)
        .single();
      
      if (room?.invite_code) {
        setInviteCode(room.invite_code);
      } else {
        // Generate new invite code
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        await supabase
          .from('rooms')
          .update({ invite_code: newCode })
          .eq('id', roomId);
        setInviteCode(newCode);
      }
    }
    
    fetchOrCreateInviteCode();
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
        stageRef={stageRef}
        selectedStickyColor={selectedStickyColor}
        selectedShapeColor={selectedShapeColor}
      />
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.95)", padding: "8px 12px", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", zIndex: 10 }}>
        <button
          onClick={() => navigate("/dashboard")}
          style={{ padding: "4px 10px", background: "#6b7280", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          ← Back to Dashboard
        </button>
        <button
          onClick={() => setShowInviteModal(true)}
          style={{ padding: "4px 10px", background: "#10b981", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}
        >
          📤 Invite Others
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>Room: {roomId?.slice(0, 15)}...</span>
        <span style={{ fontSize: 12, color: "#666" }}>{displayName}</span>
        <span data-testid="connection-status" style={{ color: connected ? "green" : "red" }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
        {(["pan", "sticky", "rectangle", "circle", "line"] as const).map((t) => (
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
                      : undefined
            }
            style={{ padding: "4px 10px", background: tool === t ? "#333" : "#eee", color: tool === t ? "white" : "#333", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {tool === "pan" && (
          <span style={{ fontSize: 11, color: "#888" }}>Shift+drag to select</span>
        )}
        {tool === "sticky" && (
          <>
            <span style={{ fontSize: 12, color: "#666" }}>Color:</span>
            {STICKY_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedStickyColor(color)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: color,
                  border: selectedStickyColor === color ? "2px solid #333" : "1px solid #ccc",
                  cursor: "pointer",
                  padding: 0,
                }}
                title={color}
              />
            ))}
            <button
              onClick={() => setSelectedStickyColor(getRandomStickyColor())}
              style={{ padding: "4px 8px", fontSize: 12, background: "#f3f4f6", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
            >
              Random
            </button>
          </>
        )}
        {(tool === "rectangle" || tool === "circle" || tool === "line") && (
          <>
            <span style={{ fontSize: 12, color: "#666" }}>Color:</span>
            {["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"].map((color) => (
              <button
                key={color}
                onClick={() => setSelectedShapeColor(color)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  background: color,
                  border: selectedShapeColor === color ? "2px solid #333" : "1px solid #ccc",
                  cursor: "pointer",
                  padding: 0,
                }}
                title={color}
              />
            ))}
          </>
        )}
        {selectedIds.length > 0 && (
          <button data-testid="delete-btn" onClick={() => { selectedIds.forEach((id) => deleteObject(id)); setSelectedIds([]); }} style={{ padding: "4px 10px", background: "#dc2626", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
            Delete
          </button>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,0.95)", padding: "8px 12px", borderRadius: 8, fontSize: 12, zIndex: 10 }}>
        <strong>Online:</strong> {presence.length} — {presence.map((p) => p.name).join(", ") || "Just you"}
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
    </div>
  );
}