import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { BoardObject, Cursor } from "@collabboard/shared";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "";

export function useSocket(userId: string, displayName: string) {
  const [connected, setConnected] = useState(false);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [presence, setPresence] = useState<{ userId: string; name: string }[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { userId: userId || `anon-${Math.random().toString(36).slice(2, 9)}`, name: displayName || "Anonymous" },
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("board:state", (state: { objects: BoardObject[] }) => setObjects(state.objects || []));
    socket.on("object:updated", (obj: BoardObject) => {
      setObjects((prev) => {
        const idx = prev.findIndex((o) => o.id === obj.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...obj };
        return next;
      });
    });
    socket.on("cursors:state", (list: Cursor[]) => {
      const map: Record<string, Cursor> = {};
      list.forEach((c) => (map[c.id] = c));
      setCursors(map);
    });
    socket.on("presence:state", (list: { userId: string; name: string }[]) => setPresence(list || []));
    socket.on("cursor:moved", (data: { socketId: string; userId: string; name: string; x: number; y: number }) => {
      setCursors((prev) => ({
        ...prev,
        [data.socketId]: { id: data.socketId, userId: data.userId, name: data.name, x: data.x, y: data.y },
      }));
    });
    socket.on("cursor:left", (socketId: string) => {
      setCursors((prev) => {
        const next = { ...prev };
        delete next[socketId];
        return next;
      });
    });
    socket.on("presence:joined", (data: { userId: string; name: string }) => {
      setPresence((prev) => (prev.some((p) => p.userId === data.userId) ? prev : [...prev, { userId: data.userId, name: data.name }]));
    });

    return () => {
      socket.off("connect").off("disconnect").off("board:state").off("object:updated").off("cursors:state").off("presence:state");
      socket.off("cursor:moved").off("cursor:left").off("presence:joined");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, displayName]);

  const emitCursor = (x: number, y: number) => socketRef.current?.emit("cursor:move", { x, y });
  const createObject = (obj: BoardObject) => {
    setObjects((prev) => [...prev, obj]);
    socketRef.current?.emit("object:create", obj);
  };
  const updateObject = (obj: BoardObject) => {
    setObjects((prev) => prev.map((o) => (o.id === obj.id ? { ...o, ...obj } : o)));
    socketRef.current?.emit("object:update", obj);
  };
  const deleteObject = (id: string) => socketRef.current?.emit("object:delete", id);

  return {
    connected,
    objects,
    cursors,
    presence,
    emitCursor,
    createObject,
    updateObject,
    deleteObject,
  };
}
