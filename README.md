# CollabBoard

Real-time collaborative whiteboard application built for group collaboration. Create boards, invite teammates via room codes, and work together with sticky notes, shapes, drawings, connectors, frames, and an AI assistant.

**Deployed:** [https://collabboard-n2fd.onrender.com]

## Architecture Overview

```
G4_CollabBoard/
├── packages/shared/       # Shared types & Zod schemas (BoardObject, Room, etc.)
├── apps/web/              # React + Konva frontend (Vite)
│   └── src/
│       ├── Board.tsx          # Main canvas — all object rendering, selection, drawing
│       ├── BoardRoom.tsx      # Room wrapper — connects Board to real-time sync
│       ├── useSupabaseBoard.ts # Real-time hook — Supabase presence & broadcast
│       └── components/
│           ├── AIChat.tsx     # AI assistant panel — processes tool calls into objects
│           └── elkLayout.ts   # ELK-based auto-layout for flowcharts/diagrams
├── apps/server/           # Express API server
│   └── src/
│       ├── index.ts           # REST endpoints + NDJSON streaming for AI
│       └── ai-service.ts     # Dual-model AI (GPT-4o simple, Claude Sonnet creative)
└── render.yaml            # Render deployment config
```

**Tech stack:**
- **Frontend:** React, Konva (HTML5 canvas), TypeScript, Vite
- **Backend:** Express, Node.js, TypeScript
- **Database & Auth:** Supabase (PostgreSQL, Auth, Realtime broadcast)
- **AI:** Anthropic Claude Sonnet 4.6 (creative tasks), OpenAI GPT-4o (simple tasks)
- **Deployment:** Render
- **Observability:** Langfuse (AI tracing)

**Real-time sync:** All collaboration (cursors, selections, drawing, object transforms, chat) uses Supabase Realtime broadcast channels — no Socket.io needed. Objects are persisted to Supabase PostgreSQL.

## Setup

### 1. Supabase (auth)

1. Create a project at [supabase.com](https://supabase.com).
2. In **Authentication → Providers**, enable **Email** and **Google** (add Google OAuth client id/secret if using Google).
3. In **Project Settings → API**, copy **Project URL** and **anon public** key.
4. In `apps/web`, copy `.env.example` to `.env` and set:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key

### 2. Install and run

```bash
npm install
npm run build -w @collabboard/shared
```

**Terminal 1 – server**
```bash
npm run dev -w collabboard-server
```

**Terminal 2 – web**
```bash
npm run dev -w collabboard-web
```

Open http://localhost:5173. Sign in with Google or create an account with email/password, then use the board.

## Scripts

- `npm run dev -w collabboard-server` – Socket.io server (port 3001)
- `npm run dev -w collabboard-web` – Vite + React (port 5173)
- `npm run test -w @collabboard/shared` – shared tests
- `npm run test -w collabboard-server` – server tests
- `npm run test -w collabboard-web` – web tests
