Here is your final, complete Pre-Search Architecture Decision Document. This version includes all the refinements we discussed—including the Zod validation, Anthropic integration, and your specific testing strategy.

Pre-Search Architecture Decision Document: CollabBoard
Project: Real-time Collaborative Whiteboard with AI Agent
Developer: Solo (AI-First Workflow)
Date: February 2026

Phase 1: Define Your Constraints
1. Scale & Load Profile
Launch: 5–20 total users. Must support 5+ concurrent users in a single room (Project Requirement).
6 Months: Target 10,000 total users. Aspirational stress-case ceiling of 100,000.
Concurrency Estimate: At 10,000 total users, peak concurrency is estimated at 1–2% (100–200 concurrent users).
Traffic Pattern: Spiky/Bursty. Usage will center around collaboration sessions where teams join simultaneously.
Real-time Requirements: High. Cursor latency <50ms; Object sync latency <100ms. Smooth 60 FPS pan/zoom and drag.
Cold Start Tolerance: Low. Collaboration must feel instantaneous; serverless cold starts are unacceptable for cursor sync.
2. Budget & Cost Ceiling
Initial Strategy: Pay-per-use model leveraging free tiers (Supabase + Render).
Target Spend: <$100/month until 1,000 users; <$1,000/month at 10,000 users (Infrastructure + AI API).
Scaling Strategy: Transition to fixed/reserved container instances once user count exceeds 1,000 to stabilize costs.
Trade-off: Trading money for time by using managed Auth and Postgres services to focus effort on real-time sync and AI logic.
3. Time to Ship
MVP Timeline: 24-hour hard gate for collaborative infrastructure.
Priority: Speed-to-market over long-term maintainability for Week 1.
Iteration Cadence: Daily iterations post-MVP with incremental feature additions (AI commands, performance optimization).
4. Compliance & Regulatory Needs
Data Type: No health (HIPAA), financial, or regulated enterprise data.
GDPR: Minimal PII (email only). Users provided “Delete My Data” functionality for Right-to-Be-Forgotten compliance.
Data Residency: US-based hosting (Render + Supabase). Cross-border transfer relies on managed provider mechanisms.
SOC 2: Not required for MVP. Future roadmap includes audit logging and formal access controls for enterprise clients.
5. Team & Skill Constraints
Profile: Solo developer with Java/C#/SQL background.
Strategy: Using TypeScript to leverage strict typing (familiar to C#/Java) while accessing the strongest real-time web ecosystem.
Preference: Shipping speed prioritized over learning entirely new paradigms.

Phase 2: Architecture Discovery
6. Hosting & Deployment
Decision: Managed container platform (Render).
Justification: Avoids serverless cold starts; supports persistent WebSocket connections; predictable runtime behavior.
Scaling: Horizontal scaling via additional containers; Redis pub/sub required if scaling beyond a single instance.
CI/CD: GitHub Push-to-Deploy automated pipeline.
7. Authentication & Authorization
Decision: Supabase Auth.
Approach: Email/Password + Google OAuth.
Authorization: Row-Level Security (RLS) in Postgres to restrict access by board_id.
Multi-Tenancy: Each board is an isolated namespace. RLS ensures users only access boards they own or are invited to.
8. Database & Data Layer
Type: Relational (PostgreSQL via Supabase).
State Storage: Boards table stores JSON snapshots; Operations table logs append-only mutations (move, create, delete).
Caching: Redis for ephemeral presence and cursor streaming to avoid SQL write bottlenecks.
Read/Write Ratio: High-write during active sessions; low-write persistence after session completion.
9. Backend/API Architecture
Structure: Node.js Monolith (TypeScript).
Communication: WebSockets (Socket.io) for real-time sync; REST endpoints for Auth handshake and AI triggers.
Conflict Resolution: Last-Write-Wins (LWW) for simplicity and scalability.
Background Jobs: AI commands executed synchronously for MVP; BullMQ considered if latency becomes blocking.
10. Frontend Framework & Rendering
Decision: React SPA + Konva.js.
Justification: Canvas-based rendering is more performant than DOM-based shapes. Konva stages/layers align with OOP mental models.
SEO/Offline: Not required for MVP.
11. Third-Party Integrations
AI API: Anthropic Claude 3.5 Sonnet.
Rate Limits: 10 AI commands per hour per user to cap cost exposure.
Vendor Lock-in: Accepted for Supabase and Render to maximize shipping speed.

Phase 3: Post-Stack Refinement
12. Security Vulnerabilities
Risks: Socket hijacking, malicious client mutations, unauthorized board access.
Mitigation: JWT verification on every WebSocket connection; server-side validation of every mutation; RLS enforcement.
13. File Structure & Project Organization
Structure: Monorepo.
/apps/web – React + Konva frontend.
/apps/server – Node + Socket.io backend.
/packages/shared – Zod-backed Shared Schema for Object types.
Validation: Use Zod for runtime validation of AI-generated JSON on the server to prevent malformed data from crashing the board.
14. Naming Conventions & Code Style
Patterns: camelCase for logic; PascalCase for React components.
Tooling: ESLint + Prettier; Strict TypeScript mode enabled.
15. Testing Strategy
Unit Testing: Vitest for TDD on the AI command parser and state mutation logic.
Coverage Target: 70%+ on core parser/mutation modules.
E2E: Playwright for full flow (User → AI prompt → Board mutation).
Manual: Two-browser throttled network testing (3G mode) for latency validation.
16. Recommended Tooling & DX
Editor: Cursor (AI-first workflow).
CLI Tools: Supabase CLI, Docker Compose.
Debugging: Chrome DevTools (Canvas profiling), Socket.io Admin UI.


