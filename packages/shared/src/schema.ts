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
  rotation: z.number().optional(),
});

export const textboxSchema = z.object({
  id: z.string().min(1, "id required"),
  type: z.literal("textbox"),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  text: z.string(),
  autoSize: z.boolean().optional(),
  rotation: z.number().optional(),
});

export const shapeSchema = z.object({
  id: z.string().min(1, "id required"),
  type: z.enum(["rectangle", "circle", "line"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  color: z.string(),
  rotation: z.number().optional(),
});

export const boardObjectSchema = z.union([stickyNoteSchema, textboxSchema, shapeSchema]);

export type StickyNote = z.infer<typeof stickyNoteSchema>;
export type Textbox = z.infer<typeof textboxSchema>;
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
