import { describe, it, expect, beforeEach } from "vitest";
import {
  getBoardState,
  addObject,
  updateObject,
  removeObject,
  clearBoardForTesting,
} from "./board-store";

const BOARD_A = "board-a";
const BOARD_B = "board-b";

const validSticky = {
  id: "sticky-1",
  type: "sticky" as const,
  x: 10,
  y: 20,
  width: 150,
  height: 100,
  text: "Note",
  color: "#fef08a",
};

const validRectangle = {
  id: "rect-1",
  type: "rectangle" as const,
  x: 0,
  y: 0,
  width: 120,
  height: 80,
  color: "#93c5fd",
};

describe("board-store", () => {
  beforeEach(() => {
    clearBoardForTesting(BOARD_A);
    clearBoardForTesting(BOARD_B);
  });

  describe("getBoardState", () => {
    it("returns empty state for unknown boardId", () => {
      const state = getBoardState("new-board");
      expect(state.objects).toEqual([]);
    });

    it("returns same reference after getOrEmpty creates board", () => {
      const one = getBoardState(BOARD_A);
      const two = getBoardState(BOARD_A);
      expect(one).toEqual(two);
      expect(one.objects).toEqual([]);
    });
  });

  describe("addObject", () => {
    it("adds object and returns new state", () => {
      const state = addObject(BOARD_A, validSticky);
      expect(state.objects).toHaveLength(1);
      expect(state.objects[0]).toEqual(validSticky);
    });

    it("subsequent getBoardState returns updated state", () => {
      addObject(BOARD_A, validSticky);
      const state = getBoardState(BOARD_A);
      expect(state.objects).toHaveLength(1);
    });

    it("throws on invalid payload", () => {
      expect(() => addObject(BOARD_A, { id: "x" })).toThrow(/Invalid payload/);
      expect(() => addObject(BOARD_A, null)).toThrow(/Invalid payload/);
      expect(() => addObject(BOARD_A, { ...validSticky, id: "" })).toThrow(/Invalid payload/);
    });

    it("LWW: create with same id replaces existing", () => {
      addObject(BOARD_A, validSticky);
      const updated = { ...validSticky, text: "Updated" };
      const state = addObject(BOARD_A, updated);
      expect(state.objects).toHaveLength(1);
      expect((state.objects[0] as { text?: string }).text).toBe("Updated");
    });
  });

  describe("updateObject", () => {
    it("updates existing object and returns new state", () => {
      addObject(BOARD_A, validSticky);
      const updated = { ...validSticky, text: "New text" };
      const state = updateObject(BOARD_A, updated);
      expect((state.objects[0] as { text?: string }).text).toBe("New text");
    });

    it("no-op when objectId does not exist", () => {
      addObject(BOARD_A, validSticky);
      const before = getBoardState(BOARD_A);
      const ghost = { ...validRectangle, id: "ghost" };
      const after = updateObject(BOARD_A, ghost);
      expect(after).toBe(before);
      expect(after.objects).toHaveLength(1);
    });

    it("throws on invalid payload", () => {
      expect(() => updateObject(BOARD_A, { id: "x" })).toThrow(/Invalid payload/);
    });
  });

  describe("removeObject", () => {
    it("removes object and returns new state", () => {
      addObject(BOARD_A, validSticky);
      addObject(BOARD_A, validRectangle);
      const state = removeObject(BOARD_A, "sticky-1");
      expect(state.objects).toHaveLength(1);
      expect(state.objects[0].id).toBe("rect-1");
    });

    it("no-op when objectId does not exist", () => {
      addObject(BOARD_A, validSticky);
      const before = getBoardState(BOARD_A);
      const after = removeObject(BOARD_A, "nonexistent");
      expect(after).toBe(before);
    });
  });

  describe("board isolation", () => {
    it("different boardIds have independent state", () => {
      addObject(BOARD_A, validSticky);
      addObject(BOARD_B, validRectangle);
      expect(getBoardState(BOARD_A).objects).toHaveLength(1);
      expect(getBoardState(BOARD_B).objects).toHaveLength(1);
      expect(getBoardState(BOARD_A).objects[0].id).toBe("sticky-1");
      expect(getBoardState(BOARD_B).objects[0].id).toBe("rect-1");
    });

    it("clearBoardForTesting removes board so next get is empty", () => {
      addObject(BOARD_A, validSticky);
      clearBoardForTesting(BOARD_A);
      expect(getBoardState(BOARD_A).objects).toEqual([]);
    });
  });
});
