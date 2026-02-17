import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Circle, Line, Text, Group, Shape } from "react-konva";
import Konva from "konva";
import type { BoardObject, Cursor } from "@collabboard/shared";

export type Tool = "pan" | "sticky" | "textbox";

interface BoardProps {
  objects: BoardObject[];
  cursors: Record<string, Cursor>;
  tool: Tool;
  selectedIds: string[];
  selectedStickyColor?: string;
  onSelect: (ids: string[]) => void;
  onObjectCreate: (obj: BoardObject) => void;
  onObjectUpdate: (obj: BoardObject) => void;
  onCursorMove: (x: number, y: number) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

const CURSOR_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b"];
function getCursorColor(index: number) {
  return CURSOR_COLORS[index % CURSOR_COLORS.length];
}

export const STICKY_COLORS = ["#fef08a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#fed7aa", "#fde68a", "#ddd6fe"];
export function getRandomStickyColor() {
  return STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)];
}

export function Board({
  objects,
  cursors,
  tool,
  selectedIds,
  onSelect,
  onObjectCreate,
  onObjectUpdate,
  onCursorMove,
  stageRef,
  selectedStickyColor,
}: BoardProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingStickyText, setEditingStickyText] = useState("");
  const stickyInputRef = useRef<HTMLTextAreaElement>(null);
  const [editingTextboxId, setEditingTextboxId] = useState<string | null>(null);
  const [editingTextboxText, setEditingTextboxText] = useState("");
  const textboxInputRef = useRef<HTMLTextAreaElement>(null);
  const [hoveredStickyId, setHoveredStickyId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const ignoreNextClickRef = useRef(false);

  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (stage && e.target === stage) {
      setPosition({ x: e.target.x(), y: e.target.y() });
    }
  }, []);

  useEffect(() => {
    if (editingStickyId) {
      const t = setTimeout(() => stickyInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [editingStickyId]);
  useEffect(() => {
    if (editingTextboxId) {
      const t = setTimeout(() => textboxInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [editingTextboxId]);

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

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      if (tool === "pan" && !e.evt.shiftKey) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      setSelectionBox({ start: { x: pos.x, y: pos.y }, end: { x: pos.x, y: pos.y } });
    },
    [tool]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!selectionBox) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      setSelectionBox((prev) => (prev ? { ...prev, end: { x: pos.x, y: pos.y } } : null));
    },
    [selectionBox]
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      if (!selectionBox) return;
      const { start, end } = selectionBox;
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      const dx = maxX - minX;
      const dy = maxY - minY;
      setSelectionBox(null);
      if (dx < 5 && dy < 5) {
        ignoreNextClickRef.current = false;
        return;
      }
      ignoreNextClickRef.current = true;
      const ids: string[] = [];
      objects.forEach((obj) => {
        if (obj.type === "sticky" || obj.type === "textbox") {
          const w = (obj.type === "sticky" ? obj.width : (obj.width ?? 200));
          const h = (obj.type === "sticky" ? obj.height : (obj.height ?? 80));
          const ox = obj.x;
          const oy = obj.y;
          const intersects =
            !(ox + w < minX || ox > maxX || oy + h < minY || oy > maxY);
          if (intersects) ids.push(obj.id);
        }
      });
      onSelect(ids);
    },
    [selectionBox, objects, onSelect]
  );

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }
      onSelect([]);
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
          color: selectedStickyColor ?? getRandomStickyColor(),
        });
      } else if (tool === "textbox") {
        onObjectCreate({
          id: `textbox-${Date.now()}`,
          type: "textbox",
          x: pos.x,
          y: pos.y,
          width: 200,
          height: 80,
          text: "",
          autoSize: true,
        });
      }
    },
    [tool, onSelect, onObjectCreate, selectedStickyColor]
  );

  const stickyObj = editingStickyId ? objects.find((o): o is Extract<BoardObject, { type: "sticky" }> => o.type === "sticky" && o.id === editingStickyId) : null;
  const textboxObj = editingTextboxId ? objects.find((o): o is Extract<BoardObject, { type: "textbox" }> => o.type === "textbox" && o.id === editingTextboxId) : null;
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
  const pad = 8;
  const textboxEditRect =
    textboxObj && containerRect
      ? {
          left: containerRect.left + (textboxObj.x + pad) * scale + position.x,
          top: containerRect.top + (textboxObj.y + pad) * scale + position.y,
          width: Math.max(80, ((textboxObj.width ?? 200) - pad * 2) * scale),
          height: Math.max(40, ((textboxObj.height ?? 80) - pad * 2) * scale),
        }
      : null;

  const handleStickyBlur = useCallback(() => {
    if (!editingStickyId) return;
    const obj = objects.find((o): o is Extract<BoardObject, { type: "sticky" }> => o.type === "sticky" && o.id === editingStickyId);
    if (obj) onObjectUpdate({ ...obj, text: editingStickyText });
    setEditingStickyId(null);
  }, [editingStickyId, editingStickyText, objects, onObjectUpdate]);

  const handleTextboxBlur = useCallback(() => {
    if (!editingTextboxId) return;
    const obj = objects.find((o): o is Extract<BoardObject, { type: "textbox" }> => o.type === "textbox" && o.id === editingTextboxId);
    if (!obj) {
      setEditingTextboxId(null);
      return;
    }
    const el = textboxInputRef.current;
    if (obj.autoSize !== false && el) {
      const w = Math.max(80, el.scrollWidth + 4);
      const h = Math.max(24, el.scrollHeight + 4);
      onObjectUpdate({ ...obj, text: editingTextboxText, width: w, height: h, autoSize: true });
    } else {
      onObjectUpdate({ ...obj, text: editingTextboxText });
    }
    setEditingTextboxId(null);
  }, [editingTextboxId, editingTextboxText, objects, onObjectUpdate]);

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

  const textboxEditor =
    editingTextboxId && textboxObj && textboxEditRect
      ? createPortal(
          <textarea
            ref={textboxInputRef}
            value={editingTextboxText}
            onChange={(e) => setEditingTextboxText(e.target.value)}
            onBlur={handleTextboxBlur}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingTextboxText(textboxObj.text);
                setEditingTextboxId(null);
                textboxInputRef.current?.blur();
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                textboxInputRef.current?.blur();
              }
            }}
            style={{
              position: "fixed",
              left: textboxEditRect.left,
              top: textboxEditRect.top,
              width: textboxEditRect.width,
              height: textboxEditRect.height,
              padding: 8,
              fontSize: 14,
              lineHeight: 1.4,
              fontFamily: "system-ui, sans-serif",
              background: "#fff",
              color: "#1a1a1a",
              border: "1px solid #d1d5db",
              borderRadius: 4,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              zIndex: 1000,
              boxShadow: "none",
              overflow: "auto",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitAppearance: "none",
              appearance: "none",
            }}
            placeholder="Type text…"
            spellCheck={false}
            className="textbox-edit-overlay"
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
      draggable={tool === "pan" && !selectionBox}
      onWheel={handleWheel}
      onPointerMove={(e) => {
        handlePointerMove(e);
        handleStageMouseMove(e);
      }}
      onMouseDown={handleStageMouseDown}
      onMouseUp={handleStageMouseUp}
      onClick={handleStageClick}
      onDragStart={() => {}}
      onDragEnd={handleStageDragEnd}
    >
      <Layer>
        {selectionBox && (() => {
          const w = Math.abs(selectionBox.end.x - selectionBox.start.x);
          const h = Math.abs(selectionBox.end.y - selectionBox.start.y);
          return w >= 5 || h >= 5 ? (
            <Rect
              x={Math.min(selectionBox.start.x, selectionBox.end.x)}
              y={Math.min(selectionBox.start.y, selectionBox.end.y)}
              width={w}
              height={h}
              stroke="#3b82f6"
              strokeWidth={2}
              dash={[4, 4]}
              listening={false}
            />
          ) : null;
        })()}
        {objects.map((obj) => {
          if (obj.type === "sticky") {
            const w = obj.width;
            const h = obj.height;
            const isHovered = hoveredStickyId === obj.id;
            return (
              <Group
                key={obj.id}
                x={obj.x}
                y={obj.y}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: e.target.x(), y: e.target.y() })}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect([obj.id]);
                }}
                onDblClick={(e) => {
                  e.cancelBubble = true;
                  setEditingStickyId(obj.id);
                  setEditingStickyText(obj.text === "New note" ? "" : obj.text);
                }}
                onPointerEnter={() => setHoveredStickyId(obj.id)}
                onPointerLeave={() => setHoveredStickyId(null)}
              >
                <Rect width={w} height={h} fill="transparent" listening />
                {!isHovered ? (
                  <Rect width={w} height={h} fill={obj.color} cornerRadius={4} stroke={selectedIds.includes(obj.id) ? "#333" : undefined} strokeWidth={selectedIds.includes(obj.id) ? 2 : 0} />
                ) : (
                  <Shape
                    sceneFunc={(ctx) => {
                      const cr = 4;
                      const cut = 22;
                      ctx.beginPath();
                      ctx.moveTo(0, h - cr);
                      ctx.lineTo(0, cr);
                      ctx.quadraticCurveTo(0, 0, cr, 0);
                      ctx.lineTo(w - cr, 0);
                      ctx.quadraticCurveTo(w, 0, w, cr);
                      ctx.lineTo(w, h - cut);
                      ctx.lineTo(w - cut, h);
                      ctx.lineTo(cr, h);
                      ctx.quadraticCurveTo(0, h, 0, h - cr);
                      ctx.closePath();
                      ctx.fillStyle = obj.color;
                      ctx.fill();
                      if (selectedIds.includes(obj.id)) {
                        ctx.strokeStyle = "#333";
                        ctx.lineWidth = 2;
                        ctx.stroke();
                      }
                    }}
                    listening={false}
                  />
                )}
                <Group x={w / 2} y={14} listening={false}>
                  <Circle radius={4} fill="#dc2626" stroke="#991b1b" strokeWidth={1} />
                  <Line points={[0, 4, 0, 12]} stroke="#991b1b" strokeWidth={1.5} lineCap="round" listening={false} />
                </Group>
                {editingStickyId !== obj.id && (
                  <Text text={obj.text} width={w - 16} height={h - 16} x={8} y={24} fontSize={14} wrap="word" listening={false} />
                )}
                {isHovered && (() => {
                  const size = 22;
                  const lift = 3;
                  const tipX = w - 6 - lift;
                  const tipY = h - size - lift;
                  const rightX = w - lift;
                  const rightY = h - 10 - lift;
                  const bottomX = w - 10 - lift;
                  const bottomY = h - lift;
                  const lighten = (hex: string, pct: number) => {
                    const num = parseInt(hex.slice(1), 16);
                    if (isNaN(num)) return hex;
                    const r = Math.min(255, ((num >> 16) & 0xff) + 255 * pct);
                    const g = Math.min(255, ((num >> 8) & 0xff) + 255 * pct);
                    const b = Math.min(255, (num & 0xff) + 255 * pct);
                    return `rgb(${r | 0},${g | 0},${b | 0})`;
                  };
                  const underside = obj.color.startsWith("#") ? lighten(obj.color, 0.1) : obj.color;
                  return (
                    <Shape
                      sceneFunc={(ctx) => {
                        ctx.beginPath();
                        ctx.moveTo(tipX, tipY);
                        ctx.lineTo(rightX, rightY);
                        ctx.quadraticCurveTo(w - 12, h - 12, bottomX, bottomY);
                        ctx.closePath();
                        ctx.save();
                        ctx.shadowColor = "rgba(0,0,0,0.18)";
                        ctx.shadowBlur = 6;
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 2;
                        ctx.fillStyle = underside;
                        ctx.fill();
                        ctx.restore();
                      }}
                      listening={false}
                    />
                  );
                })()}
              </Group>
            );
          }
          if (obj.type === "textbox") {
            const w = obj.width ?? 200;
            const h = obj.height ?? 80;
            const isSelected = selectedIds.includes(obj.id);
            return (
              <Group
                key={obj.id}
                x={obj.x}
                y={obj.y}
                draggable
                onDragEnd={(e) => onObjectUpdate({ ...obj, x: e.target.x(), y: e.target.y() })}
              >
                <Rect
                  name="textbox-body"
                  width={w}
                  height={h}
                  fill="#fff"
                  stroke={isSelected ? "#333" : "#e5e7eb"}
                  strokeWidth={isSelected ? 2 : 1}
                  cornerRadius={4}
                  onClick={(e) => {
                    e.cancelBubble = true;
                    onSelect([obj.id]);
                  }}
                  onDblClick={(e) => {
                    e.cancelBubble = true;
                    setEditingTextboxId(obj.id);
                    setEditingTextboxText(obj.text);
                  }}
                />
                {editingTextboxId !== obj.id && (
                  <Text
                    name="textbox-text"
                    text={obj.text || " "}
                    width={w - 16}
                    height={h - 16}
                    x={8}
                    y={8}
                    fontSize={14}
                    wrap="word"
                    listening={false}
                    fill="#1a1a1a"
                  />
                )}
                {isSelected && (
                  <Rect
                    name="textbox-handle"
                    x={w - 10}
                    y={h - 10}
                    width={10}
                    height={10}
                    fill="#333"
                    cornerRadius={2}
                    draggable
                    onClick={(e) => {
                      e.cancelBubble = true;
                    }}
                    onDragMove={(e) => {
                      e.cancelBubble = true;
                      const handle = e.target;
                      const group = handle.getParent();
                      if (!group) return;
                      const newW = Math.max(60, handle.x() + 10);
                      const newH = Math.max(24, handle.y() + 10);
                      const body = group.find(".textbox-body")[0];
                      const textNode = group.find(".textbox-text")[0];
                      if (body) {
                        body.width(newW);
                        body.height(newH);
                      }
                      if (textNode) {
                        textNode.width(newW - 16);
                        textNode.height(newH - 16);
                      }
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      const node = e.target;
                      const newW = Math.max(60, node.x() + 10);
                      const newH = Math.max(24, node.y() + 10);
                      onObjectUpdate({ ...obj, width: newW, height: newH, autoSize: false });
                      node.position({ x: newW - 10, y: newH - 10 });
                    }}
                    dragBoundFunc={(pos) => ({ x: Math.max(0, pos.x), y: Math.max(0, pos.y) })}
                  />
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
                  onSelect([obj.id]);
                }}
                stroke={selectedIds.includes(obj.id) ? "#333" : undefined}
                strokeWidth={selectedIds.includes(obj.id) ? 2 : 0}
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
                  onSelect([obj.id]);
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
                  onSelect([obj.id]);
                }}
              />
            );
          }
          return null;
        })}
      </Layer>
      <Layer listening={false}>
        {Object.entries(cursors).map(([id, cur], i) => {
          const color = getCursorColor(i);
          return (
            <Group key={id} x={cur.x} y={cur.y}>
              <Line
                points={[0, 0, 14, 10, 8, 10, 8, 18, 0, 14]}
                fill={color}
                stroke={color}
                strokeWidth={1}
                lineJoin="round"
                closed
              />
              <Text text={cur.name} x={20} y={4} fontSize={12} fill={color} fontStyle="bold" />
            </Group>
          );
        })}
      </Layer>
    </Stage>
    {stickyEditor}
    {textboxEditor}
    </>
  );
}
