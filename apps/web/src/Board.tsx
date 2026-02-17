import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Circle, Line, Text, Group, Shape, Transformer } from "react-konva";
import Konva from "konva";
import type { BoardObject, Cursor } from "@collabboard/shared";

export type Tool = "pan" | "sticky" | "textbox" | "rectangle" | "circle" | "line";

interface BoardProps {
  objects: BoardObject[];
  cursors: Record<string, Cursor>;
  tool: Tool;
  selectedIds: string[];
  selectedStickyColor?: string;
  selectedShapeColor?: string;
  onSelect: (ids: string[]) => void;
  onObjectCreate: (obj: BoardObject) => void;
  onObjectUpdate: (obj: BoardObject) => void;
  onObjectDelete?: (id: string) => void;
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

// Helper function to get anchor point on an object
function getAnchorPoint(obj: BoardObject, anchor: "top" | "right" | "bottom" | "left" | "center"): { x: number; y: number } {
  // Connectors don't have x/y properties, return a default
  if (obj.type === "connector") {
    return { x: 0, y: 0 };
  }
  
  const width = obj.type === "sticky" ? obj.width : 
                obj.type === "textbox" ? (obj.width ?? 200) : 
                obj.type === "rectangle" || obj.type === "circle" ? obj.width : 
                obj.type === "line" ? 100 : 0;
  const height = obj.type === "sticky" ? obj.height : 
                 obj.type === "textbox" ? (obj.height ?? 80) : 
                 obj.type === "rectangle" || obj.type === "circle" ? obj.height : 
                 obj.type === "line" ? 100 : 0;
  
  const centerX = obj.x + width / 2;
  const centerY = obj.y + height / 2;
  
  switch (anchor) {
    case "top": return { x: centerX, y: obj.y };
    case "right": return { x: obj.x + width, y: centerY };
    case "bottom": return { x: centerX, y: obj.y + height };
    case "left": return { x: obj.x, y: centerY };
    case "center": return { x: centerX, y: centerY };
    default: return { x: centerX, y: centerY };
  }
}

// Helper function to find the best anchor point between two objects
function getBestAnchor(fromObj: BoardObject, toObj: BoardObject): { startAnchor: "top" | "right" | "bottom" | "left"; endAnchor: "top" | "right" | "bottom" | "left" } {
  const fromCenter = getAnchorPoint(fromObj, "center");
  const toCenter = getAnchorPoint(toObj, "center");
  
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  
  let startAnchor: "top" | "right" | "bottom" | "left";
  let endAnchor: "top" | "right" | "bottom" | "left";
  
  // Determine start anchor based on direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection is stronger
    startAnchor = dx > 0 ? "right" : "left";
    endAnchor = dx > 0 ? "left" : "right";
  } else {
    // Vertical connection is stronger
    startAnchor = dy > 0 ? "bottom" : "top";
    endAnchor = dy > 0 ? "top" : "bottom";
  }
  
  return { startAnchor, endAnchor };
}

// Get the best connection point on object perimeter - allows for any point, not just 4 anchors
function getBestPerimeterPoint(obj: BoardObject, targetPoint: { x: number; y: number }): { x: number; y: number } {
  // Connectors don't have x/y properties, return target point as fallback
  if (obj.type === "connector") {
    return targetPoint;
  }
  
  const width = obj.type === "sticky" ? obj.width : 
                obj.type === "textbox" ? (obj.width ?? 200) : 
                obj.type === "rectangle" || obj.type === "circle" ? obj.width : 
                obj.type === "line" ? 100 : 0;
  const height = obj.type === "sticky" ? obj.height : 
                 obj.type === "textbox" ? (obj.height ?? 80) : 
                 obj.type === "rectangle" || obj.type === "circle" ? obj.height : 
                 obj.type === "line" ? 100 : 0;
  
  const objCenterX = obj.x + width / 2;
  const objCenterY = obj.y + height / 2;
  
  // Vector from object center to target
  const dx = targetPoint.x - objCenterX;
  const dy = targetPoint.y - objCenterY;
  
  // Handle edge case where target is at center
  if (dx === 0 && dy === 0) {
    return { x: obj.x + width, y: objCenterY }; // Default to right edge
  }
  
  // For circles, use radius-based calculation
  if (obj.type === "circle") {
    const radius = Math.min(width, height) / 2;
    const angle = Math.atan2(dy, dx);
    return {
      x: objCenterX + radius * Math.cos(angle),
      y: objCenterY + radius * Math.sin(angle)
    };
  }
  
  // For rectangles/stickies, find intersection with rectangle perimeter
  const halfW = width / 2;
  const halfH = height / 2;
  
  // Calculate the scale factor to reach the edge
  const scaleX = dx === 0 ? Infinity : Math.abs(halfW / dx);
  const scaleY = dy === 0 ? Infinity : Math.abs(halfH / dy);
  const scale = Math.min(scaleX, scaleY);
  
  return {
    x: objCenterX + dx * scale,
    y: objCenterY + dy * scale
  };
}

