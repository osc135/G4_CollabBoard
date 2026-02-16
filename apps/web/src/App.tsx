import { useRef, useState } from "react";
import { Board, type Tool } from "./Board";
import { useSocket } from "./useSocket";
import Konva from "konva";

export default function App() {
  const [userName, setUserName] = useState(() => localStorage.getItem("collabboard-name") || "Anonymous");
  const [tool, setTool] = useState<Tool>("pan");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);

  const { connected, objects, cursors, presence, emitCursor, createObject, updateObject, deleteObject } = useSocket(userName);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Board
        objects={objects}
        cursors={cursors}
        tool={tool}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onObjectCreate={createObject}
        onObjectUpdate={updateObject}
        onCursorMove={emitCursor}
        stageRef={stageRef}
      />
      <div style={{ position: "absolute", top: 12, left: 12, display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.95)", padding: "8px 12px", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", zIndex: 10 }}>
        <input
          aria-label="Your name"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          onBlur={() => userName && localStorage.setItem("collabboard-name", userName)}
          style={{ width: 120, padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4 }}
        />
        <span data-testid="connection-status" style={{ color: connected ? "green" : "red" }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
        {(["pan", "sticky", "rectangle"] as const).map((t) => (
          <button
            key={t}
            data-testid={`tool-${t}`}
            onClick={() => setTool(t)}
            style={{ padding: "4px 10px", background: tool === t ? "#333" : "#eee", color: tool === t ? "white" : "#333", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        {selectedId && (
          <button data-testid="delete-btn" onClick={() => { deleteObject(selectedId); setSelectedId(null); }} style={{ padding: "4px 10px", background: "#dc2626", color: "white", border: "none", borderRadius: 4, cursor: "pointer" }}>
            Delete
          </button>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,0.95)", padding: "8px 12px", borderRadius: 8, fontSize: 12, zIndex: 10 }}>
        <strong>Online:</strong> {presence.length} — {presence.map((p) => p.name).join(", ") || "Just you"}
      </div>
    </div>
  );
}
