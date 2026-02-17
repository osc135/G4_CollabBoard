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

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

const DEFAULT_BOARD = "default";

io.on("connection", (socket) => {
  const userId = (socket.handshake.auth?.userId as string) || `user-${socket.id.slice(0, 6)}`;
  const name = (socket.handshake.auth?.name as string) || `User ${socket.id.slice(0, 6)}`;

  setPresence(DEFAULT_BOARD, socket.id, userId, name);
  socket.to(DEFAULT_BOARD).emit("presence:joined", { userId, name, socketId: socket.id });
  socket.emit("board:state", { objects: getBoardState(DEFAULT_BOARD).objects });
  socket.emit("cursors:state", getCursorsForBoard(DEFAULT_BOARD));
  socket.emit("presence:state", getPresenceForBoard(DEFAULT_BOARD));
  socket.join(DEFAULT_BOARD);

  socket.on("cursor:move", (data: { x: number; y: number }) => {
    setCursor(DEFAULT_BOARD, socket.id, { id: socket.id, userId, name, x: data.x, y: data.y });
    socket.to(DEFAULT_BOARD).emit("cursor:moved", { socketId: socket.id, userId, name, x: data.x, y: data.y });
  });

  socket.on("object:create", (data: unknown) => {
    const parsed = boardObjectSchema.safeParse(data);
    if (!parsed.success) return;
    addObject(DEFAULT_BOARD, parsed.data);
    const state = getBoardState(DEFAULT_BOARD);
    io.in(DEFAULT_BOARD).emit("board:state", { objects: state.objects });
  });

  socket.on("object:update", (data: unknown) => {
    const parsed = boardObjectSchema.safeParse(data);
    if (!parsed.success) return;
    updateObject(DEFAULT_BOARD, parsed.data);
    const state = getBoardState(DEFAULT_BOARD);
    io.in(DEFAULT_BOARD).emit("board:state", { objects: state.objects });
  });

  socket.on("object:delete", (objectId: string) => {
    removeObject(DEFAULT_BOARD, objectId);
    const state = getBoardState(DEFAULT_BOARD);
    io.in(DEFAULT_BOARD).emit("board:state", { objects: state.objects });
  });

  socket.on("disconnect", () => {
    removeCursor(DEFAULT_BOARD, socket.id);
    removePresence(DEFAULT_BOARD, socket.id);
    io.to(DEFAULT_BOARD).emit("cursor:left", socket.id);
    io.to(DEFAULT_BOARD).emit("presence:state", getPresenceForBoard(DEFAULT_BOARD));
  });
});

const PORT = process.env.PORT || 3001;

async function start() {
  const state = await loadFromDisk(DEFAULT_BOARD);
  loadBoardState(DEFAULT_BOARD, state);
  let savePromise = Promise.resolve();
  setPersist((boardId, s) => {
    savePromise = savePromise.then(() => saveToDisk(boardId, s)).catch((err) => console.error("Save failed:", err));
  });
  httpServer.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));
}
start();
