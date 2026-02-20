import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import fs from "fs";
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
import rateLimit from "express-rate-limit";
import { AIService } from "./ai-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const snapshotsDir = path.join(__dirname, "data", "snapshots");

// Ensure snapshots directory exists
if (!fs.existsSync(snapshotsDir)) {
  fs.mkdirSync(snapshotsDir, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

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

// Snapshot upload endpoint
app.post("/api/room/:roomId/snapshot", (req, res) => {
  try {
    const { roomId } = req.params;
    const { image } = req.body;
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Missing image data" });
    }
    // Strip data URL prefix
    const base64Data = image.replace(/^data:image\/png;base64,/, "");
    const filePath = path.join(snapshotsDir, `${roomId}.png`);
    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    res.json({ ok: true });
  } catch (error) {
    console.error("Snapshot upload error:", error);
    res.status(500).json({ error: "Failed to save snapshot" });
  }
});

// Snapshot serve endpoint
app.get("/api/room/:roomId/snapshot.png", (req, res) => {
  const filePath = path.join(snapshotsDir, `${req.params.roomId}.png`);
  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "image/png");
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "No snapshot found" });
  }
});

// OG share route — serves meta tags then redirects to the read-only viewer
app.get("/share/:roomId", (req, res) => {
  const { roomId } = req.params;
  const snapshotUrl = `/api/room/${roomId}/snapshot.png`;
  const viewUrl = `/view/${roomId}`;

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CollabBoard - Check out this whiteboard!</title>
  <meta property="og:title" content="CollabBoard - Check out this whiteboard!" />
  <meta property="og:description" content="View this collaborative whiteboard on CollabBoard" />
  <meta property="og:image" content="${snapshotUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="CollabBoard - Check out this whiteboard!" />
  <meta name="twitter:description" content="View this collaborative whiteboard on CollabBoard" />
  <meta name="twitter:image" content="${snapshotUrl}" />
  <meta http-equiv="refresh" content="0;url=${viewUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${viewUrl}">CollabBoard viewer</a>...</p>
</body>
</html>`);
});

// Rate limiter for AI commands: 10 requests per minute per IP
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many AI requests. Please wait a minute before trying again.",
    error: "Rate limit exceeded",
  },
});

// API endpoint for AI commands
app.post("/api/ai/command", aiRateLimiter, async (req, res) => {
  try {
    const { command, roomId = "default", history = [], objects = [] } = req.body;
    console.log("AI command received via API:", command, "for room:", roomId);

    // Use objects from the client (Supabase is the source of truth)
    // Fall back to server in-memory store if client didn't send objects
    const boardObjects = objects.length > 0 ? objects : getBoardState(roomId).objects;
    const response = await aiService.processCommand(
      command,
      boardObjects,
      "api-user",
      history
    );
    console.log("AI response:", response);

    // Return response with actions — the client handles object creation
    // via Supabase, which broadcasts to all users through realtime subscriptions
    res.json(response);
  } catch (error) {
    console.error("AI command error:", error);
    res.status(500).json({
      message: "Sorry, I encountered an error processing your request.",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Serve static files from React build in production
// IMPORTANT: This catch-all must come AFTER all API and share routes
if (process.env.NODE_ENV === "production") {
  const clientBuildPath = path.join(__dirname, "../../web/dist");
  app.use(express.static(clientBuildPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// Initialize AI Service
const aiService = new AIService();

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
    io.in(roomId).emit("object:created", parsed.data);
  });

  socket.on("object:update", (data: unknown) => {
    const parsed = boardObjectSchema.safeParse(data);
    if (!parsed.success) return;
    updateObject(roomId, parsed.data);
    io.in(roomId).emit("object:updated", parsed.data);
  });

  socket.on("object:delete", (objectId: string) => {
    removeObject(roomId, objectId);
    io.in(roomId).emit("object:deleted", objectId);
  });

  socket.on("ai:command", async (data: { command: string; viewport?: { x: number; y: number } }) => {
    console.log("AI command received:", data.command, "viewport:", data.viewport);
    const viewCenter = data.viewport || { x: 400, y: 300 };
    try {
      const boardState = getBoardState(roomId);
      const response = await aiService.processCommand(
        data.command,
        boardState.objects,
        userId
      );
      console.log("AI response:", response);

      // Process any AI actions (create sticky notes, organize, etc.)
      if (response.actions) {
        const spread = () => (Math.random() - 0.5) * 300;
        const defaultX = (args: any) => args.x ?? (viewCenter.x + spread());
        const defaultY = (args: any) => args.y ?? (viewCenter.y + spread());

        for (const action of response.actions) {
          if (action.tool === 'create_sticky_note') {
            const stickyNote = {
              id: `sticky-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'sticky' as const,
              x: defaultX(action.arguments),
              y: defaultY(action.arguments),
              width: 200,
              height: 200,
              rotation: 0,
              text: action.arguments.text || '',
              color: action.arguments.color || '#ffeb3b',
              zIndex: action.arguments.zIndex ?? 0,
            };
            addObject(roomId, stickyNote);
          } else if (action.tool === 'create_rectangle') {
            const rect = {
              id: `rect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'rectangle' as const,
              x: defaultX(action.arguments),
              y: defaultY(action.arguments),
              width: action.arguments.width || 120,
              height: action.arguments.height || 80,
              color: action.arguments.color || '#2196f3',
              rotation: 0,
              zIndex: action.arguments.zIndex ?? 0,
            };
            addObject(roomId, rect);
          } else if (action.tool === 'create_circle') {
            const size = action.arguments.size || 80;
            const circle = {
              id: `circle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'circle' as const,
              x: defaultX(action.arguments),
              y: defaultY(action.arguments),
              width: size,
              height: size,
              color: action.arguments.color || '#4caf50',
              rotation: 0,
              zIndex: action.arguments.zIndex ?? 0,
            };
            addObject(roomId, circle);
          } else if (action.tool === 'create_line') {
            const line = {
              id: `line-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              type: 'line' as const,
              x: defaultX(action.arguments),
              y: defaultY(action.arguments),
              width: action.arguments.width || 200,
              height: action.arguments.height || 0,
              color: action.arguments.color || '#333333',
              rotation: 0,
              zIndex: action.arguments.zIndex ?? 0,
            };
            addObject(roomId, line);
          }
          // organize_board, move_object, delete_object, clear_board, and analyze_board
          // are handled client-side where the viewport context and Supabase sync live.
        }

        // Emit updated board state after processing actions
        const updatedState = getBoardState(roomId);
        io.in(roomId).emit("board:state", { objects: updatedState.objects });
      }

      // Send response back to the requesting client
      socket.emit("ai:response", response);
    } catch (error) {
      console.error("AI command error:", error);
      socket.emit("ai:response", {
        message: "Sorry, I encountered an error processing your request.",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
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
