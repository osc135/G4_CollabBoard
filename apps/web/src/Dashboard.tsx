import { useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { useAuth } from "./contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { RoomPreview } from "./RoomPreview";
import { SupabaseBoardService } from "./lib/supabase-boards";
import { extractRoomCode } from "./utils/roomCode";

interface BoardSummary {
  id: string;
  name: string;
  room_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  object_count: number;
  collaborator_count: number;
}

type TabType = 'my-rooms' | 'shared';
type SortType = 'recent' | 'name-asc' | 'oldest';

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    alert('Room code copied to clipboard!');
  }).catch(() => {
    alert(`Room code: ${text}`);
  });
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function sortRooms(rooms: BoardSummary[], sort: SortType): BoardSummary[] {
  const sorted = [...rooms];
  switch (sort) {
    case 'recent':
      return sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
}

export function Dashboard() {
  const { user, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const [ownedRooms, setOwnedRooms] = useState<BoardSummary[]>([]);
  const [sharedRooms, setSharedRooms] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('my-rooms');
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortType>('recent');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkAction, setConfirmBulkAction] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadRooms();
    }
  }, [user]);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadRooms() {
    try {
      const result = await SupabaseBoardService.getUserBoards();
      setOwnedRooms(result.owned);
      setSharedRooms(result.shared);
    } catch (err) {
      console.error('Error loading boards:', err);
    } finally {
      setLoading(false);
    }
  }

  async function createRoom() {
    if (!newRoomName.trim() || !user) return;

    setCreating(true);
    try {
      const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await SupabaseBoardService.createBoard(newRoomName, roomId);
      navigate(`/board/${roomId}`);
    } catch (err) {
      console.error('Error creating board:', err);
      alert('Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  async function createRoomWithAI() {
    if (!aiPrompt.trim() || !user) return;

    setAiGenerating(true);
    try {
      // Derive a room name from the prompt (first ~40 chars)
      const roomName = aiPrompt.length > 40 ? aiPrompt.slice(0, 40).trim() + '...' : aiPrompt;
      const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await SupabaseBoardService.createBoard(roomName, roomId);
      navigate(`/board/${roomId}?ai=${encodeURIComponent(aiPrompt)}`);
    } catch (err) {
      console.error('Error creating AI room:', err);
      alert('Failed to create room');
    } finally {
      setAiGenerating(false);
    }
  }

  async function enterRoom(roomId: string) {
    await supabase
      .from('boards')
      .update({ updated_at: new Date().toISOString() })
      .eq('room_id', roomId);
    navigate(`/board/${roomId}`);
  }

  async function handleLogout() {
    await signOut();
    navigate('/');
  }

  async function handleDeleteRoom(boardId: string) {
    try {
      await SupabaseBoardService.deleteBoard(boardId);
      setOwnedRooms(prev => prev.filter(r => r.id !== boardId));
    } catch (err) {
      console.error('Error deleting board:', err);
      alert('Failed to delete room');
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleLeaveRoom(boardId: string) {
    try {
      await SupabaseBoardService.leaveBoard(boardId);
      setSharedRooms(prev => prev.filter(r => r.id !== boardId));
    } catch (err) {
      console.error('Error leaving board:', err);
      alert('Failed to leave room');
    } finally {
      setConfirmLeave(null);
    }
  }

  function toggleSelectMode() {
    setSelectMode(prev => !prev);
    setSelectedRooms(new Set());
  }

  function toggleRoomSelection(roomId: string) {
    setSelectedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }

  function selectAll() {
    const allIds = displayedRooms.map(r => r.id);
    setSelectedRooms(prev => {
      if (prev.size === allIds.length) {
        return new Set();
      }
      return new Set(allIds);
    });
  }

  async function handleBulkAction() {
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedRooms);
      if (activeTab === 'my-rooms') {
        await Promise.all(ids.map(id => SupabaseBoardService.deleteBoard(id)));
        setOwnedRooms(prev => prev.filter(r => !selectedRooms.has(r.id)));
      } else {
        await Promise.all(ids.map(id => SupabaseBoardService.leaveBoard(id)));
        setSharedRooms(prev => prev.filter(r => !selectedRooms.has(r.id)));
      }
      setSelectedRooms(new Set());
      setSelectMode(false);
    } catch (err) {
      console.error('Bulk action error:', err);
      alert(`Failed to ${activeTab === 'my-rooms' ? 'delete' : 'leave'} some rooms`);
    } finally {
      setBulkDeleting(false);
      setConfirmBulkAction(false);
    }
  }

  async function joinRoomWithCode() {
    if (!joinCode.trim() || !user) return;

    setJoining(true);
    try {
      const { data: allBoards, error } = await supabase
        .from('boards')
        .select('*')
        .eq('is_public', true);

      if (error) throw error;

      const boards = allBoards?.filter(board => {
        const extractedCode = extractRoomCode(board.room_id);
        return extractedCode.toLowerCase() === joinCode.toLowerCase();
      }) || [];

      if (!boards || boards.length === 0) {
        alert('Room not found. Please check the code and try again.');
        return;
      }

      const board = boards[0];

      const { data: existingCollab } = await supabase
        .from('board_collaborators')
        .select('*')
        .eq('board_id', board.id)
        .eq('user_id', user.id)
        .single();

      if (!existingCollab) {
        const { error: collaboratorError } = await supabase
          .from('board_collaborators')
          .insert({
            board_id: board.id,
            user_id: user.id,
            role: 'editor'
          })
          .select()
          .single();

        if (collaboratorError) {
          alert(`Failed to join room: ${collaboratorError.message}`);
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      navigate(`/board/${board.room_id}`);
    } catch (err) {
      alert(`Failed to join room: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setJoining(false);
      setShowJoinModal(false);
      setJoinCode('');
    }
  }

  // Get filtered and sorted rooms for current tab
  // Clear selection when switching tabs
  const prevTab = useRef(activeTab);
  if (prevTab.current !== activeTab) {
    prevTab.current = activeTab;
    if (selectedRooms.size > 0) setSelectedRooms(new Set());
  }

  const currentRooms = activeTab === 'my-rooms' ? ownedRooms : sharedRooms;
  const filteredRooms = currentRooms.filter(room =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const displayedRooms = sortRooms(filteredRooms, sortBy);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "white", fontSize: "18px" }}>Loading your workspace...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page" style={{ minHeight: "100vh", background: "#f8fafc" }}>
      {/* Header */}
      <header style={{ background: "white", borderBottom: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "64px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "18px"
              }}>🎨</div>
              <h1 style={{ fontSize: "22px", fontWeight: "700", color: "#1a202c", margin: 0 }}>CollabBoard</h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={() => setShowNewRoomModal(true)}
                style={{
                  padding: "8px 16px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
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
                + New Room
              </button>
              <button
                onClick={() => setShowJoinModal(true)}
                style={{
                  padding: "8px 16px",
                  background: "#10b981",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
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
                Join Room
              </button>

              {/* Profile Dropdown */}
              <div ref={profileRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  style={{
                    padding: "6px 14px",
                    background: showProfileDropdown ? "#eef2ff" : "#f1f5f9",
                    borderRadius: "20px",
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: "500",
                    border: showProfileDropdown ? "1px solid #c7d2fe" : "1px solid transparent",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "12px",
                    fontWeight: "700"
                  }}>
                    {(displayName || 'U')[0].toUpperCase()}
                  </div>
                  {displayName}
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>▼</span>
                </button>

                {showProfileDropdown && (
                  <div style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    right: 0,
                    background: "white",
                    borderRadius: "12px",
                    boxShadow: "0 10px 25px -3px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                    border: "1px solid #e2e8f0",
                    minWidth: "200px",
                    padding: "8px 0",
                    zIndex: 200
                  }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "#1a202c" }}>{displayName}</div>
                      <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{user?.email}</div>
                    </div>
                    <button
                      onClick={handleLogout}
                      style={{
                        width: "100%",
                        padding: "10px 16px",
                        background: "transparent",
                        border: "none",
                        textAlign: "left",
                        fontSize: "13px",
                        color: "#ef4444",
                        cursor: "pointer",
                        transition: "background 0.15s"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px 24px 48px" }}>
        {/* Welcome + Build with AI */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px"
          }}>
            <div>
              <h2 style={{
                fontSize: "24px",
                fontWeight: "700",
                color: "#1a202c",
                margin: "0 0 4px 0",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text"
              }}>
                Welcome back, {displayName}
              </h2>
              <p style={{ fontSize: "14px", color: "#64748b", margin: 0 }}>
                {ownedRooms.length + sharedRooms.length} room{ownedRooms.length + sharedRooms.length !== 1 ? 's' : ''} in your workspace
              </p>
            </div>
          </div>

          {/* Build with AI */}
          <div style={{
            background: "white",
            borderRadius: "14px",
            border: "1px solid #e2e8f0",
            padding: "20px 24px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px"
            }}>
              <span style={{ fontSize: "18px" }}>✨</span>
              <span style={{ fontSize: "14px", fontWeight: "600", color: "#1a202c" }}>Build with AI</span>
              <span style={{
                fontSize: "11px",
                fontWeight: "500",
                color: "#667eea",
                background: "#eef2ff",
                padding: "2px 8px",
                borderRadius: "10px"
              }}>
                Beta
              </span>
            </div>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 14px 0" }}>
              Describe what you want to create and AI will generate a board for you.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                type="text"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g. Sprint planning board for Q2, SWOT analysis for product launch..."
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: "14px",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  background: "#f8fafc"
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#667eea";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102, 126, 234, 0.1)";
                  e.currentTarget.style.background = "white";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.background = "#f8fafc";
                }}
                onKeyDown={(e) => e.key === 'Enter' && !aiGenerating && createRoomWithAI()}
                disabled={aiGenerating}
              />
              <button
                onClick={createRoomWithAI}
                disabled={aiGenerating || !aiPrompt.trim()}
                style={{
                  padding: "10px 20px",
                  background: aiGenerating || !aiPrompt.trim()
                    ? "#cbd5e0"
                    : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: aiGenerating || !aiPrompt.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
                onMouseEnter={(e) => {
                  if (!aiGenerating && aiPrompt.trim()) e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {aiGenerating ? 'Creating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs + Search/Sort Bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "10px", padding: "4px" }}>
            <button
              onClick={() => setActiveTab('my-rooms')}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: activeTab === 'my-rooms' ? "white" : "transparent",
                color: activeTab === 'my-rooms' ? "#1a202c" : "#64748b",
                boxShadow: activeTab === 'my-rooms' ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
              }}
            >
              My Rooms ({ownedRooms.length})
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: activeTab === 'shared' ? "white" : "transparent",
                color: activeTab === 'shared' ? "#1a202c" : "#64748b",
                boxShadow: activeTab === 'shared' ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
              }}
            >
              Shared with Me ({sharedRooms.length})
            </button>
          </div>

          {/* Search + Sort + Select */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rooms..."
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                outline: "none",
                width: "200px",
                transition: "border-color 0.15s"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#667eea"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              style={{
                padding: "8px 12px",
                fontSize: "13px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                outline: "none",
                background: "white",
                color: "#475569",
                cursor: "pointer"
              }}
            >
              <option value="recent">Recently updated</option>
              <option value="name-asc">Name A-Z</option>
              <option value="oldest">Oldest first</option>
            </select>
            <button
              onClick={toggleSelectMode}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                fontWeight: "500",
                border: selectMode ? "1px solid #667eea" : "1px solid #e2e8f0",
                borderRadius: "8px",
                background: selectMode ? "#eef2ff" : "white",
                color: selectMode ? "#667eea" : "#475569",
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>

        {/* Select Mode Action Bar */}
        {selectMode && displayedRooms.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            padding: "10px 16px",
            background: selectedRooms.size > 0 ? "#eef2ff" : "#f8fafc",
            borderRadius: "10px",
            border: `1px solid ${selectedRooms.size > 0 ? '#c7d2fe' : '#e2e8f0'}`,
            transition: "all 0.15s ease"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                onClick={selectAll}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: "500",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  background: selectedRooms.size === displayedRooms.length && displayedRooms.length > 0 ? "#667eea" : "white",
                  color: selectedRooms.size === displayedRooms.length && displayedRooms.length > 0 ? "white" : "#475569",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {selectedRooms.size === displayedRooms.length && displayedRooms.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              <span style={{ fontSize: "13px", color: "#64748b" }}>
                {selectedRooms.size > 0 ? `${selectedRooms.size} selected` : 'Click cards to select'}
              </span>
            </div>
            {selectedRooms.size > 0 && (
              <button
                onClick={() => setConfirmBulkAction(true)}
                style={{
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border: "none",
                  borderRadius: "8px",
                  background: activeTab === 'my-rooms' ? "#ef4444" : "#f59e0b",
                  color: "white",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                {activeTab === 'my-rooms' ? `Delete ${selectedRooms.size} Room${selectedRooms.size > 1 ? 's' : ''}` : `Leave ${selectedRooms.size} Room${selectedRooms.size > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}

        {/* Room Grid */}
        {displayedRooms.length === 0 ? (
          <div style={{
            padding: "60px 20px",
            textAlign: "center",
            background: "white",
            borderRadius: "16px",
            border: "1px solid #e2e8f0"
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>
              {searchQuery ? '🔍' : activeTab === 'my-rooms' ? '📋' : '🤝'}
            </div>
            <p style={{ fontSize: "18px", color: "#4a5568", marginBottom: "8px" }}>
              {searchQuery
                ? 'No rooms match your search'
                : activeTab === 'my-rooms'
                  ? 'No rooms yet'
                  : 'No shared rooms'}
            </p>
            <p style={{ fontSize: "14px", color: "#718096", marginBottom: "24px" }}>
              {searchQuery
                ? 'Try a different search term'
                : activeTab === 'my-rooms'
                  ? 'Create your first room to start collaborating'
                  : 'Join a room using a share code to see it here'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => activeTab === 'my-rooms' ? setShowNewRoomModal(true) : setShowJoinModal(true)}
                style={{
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s ease"
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
              >
                {activeTab === 'my-rooms' ? '+ Create Your First Room' : 'Join a Room'}
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "20px"
          }}>
            {displayedRooms.map((room) => {
              const isSelected = selectedRooms.has(room.id);
              return (
              <div
                key={room.id}
                onClick={() => selectMode ? toggleRoomSelection(room.id) : enterRoom(room.room_id)}
                style={{
                  background: isSelected ? "#eef2ff" : "white",
                  borderRadius: "12px",
                  padding: "16px",
                  cursor: "pointer",
                  border: isSelected ? "2px solid #667eea" : "1px solid #e2e8f0",
                  transition: "all 0.2s ease",
                  position: "relative"
                }}
                onMouseEnter={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 8px 20px -4px rgba(0, 0, 0, 0.1)";
                  }
                  if (!isSelected) e.currentTarget.style.borderColor = selectMode ? "#a5b4fc" : "#cbd5e1";
                  const btn = e.currentTarget.querySelector('[data-action-btn]') as HTMLElement;
                  if (btn) btn.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }
                  e.currentTarget.style.borderColor = isSelected ? "#667eea" : "#e2e8f0";
                  const btn = e.currentTarget.querySelector('[data-action-btn]') as HTMLElement;
                  if (btn) btn.style.opacity = '0';
                }}
              >
                {/* Selection Checkbox */}
                {selectMode && (
                  <div style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    width: "22px",
                    height: "22px",
                    borderRadius: "6px",
                    border: isSelected ? "none" : "2px solid #cbd5e1",
                    background: isSelected ? "#667eea" : "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                    transition: "all 0.15s ease"
                  }}>
                    {isSelected && (
                      <span style={{ color: "white", fontSize: "13px", fontWeight: "700", lineHeight: 1 }}>✓</span>
                    )}
                  </div>
                )}

                {/* Delete/Leave Button (hidden in select mode) */}
                {!selectMode && (
                <button
                  data-action-btn
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTab === 'my-rooms') {
                      setConfirmDelete(room.id);
                    } else {
                      setConfirmLeave(room.id);
                    }
                  }}
                  style={{
                    position: "absolute",
                    top: "12px",
                    right: "12px",
                    width: "30px",
                    height: "30px",
                    borderRadius: "8px",
                    border: "none",
                    background: activeTab === 'my-rooms' ? "#fef2f2" : "#f0fdf4",
                    color: activeTab === 'my-rooms' ? "#ef4444" : "#22c55e",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    opacity: 0,
                    transition: "opacity 0.15s ease",
                    zIndex: 10
                  }}
                  title={activeTab === 'my-rooms' ? 'Delete room' : 'Leave room'}
                >
                  {activeTab === 'my-rooms' ? '🗑' : '↩'}
                </button>
                )}

                {/* Room Preview */}
                <div style={{
                  marginBottom: "12px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
                }}>
                  <RoomPreview roomId={room.room_id} width={252} height={140} />
                </div>

                <h3 style={{
                  fontSize: "16px",
                  fontWeight: "600",
                  color: "#1a202c",
                  marginBottom: "8px",
                  lineHeight: "1.3",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}>
                  {room.name}
                </h3>

                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "12px",
                  color: "#94a3b8"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span>{relativeTime(room.updated_at)}</span>
                    <span style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px"
                    }}>
                      👥 {room.collaborator_count}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(extractRoomCode(room.room_id));
                    }}
                    style={{
                      padding: "4px 10px",
                      background: "#f1f5f9",
                      color: "#64748b",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: "500",
                      cursor: "pointer",
                      transition: "all 0.15s ease"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#e2e8f0";
                      e.currentTarget.style.color = "#475569";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#f1f5f9";
                      e.currentTarget.style.color = "#64748b";
                    }}
                  >
                    Share
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>

      {/* New Room Modal */}
      {showNewRoomModal && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
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
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#1a202c", marginBottom: "24px" }}>
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
                marginBottom: "24px",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#667eea"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
              onKeyDown={(e) => e.key === 'Enter' && createRoom()}
            />
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => { setShowNewRoomModal(false); setNewRoomName(""); }}
                style={{
                  flex: 1, padding: "12px",
                  background: "#f7fafc", color: "#4a5568",
                  border: "1px solid #cbd5e0", borderRadius: "8px",
                  fontSize: "16px", fontWeight: "600", cursor: "pointer",
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
                  flex: 1, padding: "12px",
                  background: creating || !newRoomName.trim() ? "#cbd5e0" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  color: "white", border: "none", borderRadius: "8px",
                  fontSize: "16px", fontWeight: "600",
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
          top: 0, left: 0, right: 0, bottom: 0,
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
            <h2 style={{ fontSize: "24px", fontWeight: "700", color: "#1a202c", marginBottom: "8px" }}>
              Join Existing Room
            </h2>
            <p style={{ fontSize: "14px", color: "#718096", marginBottom: "24px" }}>
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
                textTransform: "uppercase",
                boxSizing: "border-box"
              }}
              onFocus={(e) => e.currentTarget.style.borderColor = "#10b981"}
              onBlur={(e) => e.currentTarget.style.borderColor = "#e2e8f0"}
              onKeyDown={(e) => e.key === 'Enter' && joinRoomWithCode()}
            />
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => { setShowJoinModal(false); setJoinCode(""); }}
                style={{
                  flex: 1, padding: "12px",
                  background: "#f7fafc", color: "#4a5568",
                  border: "1px solid #cbd5e0", borderRadius: "8px",
                  fontSize: "16px", fontWeight: "600", cursor: "pointer",
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
                  flex: 1, padding: "12px",
                  background: joining || joinCode.length !== 6 ? "#cbd5e0" : "#10b981",
                  color: "white", border: "none", borderRadius: "8px",
                  fontSize: "16px", fontWeight: "600",
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

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
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
            maxWidth: "380px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1a202c", marginBottom: "12px" }}>
              Delete Room
            </h2>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "24px", lineHeight: "1.5" }}>
              This will permanently delete this room and all its contents for everyone. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, padding: "10px",
                  background: "#f7fafc", color: "#4a5568",
                  border: "1px solid #cbd5e0", borderRadius: "8px",
                  fontSize: "14px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRoom(confirmDelete)}
                style={{
                  flex: 1, padding: "10px",
                  background: "#ef4444", color: "white",
                  border: "none", borderRadius: "8px",
                  fontSize: "14px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirmation Modal */}
      {confirmLeave && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
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
            maxWidth: "380px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1a202c", marginBottom: "12px" }}>
              Leave Room
            </h2>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "24px", lineHeight: "1.5" }}>
              You will lose access to this room. You can rejoin later with a share code.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setConfirmLeave(null)}
                style={{
                  flex: 1, padding: "10px",
                  background: "#f7fafc", color: "#4a5568",
                  border: "1px solid #cbd5e0", borderRadius: "8px",
                  fontSize: "14px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleLeaveRoom(confirmLeave)}
                style={{
                  flex: 1, padding: "10px",
                  background: "#f59e0b", color: "white",
                  border: "none", borderRadius: "8px",
                  fontSize: "14px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Confirmation Modal */}
      {confirmBulkAction && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
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
            maxWidth: "380px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)"
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#1a202c", marginBottom: "12px" }}>
              {activeTab === 'my-rooms' ? `Delete ${selectedRooms.size} Room${selectedRooms.size > 1 ? 's' : ''}` : `Leave ${selectedRooms.size} Room${selectedRooms.size > 1 ? 's' : ''}`}
            </h2>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "24px", lineHeight: "1.5" }}>
              {activeTab === 'my-rooms'
                ? `This will permanently delete ${selectedRooms.size} room${selectedRooms.size > 1 ? 's' : ''} and all their contents for everyone. This cannot be undone.`
                : `You will lose access to ${selectedRooms.size} room${selectedRooms.size > 1 ? 's' : ''}. You can rejoin later with share codes.`}
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => setConfirmBulkAction(false)}
                disabled={bulkDeleting}
                style={{
                  flex: 1, padding: "10px",
                  background: "#f7fafc", color: "#4a5568",
                  border: "1px solid #cbd5e0", borderRadius: "8px",
                  fontSize: "14px", fontWeight: "600", cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkAction}
                disabled={bulkDeleting}
                style={{
                  flex: 1, padding: "10px",
                  background: activeTab === 'my-rooms' ? "#ef4444" : "#f59e0b",
                  color: "white",
                  border: "none", borderRadius: "8px",
                  fontSize: "14px", fontWeight: "600",
                  cursor: bulkDeleting ? "not-allowed" : "pointer",
                  opacity: bulkDeleting ? 0.7 : 1
                }}
              >
                {bulkDeleting ? 'Processing...' : activeTab === 'my-rooms' ? 'Delete All' : 'Leave All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
