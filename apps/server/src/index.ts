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
import rateLimit from "express-rate-limit";
import { AIService } from "./ai-service.js";

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
    const { command, roomId = "default", history = [] } = req.body;
    console.log("AI command received via API:", command, "for room:", roomId);

    const boardState = getBoardState(roomId);
    const response = await aiService.processCommand(
      command,
      boardState.objects,
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
              layer: boardState.objects.length
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
              rotation: 0
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
              rotation: 0
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
              rotation: 0
            };
            addObject(roomId, line);
          } else if (action.tool === 'organize_board') {
            // Implement organization logic based on strategy
            const strategy = action.arguments.strategy;
            let organized = [...boardState.objects];

            if (strategy === 'grid') {
              // Arrange in a grid
              const cols = Math.ceil(Math.sqrt(organized.length));
              organized.forEach((obj, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                updateObject(roomId, {
                  ...obj,
                  x: 100 + col * 250,
                  y: 100 + row * 250
                });
              });
            } else if (strategy === 'color') {
              // Group by color
              const byColor = organized.reduce((acc, obj) => {
                if ('color' in obj && obj.color) {
                  const color = obj.color as string;
                  if (!acc[color]) acc[color] = [];
                  acc[color].push(obj);
                }
                return acc;
              }, {} as Record<string, typeof organized>);

              let xOffset = 100;
              Object.values(byColor).forEach(group => {
                group.forEach((obj, i) => {
                  updateObject(roomId, {
                    ...obj,
                    x: xOffset + (i % 3) * 220,
                    y: 100 + Math.floor(i / 3) * 220
                  });
                });
                xOffset += 700;
              });
            }
          }
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
