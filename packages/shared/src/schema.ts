import { z } from "zod";

export const stickyNoteSchema = z.object({
  id: z.string().min(1, "id required"),
  type: z.literal("sticky"),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  text: z.string(),
  color: z.string(),
});

export const shapeSchema = z.object({
  id: z.string().min(1, "id required"),
  type: z.enum(["rectangle", "circle", "line"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string(),
});

export const boardObjectSchema = z.union([stickyNoteSchema, shapeSchema]);

export type StickyNote = z.infer<typeof stickyNoteSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type BoardObject = z.infer<typeof boardObjectSchema>;

export const boardStateSchema = z.object({
  objects: z.array(boardObjectSchema),
});

export type BoardState = z.infer<typeof boardStateSchema>;

export const cursorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  x: z.number(),
  y: z.number(),
  color: z.string().optional(),
});
export type Cursor = z.infer<typeof cursorSchema>;

export function parseBoardObject(data: unknown): BoardObject {
  return boardObjectSchema.parse(data);
}

export function safeParseBoardObject(data: unknown): z.SafeParseReturnType<unknown, BoardObject> {
  return boardObjectSchema.safeParse(data);
}
