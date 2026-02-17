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

export const connectorSchema = z.object({
  id: z.string().min(1, "id required"),
  type: z.literal("connector"),
  startObjectId: z.string().nullable(), // null if not connected to an object
  endObjectId: z.string().nullable(),   // null if not connected to an object
  startPoint: z.object({ x: z.number(), y: z.number() }), // absolute position if not connected
  endPoint: z.object({ x: z.number(), y: z.number() }),   // absolute position if not connected
  startAnchor: z.enum(["top", "right", "bottom", "left", "center"]).optional(), // which side of the object
  endAnchor: z.enum(["top", "right", "bottom", "left", "center"]).optional(),
  color: z.string(),
  strokeWidth: z.number().optional(),
  arrowStart: z.boolean().optional(),
  arrowEnd: z.boolean().optional(),
});

export const boardObjectSchema = z.union([stickyNoteSchema, textboxSchema, shapeSchema, connectorSchema]);

export type StickyNote = z.infer<typeof stickyNoteSchema>;
export type Textbox = z.infer<typeof textboxSchema>;
export type Shape = z.infer<typeof shapeSchema>;
export type Connector = z.infer<typeof connectorSchema>;
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
