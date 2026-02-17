import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  getBoardState,
  addObject,
  updateObject,
  removeObject,
  loadBoardState,
  setPersist,
} from "./board-store.js";
import { loadBoardState as loadFromDisk, saveBoardState as saveToDisk } from "./persistence.js";
import { getCursorsForBoard, setCursor, removeCursor, setPresence, removePresence, getPresenceForBoard } from "./presence.js";
import { boardObjectSchema } from "@collabboard/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.join(__dirname, "../../web/dist");
  app.use(express.static(clientBuildPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// API endpoint for room previews
app.get("/api/room/:roomId/preview", async (req, res) => {
  try {
    const roomId = req.params.roomId;
    // Try to load from disk if not in memory
    let state = getBoardState(roomId);
    if (!state || state.objects.length === 0) {
      const diskState = await loadFromDisk(roomId);
      if (diskState && diskState.objects) {
        loadBoardState(roomId, diskState);
        state = diskState;
      }
    }
    res.json({ objects: state.objects.slice(0, 50) }); // Limit to 50 objects for preview
  } catch (error) {
    console.error("Preview error:", error);
    res.json({ objects: [] }); // Return empty instead of error
  }
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  const userId = (socket.handshake.auth?.userId as string) || `user-${socket.id.slice(0, 6)}`;
  const name = (socket.handshake.auth?.name as string) || `User ${socket.id.slice(0, 6)}`;
  const roomId = (socket.handshake.auth?.roomId as string) || "default";

  setPresence(roomId, socket.id, userId, name);
  socket.to(roomId).emit("presence:joined", { userId, name, socketId: socket.id });
  socket.emit("board:state", { objects: getBoardState(roomId).objects });
  socket.emit("cursors:state", getCursorsForBoard(roomId));
  socket.emit("presence:state", getPresenceForBoard(roomId));
  socket.join(roomId);

  socket.on("cursor:move", (data: { x: number; y: number }) => {
    setCursor(roomId, socket.id, { id: socket.id, userId, name, x: data.x, y: data.y });
    socket.to(roomId).emit("cursor:moved", { socketId: socket.id, userId, name, x: data.x, y: data.y });
  });

  socket.on("object:create", (data: unknown) => {
    const parsed = boardObjectSchema.safeParse(data);
    if (!parsed.success) return;
    addObject(roomId, parsed.data);
    const state = getBoardState(roomId);
    io.in(roomId).emit("board:state", { objects: state.objects });
  });

  socket.on("object:update", (data: unknown) => {
    const parsed = boardObjectSchema.safeParse(data);
    if (!parsed.success) return;
    updateObject(roomId, parsed.data);
    const state = getBoardState(roomId);
    io.in(roomId).emit("board:state", { objects: state.objects });
  });

  socket.on("object:delete", (objectId: string) => {
    removeObject(roomId, objectId);
    const state = getBoardState(roomId);
    io.in(roomId).emit("board:state", { objects: state.objects });
  });

  socket.on("disconnect", () => {
    removeCursor(roomId, socket.id);
    removePresence(roomId, socket.id);
    io.to(roomId).emit("cursor:left", socket.id);
    io.to(roomId).emit("presence:state", getPresenceForBoard(roomId));
  });
});

const PORT = process.env.PORT || 3001;

async function start() {
  // Load default room for backward compatibility
  const defaultState = await loadFromDisk("default");
  loadBoardState("default", defaultState);
  
  let savePromise = Promise.resolve();
  setPersist((boardId, s) => {
    savePromise = savePromise.then(() => saveToDisk(boardId, s)).catch((err) => console.error("Save failed:", err));
  });
  
  httpServer.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));
}
start();
