import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import Konva from "konva";
import type { BoardObject, Cursor } from "@collabboard/shared";

export type Tool = "pan" | "sticky";

interface BoardProps {
  objects: BoardObject[];
  cursors: Record<string, Cursor>;
  tool: Tool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onObjectCreate: (obj: BoardObject) => void;
  onObjectUpdate: (obj: BoardObject) => void;
  onCursorMove: (x: number, y: number) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

const CURSOR_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
function getCursorColor(index: number) {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

const STICKY_COLORS = ["#fef08a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fed7aa", "#fde68a", "#ddd6fe"];
function getRandomStickyColor() {
  return STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
}

export function Board({
  objects,
  cursors,
  tool,
  selectedId,
  onSelect,
  onObjectCreate,
  onObjectUpdate,
  onCursorMove,
  stageRef,
}: BoardProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingStickyText, setEditingStickyText] = useState("");
  const stickyInputRef = useRef<HTMLTextAreaElement>(null);

  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    setPosition({ x: e.target.x(), y: e.target.y() });
  }, []);

  useEffect(() => {
    if (editingStickyId) {
      const t = setTimeout(() => stickyInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [editingStickyId]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const scaleBy = 1.1;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clamped = Math.min(Math.max(0.2, newScale), 5);
    setScale(clamped);
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    setPosition({ x: pointer.x - mousePointTo.x * clamped, y: pointer.y - mousePointTo.y * clamped });
  }, []);

  const handlePointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const point = stage.getStage().getRelativePointerPosition();
      if (point) onCursorMove(point.x, point.y);
    },
    [onCursorMove]
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      onSelect(null);
      if (tool === "pan") return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      if (tool === "sticky") {
        onObjectCreate({
          id: `sticky-${Date.now()}`,
          type: "sticky",
          x: pos.x - 75,
          y: pos.y - 50,
          width: 150,
          height: 100,
          text: "New note",
          color: getRandomStickyColor(),
        });
      }
    },
    [tool, onSelect, onObjectCreate]
  );

  const stickyObj = editingStickyId ? objects.find((o): o is Extract<BoardObject, { type: "sticky" }> => o.type === "sticky" && o.id === editingStickyId) : null;
  const stage = stageRef.current;
  const containerRect = (stage && "getContainer" in stage ? (stage as { getContainer: () => HTMLElement }).getContainer() : null)?.getBoundingClientRect();
  const stickyEditRect =
    stickyObj && containerRect
      ? {
          left: containerRect.left + (stickyObj.x + 8) * scale + position.x,
          top: containerRect.top + (stickyObj.y + 8) * scale + position.y,
          width: Math.max(80, (stickyObj.width - 16) * scale),
          height: Math.max(40, (stickyObj.height - 16) * scale),
        }
      : null;

  const handleStickyBlur = useCallback(() => {
    if (!editingStickyId) return;
    const obj = objects.find((o): o is Extract<BoardObject, { type: "sticky" }> => o.type === "sticky" && o.id === editingStickyId);
    if (obj) onObjectUpdate({ ...obj, text: editingStickyText });
    setEditingStickyId(null);
  }, [editingStickyId, editingStickyText, objects, onObjectUpdate]);

  const stickyEditor =
    editingStickyId && stickyObj && stickyEditRect
      ? createPortal(
          <textarea
            ref={stickyInputRef}
            value={editingStickyText}
            onChange={(e) => setEditingStickyText(e.target.value)}
            onBlur={handleStickyBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingStickyText(stickyObj.text === "New note" ? "" : stickyObj.text);
                setEditingStickyId(null);
                stickyInputRef.current?.blur();
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                stickyInputRef.current?.blur();
              }
            }}
            style={{
              position: "fixed",
              left: stickyEditRect.left,
              top: stickyEditRect.top,
              width: stickyEditRect.width,
              height: stickyEditRect.height,
              padding: 6,
              fontSize: 14,
              lineHeight: 1.4,
              fontFamily: "system-ui, sans-serif",
              background: stickyObj.color,
              color: "#1a1a1a",
              border: "none",
              borderRadius: 4,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              zIndex: 1000,
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
            }}
            placeholder="Type your note…"
            spellCheck={false}
          />,
          document.body
        )
      : null;

  return (
    <>
    <Stage
      ref={stageRef as React.RefObject<Konva.Stage>}
      width={window.innerWidth}
      height={window.innerHeight}
      scaleX={scale}
      scaleY={scale}
      x={position.x}
      y={position.y}
      draggable={tool === "pan"}
      onWheel={handleWheel}
      onPointerMove={handlePointerMove}
      onClick={handleStageClick}
      onDragStart={() => {}}
      onDragEnd={handleStageDragEnd}
    >
      <Layer>
        {objects.map((obj) => {
          if (obj.type === "sticky") {
            return (
              <Group
                key={obj.id}
                x={obj.x}
                y={obj.y}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: e.target.x(), y: e.target.y() })}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect(obj.id);
                }}
                onDblClick={(e) => {
                  e.cancelBubble = true;
                  setEditingStickyId(obj.id);
                  setEditingStickyText(obj.text === "New note" ? "" : obj.text);
                }}
              >
                <Rect width={obj.width} height={obj.height} fill={obj.color} cornerRadius={4} stroke={selectedId === obj.id ? "#333" : undefined} strokeWidth={selectedId === obj.id ? 2 : 0} />
                {editingStickyId !== obj.id && (
                  <Text text={obj.text} width={obj.width - 16} height={obj.height - 16} x={8} y={8} fontSize={14} wrap="word" listening={false} />
                )}
              </Group>
            );
          }
          if (obj.type === "rectangle") {
            return (
              <Rect
                key={obj.id}
                x={obj.x}
                y={obj.y}
                width={obj.width}
                height={obj.height}
                fill={obj.color}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: e.target.x(), y: e.target.y() })}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect(obj.id);
                }}
                stroke={selectedId === obj.id ? "#333" : undefined}
                strokeWidth={selectedId === obj.id ? 2 : 0}
              />
            );
          }
          if (obj.type === "circle") {
            return (
              <Circle
                key={obj.id}
                x={obj.x + obj.width / 2}
                y={obj.y + obj.height / 2}
                radius={Math.min(obj.width, obj.height) / 2}
                fill={obj.color}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: e.target.x() - obj.width / 2, y: e.target.y() - obj.height / 2 })}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect(obj.id);
                }}
              />
            );
          }
          if (obj.type === "line") {
            return (
              <Line
                key={obj.id}
                x={obj.x}
                y={obj.y}
                points={[0, 0, obj.width, obj.height]}
                stroke={obj.color}
                strokeWidth={2}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: e.target.x(), y: e.target.y() })}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect(obj.id);
                }}
              />
            );
          }
          return null;
        })}
      </Layer>
      <Layer listening={false}>
        {Object.entries(cursors).map(([id, cur], i) => (
          <Group key={id} x={cur.x} y={cur.y}>
            <Line points={[0, 0, 12, 0]} stroke={getCursorColor(i)} strokeWidth={2} />
            <Text text={cur.name} x={14} y={-8} fontSize={12} fill={getCursorColor(i)} />
          </Group>
        ))}
      </Layer>
    </Stage>
    {stickyEditor}
    </>
  );
}
