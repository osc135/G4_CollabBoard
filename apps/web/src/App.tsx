import { useEffect, useRef, useState } from "react";
import { Board, type Tool, STICKY_COLORS, getRandomStickyColor } from "./Board";
import { useSocket } from "./useSocket";
import { useAuth } from "./contexts/AuthContext";
import { LoginScreen } from "./LoginScreen";
import Konva from "konva";

export default function App() {
  const { session, loading, displayName, userId, signOut } = useAuth();
  const [tool, setTool] = useState<Tool>("pan");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStickyColor, setSelectedStickyColor] = useState<string>(STICKY_COLORS[0]);
  const [selectedShapeColor, setSelectedShapeColor] = useState<string>("#3b82f6");
  const stageRef = useRef<Konva.Stage | null>(null);

  const { connected, objects, cursors, presence, emitCursor, createObject, updateObject, deleteObject } = useSocket(
    userId,
    displayName
  );

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
    return <LoginScreen />;
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
        onCursorMove={emitCursor}
        stageRef={stageRef}
        selectedStickyColor={selectedStickyColor}
        selectedShapeColor={selectedShapeColor}
      />
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.95)", padding: "8px 12px", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", zIndex: 10 }}>
        <span style={{ fontSize: 12, color: "#666" }}>{displayName}</span>
        <span data-testid="connection-status" style={{ color: connected ? "green" : "red" }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
        {(["pan", "sticky", "textbox", "rectangle", "circle", "line"] as const).map((t) => (
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
        <button onClick={() => signOut()} style={{ padding: "4px 10px", background: "#64748b", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
          Sign out
        </button>
      </div>
      <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,0.95)", padding: "8px 12px", borderRadius: 8, fontSize: 12, zIndex: 10 }}>
        <strong>Online:</strong> {presence.length} — {presence.map((p) => p.name).join(", ") || "Just you"}
      </div>
    </div>
  );
}