// Calculate curved path for connector
function calculateCurvedPath(start: { x: number; y: number }, end: { x: number; y: number }): number[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Control point offset for the curve
  const controlOffset = Math.min(distance * 0.3, 100);
  
  // Calculate control points perpendicular to the line
  const angle = Math.atan2(dy, dx);
  const perpAngle = angle + Math.PI / 2;
  
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  
  const controlX = midX + Math.cos(perpAngle) * controlOffset;
  const controlY = midY + Math.sin(perpAngle) * controlOffset;
  
  // Return quadratic bezier curve points
  return [start.x, start.y, controlX, controlY, end.x, end.y];
}

// Calculate orthogonal (right-angle) path
function calculateOrthogonalPath(start: { x: number; y: number }, end: { x: number; y: number }): number[] {
  const midX = (start.x + end.x) / 2;
  
  // Create a path that goes horizontal then vertical
  return [
    start.x, start.y,
    midX, start.y,
    midX, end.y,
    end.x, end.y
  ];
}

// Helper to find which object is under a point
function findObjectAtPoint(objects: BoardObject[], point: { x: number; y: number }): BoardObject | null {
  // Check in reverse order (top to bottom)
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.type === "connector") continue;
    
    const width = obj.type === "sticky" ? obj.width : 
                  obj.type === "textbox" ? (obj.width ?? 200) : 
                  obj.type === "rectangle" || obj.type === "circle" ? obj.width : 
                  obj.type === "line" ? 100 : 0;
    const height = obj.type === "sticky" ? obj.height : 
                   obj.type === "textbox" ? (obj.height ?? 80) : 
                   obj.type === "rectangle" || obj.type === "circle" ? obj.height : 
                   obj.type === "line" ? 100 : 0;
    
    // Add some padding for easier selection (10px around the object)
    const padding = 10;
    if (point.x >= obj.x - padding && point.x <= obj.x + width + padding &&
        point.y >= obj.y - padding && point.y <= obj.y + height + padding) {
      return obj;
    }
  }
  return null;
}

