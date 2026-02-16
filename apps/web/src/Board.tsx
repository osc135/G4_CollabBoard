import React, { useCallback, useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import Konva from "konva";
import type { BoardObject, Cursor } from "@collabboard/shared";

export type Tool = "pan" | "sticky" | "rectangle";

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
          color: "#fef08a",
        });
      } else if (tool === "rectangle") {
        onObjectCreate({
          id: `rect-${Date.now()}`,
          type: "rectangle",
          x: pos.x,
          y: pos.y,
          width: 120,
          height: 80,
          color: "#93c5fd",
        });
      }
    },
    [tool, onSelect, onObjectCreate]
  );

  return (
    <Stage
      ref={stageRef as React.RefObject<Konva.Stage>}
      width={window.innerWidth}
      height={window.innerHeight}
      scaleX={scale}
      scaleY={scale}
      x={position.x}
      y={position.y}
      draggable
      onWheel={handleWheel}
      onPointerMove={handlePointerMove}
      onClick={handleStageClick}
      onDragStart={() => {}}
      onDragEnd={() => {}}
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
                onClick={(e) => e.cancelBubble && onSelect(obj.id)}
              >
                <Rect width={obj.width} height={obj.height} fill={obj.color} cornerRadius={4} stroke={selectedId === obj.id ? "#333" : undefined} strokeWidth={selectedId === obj.id ? 2 : 0} />
                <Text text={obj.text} width={obj.width - 16} height={obj.height - 16} x={8} y={8} fontSize={14} wrap="word" listening={false} />
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
                onClick={(e) => e.cancelBubble && onSelect(obj.id)}
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
                onClick={(e) => e.cancelBubble && onSelect(obj.id)}
              />
            );
          }
          if (obj.type === "line") {
            return (
              <Line
                key={obj.id}
                points={[obj.x, obj.y, obj.x + obj.width, obj.y + obj.height]}
                stroke={obj.color}
                strokeWidth={2}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: obj.x + e.target.x(), y: obj.y + e.target.y() })}
                onClick={(e) => e.cancelBubble && onSelect(obj.id)}
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
  );
}
