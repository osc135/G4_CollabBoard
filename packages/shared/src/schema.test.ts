import { describe, it, expect } from "vitest";
import {
  stickyNoteSchema,
  shapeSchema,
  boardObjectSchema,
  safeParseBoardObject,
  parseBoardObject,
} from "./schema";

describe("schema validation (edge cases and important)", () => {
  const validSticky = {
    id: "sticky-1",
    type: "sticky" as const,
    x: 10,
    y: 20,
    width: 150,
    height: 100,
    text: "Hello",
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

  describe("sticky note", () => {
    it("accepts valid sticky payload", () => {
      expect(safeParseBoardObject(validSticky).success).toBe(true);
      expect(parseBoardObject(validSticky)).toEqual(validSticky);
    });

    it("rejects empty id", () => {
      const result = safeParseBoardObject({ ...validSticky, id: "" });
      expect(result.success).toBe(false);
    });

    it("rejects missing id", () => {
      const { id: _, ...noId } = validSticky;
      expect(safeParseBoardObject(noId).success).toBe(false);
    });

    it("rejects wrong type for id (number)", () => {
      const result = safeParseBoardObject({ ...validSticky, id: 123 });
      expect(result.success).toBe(false);
    });

    it("sticky requires type literal 'sticky' (union: rectangle with sticky shape is valid as shape)", () => {
      // Object with type "rectangle" and sticky-like fields is valid as a shape (union accepts it)
      expect(safeParseBoardObject({ ...validSticky, type: "rectangle" }).success).toBe(true);
    });

    it("rejects missing required fields (text, color, x, y, width, height)", () => {
      expect(safeParseBoardObject({ ...validSticky, text: undefined }).success).toBe(false);
      expect(safeParseBoardObject({ ...validSticky, color: undefined }).success).toBe(false);
      expect(safeParseBoardObject({ ...validSticky, x: undefined }).success).toBe(false);
    });

    it("rejects wrong numeric types (string instead of number)", () => {
      expect(safeParseBoardObject({ ...validSticky, x: "10" }).success).toBe(false);
      expect(safeParseBoardObject({ ...validSticky, width: "150" }).success).toBe(false);
    });
  });

  describe("shape (rectangle)", () => {
    it("accepts valid rectangle payload", () => {
      expect(safeParseBoardObject(validRectangle).success).toBe(true);
      expect(parseBoardObject(validRectangle)).toEqual(validRectangle);
    });

    it("accepts circle and line types", () => {
      expect(safeParseBoardObject({ ...validRectangle, type: "circle" }).success).toBe(true);
      expect(safeParseBoardObject({ ...validRectangle, type: "line" }).success).toBe(true);
    });

    it("rejects empty id", () => {
      expect(safeParseBoardObject({ ...validRectangle, id: "" }).success).toBe(false);
    });

    it("rejects invalid shape type", () => {
      expect(safeParseBoardObject({ ...validRectangle, type: "triangle" }).success).toBe(false);
    });
  });

  describe("malformed / unsafe input", () => {
    it("rejects null", () => {
      expect(safeParseBoardObject(null).success).toBe(false);
    });

    it("rejects undefined", () => {
      expect(safeParseBoardObject(undefined).success).toBe(false);
    });

    it("rejects plain array", () => {
      expect(safeParseBoardObject([]).success).toBe(false);
    });

    it("rejects object with no type", () => {
      expect(safeParseBoardObject({ id: "x", x: 0, y: 0 }).success).toBe(false);
    });
  });
});