export function Board({
  objects,
  cursors,
  tool,
  selectedIds,
  onSelect,
  onObjectCreate,
  onObjectUpdate,
  onObjectDelete,
  onCursorMove,
  stageRef,
  selectedStickyColor,
  selectedShapeColor = "#3b82f6",
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
  const shapeRefs = useRef<Record<string, Konva.Group>>({});
  const trRef = useRef<Konva.Transformer | null>(null);
  const [drawingConnector, setDrawingConnector] = useState<{
    startObjectId: string | null;
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
  } | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const [draggingObject, setDraggingObject] = useState<{ id: string; x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    objectId: string;
  } | null>(null);
  const [connectorStyle, setConnectorStyle] = useState<"straight" | "curved" | "orthogonal">("curved");
  const [drawingLine, setDrawingLine] = useState<{
    id: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const handleObjectContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>, objId: string) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;
    
    // Use the raw event coordinates for fixed positioning
    const clientX = e.evt.clientX;
    const clientY = e.evt.clientY;
    
    setContextMenu({
      x: clientX,
      y: clientY,
      objectId: objId
    });
  }, []);

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

  useLayoutEffect(() => {
    const objIds = new Set(objects.map((o) => o.id));
    Object.keys(shapeRefs.current).forEach((id) => {
      if (!objIds.has(id)) delete shapeRefs.current[id];
    });
  }, [objects]);

  useLayoutEffect(() => {
    const tr = trRef.current;
    if (!tr || selectedIds.length === 0) return;
    const attach = () => {
      // Filter out connectors from transformation (they can be selected but not transformed)
      const transformableIds = selectedIds.filter(id => {
        const obj = objects.find(o => o.id === id);
        return obj && obj.type !== "connector";
      });
      const nodes = transformableIds.map((id) => shapeRefs.current[id]).filter(Boolean) as Konva.Node[];
      if (nodes.length > 0) {
        tr.nodes(nodes);
        tr.forceUpdate();
        tr.getLayer()?.batchDraw();
      }
    };
    attach();
    const rafId = requestAnimationFrame(attach);
    return () => cancelAnimationFrame(rafId);
  }, [selectedIds, objects]);

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
      
      if (tool === "line") {
        // Start line drawing
        setDrawingLine({
          id: `line-${Date.now()}`,
          startX: pos.x,
          startY: pos.y,
          currentX: pos.x,
          currentY: pos.y,
        });
      } else {
        setSelectionBox({ start: { x: pos.x, y: pos.y }, end: { x: pos.x, y: pos.y } });
      }
    },
    [tool]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      
      if (drawingLine) {
        // Update line current position
        setDrawingLine((prev) => (prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null));
      } else if (selectionBox) {
        setSelectionBox((prev) => (prev ? { ...prev, end: { x: pos.x, y: pos.y } } : null));
      }
    },
    [selectionBox, drawingLine]
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Handle connector completion first (before checking if target is stage)
      if (drawingConnector) {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;
        
        const targetObj = findObjectAtPoint(objects, pos);
        const startObj = objects.find(o => o.id === drawingConnector.startObjectId);
        
        let startAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let endAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let startPoint = drawingConnector.startPoint;
        let endPoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;
        
        // Use smart anchoring if both objects exist
        if (startObj && targetObj) {
          const anchors = getBestAnchor(startObj, targetObj);
          startAnchor = anchors.startAnchor;
          endAnchor = anchors.endAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
          endPoint = getAnchorPoint(targetObj, endAnchor);
        } else if (startObj) {
          // If only start object exists, use smart start anchor
          const mousePoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;
          const anchors = getBestAnchor(startObj, { ...startObj, x: mousePoint.x - 50, y: mousePoint.y - 50, width: 100, height: 100 } as any);
          startAnchor = anchors.startAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
        }
        
        const newConnector = {
          id: `connector-${Date.now()}`,
          type: "connector" as const,
          startObjectId: drawingConnector.startObjectId,
          endObjectId: targetObj?.id || null,
          startPoint,
          endPoint,
          startAnchor,
          endAnchor,
          style: connectorStyle,
          color: selectedShapeColor,
          strokeWidth: 2,
          arrowEnd: true,
        };
        onObjectCreate(newConnector as any);
        setDrawingConnector(null);
        return;
      }
      
      if (e.target !== e.target.getStage()) return;
      
      // Handle line creation
      if (drawingLine) {
        const width = drawingLine.currentX - drawingLine.startX;
        const height = drawingLine.currentY - drawingLine.startY;
        
        // Only create line if there's a minimum drag distance
        if (Math.abs(width) >= 10 || Math.abs(height) >= 10) {
          onObjectCreate({
            id: drawingLine.id,
            type: "line",
            x: drawingLine.startX,
            y: drawingLine.startY,
            width: width,
            height: height,
            color: selectedShapeColor,
            rotation: 0,
          });
        }
        setDrawingLine(null);
        return;
      }
      
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
          const w = obj.type === "sticky" ? obj.width : (obj.width ?? 200);
          const h = obj.type === "sticky" ? obj.height : (obj.height ?? 80);
          const ox = obj.x;
          const oy = obj.y;
          const intersects = !(ox + w < minX || ox > maxX || oy + h < minY || oy > maxY);
          if (intersects) ids.push(obj.id);
        } else if (obj.type === "rectangle") {
          const intersects = !(obj.x + obj.width < minX || obj.x > maxX || obj.y + obj.height < minY || obj.y > maxY);
          if (intersects) ids.push(obj.id);
        } else if (obj.type === "circle") {
          const cx = obj.x + obj.width / 2;
          const cy = obj.y + obj.height / 2;
          const r = Math.min(obj.width, obj.height) / 2;
          const boxIntersects = !(cx - r > maxX || cx + r < minX || cy - r > maxY || cy + r < minY);
          if (boxIntersects) ids.push(obj.id);
        } else if (obj.type === "line") {
          const lx = Math.min(obj.x, obj.x + obj.width);
          const rx = Math.max(obj.x, obj.x + obj.width);
          const ty = Math.min(obj.y, obj.y + obj.height);
          const by = Math.max(obj.y, obj.y + obj.height);
          const intersects = !(rx < minX || lx > maxX || by < minY || ty > maxY);
          if (intersects) ids.push(obj.id);
        }
      });
      onSelect(ids);
    },
    [selectionBox, objects, onSelect, drawingLine, onObjectCreate, selectedShapeColor, drawingConnector, connectorStyle]
  );

  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    // Prevent default browser context menu when right-clicking on stage background
    e.evt.preventDefault();
    // Close any existing context menu
    setContextMenu(null);
  }, []);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Close context menu on any left click
      if (contextMenu) {
        setContextMenu(null);
      }
      
      // If we're drawing a connector, complete it
      if (drawingConnector) {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;
        
        const targetObj = findObjectAtPoint(objects, pos);
        const startObj = objects.find(o => o.id === drawingConnector.startObjectId);
        
        let startAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let endAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let startPoint = drawingConnector.startPoint;
        let endPoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;
        
        // Use smart anchoring if both objects exist
        if (startObj && targetObj) {
          const anchors = getBestAnchor(startObj, targetObj);
          startAnchor = anchors.startAnchor;
          endAnchor = anchors.endAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
          endPoint = getAnchorPoint(targetObj, endAnchor);
        } else if (startObj) {
          // If only start object exists, use smart start anchor
          const mousePoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;
          const anchors = getBestAnchor(startObj, { ...startObj, x: mousePoint.x - 50, y: mousePoint.y - 50, width: 100, height: 100 } as any);
          startAnchor = anchors.startAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
        }
        
        const newConnector = {
          id: `connector-${Date.now()}`,
          type: "connector" as const,
          startObjectId: drawingConnector.startObjectId,
          endObjectId: targetObj?.id || null,
          startPoint,
          endPoint,
          startAnchor,
          endAnchor,
          style: connectorStyle,
          color: selectedShapeColor,
          strokeWidth: 2,
          arrowEnd: true,
        };
        onObjectCreate(newConnector as any);
        setDrawingConnector(null);
        return;
      }
      
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
          rotation: 0,
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
          rotation: 0,
        });
      } else if (tool === "rectangle") {
        onObjectCreate({
          id: `rect-${Date.now()}`,
          type: "rectangle",
          x: pos.x,
          y: pos.y,
          width: 120,
          height: 80,
          color: selectedShapeColor,
          rotation: 0,
        });
      } else if (tool === "circle") {
        onObjectCreate({
          id: `circle-${Date.now()}`,
          type: "circle",
          x: pos.x,
          y: pos.y,
          width: 80,
          height: 80,
          color: selectedShapeColor,
          rotation: 0,
        });
      }
    },
    [tool, onSelect, onObjectCreate, selectedStickyColor, selectedShapeColor, drawingConnector, objects, contextMenu, connectorStyle]
  );

  const stickyObj = editingStickyId ? objects.find((o): o is Extract<BoardObject, { type: "sticky" }> => o.type === "sticky" && o.id === editingStickyId) : null;
  const textboxObj = editingTextboxId ? objects.find((o): o is Extract<BoardObject, { type: "textbox" }> => o.type === "textbox" && o.id === editingTextboxId) : null;
  const stage = stageRef.current;
  const containerRect = (stage && "getContainer" in stage ? (stage as { getContainer: () => HTMLElement }).getContainer() : null)?.getBoundingClientRect();
  const stickyEditRect =
    stickyObj && containerRect
      ? {
          left: containerRect.left + (stickyObj.x + 8) * scale + position.x,
          top: containerRect.top + (stickyObj.y + 24) * scale + position.y,
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
              padding: 0,
              fontSize: 14 * scale,
              lineHeight: 1.4,
              fontFamily: "system-ui, sans-serif",
              background: "transparent",
              color: "#1a1a1a",
              border: "none",
              resize: "none",
              overflow: "hidden",
              outline: "none",
              boxSizing: "border-box",
              zIndex: 1000,
              wordWrap: "break-word",
              whiteSpace: "pre-wrap",
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
              padding: 0,
              fontSize: 14 * scale,
              lineHeight: 1.4,
              fontFamily: "system-ui, sans-serif",
              background: "transparent",
              color: "#1a1a1a",
              border: "none",
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              zIndex: 1000,
              overflow: "hidden",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              WebkitAppearance: "none",
              appearance: "none",
              wordWrap: "break-word",
              whiteSpace: "pre-wrap",
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
        // Update connector endpoint while drawing
        if (drawingConnector) {
          const stage = e.target.getStage();
          if (!stage) return;
          const pos = stage.getRelativePointerPosition();
          if (!pos) return;
          
          // Check if we're hovering over an object
          const targetObj = findObjectAtPoint(objects, pos);
          setHoveredObjectId(targetObj?.id || null);
          
          // Update drawing connector with smart anchoring
          const startObj = objects.find(o => o.id === drawingConnector.startObjectId);
          let startPoint = drawingConnector.startPoint;
          let endPoint = pos;
          
          if (targetObj) {
            // If hovering over target object, use smart anchoring
            if (startObj) {
              const anchors = getBestAnchor(startObj, targetObj);
              startPoint = getAnchorPoint(startObj, anchors.startAnchor);
              endPoint = getAnchorPoint(targetObj, anchors.endAnchor);
            } else {
              endPoint = getAnchorPoint(targetObj, "center");
            }
          } else if (startObj) {
            // If not hovering over target, use smart start anchor based on mouse direction
            const mousePoint = pos;
            const anchors = getBestAnchor(startObj, { ...startObj, x: mousePoint.x - 50, y: mousePoint.y - 50, width: 100, height: 100 } as any);
            startPoint = getAnchorPoint(startObj, anchors.startAnchor);
            endPoint = mousePoint;
          }
          
          setDrawingConnector(prev => prev ? { ...prev, startPoint, endPoint } : null);
        } else {
          setHoveredObjectId(null);
        }
      }}
      onMouseDown={handleStageMouseDown}
      onMouseUp={handleStageMouseUp}
      onClick={handleStageClick}
      onContextMenu={handleStageContextMenu}
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
        {drawingLine && (
          <Line
            points={[drawingLine.startX, drawingLine.startY, drawingLine.currentX, drawingLine.currentY]}
            stroke={selectedShapeColor}
            strokeWidth={2}
            dash={[5, 5]}
            listening={false}
          />
        )}
        {objects.map((obj) => {
          if (obj.type === "sticky") {
            const w = obj.width;
            const h = obj.height;
            const rot = obj.rotation ?? 0;
            const isHovered = hoveredStickyId === obj.id;
            return (
              <Group
                key={obj.id}
                ref={(el) => {
                  if (el) shapeRefs.current[obj.id] = el;
                }}
                x={obj.x + w / 2}
                y={obj.y + h / 2}
                offsetX={w / 2}
                offsetY={h / 2}
                rotation={rot}
                draggable
                onDragMove={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject({ id: obj.id, x: newX, y: newY });
                  // Force re-render to update connectors in real-time
                  e.target.getLayer()?.batchDraw();
                }}
                onDragEnd={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject(null);
                  onObjectUpdate({ ...obj, x: newX, y: newY, rotation: e.target.rotation() });
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect([obj.id]);
                }}
                onContextMenu={(e) => handleObjectContextMenu(e, obj.id)}
                onDblClick={(e) => {
                  e.cancelBubble = true;
                  setEditingStickyId(obj.id);
                  setEditingStickyText(obj.text === "New note" ? "" : obj.text);
                }}
                onPointerEnter={() => setHoveredStickyId(obj.id)}
                onPointerLeave={() => setHoveredStickyId(null)}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  
                  // Reset scale to 1 and apply it to width/height
                  node.scaleX(1);
                  node.scaleY(1);
                  
                  const newWidth = Math.max(50, w * scaleX);
                  const newHeight = Math.max(50, h * scaleY);
                  const newX = node.x() - newWidth / 2;
                  const newY = node.y() - newHeight / 2;
                  
                  onObjectUpdate({
                    ...obj,
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight,
                    rotation: node.rotation()
                  });
                }}
              >
                <Rect width={w} height={h} fill="transparent" listening />
                {!isHovered ? (
                  <Rect 
                    width={w} 
                    height={h} 
                    fill={obj.color} 
                    cornerRadius={4} 
                    stroke={selectedIds.includes(obj.id) ? "#333" : hoveredObjectId === obj.id && drawingConnector ? "#3b82f6" : undefined} 
                    strokeWidth={selectedIds.includes(obj.id) ? 2 : hoveredObjectId === obj.id && drawingConnector ? 3 : 0} 
                  />
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
                      } else if (hoveredObjectId === obj.id && drawingConnector) {
                        ctx.strokeStyle = "#3b82f6";
                        ctx.lineWidth = 3;
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
                  <Text text={obj.text} width={w - 16} height={h - 16} x={8} y={24} fontSize={14 / scale} wrap="word" listening={false} />
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
            const rot = obj.rotation ?? 0;
            const isSelected = selectedIds.includes(obj.id);
            return (
              <Group
                key={obj.id}
                ref={(el) => {
                  if (el) shapeRefs.current[obj.id] = el;
                }}
                x={obj.x + w / 2}
                y={obj.y + h / 2}
                offsetX={w / 2}
                offsetY={h / 2}
                rotation={rot}
                draggable
                onDragMove={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject({ id: obj.id, x: newX, y: newY });
                  // Force re-render to update connectors in real-time
                  e.target.getLayer()?.batchDraw();
                }}
                onDragEnd={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject(null);
                  onObjectUpdate({ ...obj, x: newX, y: newY, rotation: e.target.rotation() });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  
                  // Reset scale to 1 and apply it to width/height
                  node.scaleX(1);
                  node.scaleY(1);
                  
                  const newWidth = Math.max(50, w * scaleX);
                  const newHeight = Math.max(30, h * scaleY);
                  const newX = node.x() - newWidth / 2;
                  const newY = node.y() - newHeight / 2;
                  
                  onObjectUpdate({
                    ...obj,
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight,
                    rotation: node.rotation()
                  });
                }}
                onContextMenu={(e) => handleObjectContextMenu(e, obj.id)}
              >
                <Rect
                  name="textbox-body"
                  x={-w / 2}
                  y={-h / 2}
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
                    x={-w / 2 + 8}
                    y={-h / 2 + 8}
                    fontSize={14 / scale}
                    wrap="word"
                    listening={false}
                    fill="#1a1a1a"
                  />
                )}
                {isSelected && (
                  <Rect
                    name="textbox-handle"
                    x={w / 2 - 10}
                    y={h / 2 - 10}
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
                      const newW = Math.max(60, handle.x() + w / 2 + 10);
                      const newH = Math.max(24, handle.y() + h / 2 + 10);
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
                      const newW = Math.max(60, node.x() + w / 2 + 10);
                      const newH = Math.max(24, node.y() + h / 2 + 10);
                      onObjectUpdate({ ...obj, width: newW, height: newH, autoSize: false, rotation: e.target.getParent()?.rotation() || 0 });
                      node.position({ x: newW / 2 - 10, y: newH / 2 - 10 });
                    }}
                    dragBoundFunc={(pos) => ({ x: Math.max(-w / 2 + 10, pos.x), y: Math.max(-h / 2 + 10, pos.y) })}
                  />
                )}
              </Group>
            );
          }
          if (obj.type === "rectangle") {
            const w = obj.width;
            const h = obj.height;
            const rot = obj.rotation ?? 0;
            const isSelected = selectedIds.includes(obj.id);
            return (
              <Group
                key={obj.id}
                ref={(el) => {
                  if (el) shapeRefs.current[obj.id] = el;
                }}
                x={obj.x + w / 2}
                y={obj.y + h / 2}
                offsetX={w / 2}
                offsetY={h / 2}
                rotation={rot}
                draggable
                onDragMove={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject({ id: obj.id, x: newX, y: newY });
                  // Force re-render to update connectors in real-time
                  e.target.getLayer()?.batchDraw();
                }}
                onDragEnd={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject(null);
                  onObjectUpdate({ ...obj, x: newX, y: newY, rotation: e.target.rotation() });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  
                  // Reset scale to 1 and apply it to width/height
                  node.scaleX(1);
                  node.scaleY(1);
                  
                  const newWidth = Math.max(20, w * scaleX);
                  const newHeight = Math.max(20, h * scaleY);
                  const newX = node.x() - newWidth / 2;
                  const newY = node.y() - newHeight / 2;
                  
                  onObjectUpdate({
                    ...obj,
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight,
                    rotation: node.rotation()
                  });
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect([obj.id]);
                }}
                onContextMenu={(e) => handleObjectContextMenu(e, obj.id)}
              >
                <Rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  fill={obj.color}
                  stroke={isSelected ? "#333" : undefined}
                  strokeWidth={isSelected ? 2 : 0}
                />
              </Group>
            );
          }
          if (obj.type === "circle") {
            const w = obj.width;
            const h = obj.height;
            const r = Math.min(w, h) / 2;
            const rot = obj.rotation ?? 0;
            const isSelected = selectedIds.includes(obj.id);
            return (
              <Group
                key={obj.id}
                ref={(el) => {
                  if (el) shapeRefs.current[obj.id] = el;
                }}
                x={obj.x + w / 2}
                y={obj.y + h / 2}
                offsetX={w / 2}
                offsetY={h / 2}
                rotation={rot}
                draggable
                onDragMove={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject({ id: obj.id, x: newX, y: newY });
                  // Force re-render to update connectors in real-time
                  e.target.getLayer()?.batchDraw();
                }}
                onDragEnd={(e) => {
                  const newX = e.target.x() - w / 2;
                  const newY = e.target.y() - h / 2;
                  setDraggingObject(null);
                  onObjectUpdate({ ...obj, x: newX, y: newY, rotation: e.target.rotation() });
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  
                  // Reset scale to 1 and apply it to width/height
                  node.scaleX(1);
                  node.scaleY(1);
                  
                  const newWidth = Math.max(20, w * scaleX);
                  const newHeight = Math.max(20, h * scaleY);
                  const newX = node.x() - newWidth / 2;
                  const newY = node.y() - newHeight / 2;
                  
                  onObjectUpdate({
                    ...obj,
                    x: newX,
                    y: newY,
                    width: newWidth,
                    height: newHeight,
                    rotation: node.rotation()
                  });
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect([obj.id]);
                }}
                onContextMenu={(e) => handleObjectContextMenu(e, obj.id)}
              >
                <Circle x={-w / 2 + r} y={-h / 2 + r} radius={r} fill={obj.color} stroke={isSelected ? "#333" : undefined} strokeWidth={isSelected ? 2 : 0} />
              </Group>
            );
          }
          if (obj.type === "line") {
            const w = obj.width;
            const h = obj.height;
            const rot = obj.rotation ?? 0;
            const isSelected = selectedIds.includes(obj.id);
            return (
              <Group
                key={obj.id}
                ref={(el) => {
                  if (el) shapeRefs.current[obj.id] = el;
                }}
                x={obj.x}
                y={obj.y}
                rotation={rot}
                draggable
                onDragMove={(e) => {
                  const newX = e.target.x();
                  const newY = e.target.y();
                  setDraggingObject({ id: obj.id, x: newX, y: newY });
                  // Force re-render to update connectors in real-time
                  e.target.getLayer()?.batchDraw();
                }}
                onDragEnd={(e) => {
                  const newX = e.target.x();
                  const newY = e.target.y();
                  setDraggingObject(null);
                  onObjectUpdate({ ...obj, x: newX, y: newY, rotation: e.target.rotation() });
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect([obj.id]);
                }}
                onContextMenu={(e) => handleObjectContextMenu(e, obj.id)}
              >
                <Line points={[0, 0, w, h]} stroke={isSelected ? "#333" : obj.color} strokeWidth={isSelected ? 4 : 2} lineCap="round" />
                {isSelected && (
                  <>
                    {/* Start point handle */}
                    <Circle
                      x={0}
                      y={0}
                      radius={12}
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth={2}
                      draggable
                      onDragMove={(e) => {
                        const newStartX = obj.x + e.target.x();
                        const newStartY = obj.y + e.target.y();
                        const newWidth = obj.x + obj.width - newStartX;
                        const newHeight = obj.y + obj.height - newStartY;
                        onObjectUpdate({
                          ...obj,
                          x: newStartX,
                          y: newStartY,
                          width: newWidth,
                          height: newHeight,
                        });
                      }}
                    />
                    {/* End point handle */}
                    <Circle
                      x={w}
                      y={h}
                      radius={12}
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth={2}
                      draggable
                      onDragMove={(e) => {
                        const newEndX = obj.x + e.target.x();
                        const newEndY = obj.y + e.target.y();
                        const newWidth = newEndX - obj.x;
                        const newHeight = newEndY - obj.y;
                        onObjectUpdate({
                          ...obj,
                          width: newWidth,
                          height: newHeight,
                        });
                      }}
                    />
                  </>
                )}
              </Group>
            );
          }
          // Render connectors
          if (obj.type === "connector") {
            const connector = obj as any;
            let startPt = connector.startPoint;
            let endPt = connector.endPoint;
            
            // If connected to objects, get their current positions using perimeter points
            let startObj = connector.startObjectId ? objects.find(o => o.id === connector.startObjectId) : null;
            let endObj = connector.endObjectId ? objects.find(o => o.id === connector.endObjectId) : null;
            
            // If an object is being dragged, use its temporary position
            if (draggingObject && startObj && startObj.type !== "connector") {
              if (startObj.id === draggingObject.id) {
                startObj = { ...startObj, x: draggingObject.x, y: draggingObject.y };
              }
            }
            if (draggingObject && endObj && endObj.type !== "connector") {
              if (endObj.id === draggingObject.id) {
                endObj = { ...endObj, x: draggingObject.x, y: draggingObject.y };
              }
            }
            
            if (startObj && endObj) {
              // Both objects exist - calculate optimal perimeter points
              const endCenter = getAnchorPoint(endObj, "center");
              const startCenter = getAnchorPoint(startObj, "center");
              startPt = getBestPerimeterPoint(startObj, endCenter);
              endPt = getBestPerimeterPoint(endObj, startCenter);
            } else if (startObj && !endObj) {
              // Only start object exists
              startPt = getBestPerimeterPoint(startObj, endPt);
            } else if (!startObj && endObj) {
              // Only end object exists
              endPt = getBestPerimeterPoint(endObj, startPt);
            }
            
            // Calculate path based on style
            let points: number[];
            const connectorStyle = connector.style || "straight";
            
            if (connectorStyle === "curved") {
              points = calculateCurvedPath(startPt, endPt);
            } else if (connectorStyle === "orthogonal") {
              points = calculateOrthogonalPath(startPt, endPt);
            } else {
              points = [startPt.x, startPt.y, endPt.x, endPt.y];
            }
            
            const isSelected = selectedIds.includes(obj.id);
            
            return (
              <Group 
                key={obj.id}
                ref={(el) => {
                  if (el) shapeRefs.current[obj.id] = el;
                }}
                onClick={(e) => {
                  e.cancelBubble = true;
                  onSelect([obj.id]);
                }}
                onContextMenu={(e) => handleObjectContextMenu(e, obj.id)}
              >
                <Line
                  points={points}
                  stroke={isSelected ? "#1e40af" : (connector.color || "#333")}
                  strokeWidth={isSelected ? 4 : (connector.strokeWidth || 2)}
                  lineCap="round"
                  lineJoin="round"
                  hitStrokeWidth={10}
                  tension={connectorStyle === "curved" ? 0.5 : 0}
                  bezier={connectorStyle === "curved"}
                />
                {connector.arrowEnd && (
                  <Line
                    points={[
                      endPt.x - 10 * Math.cos(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) - Math.PI / 6),
                      endPt.y - 10 * Math.sin(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) - Math.PI / 6),
                      endPt.x,
                      endPt.y,
                      endPt.x - 10 * Math.cos(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) + Math.PI / 6),
                      endPt.y - 10 * Math.sin(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) + Math.PI / 6),
                    ]}
                    stroke={isSelected ? "#1e40af" : (connector.color || "#333")}
                    strokeWidth={isSelected ? 4 : (connector.strokeWidth || 2)}
                    lineCap="round"
                    lineJoin="round"
                  />
                )}
              </Group>
            );
          }
          
          return null;
        })}
        {/* Show connector preview while drawing */}
        {drawingConnector && (
          <Line
            points={[
              drawingConnector.startPoint.x,
              drawingConnector.startPoint.y,
              drawingConnector.endPoint.x,
              drawingConnector.endPoint.y
            ]}
            stroke={selectedShapeColor}
            strokeWidth={2}
            lineCap="round"
            lineJoin="round"
            dash={[5, 5]}
          />
        )}
        {/* Standard Konva Transformer */}
        {selectedIds.length > 0 && (
          <Transformer
            ref={trRef}
            resizeEnabled={true}
            rotateEnabled={false}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            anchorSize={8}
            anchorStroke="#3b82f6"
            anchorFill="#ffffff"
            anchorStrokeWidth={2}
            borderStroke="#3b82f6"
            borderStrokeWidth={1}
          />
        )}
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
    {contextMenu && (
      <div
        style={{
          position: "fixed",
          left: contextMenu.x,
          top: contextMenu.y,
          background: "white",
          border: "1px solid #ddd",
          borderRadius: 4,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          zIndex: 1000,
          padding: 4,
        }}
        onMouseLeave={() => setContextMenu(null)}
      >
        <div style={{ padding: "4px 8px", fontSize: 12, color: "#666", borderBottom: "1px solid #eee" }}>
          Connector Style
        </div>
        <div style={{ display: "flex", gap: 4, padding: 4 }}>
          {(["straight", "curved", "orthogonal"] as const).map(style => (
            <button
              key={style}
              style={{
                flex: 1,
                padding: "4px 8px",
                background: connectorStyle === style ? "#3b82f6" : "#f3f4f6",
                color: connectorStyle === style ? "white" : "#333",
                border: "none",
                borderRadius: 2,
                cursor: "pointer",
                fontSize: 11,
                textTransform: "capitalize",
              }}
              onClick={() => setConnectorStyle(style)}
            >
              {style}
            </button>
          ))}
        </div>
        <button
          style={{
            display: "block",
            width: "100%",
            padding: "8px 12px",
            background: "white",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 14,
            borderTop: "1px solid #eee",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
          onMouseLeave={(e) => e.currentTarget.style.background = "white"}
          onClick={() => {
            const obj = objects.find(o => o.id === contextMenu.objectId);
            if (obj) {
              // Start with center, will be updated to proper edge when target is selected
              setDrawingConnector({
                startObjectId: contextMenu.objectId,
                startPoint: getAnchorPoint(obj, "center"),
                endPoint: { x: contextMenu.x, y: contextMenu.y }
              });
              setContextMenu(null);
            }
          }}
        >
          Add Connector
        </button>
        <button
          style={{
            display: "block",
            width: "100%",
            padding: "8px 12px",
            background: "white",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 14,
            borderTop: "1px solid #eee",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
          onMouseLeave={(e) => e.currentTarget.style.background = "white"}
          onClick={() => {
            if (onObjectDelete) {
              onObjectDelete(contextMenu.objectId);
            }
            setContextMenu(null);
          }}
        >
          Delete
        </button>
      </div>
    )}
    </>
  );
}
