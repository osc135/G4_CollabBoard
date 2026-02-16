import { describe, it, expect } from "vitest";
import {
  emptyState,
  applyCreate,
  applyUpdate,
  applyDelete,
} from "./state-mutations";
import type { BoardState } from "./schema";

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

describe("state mutations (edge cases and important)", () => {
  describe("applyCreate", () => {
    it("adds object to empty state", () => {
      const next = applyCreate(emptyState, validSticky);
      expect(next.objects).toHaveLength(1);
      expect(next.objects[0]).toEqual(validSticky);
    });

    it("adds second object without touching first", () => {
      const withOne = applyCreate(emptyState, validSticky);
      const withTwo = applyCreate(withOne, validRectangle);
      expect(withTwo.objects).toHaveLength(2);
      expect(withTwo.objects).toContainEqual(validSticky);
      expect(withTwo.objects).toContainEqual(validRectangle);
    });

    it("LWW: create with same id replaces existing object", () => {
      const withOne = applyCreate(emptyState, validSticky);
      const updated = { ...validSticky, id: "sticky-1", text: "Updated text" };
      const next = applyCreate(withOne, updated);
      expect(next.objects).toHaveLength(1);
      expect(next.objects[0].text).toBe("Updated text");
    });

    it("throws on invalid payload", () => {
      expect(() => applyCreate(emptyState, { id: "x" })).toThrow(/Invalid payload/);
      expect(() => applyCreate(emptyState, null)).toThrow(/Invalid payload/);
      expect(() => applyCreate(emptyState, { ...validSticky, id: "" })).toThrow(/Invalid payload/);
    });
  });

  describe("applyUpdate", () => {
    it("updates existing object and leaves others unchanged", () => {
      const state: BoardState = {
        objects: [validSticky, validRectangle],
      };
      const updated = { ...validSticky, text: "New text" };
      const next = applyUpdate(state, updated);
      expect(next.objects).toHaveLength(2);
      expect(next.objects.find((o) => o.id === "sticky-1")?.text).toBe("New text");
      expect(next.objects.find((o) => o.id === "rect-1")).toEqual(validRectangle);
    });

    it("LWW: second update wins", () => {
      const state: BoardState = { objects: [validSticky] };
      const first = applyUpdate(state, { ...validSticky, text: "First" });
      const second = applyUpdate(first, { ...validSticky, text: "Second" });
      expect(second.objects[0].text).toBe("Second");
    });

    it("no-op when objectId does not exist", () => {
      const state: BoardState = { objects: [validSticky] };
      const ghost = { ...validRectangle, id: "nonexistent" };
      const next = applyUpdate(state, ghost);
      expect(next).toBe(state);
      expect(next.objects).toHaveLength(1);
    });

    it("throws on invalid payload", () => {
      expect(() => applyUpdate(emptyState, { id: "x" })).toThrow(/Invalid payload/);
    });
  });

  describe("applyDelete", () => {
    it("removes existing object", () => {
      const state: BoardState = { objects: [validSticky, validRectangle] };
      const next = applyDelete(state, "sticky-1");
      expect(next.objects).toHaveLength(1);
      expect(next.objects[0].id).toBe("rect-1");
    });

    it("no-op when objectId does not exist", () => {
      const state: BoardState = { objects: [validSticky] };
      const next = applyDelete(state, "nonexistent");
      expect(next).toBe(state);
      expect(next.objects).toHaveLength(1);
    });

    it("empty state stays empty when deleting anything", () => {
      const next = applyDelete(emptyState, "any-id");
      expect(next.objects).toHaveLength(0);
      expect(next).toEqual(emptyState);
    });
  });
});
