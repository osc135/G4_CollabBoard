# AI Development Log

## Tools & Workflow

For my AI coding tools, I used Claude Code, Gemini, ChatGPT, and Cursor. They each played their own role to help me fully understand the requirements of this project. I used both Gemini and ChatGPT at the start with the Pre-Search assignment to get a good baseline for what I needed to do, and the best approach that I could take for it. From there, when I started my MVP, I was using Cursor to help with the code, then I decided to switch to Claude because I got stuck with Cursor. Through the MVP and the final submission, I have been using a mix of just Claude Code and Cursor, making the other one check what I was told if I wasn't sure something would work.

## MCP Usage

N/A

## Effective Prompts

Through this assignment, I have learned how to make a better prompt for a result that I want, rather than what I was doing before this. Before we get into the actual prompts, I want to explain how I got to the prompt. When I was just started on making the AI agent, I was having a bit of a struggle to understand why it only had access to sticky notes, and every time I was asking Claude Code about it, it would just change my code making me more confused. I then fed it this prompt:

> "We are gonna work through some of the problems with the AI board agent. I want to first focus on the agent having access to all the different objects, because it just has access to sticky right now. Before you make any changes, walk me through what you are doing, and how it will impact the agents ability to access and place circles, lines, and rectangles as the user desires"

This was the start of me bettering my prompts because I did struggle quite a bit with the AI agent. This prompt made it so before Claude can change my code, it would go into plan mode, and actually correct itself before giving me something it would later state is bad.

> "I gave my AI Board agent the following prompt: 'Make a snowman with 10 circles in the middle of the page' and my whiteboard had 10 (different size which was good) green circles kind of all over the page. How come this was the output?"

This allowed me to realize that I shouldn't be using OpenAI GPT-4o-mini for some of the prompts, because it just wasn't good enough at understanding what I wanted. This allowed me (through trial and error) to come to the conclusion that I have now. My agent uses GPT-4o for the non-creative prompts, and Anthropic Sonnet 4.6 for the creative prompts.

> "here is a prompt that I am putting into the AI agent: build a password reset flow for an email account and show it as a flowchart. It takes about 2 minutes for me to get a full result, I get part after maybe 30 seconds, and then have to wait a long time (more minutes than I should) to get the full completed output. I want to get the whole response time to be as close to 2 seconds as we can possibly get. How can we make this happen, what steps would you take? Don't change the code, let's chat about it first."

Although this is similar to the first prompt that I mentioned, this allowed me to understand in a much better picture why my agent was taking around 2 minutes to give me what I asked for. Through this prompt, I learned that I needed to change the way I structure the agent from the start.

> "Implement the following plan: [detailed 4-change plan with exact file paths, line numbers, and code specifications]"

By the end of the project, I learned that giving Claude Code a fully structured plan with specific files, line numbers, and expected behavior up front led to much faster and more accurate implementation compared to vague requests.

## Code Analysis

To be totally honest, 100% of the code was AI-generated, because my AI's and I would chat before it was allowed to make any changes. I would describe the problem, we would discuss the approach, and then it would write the code. My role was directing what to build, reviewing the output, testing it, and catching issues like the stale closure bug where other users saw the wrong drawing color.

## Strengths & Limitations

**Where AI excelled:**
- Getting the foundational architecture down quickly (monorepo setup, Supabase integration, real-time sync)
- Preventative thinking — when asked about potential issues, it was good at identifying problems before they happened
- Complex multi-file changes when given a clear plan (e.g., adding shift-click multi-select across 8 component handlers in one pass)
- Template-based features like SWOT, kanban, and flowchart layout engines

**Where AI struggled:**
- Spatial/visual reasoning — mapping placement for AI agent outputs was consistently off (objects landing in the wrong spot on the board), and it took a long time to fix
- Small UI bugs — the selection tool being off-center from selected objects, and getting all users to see the same thing, took multiple rounds
- Stale React closures — the drawing color sync bug (useCallback with empty deps) is the kind of subtle issue AI introduced and couldn't catch on its own
- Over-engineering — sometimes it would add unnecessary complexity or refactor code I didn't ask it to touch

## Key Learnings

In terms of working with agents, it is something that I really do enjoy, as it allows me to get the projects done at a lot faster speed than I can do on my own. I learned that the prompts are very important, and you need to be as specific as you can with what you want. Telling the AI "don't change the code, let's chat about it first" was a game-changer — it forced the agent to plan before acting, which led to much better results. I also learned that having one AI check another's work (using Cursor to verify Claude's suggestions and vice versa) caught issues that a single tool would miss.

---

# AI Cost Analysis

## Development & Testing Costs

| Item | Details |
|------|---------|
| **LLM API Costs** | $1200 (covered by Max subscription — actual cost $0). Listed as $800, but didn't start tracking till the 19th, so added some buffer for the first few days. |
| **Total Tokens Consumed** | ~500K output tokens, ~6M input tokens (estimated across all tools). 329K output tokens tracked from Claude Code (Feb 19–22) with 98% cache read share. Earlier sessions with Cursor and ChatGPT not tracked. |
| **Input/Output Breakdown** | Input heavy — Board.tsx (~3,300 lines) and ai-service.ts (~1,500 lines) sent as context on nearly every call. Cache read rate of 98% kept effective input costs low. |
| **Number of API Calls** | ~40+ sessions total — 28 tracked Claude Code sessions (25h 11m, avg 54 min each) plus ~12 earlier Cursor/ChatGPT sessions. |
| **Embeddings** | $0 — no embeddings used |
| **Hosting** | $0 — Render free tier for server, Supabase free tier for DB and realtime |

## Production Cost Projections

**Assumptions:**
- Average AI commands per user per session: 5
- Average sessions per user per month: 8
- Simple commands (GPT-4o): 70% of requests — ~2K input tokens, ~500 output tokens
- Creative commands (Claude Sonnet 4.6): 30% of requests — ~3K input tokens, ~3K output tokens
- GPT-4o pricing: $2.50/M input, $10.00/M output
- Claude Sonnet 4.6 pricing: $3.00/M input, $15.00/M output

**Per-command cost:**
- Simple (GPT-4o): (2K x $2.50 + 500 x $10.00) / 1M = $0.01/command
- Creative (Claude Sonnet 4.6): (3K x $3.00 + 3K x $15.00) / 1M = $0.054/command
- Blended average: (0.70 x $0.01) + (0.30 x $0.054) = **$0.023/command**

**Per-user per month:** 5 commands x 8 sessions x $0.023 = **$0.92/user/month**

| 100 Users | 1,000 Users | 10,000 Users | 100,000 Users |
|-----------|-------------|--------------|---------------|
| $92/month | $920/month | $9,200/month | $92,000/month |

**Cost optimization strategies already in place:**
- Dual-model routing sends 70% of requests to the cheaper GPT-4o model
- Input filtering rejects off-topic messages before they reach the LLM
- Throttled real-time events (cursors at 30fps, drawing at 20fps) reduce unnecessary processing
- Supabase free tier handles all real-time sync without additional cost
