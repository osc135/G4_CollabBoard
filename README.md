# CollabBoard

Real-time collaborative whiteboard (G4). Monorepo: shared (Zod + state), server (Socket.io), web (React + Konva). Auth via Supabase.

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
