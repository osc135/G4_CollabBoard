import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import type { BoardObject } from "@collabboard/shared";
import { SupabaseBoardService } from "./lib/supabase-boards";

interface RoomPreviewProps {
  roomId: string;
  width?: number;
  height?: number;
}

export function RoomPreview({ roomId, width = 280, height = 180 }: RoomPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch room state from Supabase
    SupabaseBoardService.getBoardPreview(roomId)
      .then(supabaseObjects => {
        console.log('Supabase objects:', supabaseObjects);
        
        // Convert Supabase objects to legacy format for rendering
        const legacyObjects = supabaseObjects.map(obj => {
          try {
            return SupabaseBoardService.convertToLegacyObject(obj);
          } catch (error) {
            console.error('Conversion error for object:', obj, error);
            return null;
          }
        }).filter(obj => obj !== null);
        
        console.log('Legacy objects:', legacyObjects);
        setObjects(legacyObjects);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load preview:', err);
        setObjects([]);
        setLoading(false);
      });
  }, [roomId]);

  useEffect(() => {
    if (!containerRef.current || loading || objects.length === 0) return;

    // Create mini Konva stage for preview
    const stage = new Konva.Stage({
      container: containerRef.current,
      width,
      height,
    });

    const layer = new Konva.Layer();
    stage.add(layer);

    // Calculate bounds of all objects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    objects.forEach(obj => {
      if (obj.type === "connector") return;
      
      const x = (obj as any).x || 0;
      const y = (obj as any).y || 0;
      const objWidth = (obj as any).width || 100;
      const objHeight = (obj as any).height || 100;
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + objWidth);
      maxY = Math.max(maxY, y + objHeight);
    });

    // Calculate scale to fit preview
    const boardWidth = maxX - minX || 1000;
    const boardHeight = maxY - minY || 1000;
    const scaleX = width / boardWidth;
    const scaleY = height / boardHeight;
    const scale = Math.min(scaleX, scaleY) * 0.8; // 80% to add padding

    // Center the content
    const offsetX = (width - boardWidth * scale) / 2 - minX * scale;
    const offsetY = (height - boardHeight * scale) / 2 - minY * scale;

    // Render objects at mini scale
    objects.forEach(obj => {
      if (obj.type === "sticky") {
        const rect = new Konva.Rect({
          x: obj.x * scale + offsetX,
          y: obj.y * scale + offsetY,
          width: obj.width * scale,
          height: obj.height * scale,
          fill: obj.color,
          cornerRadius: 4 * scale,
          shadowColor: "rgba(0,0,0,0.1)",
          shadowBlur: 3,
          shadowOffsetX: 1,
          shadowOffsetY: 1,
        });
        layer.add(rect);

        // Add tiny text indication
        if (obj.text) {
          const text = new Konva.Text({
            x: obj.x * scale + offsetX + 5 * scale,
            y: obj.y * scale + offsetY + 5 * scale,
            text: obj.text.substring(0, 50),
            fontSize: Math.max(8, 12 * scale),
            fontFamily: "Arial",
            fill: "#333",
            width: obj.width * scale - 10 * scale,
            height: obj.height * scale - 10 * scale,
            ellipsis: true,
            wrap: "word",
          });
          layer.add(text);
        }
      } else if (obj.type === "rectangle") {
        const rect = new Konva.Rect({
          x: obj.x * scale + offsetX,
          y: obj.y * scale + offsetY,
          width: obj.width * scale,
          height: obj.height * scale,
          stroke: obj.color,
          strokeWidth: Math.max(1, 2 * scale),
          cornerRadius: 4 * scale,
        });
        layer.add(rect);
      } else if (obj.type === "circle") {
        const circle = new Konva.Ellipse({
          x: obj.x * scale + offsetX + (obj.width * scale) / 2,
          y: obj.y * scale + offsetY + (obj.height * scale) / 2,
          radiusX: (obj.width * scale) / 2,
          radiusY: (obj.height * scale) / 2,
          stroke: obj.color,
          strokeWidth: Math.max(1, 2 * scale),
        });
        layer.add(circle);
      } else if (obj.type === "textbox" && obj.text) {
        const text = new Konva.Text({
          x: obj.x * scale + offsetX,
          y: obj.y * scale + offsetY,
          text: obj.text.substring(0, 100),
          fontSize: Math.max(8, 14 * scale),
          fontFamily: "Arial",
          fill: "#333",
          width: (obj.width || 200) * scale,
        });
        layer.add(text);
      }
    });

    layer.draw();

    return () => {
      stage.destroy();
    };
  }, [objects, loading, width, height]);

  if (loading) {
    return (
      <div style={{
        width,
        height,
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#718096",
        fontSize: "12px"
      }}>
        Loading preview...
      </div>
    );
  }

  if (objects.length === 0) {
    return (
      <div style={{
        width,
        height,
        background: "linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%)",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#a0aec0",
        fontSize: "13px",
        gap: "8px",
        border: "1px dashed #e2e8f0"
      }}>
        <span style={{ fontSize: "24px", opacity: 0.5 }}>📋</span>
        <span>Empty board</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      style={{
        width,
        height,
        background: "#fafafa",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid #e2e8f0"
      }}
    />
  );
}