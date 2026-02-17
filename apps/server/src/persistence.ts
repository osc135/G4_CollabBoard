import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { BoardState } from "@collabboard/shared";
import { boardStateSchema, emptyState } from "@collabboard/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "data");
const STATE_FILE = join(DATA_DIR, "board-state.json");

export async function loadBoardState(_boardId: string): Promise<BoardState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const result = boardStateSchema.safeParse(parsed);
    if (result.success && parsed.objects) {
      return { objects: result.data.objects };
    }
  } catch {
    // File doesn't exist or invalid - use empty state
  }
  return { ...emptyState };
}

export async function saveBoardState(_boardId: string, state: BoardState): Promise<void> {
  try {
    await mkdir(dirname(STATE_FILE), { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save board state:", err);
  }
}
