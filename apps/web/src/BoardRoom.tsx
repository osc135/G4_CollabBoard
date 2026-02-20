import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import type { BoardObject } from "@collabboard/shared";
import { Board, type Tool, type BackgroundPattern, STICKY_COLORS, getRandomStickyColor } from "./Board";
import { useSupabaseBoard } from "./useSupabaseBoard";
import { useAuth } from "./contexts/AuthContext";
import { extractRoomCode } from "./utils/roomCode";
import { AIChatContent } from "./components/AIChat";
import { ShareModal } from "./components/ShareModal";
import Konva from "konva";

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface BoardRoomProps {
  readOnly?: boolean;
}

export function BoardRoom({ readOnly = false }: BoardRoomProps) {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const aiPrompt = searchParams.get('ai');

  // Stable viewer ID for read-only mode (persists across re-renders)
  const [viewerId] = useState(() => `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

  // In read-only mode, auth may not be available (user not logged in)
  const auth = useAuth();
  const session = auth.session;
  const loading = auth.loading;
  const displayName = readOnly ? "Viewer" : auth.displayName;
  const userId = readOnly ? viewerId : auth.userId;

  const [tool, setTool] = useState<Tool>(readOnly ? "pan" : "pan");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStickyColor, setSelectedStickyColor] = useState<string>(STICKY_COLORS[0]);
  const [selectedShapeColor, setSelectedShapeColor] = useState<string>("#3b82f6");
  const [penType, setPenType] = useState<"pen" | "marker" | "highlighter">("pen");
  const [penStrokeWidth, setPenStrokeWidth] = useState<number>(3);
  const [backgroundPattern, setBackgroundPattern] = useState<BackgroundPattern>("dots");
  const [bgColor, setBgColor] = useState("#f8fafc");
  const [showBgPicker, setShowBgPicker] = useState(false);
  const bgPickerRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'ai'>('chat');
  const [unreadCount, setUnreadCount] = useState(0);
  const chatOpenRef = useRef(false);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatInput, setChatInput] = useState("");
  const seenStorageKey = roomId ? `chat-seen-${roomId}` : null;
  const [initSeenCount] = useState(() => {
    if (!seenStorageKey) return 0;
    try {
      return parseInt(localStorage.getItem(seenStorageKey) || '0', 10);
    } catch { return 0; }
  });
  const lastSeenCountRef = useRef(initSeenCount);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>("");
  const stageRef = useRef<Konva.Stage | null>(null);

  const { connected, objects, cursors, presence, isOwner, isLocked, toggleLock, remoteSelections, remoteEditingMap, remoteDraggingIds, remoteDrawingPaths, chatMessages, emitChatMessage, emitCursor, emitSelection, emitTextEdit, emitStickyLock, emitStickyUnlock, emitObjectDrag, emitObjectDragEnd, emitObjectTransform, emitObjectTransformEnd, emitDrawingPath, emitDrawingEnd, createObject, updateObject, deleteObject } = useSupabaseBoard(
    userId,
    displayName,
    roomId
  );

  // Non-owners are effectively read-only when the board is locked
  const effectiveReadOnly = readOnly || (isLocked && !isOwner);

  // No-op callbacks for read-only mode
  const noop = useCallback(() => {}, []);
  const noopObj = useCallback((_obj: BoardObject) => {}, []);
  const noopStr = useCallback((_id: string) => {}, []);
  const noopDrag = useCallback((_id: string, _x: number, _y: number, _r?: number) => {}, []);
  const noopDragEnd = useCallback((_id: string, _x: number, _y: number) => {}, []);
  const noopTransform = useCallback((_id: string, _x: number, _y: number, _w: number, _h: number, _r: number) => {}, []);
  const noopTransformEnd = useCallback((_id: string) => {}, []);
  const noopTextEdit = useCallback((_id: string, _text: string) => {}, []);
  const noopCursor = useCallback((_x: number, _y: number) => {}, []);

  // Undo stack for local deletions only
  const [deletedStack, setDeletedStack] = useState<BoardObject[]>([]);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const deleteWithUndo = useCallback((id: string) => {
    const obj = objectsRef.current.find(o => o.id === id);
    if (obj) setDeletedStack(prev => [...prev, obj]);
    deleteObject(id);
  }, [deleteObject]);

  const handleUndo = useCallback(() => {
    setDeletedStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      createObject(last);
      return prev.slice(0, -1);
    });
  }, [createObject]);

  // Broadcast selection changes to other users
  useEffect(() => {
    if (effectiveReadOnly) return;
    emitSelection(selectedIds);
  }, [selectedIds, emitSelection, effectiveReadOnly]);

  // Extract invite code from room ID
  useEffect(() => {
    if (!roomId) return;
    const code = extractRoomCode(roomId);
    setInviteCode(code);
  }, [roomId]);

  // Clear seen count from localStorage when leaving the room (SPA navigation)
  useEffect(() => {
    return () => {
      if (seenStorageKey) {
        localStorage.removeItem(seenStorageKey);
      }
    };
  }, [seenStorageKey]);

  // Keep chatOpenRef in sync and mark messages as seen when chat tab is visible
  const chatTabVisible = panelOpen && activeTab === 'chat';
  useEffect(() => {
    chatOpenRef.current = chatTabVisible;
    if (chatTabVisible) {
      setUnreadCount(0);
      lastSeenCountRef.current = chatMessages.length;
      if (seenStorageKey) {
        try { localStorage.setItem(seenStorageKey, String(chatMessages.length)); } catch {}
      }
    }
  }, [chatTabVisible, chatMessages.length, seenStorageKey]);

  // Auto-focus chat input when chat tab is visible
  useEffect(() => {
    if (chatTabVisible) {
      setTimeout(() => chatInputRef.current?.focus(), 0);
    }
  }, [chatTabVisible]);

  // Track unread messages when panel is closed
  useEffect(() => {
    if (!chatOpenRef.current && chatMessages.length > lastSeenCountRef.current) {
      setUnreadCount(chatMessages.length - lastSeenCountRef.current);
    }
  }, [chatMessages]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatTabVisible) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatTabVisible]);

  // Auto-open panel on AI tab when ?ai= param is present
  useEffect(() => {
    if (aiPrompt && connected) {
      setPanelOpen(true);
      setActiveTab('ai');
    }
  }, [aiPrompt, connected]);

  useEffect(() => {
    if (effectiveReadOnly) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active?.tagName === "INPUT" || active?.tagName === "TEXTAREA" || (active as HTMLElement)?.isContentEditable;

      // Ctrl/Cmd+Z to undo last deletion
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !isInput) {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isInput) return;
      if (selectedIds.length === 0) return;
      e.preventDefault();
      selectedIds.forEach((id) => deleteWithUndo(id));
      setSelectedIds([]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, deleteWithUndo, handleUndo, effectiveReadOnly]);

  useEffect(() => {
    if (!showBgPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (bgPickerRef.current && !bgPickerRef.current.contains(e.target as Node)) {
        setShowBgPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBgPicker]);

  // In read-only mode, skip auth checks
  if (!readOnly) {
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
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Board
        objects={objects}
        cursors={cursors}
        tool={effectiveReadOnly ? "pan" : tool}
        selectedIds={effectiveReadOnly ? [] : selectedIds}
        onSelect={effectiveReadOnly ? noop : setSelectedIds}
        onObjectCreate={effectiveReadOnly ? noopObj : createObject}
        onObjectUpdate={effectiveReadOnly ? noopObj : updateObject}
        onObjectDelete={effectiveReadOnly ? noopStr : deleteWithUndo}
        onCursorMove={effectiveReadOnly ? noopCursor : emitCursor}
        onObjectDrag={effectiveReadOnly ? noopDrag : emitObjectDrag}
        onObjectDragEnd={effectiveReadOnly ? noopDragEnd : emitObjectDragEnd}
        onObjectTransform={effectiveReadOnly ? noopTransform : emitObjectTransform}
        onObjectTransformEnd={effectiveReadOnly ? noopTransformEnd : emitObjectTransformEnd}
        remoteSelections={remoteSelections}
        remoteEditingMap={remoteEditingMap}
        remoteDraggingIds={remoteDraggingIds}
        onTextEdit={effectiveReadOnly ? noopTextEdit : emitTextEdit}
        onStickyLock={effectiveReadOnly ? noopStr : emitStickyLock}
        onStickyUnlock={effectiveReadOnly ? noopStr : emitStickyUnlock}
        stageRef={stageRef}
        selectedStickyColor={selectedStickyColor}
        selectedShapeColor={selectedShapeColor}
        backgroundPattern={backgroundPattern}
        bgColor={bgColor}
        penType={penType}
        penStrokeWidth={penStrokeWidth}
        onDrawingPath={emitDrawingPath}
        onDrawingEnd={emitDrawingEnd}
        remoteDrawingPaths={remoteDrawingPaths}
      />

      {readOnly ? (
        /* Read-only minimal top bar */
        <div style={{
          position: "absolute",
          top: 16,
          left: 16,
          right: 16,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.98), rgba(250,250,250,0.98))",
          backdropFilter: "blur(10px)",
          padding: "10px 16px",
          borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid rgba(0,0,0,0.06)",
          zIndex: 10,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>CollabBoard</span>
          <span style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#6b7280",
            background: "rgba(0,0,0,0.05)",
            padding: "3px 8px",
            borderRadius: 4,
          }}>
            VIEW ONLY
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#10b981" : "#ef4444",
              boxShadow: connected ? "0 0 0 3px rgba(16,185,129,0.2)" : "0 0 0 3px rgba(239,68,68,0.2)",
            }} />
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>
              {connected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
          <a
            href="/"
            style={{
              padding: "7px 14px",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            }}
          >
            Open CollabBoard
          </a>
        </div>
      ) : (
        /* Full editing toolbar */
        <>
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
          Invite
        </button>

        <button
          onClick={() => setShowShareModal(true)}
          style={{
            padding: "7px 14px",
            background: "linear-gradient(135deg, #3b82f6, #2563eb)",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            transition: "all 0.2s",
            boxShadow: "0 2px 4px rgba(59,130,246,0.2)"
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          Share
        </button>

        {isOwner && (
          <button
            onClick={toggleLock}
            style={{
              padding: "7px 14px",
              background: isLocked
                ? "linear-gradient(135deg, #f59e0b, #d97706)"
                : "linear-gradient(135deg, #6b7280, #4b5563)",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.2s",
              boxShadow: isLocked
                ? "0 2px 4px rgba(245,158,11,0.3)"
                : "0 2px 4px rgba(0,0,0,0.1)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
            title={isLocked ? "Unlock board for collaborators" : "Lock board (view-only for others)"}
          >
            {isLocked ? "Unlock" : "Lock"}
          </button>
        )}

        {!isOwner && isLocked && (
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#d97706",
            background: "rgba(245,158,11,0.1)",
            padding: "5px 10px",
            borderRadius: 6,
            border: "1px solid rgba(245,158,11,0.2)",
          }}>
            LOCKED
          </span>
        )}

        <div style={{ width: 1, height: 24, background: "rgba(0,0,0,0.1)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.03)", padding: "4px 8px", borderRadius: 6, opacity: effectiveReadOnly ? 0.5 : 1, pointerEvents: effectiveReadOnly ? "none" : "auto" }}>
          {(["pan", "sticky", "rectangle", "circle", "line", "drawing"] as const).map((t, index) => [
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
                          : t === "drawing"
                            ? "Click and drag to draw"
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
                  <span style={{ fontSize: 16 }}>{t === "pan" ? "✋" : t === "sticky" ? "📝" : t === "rectangle" ? "◻" : t === "circle" ? "⭕" : t === "drawing" ? "✏️" : "⁄"}</span>
                  <span>{t === "drawing" ? "Draw" : t.charAt(0).toUpperCase() + t.slice(1)}</span>
                </span>
              </button>,
              index < 5 && <div key={`sep-${index}`} style={{ width: 1, height: 20, background: "rgba(0,0,0,0.06)" }} />
          ].filter(Boolean))}
        </div>

        <div style={{ width: 1, height: 24, background: "rgba(0,0,0,0.1)" }} />

        <div ref={bgPickerRef} style={{ position: "relative" }}>
          <button
            onClick={() => setShowBgPicker(!showBgPicker)}
            style={{
              padding: "6px 12px",
              background: showBgPicker ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "white",
              color: showBgPicker ? "white" : "#4b5563",
              border: showBgPicker ? "none" : "1px solid rgba(0,0,0,0.08)",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              transition: "all 0.2s",
              boxShadow: showBgPicker ? "0 2px 8px rgba(59,130,246,0.3)" : "0 1px 2px rgba(0,0,0,0.05)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
            onMouseEnter={(e) => { if (!showBgPicker) e.currentTarget.style.background = "#f9fafb"; }}
            onMouseLeave={(e) => { if (!showBgPicker) e.currentTarget.style.background = "white"; }}
          >
            <span style={{ fontSize: 16 }}>🎨</span>
            <span>Background</span>
          </button>

          {showBgPicker && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              background: "white",
              borderRadius: 12,
              boxShadow: "0 8px 30px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08)",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 16,
              zIndex: 100,
              width: 340,
            }}>
              {/* Background Color */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Background Color</span>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {["#f8fafc", "#ffffff", "#f1f5f9", "#e2e8f0", "#1e293b", "#0f172a", "#fef3c7", "#ecfccb", "#e0f2fe", "#fce7f3"].map((color) => (
                    <button
                      key={color}
                      onClick={() => setBgColor(color)}
                      title={color}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: color,
                        border: bgColor === color ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.12)",
                        cursor: "pointer",
                        padding: 0,
                        transition: "all 0.15s",
                        boxShadow: bgColor === color ? "0 0 0 3px rgba(59,130,246,0.3)" : "0 1px 2px rgba(0,0,0,0.08)",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.1)"}
                      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                    />
                  ))}
                </div>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                  padding: "6px 10px",
                  background: "linear-gradient(135deg, #f0f9ff, #fdf2f8, #fefce8)",
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}>
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    style={{ width: 24, height: 24, border: "none", borderRadius: 4, cursor: "pointer", padding: 0 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#4b5563" }}>Custom Color</span>
                  <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>{bgColor}</span>
                </label>
              </div>

              <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 -16px 14px" }} />

              {/* Patterns */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Pattern</span>
                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                  {([
                    { value: "dots" as BackgroundPattern, label: "Dots", icon: "···" },
                    { value: "lines" as BackgroundPattern, label: "Lines", icon: "╋" },
                    { value: "grid" as BackgroundPattern, label: "Grid", icon: "▦" },
                    { value: "blueprint" as BackgroundPattern, label: "Blueprint", icon: "📐" },
                    { value: "isometric" as BackgroundPattern, label: "Isometric", icon: "◇" },
                    { value: "hex" as BackgroundPattern, label: "Hex", icon: "⬡" },
                    { value: "lined" as BackgroundPattern, label: "Lined", icon: "☰" },
                    { value: "none" as BackgroundPattern, label: "None", icon: "◻" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setBackgroundPattern(opt.value)}
                      title={opt.label}
                      style={{
                        padding: "5px 10px",
                        background: backgroundPattern === opt.value ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "#f8fafc",
                        color: backgroundPattern === opt.value ? "white" : "#4b5563",
                        border: backgroundPattern === opt.value ? "none" : "1px solid rgba(0,0,0,0.06)",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: backgroundPattern === opt.value ? 600 : 500,
                        transition: "all 0.15s",
                      }}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 -16px 14px" }} />

              {/* Themes (these override both color + pattern) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Themes</span>
                  <span style={{ fontSize: 10, color: "#9ca3af" }}>overrides color + pattern</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 6 }}>
                  {([
                    { value: "space" as BackgroundPattern, label: "Space", color: "#1e1b4b", emoji: "🌌" },
                    { value: "library" as BackgroundPattern, label: "Library", color: "#4e342e", emoji: "📚" },
                    { value: "school" as BackgroundPattern, label: "School", color: "#2e7d32", emoji: "🏫" },
                    { value: "ocean" as BackgroundPattern, label: "Ocean", color: "#0369a1", emoji: "🌊" },
                    { value: "sunset" as BackgroundPattern, label: "Sunset", color: "#ea580c", emoji: "🌅" },
                    { value: "cork" as BackgroundPattern, label: "Cork", color: "#c4956a", emoji: "📌" },
                    { value: "nightcity" as BackgroundPattern, label: "Night City", color: "#1e293b", emoji: "🌃" },
                    { value: "garden" as BackgroundPattern, label: "Garden", color: "#86efac", emoji: "🌿" },
                    { value: "snowfall" as BackgroundPattern, label: "Snowfall", color: "#bae6fd", emoji: "❄️" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { setBackgroundPattern(opt.value); setShowBgPicker(false); }}
                      style={{
                        padding: "6px 8px",
                        background: opt.color,
                        color: ["garden", "snowfall", "cork"].includes(opt.value) ? "#1e293b" : "white",
                        border: backgroundPattern === opt.value ? "2px solid #3b82f6" : "1px solid rgba(0,0,0,0.12)",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                        transition: "all 0.15s",
                        boxShadow: backgroundPattern === opt.value ? "0 0 0 3px rgba(59,130,246,0.3)" : "0 1px 3px rgba(0,0,0,0.1)",
                        textAlign: "left" as const,
                      }}
                    >
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
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

        {tool === "drawing" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.03)", padding: "4px 8px", borderRadius: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>TYPE</span>
            {([
              { value: "pen" as const, label: "Pen", icon: "✏️" },
              { value: "marker" as const, label: "Marker", icon: "🖊️" },
              { value: "highlighter" as const, label: "Highlighter", icon: "🖍️" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPenType(opt.value)}
                style={{
                  padding: "4px 8px",
                  background: penType === opt.value ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "white",
                  color: penType === opt.value ? "white" : "#4b5563",
                  border: penType === opt.value ? "none" : "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 5,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: penType === opt.value ? 600 : 500,
                  transition: "all 0.15s",
                }}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
            <div style={{ width: 1, height: 20, background: "rgba(0,0,0,0.1)" }} />
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 500 }}>WIDTH</span>
            {[2, 4, 8, 16].map((w) => (
              <button
                key={w}
                onClick={() => setPenStrokeWidth(w)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: penStrokeWidth === w ? "#3b82f6" : "white",
                  border: penStrokeWidth === w ? "none" : "1px solid rgba(0,0,0,0.08)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  transition: "all 0.15s",
                }}
                title={`${w}px`}
              >
                <div style={{
                  width: Math.min(w * 1.5, 18),
                  height: Math.min(w * 1.5, 18),
                  borderRadius: "50%",
                  background: penStrokeWidth === w ? "white" : "#4b5563",
                }} />
              </button>
            ))}
          </div>
        )}

        {(tool === "rectangle" || tool === "circle" || tool === "line" || tool === "drawing") && (
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
            onClick={() => { selectedIds.forEach((id) => deleteWithUndo(id)); setSelectedIds([]); }}
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

        {deletedStack.length > 0 && (
          <button
            onClick={handleUndo}
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
            title="Undo last delete (Ctrl+Z)"
          >
            Undo ({deletedStack.length})
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
        </>
      )}

      {/* Presence indicator - shown in both modes */}
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
      {!effectiveReadOnly && showInviteModal && (
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

      {/* Share Modal */}
      {!effectiveReadOnly && showShareModal && roomId && (
        <ShareModal
          roomId={roomId}
          stageRef={stageRef}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Unified Chat FAB */}
      <button
        onClick={() => setPanelOpen(prev => !prev)}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: panelOpen ? '#1d4ed8' : '#2563eb',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 50,
          fontSize: 22,
          transition: 'transform 0.2s, background-color 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        aria-label="Open Chat"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {unreadCount > 0 && (!panelOpen || activeTab !== 'chat') && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#ef4444',
            color: 'white',
            fontSize: 11,
            fontWeight: 700,
            borderRadius: '50%',
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Unified Tabbed Panel */}
      {panelOpen && (
        <div data-chat-panel style={{
          position: 'fixed',
          bottom: 88,
          right: 24,
          width: 384,
          maxHeight: 500,
          backgroundColor: 'white',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header — tab bar + close */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid #e5e7eb',
          }}>
            {/* Tabs */}
            <div style={{ display: 'flex', flex: 1 }}>
              <button
                onClick={() => setActiveTab('chat')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'chat' ? '2px solid #2563eb' : '2px solid transparent',
                  color: activeTab === 'chat' ? '#2563eb' : '#6b7280',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'color 0.15s',
                }}
              >
                Chat
                {unreadCount > 0 && activeTab !== 'chat' && (
                  <span style={{
                    background: '#ef4444',
                    color: 'white',
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 10,
                    padding: '1px 6px',
                    minWidth: 18,
                    textAlign: 'center',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {!effectiveReadOnly && (
                <button
                  onClick={() => setActiveTab('ai')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === 'ai' ? '2px solid #2563eb' : '2px solid transparent',
                    color: activeTab === 'ai' ? '#2563eb' : '#6b7280',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'color 0.15s',
                  }}
                >
                  AI
                </button>
              )}
            </div>
            {/* Close button */}
            <button
              onClick={() => setPanelOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                color: '#6b7280',
                padding: '2px 12px',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              ✕
            </button>
          </div>

          {/* Body — Chat tab */}
          {activeTab === 'chat' && (
            <>
              {/* Messages */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                {chatMessages.length === 0 && (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    fontSize: 13,
                  }}>
                    No messages yet. Say hi!
                  </div>
                )}
                {chatMessages.map((msg, i) => {
                  const isOwn = msg.senderId === userId;
                  const showSender = !isOwn && (i === 0 || chatMessages[i - 1].senderId !== msg.senderId);
                  const CURSOR_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
                  const senderColorIndex = Math.abs(msg.senderName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % CURSOR_COLORS.length;
                  const senderColor = CURSOR_COLORS[senderColorIndex];
                  const timeAgo = formatTimeAgo(msg.timestamp);

                  return (
                    <div key={msg.id} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isOwn ? 'flex-end' : 'flex-start',
                      marginTop: showSender ? 8 : 0,
                    }}>
                      {showSender && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: senderColor,
                          marginBottom: 2,
                          marginLeft: isOwn ? 0 : 4,
                          marginRight: isOwn ? 4 : 0,
                        }}>
                          {msg.senderName}
                        </span>
                      )}
                      <div style={{
                        maxWidth: '80%',
                        padding: '8px 12px',
                        borderRadius: isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                        background: isOwn ? '#2563eb' : '#f1f5f9',
                        color: isOwn ? 'white' : '#1e293b',
                        fontSize: 13,
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}>
                        {msg.text}
                      </div>
                      {(i === chatMessages.length - 1 || chatMessages[i + 1].senderId !== msg.senderId) && (
                        <span style={{
                          fontSize: 10,
                          color: '#9ca3af',
                          marginTop: 2,
                          marginLeft: isOwn ? 0 : 4,
                          marginRight: isOwn ? 4 : 0,
                        }}>
                          {timeAgo}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div ref={chatMessagesEndRef} />
              </div>

              {/* Input */}
              <div style={{
                borderTop: '1px solid #e5e7eb',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-end',
                gap: 8,
              }}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && chatInput.trim()) {
                      e.preventDefault();
                      emitChatMessage(chatInput.trim());
                      setChatInput('');
                      if (chatInputRef.current) {
                        chatInputRef.current.style.height = 'auto';
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const panel = e.currentTarget.closest('[data-chat-panel]');
                    if (panel) {
                      setTimeout(() => {
                        if (panel.contains(document.activeElement) || document.activeElement === document.body) {
                          chatInputRef.current?.focus();
                        }
                      }, 0);
                    }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: 13,
                    outline: 'none',
                    resize: 'none',
                    lineHeight: 1.4,
                    maxHeight: 120,
                    overflowY: 'auto',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => {
                    if (chatInput.trim()) {
                      emitChatMessage(chatInput.trim());
                      setChatInput('');
                      if (chatInputRef.current) {
                        chatInputRef.current.style.height = 'auto';
                        chatInputRef.current.focus();
                      }
                    }
                  }}
                  style={{
                    padding: '8px 14px',
                    background: chatInput.trim() ? '#2563eb' : '#e5e7eb',
                    color: chatInput.trim() ? 'white' : '#9ca3af',
                    border: 'none',
                    borderRadius: 8,
                    cursor: chatInput.trim() ? 'pointer' : 'default',
                    fontSize: 13,
                    fontWeight: 600,
                    transition: 'background 0.15s',
                    flexShrink: 0,
                  }}
                >
                  Send
                </button>
              </div>
            </>
          )}

          {/* Body — AI tab */}
          {activeTab === 'ai' && !effectiveReadOnly && (
            <AIChatContent
              callbacks={{ createObject, updateObject, deleteObject }}
              stageRef={stageRef}
              objects={objects}
              initialPrompt={aiPrompt || undefined}
              boardConnected={connected}
              onInitialPromptConsumed={() => {
                searchParams.delete('ai');
                setSearchParams(searchParams, { replace: true });
              }}
              isVisible={panelOpen && activeTab === 'ai'}
            />
          )}
        </div>
      )}
    </div>
  );
}
