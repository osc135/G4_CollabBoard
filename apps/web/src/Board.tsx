import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Circle, Line, Text, Group, Shape, Transformer } from "react-konva";
import Konva from "konva";
import type { BoardObject, Cursor, StickyNote, Shape as ShapeType, Textbox as TextboxType, Drawing } from "@collabboard/shared";

export type Tool = "pan" | "sticky" | "rectangle" | "circle" | "line" | "drawing";
export type BackgroundPattern =
  | "dots" | "lines" | "grid" | "none"
  | "blueprint" | "isometric" | "hex" | "lined"
  | "space" | "library" | "school" | "ocean" | "sunset"
  | "cork" | "nightcity" | "garden" | "snowfall";

// SVG data URI helpers for themed backgrounds
const svgDataUri = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const THEME_BACKGROUNDS: Record<string, { background: string; svg: (scale: number) => string; tileSize: number }> = {
  space: {
    background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #0f172a 100%)",
    tileSize: 200,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <circle cx="20" cy="30" r="1.2" fill="white" opacity="0.9"/>
      <circle cx="80" cy="15" r="0.8" fill="white" opacity="0.6"/>
      <circle cx="150" cy="45" r="1.5" fill="#93c5fd" opacity="0.8"/>
      <circle cx="45" cy="90" r="0.6" fill="white" opacity="0.5"/>
      <circle cx="120" cy="80" r="1" fill="white" opacity="0.7"/>
      <circle cx="170" cy="110" r="0.7" fill="#c4b5fd" opacity="0.6"/>
      <circle cx="30" cy="140" r="1.3" fill="white" opacity="0.8"/>
      <circle cx="95" cy="155" r="0.9" fill="#93c5fd" opacity="0.5"/>
      <circle cx="160" cy="170" r="1.1" fill="white" opacity="0.7"/>
      <circle cx="55" cy="180" r="0.5" fill="white" opacity="0.4"/>
      <circle cx="130" cy="130" r="1.4" fill="#fde68a" opacity="0.6"/>
      <circle cx="10" cy="70" r="0.7" fill="white" opacity="0.5"/>
      <circle cx="185" cy="25" r="0.9" fill="#c4b5fd" opacity="0.7"/>
      <circle cx="70" cy="60" r="0.4" fill="white" opacity="0.3"/>
      <circle cx="110" cy="190" r="1" fill="white" opacity="0.6"/>
    </svg>`,
  },
  library: {
    background: "linear-gradient(180deg, #3e2723 0%, #4e342e 50%, #3e2723 100%)",
    tileSize: 120,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
      <rect x="5" y="10" width="12" height="100" rx="1" fill="#5d4037" opacity="0.6"/>
      <rect x="20" y="5" width="10" height="105" rx="1" fill="#6d4c41" opacity="0.5"/>
      <rect x="33" y="15" width="14" height="95" rx="1" fill="#4e342e" opacity="0.7"/>
      <rect x="50" y="8" width="11" height="102" rx="1" fill="#795548" opacity="0.5"/>
      <rect x="64" y="12" width="13" height="98" rx="1" fill="#5d4037" opacity="0.6"/>
      <rect x="80" y="5" width="10" height="105" rx="1" fill="#6d4c41" opacity="0.4"/>
      <rect x="93" y="18" width="12" height="92" rx="1" fill="#4e342e" opacity="0.6"/>
      <rect x="108" y="10" width="9" height="100" rx="1" fill="#795548" opacity="0.5"/>
      <line x1="0" y1="110" x2="120" y2="110" stroke="#8d6e63" stroke-width="2" opacity="0.4"/>
      <line x1="0" y1="5" x2="120" y2="5" stroke="#8d6e63" stroke-width="1.5" opacity="0.3"/>
    </svg>`,
  },
  school: {
    background: "linear-gradient(180deg, #1b5e20 0%, #2e7d32 30%, #1b5e20 100%)",
    tileSize: 100,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.07)" stroke-width="0.5" stroke-dasharray="4,3"/>
      <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.07)" stroke-width="0.5" stroke-dasharray="4,3"/>
      <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.07)" stroke-width="0.5" stroke-dasharray="4,3"/>
      <line x1="0" y1="100" x2="100" y2="100" stroke="rgba(255,255,255,0.1)" stroke-width="0.8"/>
      <circle cx="15" cy="40" r="0.8" fill="rgba(255,255,255,0.12)"/>
      <circle cx="70" cy="20" r="0.5" fill="rgba(255,255,255,0.08)"/>
      <circle cx="50" cy="80" r="0.6" fill="rgba(255,255,255,0.1)"/>
      <circle cx="85" cy="65" r="0.4" fill="rgba(255,255,255,0.06)"/>
    </svg>`,
  },
  ocean: {
    background: "linear-gradient(180deg, #0c4a6e 0%, #0369a1 40%, #0e7490 70%, #0c4a6e 100%)",
    tileSize: 160,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
      <path d="M0,30 Q20,20 40,30 T80,30 T120,30 T160,30" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
      <path d="M0,60 Q20,50 40,60 T80,60 T120,60 T160,60" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.2"/>
      <path d="M-10,90 Q15,80 40,90 T80,90 T120,90 T160,90" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="1.5"/>
      <path d="M0,120 Q25,110 40,120 T80,120 T120,120 T160,120" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      <path d="M-5,150 Q20,140 40,150 T80,150 T120,150 T160,150" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1.3"/>
      <circle cx="130" cy="45" r="1" fill="rgba(255,255,255,0.06)"/>
      <circle cx="30" cy="105" r="0.8" fill="rgba(255,255,255,0.05)"/>
    </svg>`,
  },
  sunset: {
    background: "linear-gradient(180deg, #1e1b4b 0%, #7c2d12 30%, #ea580c 60%, #fbbf24 90%)",
    tileSize: 180,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
      <circle cx="20" cy="25" r="0.8" fill="rgba(255,255,255,0.15)"/>
      <circle cx="90" cy="15" r="0.6" fill="rgba(255,255,255,0.12)"/>
      <circle cx="155" cy="30" r="1" fill="rgba(255,255,255,0.1)"/>
      <circle cx="50" cy="10" r="0.5" fill="rgba(255,255,255,0.08)"/>
      <circle cx="130" cy="20" r="0.4" fill="rgba(255,255,255,0.1)"/>
      <path d="M0,140 Q30,130 60,140 T120,140 T180,140" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
      <path d="M0,160 Q25,150 50,160 T100,160 T150,160 T180,160" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="0.8"/>
    </svg>`,
  },
  cork: {
    background: "linear-gradient(135deg, #d4a574 0%, #c4956a 30%, #dbb58a 60%, #c9a070 100%)",
    tileSize: 150,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">
      <circle cx="25" cy="30" r="2" fill="rgba(0,0,0,0.08)"/>
      <circle cx="75" cy="20" r="1.5" fill="rgba(0,0,0,0.06)"/>
      <circle cx="120" cy="55" r="1.8" fill="rgba(0,0,0,0.07)"/>
      <circle cx="40" cy="80" r="1.2" fill="rgba(0,0,0,0.05)"/>
      <circle cx="100" cy="100" r="2.2" fill="rgba(0,0,0,0.08)"/>
      <circle cx="15" cy="120" r="1" fill="rgba(0,0,0,0.04)"/>
      <circle cx="135" cy="130" r="1.6" fill="rgba(0,0,0,0.06)"/>
      <circle cx="60" cy="140" r="1.3" fill="rgba(0,0,0,0.05)"/>
      <circle cx="90" cy="65" r="0.8" fill="rgba(255,255,255,0.06)"/>
      <circle cx="50" cy="110" r="0.9" fill="rgba(255,255,255,0.05)"/>
      <rect x="70" y="40" width="3" height="3" rx="1.5" fill="rgba(180,80,80,0.3)" transform="rotate(15,71.5,41.5)"/>
      <rect x="30" cy="95" width="3" height="3" rx="1.5" fill="rgba(80,80,180,0.25)" transform="rotate(-10,31.5,96.5)"/>
    </svg>`,
  },
  nightcity: {
    background: "linear-gradient(180deg, #0f172a 0%, #1e293b 60%, #334155 100%)",
    tileSize: 200,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <circle cx="30" cy="15" r="0.6" fill="white" opacity="0.4"/>
      <circle cx="90" cy="10" r="0.4" fill="white" opacity="0.3"/>
      <circle cx="160" cy="20" r="0.5" fill="white" opacity="0.35"/>
      <rect x="10" y="100" width="25" height="100" fill="#1e293b" stroke="#475569" stroke-width="0.5"/>
      <rect x="13" y="108" width="4" height="5" fill="#fbbf24" opacity="0.7"/>
      <rect x="20" y="108" width="4" height="5" fill="#fbbf24" opacity="0.5"/>
      <rect x="13" y="120" width="4" height="5" fill="#fbbf24" opacity="0.4"/>
      <rect x="20" y="125" width="4" height="5" fill="#93c5fd" opacity="0.5"/>
      <rect x="13" y="140" width="4" height="5" fill="#fbbf24" opacity="0.6"/>
      <rect x="50" y="80" width="35" height="120" fill="#1e293b" stroke="#475569" stroke-width="0.5"/>
      <rect x="55" y="88" width="5" height="6" fill="#fbbf24" opacity="0.6"/>
      <rect x="64" y="88" width="5" height="6" fill="#93c5fd" opacity="0.4"/>
      <rect x="73" y="88" width="5" height="6" fill="#fbbf24" opacity="0.5"/>
      <rect x="55" y="102" width="5" height="6" fill="#fbbf24" opacity="0.3"/>
      <rect x="64" y="102" width="5" height="6" fill="#fbbf24" opacity="0.7"/>
      <rect x="73" y="105" width="5" height="6" fill="#93c5fd" opacity="0.5"/>
      <rect x="55" y="118" width="5" height="6" fill="#fbbf24" opacity="0.5"/>
      <rect x="64" y="122" width="5" height="6" fill="#fbbf24" opacity="0.4"/>
      <rect x="55" y="140" width="5" height="6" fill="#93c5fd" opacity="0.3"/>
      <rect x="73" y="138" width="5" height="6" fill="#fbbf24" opacity="0.6"/>
      <rect x="100" y="120" width="20" height="80" fill="#1e293b" stroke="#475569" stroke-width="0.5"/>
      <rect x="104" y="128" width="4" height="5" fill="#fbbf24" opacity="0.5"/>
      <rect x="112" y="128" width="4" height="5" fill="#fbbf24" opacity="0.6"/>
      <rect x="104" y="142" width="4" height="5" fill="#93c5fd" opacity="0.4"/>
      <rect x="112" y="145" width="4" height="5" fill="#fbbf24" opacity="0.3"/>
      <rect x="140" y="90" width="30" height="110" fill="#1e293b" stroke="#475569" stroke-width="0.5"/>
      <rect x="145" y="98" width="5" height="6" fill="#fbbf24" opacity="0.6"/>
      <rect x="155" y="98" width="5" height="6" fill="#fbbf24" opacity="0.4"/>
      <rect x="145" y="112" width="5" height="6" fill="#93c5fd" opacity="0.5"/>
      <rect x="155" y="115" width="5" height="6" fill="#fbbf24" opacity="0.7"/>
      <rect x="145" y="130" width="5" height="6" fill="#fbbf24" opacity="0.3"/>
      <rect x="155" y="132" width="5" height="6" fill="#fbbf24" opacity="0.5"/>
      <rect x="180" y="140" width="20" height="60" fill="#1e293b" stroke="#475569" stroke-width="0.5"/>
      <rect x="184" y="148" width="4" height="5" fill="#fbbf24" opacity="0.5"/>
      <rect x="192" y="150" width="4" height="5" fill="#93c5fd" opacity="0.4"/>
    </svg>`,
  },
  garden: {
    background: "linear-gradient(180deg, #ecfccb 0%, #d9f99d 30%, #bef264 70%, #a3e635 100%)",
    tileSize: 180,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
      <ellipse cx="30" cy="40" rx="8" ry="5" fill="#22c55e" opacity="0.15" transform="rotate(-20,30,40)"/>
      <ellipse cx="25" cy="38" rx="7" ry="4" fill="#16a34a" opacity="0.12" transform="rotate(15,25,38)"/>
      <ellipse cx="120" cy="25" rx="9" ry="5" fill="#22c55e" opacity="0.13" transform="rotate(-35,120,25)"/>
      <ellipse cx="115" cy="28" rx="7" ry="4" fill="#16a34a" opacity="0.1" transform="rotate(10,115,28)"/>
      <path d="M28,45 Q28,55 28,60" stroke="#15803d" stroke-width="0.8" opacity="0.15" fill="none"/>
      <path d="M118,32 Q120,42 119,48" stroke="#15803d" stroke-width="0.8" opacity="0.12" fill="none"/>
      <circle cx="70" cy="80" r="3" fill="#f472b6" opacity="0.2"/>
      <circle cx="68" cy="78" r="2" fill="#fb7185" opacity="0.15"/>
      <circle cx="72" cy="82" r="1.5" fill="#f9a8d4" opacity="0.18"/>
      <circle cx="150" cy="110" r="2.5" fill="#a78bfa" opacity="0.18"/>
      <circle cx="148" cy="108" r="2" fill="#c4b5fd" opacity="0.14"/>
      <ellipse cx="80" cy="140" rx="10" ry="6" fill="#22c55e" opacity="0.12" transform="rotate(25,80,140)"/>
      <ellipse cx="160" cy="60" rx="6" ry="4" fill="#4ade80" opacity="0.1" transform="rotate(-15,160,60)"/>
      <circle cx="40" cy="120" r="1" fill="#fbbf24" opacity="0.15"/>
      <circle cx="130" cy="160" r="1.2" fill="#fbbf24" opacity="0.12"/>
    </svg>`,
  },
  snowfall: {
    background: "linear-gradient(180deg, #e0f2fe 0%, #bae6fd 40%, #e0f2fe 100%)",
    tileSize: 160,
    svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
      <circle cx="20" cy="25" r="2.5" fill="white" opacity="0.7"/>
      <circle cx="80" cy="15" r="1.8" fill="white" opacity="0.5"/>
      <circle cx="140" cy="35" r="3" fill="white" opacity="0.6"/>
      <circle cx="50" cy="60" r="2" fill="white" opacity="0.4"/>
      <circle cx="110" cy="55" r="1.5" fill="white" opacity="0.55"/>
      <circle cx="30" cy="90" r="2.8" fill="white" opacity="0.5"/>
      <circle cx="95" cy="85" r="2.2" fill="white" opacity="0.6"/>
      <circle cx="150" cy="95" r="1.6" fill="white" opacity="0.45"/>
      <circle cx="60" cy="120" r="2.5" fill="white" opacity="0.55"/>
      <circle cx="125" cy="125" r="3.2" fill="white" opacity="0.5"/>
      <circle cx="15" cy="145" r="1.8" fill="white" opacity="0.4"/>
      <circle cx="90" cy="150" r="2" fill="white" opacity="0.6"/>
      <path d="M20,25 L20,19 M20,25 L20,31 M20,25 L24,22 M20,25 L16,28 M20,25 L24,28 M20,25 L16,22" stroke="white" stroke-width="0.3" opacity="0.3"/>
      <path d="M140,35 L140,28 M140,35 L140,42 M140,35 L145,32 M140,35 L135,38 M140,35 L145,38 M140,35 L135,32" stroke="white" stroke-width="0.4" opacity="0.25"/>
      <path d="M125,125 L125,118 M125,125 L125,132 M125,125 L130,122 M125,125 L120,128 M125,125 L130,128 M125,125 L120,122" stroke="white" stroke-width="0.35" opacity="0.2"/>
    </svg>`,
  },
};

// Determine if a hex color is dark (for adapting pattern stroke colors)
function isDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function getBackgroundStyle(pattern: BackgroundPattern, currentScale: number, pos: { x: number; y: number }, bgColor: string): Pick<React.CSSProperties, 'backgroundImage' | 'backgroundSize' | 'backgroundPosition' | 'backgroundColor'> {
  const gridSize = 20 * currentScale;
  const bgPos = `${pos.x % gridSize}px ${pos.y % gridSize}px`;
  const dark = isDark(bgColor);
  // Adaptive colors: light strokes on dark backgrounds, dark strokes on light
  const stroke = dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
  const strokeLight = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const strokeMed = dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
  const strokeHeavy = dark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";

  // Themed backgrounds (self-contained color + pattern)
  const theme = THEME_BACKGROUNDS[pattern];
  if (theme) {
    const tileSize = theme.tileSize * currentScale;
    const themeBgPos = `${pos.x % tileSize}px ${pos.y % tileSize}px`;
    return {
      backgroundImage: `${svgDataUri(theme.svg(currentScale))}, ${theme.background}`,
      backgroundSize: `${tileSize}px ${tileSize}px, cover`,
      backgroundPosition: `${themeBgPos}, center`,
    };
  }

  // Pattern backgrounds (overlay on user-chosen bgColor)
  switch (pattern) {
    case "dots":
      return {
        backgroundImage: `radial-gradient(circle at ${currentScale}px ${currentScale}px, ${stroke} ${Math.max(0.5, currentScale * 0.8)}px, transparent 0)`,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: bgPos,
        backgroundColor: bgColor,
      };
    case "lines":
      return {
        backgroundImage: `
          linear-gradient(${strokeLight} ${Math.max(0.5, currentScale * 0.5)}px, transparent 0),
          linear-gradient(90deg, ${strokeLight} ${Math.max(0.5, currentScale * 0.5)}px, transparent 0)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: bgPos,
        backgroundColor: bgColor,
      };
    case "grid":
      return {
        backgroundImage: `
          linear-gradient(${strokeMed} ${Math.max(1, currentScale * 0.8)}px, transparent 0),
          linear-gradient(90deg, ${strokeMed} ${Math.max(1, currentScale * 0.8)}px, transparent 0)
        `,
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: bgPos,
        backgroundColor: bgColor,
      };
    case "blueprint": {
      const majorGrid = 100 * currentScale;
      const minorGrid = 20 * currentScale;
      const majorPos = `${pos.x % majorGrid}px ${pos.y % majorGrid}px`;
      const minorPos = `${pos.x % minorGrid}px ${pos.y % minorGrid}px`;
      return {
        backgroundImage: `
          linear-gradient(${strokeHeavy} ${Math.max(1, currentScale)}px, transparent 0),
          linear-gradient(90deg, ${strokeHeavy} ${Math.max(1, currentScale)}px, transparent 0),
          linear-gradient(${strokeLight} ${Math.max(0.5, currentScale * 0.5)}px, transparent 0),
          linear-gradient(90deg, ${strokeLight} ${Math.max(0.5, currentScale * 0.5)}px, transparent 0)
        `,
        backgroundSize: `${majorGrid}px ${majorGrid}px, ${majorGrid}px ${majorGrid}px, ${minorGrid}px ${minorGrid}px, ${minorGrid}px ${minorGrid}px`,
        backgroundPosition: `${majorPos}, ${majorPos}, ${minorPos}, ${minorPos}`,
        backgroundColor: bgColor,
      };
    }
    case "isometric": {
      const isoSize = 40 * currentScale;
      const isoPos = `${pos.x % isoSize}px ${pos.y % isoSize}px`;
      return {
        backgroundImage: `
          linear-gradient(30deg, ${strokeLight} ${Math.max(0.5, currentScale * 0.4)}px, transparent 0),
          linear-gradient(150deg, ${strokeLight} ${Math.max(0.5, currentScale * 0.4)}px, transparent 0),
          linear-gradient(90deg, ${strokeLight} ${Math.max(0.5, currentScale * 0.4)}px, transparent 0)
        `,
        backgroundSize: `${isoSize}px ${isoSize}px`,
        backgroundPosition: isoPos,
        backgroundColor: bgColor,
      };
    }
    case "hex": {
      const hexSize = 60 * currentScale;
      const hexPos = `${pos.x % hexSize}px ${pos.y % hexSize}px`;
      const hexStroke = dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
      const hexSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="52">
        <path d="M30,2 L56,15 L56,37 L30,50 L4,37 L4,15 Z" fill="none" stroke="${hexStroke}" stroke-width="0.8"/>
      </svg>`;
      return {
        backgroundImage: svgDataUri(hexSvg),
        backgroundSize: `${hexSize}px ${hexSize * 52/60}px`,
        backgroundPosition: hexPos,
        backgroundColor: bgColor,
      };
    }
    case "lined": {
      const lineSpacing = 28 * currentScale;
      const linePos = `0px ${pos.y % lineSpacing}px`;
      const lineStroke = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)";
      return {
        backgroundImage: `linear-gradient(${lineStroke} ${Math.max(0.5, currentScale * 0.5)}px, transparent 0)`,
        backgroundSize: `100% ${lineSpacing}px`,
        backgroundPosition: linePos,
        backgroundColor: bgColor,
      };
    }
    case "none":
    default:
      return {
        backgroundImage: "none",
        backgroundColor: bgColor,
      };
  }
}

interface BoardProps {
  objects: BoardObject[];
  cursors: Record<string, Cursor>;
  tool: Tool;
  selectedIds: string[];
  selectedStickyColor?: string;
  selectedShapeColor?: string;
  backgroundPattern?: BackgroundPattern;
  bgColor?: string;
  onSelect: (ids: string[]) => void;
  onObjectCreate: (obj: BoardObject) => void;
  onObjectUpdate: (obj: BoardObject) => void;
  onObjectDelete?: (id: string) => void;
  onCursorMove: (x: number, y: number) => void;
  onObjectDrag?: (objectId: string, x: number, y: number, rotation?: number) => void;
  onObjectDragEnd?: (objectId: string, x: number, y: number) => void;
  remoteSelections?: Record<string, { sessionId: string; selectedIds: string[] }>;
  remoteEditingMap?: Record<string, { sessionId: string; name: string }>;
  remoteDraggingIds?: Set<string>;
  onTextEdit?: (objectId: string, text: string) => void;
  onStickyLock?: (objectId: string) => void;
  onStickyUnlock?: (objectId: string) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  penType?: "pen" | "marker" | "highlighter";
  penStrokeWidth?: number;
}

const noop = () => {};

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
  // Connectors and drawings don't have standard x/y properties, return a default
  if (obj.type === "connector" || obj.type === "drawing") {
    return { x: 0, y: 0 };
  }

  const width = obj.type === "sticky" ? obj.width :
                obj.type === "rectangle" || obj.type === "circle" ? obj.width :
                obj.type === "line" ? 100 : 0;
  const height = obj.type === "sticky" ? obj.height :
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
  // Connectors and drawings don't have standard x/y properties, return target point as fallback
  if (obj.type === "connector" || obj.type === "drawing") {
    return targetPoint;
  }

  const width = obj.type === "sticky" ? obj.width :
                obj.type === "rectangle" || obj.type === "circle" ? obj.width :
                obj.type === "line" ? 100 : 0;
  const height = obj.type === "sticky" ? obj.height :
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

// Helper to find which object is under a point.
// Accepts a pre-sorted array (descending zIndex) to avoid re-sorting on every call.
function findObjectAtPoint(objects: BoardObject[], point: { x: number; y: number }): BoardObject | null {
  // Iterate in reverse (highest zIndex first) since sortedObjects is ascending
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    if (obj.type === "connector") continue;

    if (obj.type === "drawing") {
      const dPts = obj.points;
      let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
      for (let i = 0; i < dPts.length; i += 2) {
        if (dPts[i] < dMinX) dMinX = dPts[i];
        if (dPts[i] > dMaxX) dMaxX = dPts[i];
        if (dPts[i+1] < dMinY) dMinY = dPts[i+1];
        if (dPts[i+1] > dMaxY) dMaxY = dPts[i+1];
      }
      const padding = 10;
      if (point.x >= dMinX - padding && point.x <= dMaxX + padding &&
          point.y >= dMinY - padding && point.y <= dMaxY + padding) {
        return obj;
      }
      continue;
    }

    const width = obj.type === "sticky" ? obj.width :
                  obj.type === "rectangle" || obj.type === "circle" ? obj.width :
                  obj.type === "line" ? 100 : 0;
    const height = obj.type === "sticky" ? obj.height :
                   obj.type === "rectangle" || obj.type === "circle" ? obj.height :
                   obj.type === "line" ? 100 : 0;

    const padding = 10;
    if (point.x >= obj.x - padding && point.x <= obj.x + width + padding &&
        point.y >= obj.y - padding && point.y <= obj.y + height + padding) {
      return obj;
    }
  }
  return null;
}

// ============= Stable callback types for memoized components =============

interface ObjectHandlers {
  onDragMove: (id: string, x: number, y: number, rotation?: number) => void;
  onDragEnd: (id: string, obj: BoardObject, x: number, y: number, rotation: number) => void;
  onSelect: (id: string) => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>, id: string) => void;
  onTransform: (id: string, x: number, y: number, rotation: number) => void;
  onTransformEnd: (obj: BoardObject, scaleX: number, scaleY: number, rotation: number, nodeX: number, nodeY: number) => void;
  onCursorMove: (x: number, y: number) => void;
}

// ============= Memoized Sticky Note =============

interface MemoStickyProps extends ObjectHandlers {
  obj: StickyNote;
  isSelected: boolean;
  isHovered: boolean;
  isDragging: boolean;
  isEditing: boolean;
  isConnectorTarget: boolean;
  scale: number;
  remoteEditor?: { name: string; color: string };
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
  onStickyDragStart: (id: string) => void;
  onStickyDragEnd: (id: string, obj: BoardObject, x: number, y: number, rotation: number) => void;
  onDblClick: (id: string, text: string) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
}

const CACHE_PADDING = 20;
const CACHE_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);

const MemoStickyNote = React.memo<MemoStickyProps>(({
  obj, isSelected, isHovered, isDragging, isEditing, isConnectorTarget, scale, remoteEditor,
  shapeRefs, onDragMove, onStickyDragStart, onStickyDragEnd, onSelect, onContextMenu,
  onDblClick, onHoverEnter, onHoverLeave, onTransform, onTransformEnd, onCursorMove,
}) => {
  const w = obj.width;
  const h = obj.height;
  const rot = obj.rotation ?? 0;
  const cacheRef = useRef<Konva.Group | null>(null);

  useLayoutEffect(() => {
    const node = cacheRef.current;
    if (node) {
      try { node.cache({ offset: CACHE_PADDING, pixelRatio: CACHE_PIXEL_RATIO }); } catch (_) {}
    }
  });

  return (
    <Group
      key={obj.id}
      ref={(el) => {
        cacheRef.current = el;
        if (el) shapeRefs.current[obj.id] = el;
      }}
      x={obj.x + w / 2}
      y={obj.y + h / 2}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={rot}
      draggable
      onDragStart={() => onStickyDragStart(obj.id)}
      onDragMove={(e) => {
        const newX = e.target.x() - w / 2;
        const newY = e.target.y() - h / 2;
        onDragMove(obj.id, newX, newY);
        const stage = e.target.getStage();
        if (stage) {
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onDragEnd={(e) => {
        const newX = e.target.x() - w / 2;
        const newY = e.target.y() - h / 2;
        onStickyDragEnd(obj.id, obj, newX, newY, e.target.rotation());
        const stage = e.target.getStage();
        if (stage) {
          stage.setPointersPositions(e.evt);
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
      onDblClick={(e) => { e.cancelBubble = true; onDblClick(obj.id, obj.text); }}
      onPointerEnter={() => onHoverEnter(obj.id)}
      onPointerLeave={() => onHoverLeave()}
      onTransform={(e) => {
        const node = e.target;
        onTransform(obj.id, node.x() - w / 2, node.y() - h / 2, node.rotation());
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(obj, node.scaleX(), node.scaleY(), node.rotation(), node.x(), node.y());
        node.scaleX(1);
        node.scaleY(1);
      }}
    >
      <Rect width={w} height={h} fill="transparent" listening />
      {!isHovered ? (
        <Rect
          width={w}
          height={h}
          fill={obj.color}
          cornerRadius={6}
          shadowColor="rgba(0,0,0,0.15)"
          shadowBlur={8}
          shadowOffsetX={0}
          shadowOffsetY={3}
          shadowOpacity={0.5}
          stroke={isSelected ? "#1e293b" : isConnectorTarget ? "#3b82f6" : undefined}
          strokeWidth={isSelected ? 2.5 : isConnectorTarget ? 3 : 0}
          perfectDrawEnabled={false}
          shadowForStrokeEnabled={false}
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
            ctx.save();
            ctx.shadowColor = "rgba(0,0,0,0.15)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 3;
            ctx.fillStyle = obj.color;
            ctx.fill();
            ctx.restore();
            if (isSelected) {
              ctx.strokeStyle = "#1e293b";
              ctx.lineWidth = 2.5;
              ctx.stroke();
            } else if (isConnectorTarget) {
              ctx.strokeStyle = "#3b82f6";
              ctx.lineWidth = 3;
              ctx.stroke();
            }
          }}
          listening={false}
        />
      )}
      {!isDragging && (
        <Group x={w / 2} y={6} listening={false}>
          <Circle
            radius={6}
            fillLinearGradientStartPoint={{ x: -6, y: -6 }}
            fillLinearGradientEndPoint={{ x: 6, y: 6 }}
            fillLinearGradientColorStops={[0, "#ef4444", 1, "#dc2626"]}
            stroke="#7f1d1d"
            strokeWidth={0.5}
            shadowColor="rgba(0,0,0,0.3)"
            shadowBlur={3}
            shadowOffsetY={1}
            perfectDrawEnabled={false}
            shadowForStrokeEnabled={false}
          />
          <Circle radius={2} fill="#fca5a5" y={-1} />
          <Line points={[0, 6, 0, 16]} stroke="#7f1d1d" strokeWidth={2.5} lineCap="round" listening={false} />
        </Group>
      )}
      {!isEditing && (
        <Text
          text={obj.text}
          width={w - 16}
          height={h - 16}
          x={8}
          y={26}
          fontSize={14 / scale}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontStyle="500"
          fill="#1f2937"
          wrap="word"
          listening={false}
        />
      )}
      {remoteEditor && (
        <Group x={4} y={h - 22} listening={false}>
          <Rect
            width={Math.min(w - 8, remoteEditor.name.length * 7 + 16)}
            height={18}
            fill={remoteEditor.color}
            cornerRadius={9}
            opacity={0.9}
          />
          <Text
            text={`${remoteEditor.name} editing`}
            x={8}
            y={3}
            fontSize={10}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontStyle="bold"
            fill="#ffffff"
            listening={false}
          />
        </Group>
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
});

// ============= Memoized Rectangle =============

interface MemoRectProps extends ObjectHandlers {
  obj: ShapeType;
  isSelected: boolean;
  isConnectorTarget: boolean;
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
}

const MemoRectangle = React.memo<MemoRectProps>(({
  obj, isSelected, isConnectorTarget, shapeRefs,
  onDragMove, onDragEnd, onSelect, onContextMenu, onTransform, onTransformEnd, onCursorMove,
}) => {
  const w = obj.width;
  const h = obj.height;
  const rot = obj.rotation ?? 0;
  const cacheRef = useRef<Konva.Group | null>(null);

  useLayoutEffect(() => {
    const node = cacheRef.current;
    if (node) {
      try { node.cache({ offset: CACHE_PADDING, pixelRatio: CACHE_PIXEL_RATIO }); } catch (_) {}
    }
  });

  return (
    <Group
      key={obj.id}
      ref={(el) => {
        cacheRef.current = el;
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
        onDragMove(obj.id, newX, newY);
        const stage = e.target.getStage();
        if (stage) {
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onDragEnd={(e) => {
        const newX = e.target.x() - w / 2;
        const newY = e.target.y() - h / 2;
        onDragEnd(obj.id, obj, newX, newY, e.target.rotation());
        const stage = e.target.getStage();
        if (stage) {
          stage.setPointersPositions(e.evt);
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onTransform={(e) => {
        const node = e.target;
        onTransform(obj.id, node.x() - w / 2, node.y() - h / 2, node.rotation());
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(obj, node.scaleX(), node.scaleY(), node.rotation(), node.x(), node.y());
        node.scaleX(1);
        node.scaleY(1);
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
    >
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={obj.color}
        cornerRadius={8}
        shadowColor="rgba(0,0,0,0.12)"
        shadowBlur={6}
        shadowOffsetY={2}
        shadowOpacity={0.4}
        stroke={isSelected ? "#1e293b" : isConnectorTarget ? "#3b82f6" : undefined}
        strokeWidth={isSelected ? 2.5 : isConnectorTarget ? 3 : 0}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
    </Group>
  );
});

// ============= Memoized Circle =============

interface MemoCircleProps extends ObjectHandlers {
  obj: ShapeType;
  isSelected: boolean;
  isConnectorTarget: boolean;
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
}

const MemoCircleObj = React.memo<MemoCircleProps>(({
  obj, isSelected, isConnectorTarget, shapeRefs,
  onDragMove, onDragEnd, onSelect, onContextMenu, onTransform, onTransformEnd, onCursorMove,
}) => {
  const w = obj.width;
  const h = obj.height;
  const r = Math.min(w, h) / 2;
  const rot = obj.rotation ?? 0;
  const cacheRef = useRef<Konva.Group | null>(null);

  useLayoutEffect(() => {
    const node = cacheRef.current;
    if (node) {
      try { node.cache({ offset: CACHE_PADDING, pixelRatio: CACHE_PIXEL_RATIO }); } catch (_) {}
    }
  });

  return (
    <Group
      key={obj.id}
      ref={(el) => {
        cacheRef.current = el;
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
        onDragMove(obj.id, newX, newY);
        const stage = e.target.getStage();
        if (stage) {
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onDragEnd={(e) => {
        const newX = e.target.x() - w / 2;
        const newY = e.target.y() - h / 2;
        onDragEnd(obj.id, obj, newX, newY, e.target.rotation());
        const stage = e.target.getStage();
        if (stage) {
          stage.setPointersPositions(e.evt);
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onTransform={(e) => {
        const node = e.target;
        onTransform(obj.id, node.x() - w / 2, node.y() - h / 2, node.rotation());
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(obj, node.scaleX(), node.scaleY(), node.rotation(), node.x(), node.y());
        node.scaleX(1);
        node.scaleY(1);
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
    >
      <Circle
        x={-w / 2 + r}
        y={-h / 2 + r}
        radius={r}
        fill={obj.color}
        shadowColor="rgba(0,0,0,0.12)"
        shadowBlur={6}
        shadowOffsetY={2}
        shadowOpacity={0.4}
        stroke={isSelected ? "#1e293b" : isConnectorTarget ? "#3b82f6" : undefined}
        strokeWidth={isSelected ? 2.5 : isConnectorTarget ? 3 : 0}
        perfectDrawEnabled={false}
        shadowForStrokeEnabled={false}
      />
    </Group>
  );
});

// ============= Memoized Line =============

interface MemoLineProps extends ObjectHandlers {
  obj: ShapeType;
  isSelected: boolean;
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
  onLineUpdate: (obj: BoardObject) => void;
}

const MemoLineObj = React.memo<MemoLineProps>(({
  obj, isSelected, shapeRefs,
  onDragMove, onDragEnd, onSelect, onContextMenu, onTransform, onCursorMove, onLineUpdate,
}) => {
  const w = obj.width;
  const h = obj.height;
  const rot = obj.rotation ?? 0;
  const cacheRef = useRef<Konva.Group | null>(null);

  useLayoutEffect(() => {
    const node = cacheRef.current;
    if (node) {
      try { node.cache({ offset: CACHE_PADDING, pixelRatio: CACHE_PIXEL_RATIO }); } catch (_) {}
    }
  });

  return (
    <Group
      key={obj.id}
      ref={(el) => {
        cacheRef.current = el;
        if (el) shapeRefs.current[obj.id] = el;
      }}
      x={obj.x}
      y={obj.y}
      rotation={rot}
      draggable
      onDragMove={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        onDragMove(obj.id, newX, newY);
        const stage = e.target.getStage();
        if (stage) {
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onDragEnd={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        onDragEnd(obj.id, obj, newX, newY, e.target.rotation());
        const stage = e.target.getStage();
        if (stage) {
          stage.setPointersPositions(e.evt);
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onTransform={(e) => {
        const node = e.target;
        onTransform(obj.id, node.x(), node.y(), node.rotation());
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
    >
      <Line
        points={[0, 0, w, h]}
        stroke={isSelected ? "#1e293b" : (obj.color || "#3b82f6")}
        strokeWidth={isSelected ? 4 : 3}
        lineCap="round"
        shadowColor="rgba(0,0,0,0.1)"
        shadowBlur={4}
        shadowOffsetY={1}
        shadowOpacity={0.3}
        perfectDrawEnabled={false}
      />
      {isSelected && (
        <>
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
              onLineUpdate({ ...obj, x: newStartX, y: newStartY, width: newWidth, height: newHeight });
            }}
          />
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
              onLineUpdate({ ...obj, width: newEndX - obj.x, height: newEndY - obj.y });
            }}
          />
        </>
      )}
    </Group>
  );
});

// ============= Memoized Textbox =============

interface MemoTextboxProps extends ObjectHandlers {
  obj: TextboxType;
  isSelected: boolean;
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
}

const MemoTextbox = React.memo<MemoTextboxProps>(({
  obj, isSelected, shapeRefs,
  onDragMove, onDragEnd, onSelect, onContextMenu, onTransform, onTransformEnd, onCursorMove,
}) => {
  const fontSize = obj.fontSize || 48;
  const color = obj.color || '#1a1a1a';
  const rot = obj.rotation ?? 0;

  return (
    <Group
      key={obj.id}
      ref={(el) => { if (el) shapeRefs.current[obj.id] = el; }}
      x={obj.x}
      y={obj.y}
      rotation={rot}
      draggable
      onDragMove={(e) => {
        onDragMove(obj.id, e.target.x(), e.target.y());
        const stage = e.target.getStage();
        if (stage) {
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onDragEnd={(e) => {
        onDragEnd(obj.id, obj, e.target.x(), e.target.y(), e.target.rotation());
        const stage = e.target.getStage();
        if (stage) {
          stage.setPointersPositions(e.evt);
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
      onTransform={(e) => {
        const node = e.target;
        onTransform(obj.id, node.x(), node.y(), node.rotation());
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        onTransformEnd(obj as any, node.scaleX(), node.scaleY(), node.rotation(), node.x(), node.y());
        node.scaleX(1);
        node.scaleY(1);
      }}
    >
      <Text
        text={obj.text}
        fontSize={fontSize}
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontStyle="bold"
        fill={isSelected ? '#3b82f6' : color}
        wrap="word"
        width={obj.width}
        height={obj.height}
      />
    </Group>
  );
});

// ============= Memoized Connector =============

// ============= Memoized Drawing =============

interface MemoDrawingProps extends ObjectHandlers {
  obj: Drawing;
  isSelected: boolean;
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
  currentTool: Tool;
}

const MemoDrawing = React.memo<MemoDrawingProps>(({
  obj, isSelected, shapeRefs, currentTool,
  onDragMove, onDragEnd, onSelect, onContextMenu, onCursorMove,
}) => {
  const pts = obj.points;
  const isDrawingTool = currentTool === "drawing";
  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i], py = pts[i + 1];
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  // Translate points to local coords
  const localPoints: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    localPoints.push(pts[i] - minX, pts[i + 1] - minY);
  }

  const pType = obj.penType || "pen";
  const opacity = pType === "highlighter" ? 0.4 : 1;

  return (
    <Group
      x={minX}
      y={minY}
      ref={(el) => {
        if (el) shapeRefs.current[obj.id] = el;
      }}
      draggable={!isDrawingTool}
      listening={!isDrawingTool}
      onDragMove={(e) => {
        const newX = e.target.x();
        const newY = e.target.y();
        onDragMove(obj.id, newX, newY);
        const stage = e.target.getStage();
        if (stage) {
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onDragEnd={(e) => {
        const node = e.target;
        const dx = node.x() - minX;
        const dy = node.y() - minY;
        // Recompute absolute points with offset
        const newPts: number[] = [];
        for (let i = 0; i < pts.length; i += 2) {
          newPts.push(pts[i] + dx, pts[i + 1] + dy);
        }
        onDragEnd(obj.id, { ...obj, points: newPts } as any, node.x(), node.y(), 0);
        const stage = node.getStage();
        if (stage) {
          stage.setPointersPositions(e.evt);
          const point = stage.getRelativePointerPosition();
          if (point) onCursorMove(point.x, point.y);
        }
      }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
    >
      <Line
        points={localPoints}
        stroke={isSelected ? "#1e293b" : obj.color}
        strokeWidth={pType === "pen" ? obj.strokeWidth * 0.7 : obj.strokeWidth}
        tension={0}
        opacity={pType === "pen" ? 0.6 : opacity}
        lineCap={pType === "marker" ? "square" : "round"}
        lineJoin={pType === "marker" ? "miter" : "round"}
        hitStrokeWidth={Math.max(obj.strokeWidth, 15)}
        perfectDrawEnabled={false}
      />
      {isSelected && (
        <Rect
          x={-2}
          y={-2}
          width={maxX - minX + 4}
          height={maxY - minY + 4}
          stroke="#3b82f6"
          strokeWidth={1}
          dash={[4, 4]}
          listening={false}
        />
      )}
    </Group>
  );
});

interface MemoConnectorProps {
  obj: BoardObject;
  startPt: { x: number; y: number };
  endPt: { x: number; y: number };
  connectorStyle: string;
  connectorColor: string;
  strokeWidth: number;
  arrowEnd: boolean;
  isSelected: boolean;
  shapeRefs: React.MutableRefObject<Record<string, Konva.Group>>;
  onSelect: (id: string) => void;
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>, id: string) => void;
}

const MemoConnector = React.memo<MemoConnectorProps>(({
  obj, startPt, endPt, connectorStyle: cStyle, connectorColor, strokeWidth: sw,
  arrowEnd, isSelected, shapeRefs, onSelect, onContextMenu,
}) => {
  let points: number[];
  if (cStyle === "curved") {
    points = calculateCurvedPath(startPt, endPt);
  } else if (cStyle === "orthogonal") {
    points = calculateOrthogonalPath(startPt, endPt);
  } else {
    points = [startPt.x, startPt.y, endPt.x, endPt.y];
  }

  return (
    <Group
      key={obj.id}
      ref={(el) => { if (el) shapeRefs.current[obj.id] = el; }}
      onClick={(e) => { e.cancelBubble = true; onSelect(obj.id); }}
      onContextMenu={(e) => onContextMenu(e, obj.id)}
    >
      <Line
        points={points}
        stroke={isSelected ? "#1e40af" : (connectorColor || "#333")}
        strokeWidth={isSelected ? 4 : (sw || 2)}
        lineCap="round"
        lineJoin="round"
        hitStrokeWidth={10}
        tension={cStyle === "curved" ? 0.5 : 0}
        bezier={cStyle === "curved"}
      />
      {arrowEnd && (
        <Line
          points={[
            endPt.x - 10 * Math.cos(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) - Math.PI / 6),
            endPt.y - 10 * Math.sin(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) - Math.PI / 6),
            endPt.x,
            endPt.y,
            endPt.x - 10 * Math.cos(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) + Math.PI / 6),
            endPt.y - 10 * Math.sin(Math.atan2(endPt.y - startPt.y, endPt.x - startPt.x) + Math.PI / 6),
          ]}
          stroke={isSelected ? "#1e40af" : (connectorColor || "#333")}
          strokeWidth={isSelected ? 4 : (sw || 2)}
          lineCap="round"
          lineJoin="round"
        />
      )}
    </Group>
  );
});

// ============= Memoized Cursor Layer =============

interface MemoCursorLayerProps {
  cursors: Record<string, Cursor>;
}

const MemoCursorLayer = React.memo<MemoCursorLayerProps>(({ cursors }) => (
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
));

// ================================================================

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
  onObjectDrag,
  onObjectDragEnd,
  remoteSelections = {},
  remoteEditingMap = {},
  remoteDraggingIds = new Set(),
  onTextEdit,
  onStickyLock,
  onStickyUnlock,
  stageRef,
  selectedStickyColor,
  selectedShapeColor = "#3b82f6",
  backgroundPattern = "dots",
  bgColor = "#f8fafc",
  penType = "pen",
  penStrokeWidth = 3,
}: BoardProps) {
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [editingStickyId, setEditingStickyId] = useState<string | null>(null);
  const [editingStickyText, setEditingStickyText] = useState("");
  const stickyInputRef = useRef<HTMLTextAreaElement>(null);
  const [hoveredStickyId, setHoveredStickyId] = useState<string | null>(null);

  const [selectionBox, setSelectionBox] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  const ignoreNextClickRef = useRef(false);
  const shapeRefs = useRef<Record<string, Konva.Group>>({});
  const trRef = useRef<Konva.Transformer | null>(null);
  const [draggingStickyId, setDraggingStickyId] = useState<string | null>(null);
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
    objectId?: string;
    canvasX?: number;
    canvasY?: number;
  } | null>(null);
  const [clipboard, setClipboard] = useState<BoardObject | null>(null);
  const [connectorStyle, setConnectorStyle] = useState<"straight" | "curved" | "orthogonal">("curved");
  const [drawingLine, setDrawingLine] = useState<{
    id: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ id: string; points: number[] } | null>(null);

  // ============= Refs for unstable props (stable callback pattern) =============
  const onObjectUpdateRef = useRef(onObjectUpdate);
  onObjectUpdateRef.current = onObjectUpdate;
  const onObjectCreateRef = useRef(onObjectCreate);
  onObjectCreateRef.current = onObjectCreate;
  const onObjectDragRef = useRef(onObjectDrag);
  onObjectDragRef.current = onObjectDrag;
  const onObjectDragEndRef = useRef(onObjectDragEnd);
  onObjectDragEndRef.current = onObjectDragEnd;
  const onCursorMoveRef = useRef(onCursorMove);
  onCursorMoveRef.current = onCursorMove;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onStickyLockRef = useRef(onStickyLock);
  onStickyLockRef.current = onStickyLock;
  const onStickyUnlockRef = useRef(onStickyUnlock);
  onStickyUnlockRef.current = onStickyUnlock;
  const remoteEditingMapRef = useRef(remoteEditingMap);
  remoteEditingMapRef.current = remoteEditingMap;

  // ============= Refs for mutable state used in callbacks =============
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const drawingConnectorRef = useRef(drawingConnector);
  drawingConnectorRef.current = drawingConnector;
  const selectionBoxRef = useRef(selectionBox);
  selectionBoxRef.current = selectionBox;
  const drawingLineRef = useRef(drawingLine);
  drawingLineRef.current = drawingLine;
  const drawingPathRef = useRef(drawingPath);
  drawingPathRef.current = drawingPath;
  const penTypeRef = useRef(penType);
  penTypeRef.current = penType;
  const penStrokeWidthRef = useRef(penStrokeWidth);
  penStrokeWidthRef.current = penStrokeWidth;
  const contextMenuRef = useRef(contextMenu);
  contextMenuRef.current = contextMenu;
  const connectorStyleRef = useRef(connectorStyle);
  connectorStyleRef.current = connectorStyle;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  // ============= Object lookup Map for O(1) access =============
  const objectMap = useMemo(
    () => new Map(objects.map(o => [o.id, o])),
    [objects]
  );
  const objectMapRef = useRef(objectMap);
  objectMapRef.current = objectMap;

  // ============= O(1) selection lookup =============
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // ============= Remote selection color map (objectId → color) =============
  const remoteSelectionMap = useMemo(() => {
    const map: Record<string, string> = {};
    // Assign colors matching cursor order
    const cursorSessionIds = Object.keys(cursors);
    for (const [remoteSessionId, sel] of Object.entries(remoteSelections)) {
      const colorIndex = cursorSessionIds.indexOf(remoteSessionId);
      const color = getCursorColor(colorIndex >= 0 ? colorIndex : Object.keys(remoteSelections).indexOf(remoteSessionId));
      for (const objId of sel.selectedIds) {
        map[objId] = color;
      }
    }
    return map;
  }, [remoteSelections, cursors]);

  // ============= Remote editing indicator map (objectId → { name, color }) =============
  const remoteEditorMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    const cursorSessionIds = Object.keys(cursors);
    for (const [objId, editor] of Object.entries(remoteEditingMap)) {
      const colorIndex = cursorSessionIds.indexOf(editor.sessionId);
      const color = getCursorColor(colorIndex >= 0 ? colorIndex : 0);
      map[objId] = { name: editor.name, color };
    }
    return map;
  }, [remoteEditingMap, cursors]);

  // ============= Throttled drag state (connectors only need ~15fps) =============
  const draggingObjectRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const flushDragState = useCallback(() => {
    setDraggingObject(draggingObjectRef.current);
    dragRafRef.current = null;
  }, []);

  // ============= Stable callbacks for memoized children =============
  const stableOnDragMove = useCallback((id: string, x: number, y: number) => {
    draggingObjectRef.current = { id, x, y };
    // Throttle React state updates to ~15fps for connector re-renders
    if (!dragRafRef.current) {
      dragRafRef.current = requestAnimationFrame(flushDragState);
    }
    onObjectDragRef.current?.(id, x, y);
  }, [flushDragState]);

  const stableOnTransform = useCallback((id: string, x: number, y: number, rotation: number) => {
    onObjectDragRef.current?.(id, x, y, rotation);
  }, []);

  const stableOnDragEnd = useCallback((id: string, obj: BoardObject, x: number, y: number, rotation: number) => {
    draggingObjectRef.current = null;
    if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
    setDraggingObject(null);
    onObjectDragEndRef.current?.(id, x, y);
    if (obj.type === 'drawing') {
      onObjectUpdateRef.current(obj);
    } else if (obj.type !== 'connector') {
      onObjectUpdateRef.current({ ...obj, x, y, rotation });
    }
  }, []);

  const stableOnSelect = useCallback((id: string) => {
    onSelectRef.current([id]);
  }, []);

  const stableOnTransformEnd = useCallback((obj: BoardObject, scaleX: number, scaleY: number, rotation: number, nodeX: number, nodeY: number) => {
    if (obj.type === 'connector' || obj.type === 'drawing') return;
    if (obj.type === 'textbox') {
      const newWidth = obj.width ? Math.max(20, obj.width * scaleX) : undefined;
      const newHeight = obj.height ? Math.max(20, obj.height * scaleY) : undefined;
      onObjectUpdateRef.current({ ...obj, x: nodeX, y: nodeY, width: newWidth, height: newHeight, rotation });
      return;
    }
    const minSize = obj.type === 'sticky' ? 50 : 20;
    const newWidth = Math.max(minSize, obj.width * scaleX);
    const newHeight = Math.max(minSize, obj.height * scaleY);
    const newX = nodeX - newWidth / 2;
    const newY = nodeY - newHeight / 2;
    onObjectUpdateRef.current({ ...obj, x: newX, y: newY, width: newWidth, height: newHeight, rotation });
  }, []);

  const stableOnCursorMove = useCallback((x: number, y: number) => {
    const now = performance.now();
    if (now - lastCursorEmitRef.current < 33) return;
    lastCursorEmitRef.current = now;
    onCursorMoveRef.current(x, y);
  }, []);

  const stableOnStickyDragStart = useCallback((id: string) => {
    setDraggingStickyId(id);
  }, []);

  const stableOnStickyDragEnd = useCallback((id: string, obj: BoardObject, x: number, y: number, rotation: number) => {
    draggingObjectRef.current = null;
    if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = null; }
    setDraggingObject(null);
    setDraggingStickyId(null);
    onObjectDragEndRef.current?.(id, x, y);
    if (obj.type === 'drawing') {
      onObjectUpdateRef.current(obj);
    } else if (obj.type !== 'connector') {
      onObjectUpdateRef.current({ ...obj, x, y, rotation });
    }
  }, []);

  const stableOnStickyDblClick = useCallback((id: string, text: string) => {
    // Block editing if another user has this sticky locked
    if (remoteEditingMapRef.current[id]) return;
    onStickyLockRef.current?.(id);
    setEditingStickyId(id);
    setEditingStickyText(text === "New note" ? "" : text);
  }, []);

  const stableOnStickyHoverEnter = useCallback((id: string) => {
    setHoveredStickyId(id);
  }, []);

  const stableOnStickyHoverLeave = useCallback(() => {
    setHoveredStickyId(null);
  }, []);

  const stableOnLineUpdate = useCallback((obj: BoardObject) => {
    onObjectUpdateRef.current(obj);
  }, []);

  // ============= Memoized sorted objects =============
  const sortedObjects = useMemo(
    () => [...objects].sort((a, b) => ((a as any).zIndex ?? 0) - ((b as any).zIndex ?? 0)),
    [objects]
  );

  // ============= Viewport culling — only render visible objects =============
  // Track real viewport in a ref so panning never causes re-renders.
  // Only bump cullVersion when the viewport drifts far enough that objects
  // might enter / leave the visible area.
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastCullPosRef = useRef({ x: 0, y: 0, scale: 1 });
  const [cullVersion, setCullVersion] = useState(0);

  // How far (in screen px) the viewport must drift before we re-cull.
  // Large value = fewer re-renders, small = tighter culling.
  const CULL_DRIFT = 400;

  const maybeBumpCull = useCallback(() => {
    const { x, y, scale: s } = viewportRef.current;
    const last = lastCullPosRef.current;
    const dx = Math.abs(x - last.x);
    const dy = Math.abs(y - last.y);
    const ds = Math.abs(s - last.scale);
    if (dx > CULL_DRIFT || dy > CULL_DRIFT || ds > 0.3) {
      lastCullPosRef.current = { x, y, scale: s };
      setCullVersion(v => v + 1);
    }
  }, []);

  const visibleObjects = useMemo(() => {
    // Read from the ref (latest viewport) whenever cullVersion changes
    const { x: posX, y: posY, scale: s } = viewportRef.current;
    const vx = -posX / s;
    const vy = -posY / s;
    const vw = window.innerWidth / s;
    const vh = window.innerHeight / s;

    // Padding must be >= CULL_DRIFT/scale so objects that enter
    // during the drift window are already rendered.
    const pad = Math.max(400, CULL_DRIFT / s + 100);
    const left = vx - pad;
    const top = vy - pad;
    const right = vx + vw + pad;
    const bottom = vy + vh + pad;

    // Reuse objectMap for connector culling (already computed above)
    const objMap = objectMap;

    return sortedObjects.filter(obj => {
      if (obj.type === 'connector') {
        const c = obj as any;
        const startObj = c.startObjectId ? objMap.get(c.startObjectId) ?? null : null;
        const endObj = c.endObjectId ? objMap.get(c.endObjectId) ?? null : null;

        // Resolve start/end points from connected objects or fallback to stored points
        const sx = startObj && startObj.type !== 'connector' && startObj.type !== 'drawing' ? startObj.x : c.startPoint?.x ?? 0;
        const sy = startObj && startObj.type !== 'connector' && startObj.type !== 'drawing' ? startObj.y : c.startPoint?.y ?? 0;
        const ex = endObj && endObj.type !== 'connector' && endObj.type !== 'drawing' ? endObj.x : c.endPoint?.x ?? 0;
        const ey = endObj && endObj.type !== 'connector' && endObj.type !== 'drawing' ? endObj.y : c.endPoint?.y ?? 0;

        // Connector bounding box with extra padding for curves
        const connPad = 150; // accounts for curved/orthogonal paths overshooting
        const cLeft = Math.min(sx, ex) - connPad;
        const cTop = Math.min(sy, ey) - connPad;
        const cRight = Math.max(sx, ex) + (startObj && startObj.type !== 'connector' ? (startObj as any).width ?? 200 : 0) + connPad;
        const cBottom = Math.max(sy, ey) + (endObj && endObj.type !== 'connector' ? (endObj as any).height ?? 100 : 0) + connPad;

        return !(cRight < left || cLeft > right || cBottom < top || cTop > bottom);
      }

      if (obj.type === 'drawing') {
        const dPts = obj.points;
        let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
        for (let i = 0; i < dPts.length; i += 2) {
          if (dPts[i] < dMinX) dMinX = dPts[i];
          if (dPts[i] > dMaxX) dMaxX = dPts[i];
          if (dPts[i+1] < dMinY) dMinY = dPts[i+1];
          if (dPts[i+1] > dMaxY) dMaxY = dPts[i+1];
        }
        return !(dMaxX < left || dMinX > right || dMaxY < top || dMinY > bottom);
      }

      const ox = obj.x;
      const oy = obj.y;
      const ow = obj.type === 'sticky' ? obj.width :
                 (obj.type === 'rectangle' || obj.type === 'circle' || obj.type === 'line') ? obj.width : 200;
      const oh = obj.type === 'sticky' ? obj.height :
                 (obj.type === 'rectangle' || obj.type === 'circle' || obj.type === 'line') ? obj.height : 100;

      return !(ox + ow < left || ox > right || oy + oh < top || oy > bottom);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedObjects, objectMap, cullVersion]);

  // ============= Pre-compute connector endpoints so MemoConnector gets stable refs =============
  // Static endpoints — only recalculated when objects or visibility change (NOT during drag)
  const staticConnectorEndpoints = useMemo(() => {
    const map = new Map<string, { startPt: { x: number; y: number }; endPt: { x: number; y: number } }>();
    for (const obj of visibleObjects) {
      if (obj.type !== 'connector') continue;
      const connector = obj as any;
      let startPt = connector.startPoint;
      let endPt = connector.endPoint;

      const startObj = connector.startObjectId ? objectMap.get(connector.startObjectId) ?? null : null;
      const endObj = connector.endObjectId ? objectMap.get(connector.endObjectId) ?? null : null;

      if (startObj && endObj) {
        const endCenter = getAnchorPoint(endObj, 'center');
        const startCenter = getAnchorPoint(startObj, 'center');
        startPt = getBestPerimeterPoint(startObj, endCenter);
        endPt = getBestPerimeterPoint(endObj, startCenter);
      } else if (startObj && !endObj) {
        startPt = getBestPerimeterPoint(startObj, endPt);
      } else if (!startObj && endObj) {
        endPt = getBestPerimeterPoint(endObj, startPt);
      }

      map.set(obj.id, { startPt, endPt });
    }
    return map;
  }, [visibleObjects, objectMap]);

  // During drag, only patch the 1-2 connectors attached to the dragged object
  const connectorEndpoints = useMemo(() => {
    if (!draggingObject) return staticConnectorEndpoints;

    const dragId = draggingObject.id;
    let needsPatch = false;
    // Quick scan: are any visible connectors attached to the dragged object?
    for (const obj of visibleObjects) {
      if (obj.type !== 'connector') continue;
      const c = obj as any;
      if (c.startObjectId === dragId || c.endObjectId === dragId) {
        needsPatch = true;
        break;
      }
    }
    if (!needsPatch) return staticConnectorEndpoints;

    // Clone map and only recompute affected connectors
    const map = new Map(staticConnectorEndpoints);
    for (const obj of visibleObjects) {
      if (obj.type !== 'connector') continue;
      const connector = obj as any;
      if (connector.startObjectId !== dragId && connector.endObjectId !== dragId) continue;

      let startPt = connector.startPoint;
      let endPt = connector.endPoint;

      let startObj = connector.startObjectId ? objectMap.get(connector.startObjectId) ?? null : null;
      let endObj = connector.endObjectId ? objectMap.get(connector.endObjectId) ?? null : null;

      if (startObj && startObj.type !== 'connector' && startObj.type !== 'drawing' && startObj.id === dragId) {
        startObj = { ...startObj, x: draggingObject.x, y: draggingObject.y } as typeof startObj;
      }
      if (endObj && endObj.type !== 'connector' && endObj.type !== 'drawing' && endObj.id === dragId) {
        endObj = { ...endObj, x: draggingObject.x, y: draggingObject.y } as typeof endObj;
      }

      if (startObj && endObj) {
        const endCenter = getAnchorPoint(endObj, 'center');
        const startCenter = getAnchorPoint(startObj, 'center');
        startPt = getBestPerimeterPoint(startObj, endCenter);
        endPt = getBestPerimeterPoint(endObj, startCenter);
      } else if (startObj && !endObj) {
        startPt = getBestPerimeterPoint(startObj, endPt);
      } else if (!startObj && endObj) {
        endPt = getBestPerimeterPoint(endObj, startPt);
      }

      map.set(obj.id, { startPt, endPt });
    }
    return map;
  }, [staticConnectorEndpoints, draggingObject, visibleObjects, objectMap]);

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

  // Track viewport position during pan — ref only, no React state updates during drag
  const handleStageDragMove = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (!stage || e.target !== stage) return;
    viewportRef.current = { x: stage.x(), y: stage.y(), scale: stage.scaleX() };
    maybeBumpCull();
  }, [maybeBumpCull]);

  const handleStageDragEnd = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    if (stage && e.target === stage) {
      const pos = { x: e.target.x(), y: e.target.y() };
      setPosition(pos);
      viewportRef.current = { ...viewportRef.current, ...pos };
      maybeBumpCull();
    }
  }, [maybeBumpCull]);

  useEffect(() => {
    if (editingStickyId) {
      const t = setTimeout(() => stickyInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [editingStickyId]);
  // Removed textbox editing effect

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
      const transformableIds = selectedIds.filter(id => {
        const obj = objectMap.get(id);
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
    const newPos = { x: pointer.x - mousePointTo.x * clamped, y: pointer.y - mousePointTo.y * clamped };
    setPosition(newPos);
    viewportRef.current = { x: newPos.x, y: newPos.y, scale: clamped };
    maybeBumpCull();
  }, [maybeBumpCull]);

  // Throttled cursor emission — cap at ~30fps to avoid flooding
  const lastCursorEmitRef = useRef(0);
  const throttledCursorMove = useCallback(
    (x: number, y: number) => {
      const now = performance.now();
      if (now - lastCursorEmitRef.current < 33) return; // ~30fps
      lastCursorEmitRef.current = now;
      onCursorMoveRef.current(x, y);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const point = stage.getRelativePointerPosition();
      if (point) throttledCursorMove(point.x, point.y);
    },
    [throttledCursorMove]
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.target !== e.target.getStage()) return;
      const curTool = toolRef.current;
      if (curTool === "pan" && !e.evt.shiftKey) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      if (curTool === "drawing") {
        setDrawingPath({ id: `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, points: [pos.x, pos.y] });
      } else if (curTool === "line") {
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
    []
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      if (drawingPathRef.current) {
        const dpts = drawingPathRef.current.points;
        const dx = pos.x - dpts[dpts.length - 2];
        const dy = pos.y - dpts[dpts.length - 1];
        if (dx * dx + dy * dy >= 9) {
          setDrawingPath(prev => prev ? { ...prev, points: [...prev.points, pos.x, pos.y] } : null);
        }
      } else if (drawingLineRef.current) {
        setDrawingLine((prev) => (prev ? { ...prev, currentX: pos.x, currentY: pos.y } : null));
      } else if (selectionBoxRef.current) {
        setSelectionBox((prev) => (prev ? { ...prev, end: { x: pos.x, y: pos.y } } : null));
      }
    },
    []
  );

  const handleStagePointerMove = useCallback(
    (e: Konva.KonvaEventObject<PointerEvent>) => {
      handlePointerMove(e);
      handleStageMouseMove(e as any);

      const dc = drawingConnectorRef.current;
      if (dc) {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;

        const curObjects = objectsRef.current;
        const curObjectMap = objectMapRef.current;
        const targetObj = findObjectAtPoint(curObjects, pos);
        setHoveredObjectId(targetObj?.id || null);

        const startObj = dc.startObjectId ? curObjectMap.get(dc.startObjectId) ?? null : null;
        let startPoint = dc.startPoint;
        let endPoint = pos;

        if (targetObj) {
          if (startObj) {
            const anchors = getBestAnchor(startObj, targetObj);
            startPoint = getAnchorPoint(startObj, anchors.startAnchor);
            endPoint = getAnchorPoint(targetObj, anchors.endAnchor);
          } else {
            endPoint = getAnchorPoint(targetObj, "center");
          }
        } else if (startObj) {
          const mousePoint = pos;
          const anchors = getBestAnchor(startObj, { ...startObj, x: mousePoint.x - 50, y: mousePoint.y - 50, width: 100, height: 100 } as any);
          startPoint = getAnchorPoint(startObj, anchors.startAnchor);
          endPoint = mousePoint;
        }

        setDrawingConnector(prev => prev ? { ...prev, startPoint, endPoint } : null);
      } else {
        setHoveredObjectId(null);
      }
    },
    [handlePointerMove, handleStageMouseMove]
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const dc = drawingConnectorRef.current;
      // Handle connector completion first (before checking if target is stage)
      if (dc) {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;

        const curObjects = objectsRef.current;
        const curObjectMap = objectMapRef.current;
        const targetObj = findObjectAtPoint(curObjects, pos);
        const startObj = dc.startObjectId ? curObjectMap.get(dc.startObjectId) ?? null : null;

        let startAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let endAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let startPoint = dc.startPoint;
        let endPoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;

        if (startObj && targetObj) {
          const anchors = getBestAnchor(startObj, targetObj);
          startAnchor = anchors.startAnchor;
          endAnchor = anchors.endAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
          endPoint = getAnchorPoint(targetObj, endAnchor);
        } else if (startObj) {
          const mousePoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;
          const anchors = getBestAnchor(startObj, { ...startObj, x: mousePoint.x - 50, y: mousePoint.y - 50, width: 100, height: 100 } as any);
          startAnchor = anchors.startAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
        }

        const newConnector = {
          id: `connector-${Date.now()}`,
          type: "connector" as const,
          startObjectId: dc.startObjectId,
          endObjectId: targetObj?.id || null,
          startPoint,
          endPoint,
          startAnchor,
          endAnchor,
          style: connectorStyleRef.current,
          color: selectedShapeColor,
          strokeWidth: 2,
          arrowEnd: true,
        };
        onObjectCreateRef.current(newConnector as any);
        setDrawingConnector(null);
        return;
      }

      // Handle drawing path completion
      const dp = drawingPathRef.current;
      if (dp) {
        if (dp.points.length >= 4) {  // at least 2 points
          onObjectCreateRef.current({
            id: dp.id, type: "drawing", points: dp.points,
            color: selectedShapeColor, strokeWidth: penStrokeWidthRef.current,
            penType: penTypeRef.current,
          } as any);
        }
        setDrawingPath(null);
        return;
      }

      if (e.target !== e.target.getStage()) return;

      // Handle line creation
      const dl = drawingLineRef.current;
      if (dl) {
        const width = dl.currentX - dl.startX;
        const height = dl.currentY - dl.startY;

        if (Math.abs(width) >= 10 || Math.abs(height) >= 10) {
          const normalizedX = Math.min(dl.startX, dl.currentX);
          const normalizedY = Math.min(dl.startY, dl.currentY);
          const normalizedWidth = Math.abs(width);
          const normalizedHeight = Math.abs(height);

          onObjectCreateRef.current({
            id: dl.id,
            type: "line",
            x: normalizedX,
            y: normalizedY,
            width: normalizedWidth,
            height: normalizedHeight,
            color: selectedShapeColor,
            rotation: 0,
          });
        }
        setDrawingLine(null);
        return;
      }

      const sb = selectionBoxRef.current;
      if (!sb) return;
      const { start, end } = sb;
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
      objectsRef.current.forEach((obj) => {
        if (obj.type === "sticky") {
          const w = obj.width ?? 200;
          const h = obj.height ?? 80;
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
        } else if (obj.type === "drawing") {
          const dObj = obj as Drawing;
          let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
          for (let i = 0; i < dObj.points.length; i += 2) {
            if (dObj.points[i] < dMinX) dMinX = dObj.points[i];
            if (dObj.points[i] > dMaxX) dMaxX = dObj.points[i];
            if (dObj.points[i+1] < dMinY) dMinY = dObj.points[i+1];
            if (dObj.points[i+1] > dMaxY) dMaxY = dObj.points[i+1];
          }
          const intersects = !(dMaxX < minX || dMinX > maxX || dMaxY < minY || dMinY > maxY);
          if (intersects) ids.push(obj.id);
        }
      });
      onSelectRef.current(ids);
    },
    [selectedShapeColor]
  );

  const handleStageContextMenu = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pos = stage?.getRelativePointerPosition();
    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      canvasX: pos?.x,
      canvasY: pos?.y,
    });
  }, []);

  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Close context menu on any left click
      if (contextMenuRef.current) {
        setContextMenu(null);
      }

      const dc = drawingConnectorRef.current;
      // If we're drawing a connector, complete it
      if (dc) {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = stage.getRelativePointerPosition();
        if (!pos) return;

        const curObjects = objectsRef.current;
        const curObjectMap = objectMapRef.current;
        const targetObj = findObjectAtPoint(curObjects, pos);
        const startObj = dc.startObjectId ? curObjectMap.get(dc.startObjectId) ?? null : null;

        let startAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let endAnchor: "top" | "right" | "bottom" | "left" | "center" = "center";
        let startPoint = dc.startPoint;
        let endPoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;

        if (startObj && targetObj) {
          const anchors = getBestAnchor(startObj, targetObj);
          startAnchor = anchors.startAnchor;
          endAnchor = anchors.endAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
          endPoint = getAnchorPoint(targetObj, endAnchor);
        } else if (startObj) {
          const mousePoint = targetObj ? getAnchorPoint(targetObj, "center") : pos;
          const anchors = getBestAnchor(startObj, { ...startObj, x: mousePoint.x - 50, y: mousePoint.y - 50, width: 100, height: 100 } as any);
          startAnchor = anchors.startAnchor;
          startPoint = getAnchorPoint(startObj, startAnchor);
        }

        const newConnector = {
          id: `connector-${Date.now()}`,
          type: "connector" as const,
          startObjectId: dc.startObjectId,
          endObjectId: targetObj?.id || null,
          startPoint,
          endPoint,
          startAnchor,
          endAnchor,
          style: connectorStyleRef.current,
          color: selectedShapeColor,
          strokeWidth: 2,
          arrowEnd: true,
        };
        onObjectCreateRef.current(newConnector as any);
        setDrawingConnector(null);
        return;
      }

      if (e.target !== e.target.getStage()) return;
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }
      onSelectRef.current([]);
      const curTool = toolRef.current;
      if (curTool === "pan" || curTool === "drawing") return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;
      if (curTool === "sticky") {
        onObjectCreateRef.current({
          id: `sticky-${Date.now()}`,
          type: "sticky",
          x: pos.x - 100,
          y: pos.y - 100,
          width: 200,
          height: 200,
          text: "New note",
          color: selectedStickyColor ?? getRandomStickyColor(),
          rotation: 0,
        });
      } else if (curTool === "rectangle") {
        onObjectCreateRef.current({
          id: `rect-${Date.now()}`,
          type: "rectangle",
          x: pos.x,
          y: pos.y,
          width: 120,
          height: 80,
          color: selectedShapeColor,
          rotation: 0,
        });
      } else if (curTool === "circle") {
        onObjectCreateRef.current({
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
    [selectedStickyColor, selectedShapeColor]
  );

  const stickyObj = editingStickyId ? (objectMap.get(editingStickyId) as StickyNote | undefined) ?? null : null;
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

  const editingStickyIdRef = useRef(editingStickyId);
  editingStickyIdRef.current = editingStickyId;
  const editingStickyTextRef = useRef(editingStickyText);
  editingStickyTextRef.current = editingStickyText;

  const handleStickyBlur = useCallback(() => {
    const eid = editingStickyIdRef.current;
    if (!eid) return;
    const obj = objectMapRef.current.get(eid) as StickyNote | undefined;
    if (obj) onObjectUpdateRef.current({ ...obj, text: editingStickyTextRef.current });
    onStickyUnlockRef.current?.(eid);
    setEditingStickyId(null);
  }, []);


  const stickyEditor =
    editingStickyId && stickyObj && stickyEditRect
      ? createPortal(
          <textarea
            ref={stickyInputRef}
            value={editingStickyText}
            onChange={(e) => {
              setEditingStickyText(e.target.value);
              if (editingStickyId && onTextEdit) onTextEdit(editingStickyId, e.target.value);
            }}
            onBlur={handleStickyBlur}
            onInput={(e) => {
              // Auto-resize sticky note based on content
              const target = e.target as HTMLTextAreaElement;
              
              // Temporarily set height to auto to get the actual content height
              const originalHeight = target.style.height;
              target.style.height = 'auto';
              const scrollHeight = target.scrollHeight;
              target.style.height = originalHeight;
              
              // Calculate the needed height (with padding for pin area)
              const neededHeight = Math.max(80, Math.ceil((scrollHeight / scale) + 32));
              
              // Update if height needs to change (expand or shrink)
              if (neededHeight !== stickyObj.height) {
                onObjectUpdate({ ...stickyObj, height: neededHeight });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditingStickyText(stickyObj.text === "New note" ? "" : stickyObj.text);
                onStickyUnlock?.(editingStickyId!);
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

  return (
    <>
    <div
      ref={(el) => {
        if (el && stageRef.current) {
          const updateBackground = () => {
            const stage = stageRef.current;
            if (stage) {
              const currentScale = stage.scaleX();
              const currentPos = { x: stage.x(), y: stage.y() };
              const bg = getBackgroundStyle(backgroundPattern, currentScale, currentPos, bgColor);
              el.style.backgroundImage = bg.backgroundImage ?? "";
              el.style.backgroundSize = bg.backgroundSize as string ?? "";
              el.style.backgroundPosition = bg.backgroundPosition as string ?? "";
              el.style.backgroundColor = bg.backgroundColor ?? "";
            }
          };

          const stage = stageRef.current;
          if (stage) {
            updateBackground();
            stage.on('dragmove', updateBackground);
            stage.on('wheel', updateBackground);
          }
        }
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        ...getBackgroundStyle(backgroundPattern, scale, position, bgColor),
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
    <Stage
      ref={stageRef as React.RefObject<Konva.Stage>}
      width={window.innerWidth}
      height={window.innerHeight}
      scaleX={scale}
      scaleY={scale}
      x={position.x}
      y={position.y}
      draggable={tool === "pan" && !selectionBox}
      style={{ position: 'relative', zIndex: 1 }}
      onWheel={handleWheel}
      onPointerMove={handleStagePointerMove}
      onMouseDown={handleStageMouseDown}
      onMouseUp={handleStageMouseUp}
      onClick={handleStageClick}
      onContextMenu={handleStageContextMenu}
      onDragStart={noop}
      onDragMove={handleStageDragMove}
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
        {drawingPath && (
          <Line
            points={drawingPath.points}
            stroke={selectedShapeColor}
            strokeWidth={penType === "pen" ? penStrokeWidth * 0.7 : penStrokeWidth}
            opacity={penType === "pen" ? 0.6 : penType === "highlighter" ? 0.4 : 1}
            lineCap={penType === "marker" ? "square" : "round"}
            lineJoin={penType === "marker" ? "miter" : "round"}
            tension={0}
            listening={false}
            perfectDrawEnabled={false}
          />
        )}
        {visibleObjects.map((obj) => {
          if (obj.type === "sticky") {
            const stickyObj = obj as StickyNote;
            return (
              <MemoStickyNote
                key={obj.id}
                obj={stickyObj}
                isSelected={selectedIdsSet.has(obj.id)}
                isHovered={hoveredStickyId === obj.id}
                isDragging={draggingStickyId === obj.id || remoteDraggingIds.has(obj.id)}
                isEditing={editingStickyId === obj.id}
                isConnectorTarget={hoveredObjectId === obj.id && !!drawingConnector}
                scale={scale}
                remoteEditor={remoteEditorMap[obj.id]}
                shapeRefs={shapeRefs}
                onDragMove={stableOnDragMove}
                onDragEnd={stableOnDragEnd}
                onStickyDragStart={stableOnStickyDragStart}
                onStickyDragEnd={stableOnStickyDragEnd}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
                onDblClick={stableOnStickyDblClick}
                onHoverEnter={stableOnStickyHoverEnter}
                onHoverLeave={stableOnStickyHoverLeave}
                onTransform={stableOnTransform}
                onTransformEnd={stableOnTransformEnd}
                onCursorMove={stableOnCursorMove}
              />
            );
          }
          if (obj.type === "rectangle") {
            const rectObj = obj as ShapeType;
            return (
              <MemoRectangle
                key={obj.id}
                obj={rectObj}
                isSelected={selectedIdsSet.has(obj.id)}
                isConnectorTarget={hoveredObjectId === obj.id && !!drawingConnector}
                shapeRefs={shapeRefs}
                onDragMove={stableOnDragMove}
                onDragEnd={stableOnDragEnd}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
                onTransform={stableOnTransform}
                onTransformEnd={stableOnTransformEnd}
                onCursorMove={stableOnCursorMove}
              />
            );
          }
          if (obj.type === "circle") {
            const circleObj = obj as ShapeType;
            return (
              <MemoCircleObj
                key={obj.id}
                obj={circleObj}
                isSelected={selectedIdsSet.has(obj.id)}
                isConnectorTarget={hoveredObjectId === obj.id && !!drawingConnector}
                shapeRefs={shapeRefs}
                onDragMove={stableOnDragMove}
                onDragEnd={stableOnDragEnd}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
                onTransform={stableOnTransform}
                onTransformEnd={stableOnTransformEnd}
                onCursorMove={stableOnCursorMove}
              />
            );
          }
          if (obj.type === "line") {
            const lineObj = obj as ShapeType;
            return (
              <MemoLineObj
                key={obj.id}
                obj={lineObj}
                isSelected={selectedIdsSet.has(obj.id)}
                shapeRefs={shapeRefs}
                onDragMove={stableOnDragMove}
                onDragEnd={stableOnDragEnd}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
                onTransform={stableOnTransform}
                onTransformEnd={stableOnTransformEnd}
                onCursorMove={stableOnCursorMove}
                onLineUpdate={stableOnLineUpdate}
              />
            );
          }
          if (obj.type === "textbox") {
            const textObj = obj as TextboxType;
            return (
              <MemoTextbox
                key={obj.id}
                obj={textObj}
                isSelected={selectedIdsSet.has(obj.id)}
                shapeRefs={shapeRefs}
                onDragMove={stableOnDragMove}
                onDragEnd={stableOnDragEnd}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
                onTransform={stableOnTransform}
                onTransformEnd={stableOnTransformEnd}
                onCursorMove={stableOnCursorMove}
              />
            );
          }
          if (obj.type === "drawing") {
            const drawObj = obj as Drawing;
            return (
              <MemoDrawing
                key={obj.id}
                obj={drawObj}
                isSelected={selectedIdsSet.has(obj.id)}
                shapeRefs={shapeRefs}
                currentTool={tool}
                onDragMove={stableOnDragMove}
                onDragEnd={stableOnDragEnd}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
                onTransform={stableOnTransform}
                onTransformEnd={stableOnTransformEnd}
                onCursorMove={stableOnCursorMove}
              />
            );
          }
          if (obj.type === "connector") {
            const connector = obj as any;
            const cached = connectorEndpoints.get(obj.id);
            const startPt = cached?.startPt ?? connector.startPoint;
            const endPt = cached?.endPt ?? connector.endPoint;

            return (
              <MemoConnector
                key={obj.id}
                obj={obj}
                startPt={startPt}
                endPt={endPt}
                connectorStyle={connector.style || "straight"}
                connectorColor={connector.color || "#333"}
                strokeWidth={connector.strokeWidth || 2}
                arrowEnd={!!connector.arrowEnd}
                isSelected={selectedIdsSet.has(obj.id)}
                shapeRefs={shapeRefs}
                onSelect={stableOnSelect}
                onContextMenu={handleObjectContextMenu}
              />
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
        {/* Remote user selection highlights */}
        {visibleObjects.map((obj) => {
          const color = remoteSelectionMap[obj.id];
          if (!color || obj.type === 'connector') return null;
          const pad = 6;
          let cx: number, cy: number, totalW: number, totalH: number, rot: number;
          if (obj.type === 'drawing') {
            const dObj = obj as Drawing;
            let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
            for (let i = 0; i < dObj.points.length; i += 2) {
              if (dObj.points[i] < dMinX) dMinX = dObj.points[i];
              if (dObj.points[i] > dMaxX) dMaxX = dObj.points[i];
              if (dObj.points[i+1] < dMinY) dMinY = dObj.points[i+1];
              if (dObj.points[i+1] > dMaxY) dMaxY = dObj.points[i+1];
            }
            const dw = dMaxX - dMinX;
            const dh = dMaxY - dMinY;
            cx = dMinX + dw / 2;
            cy = dMinY + dh / 2;
            totalW = dw + pad * 2;
            totalH = dh + pad * 2;
            rot = 0;
          } else {
            const w = (obj as any).width ?? 0;
            const h = (obj as any).height ?? 0;
            rot = (obj as any).rotation ?? 0;
            totalW = w + pad * 2;
            totalH = h + pad * 2;
            cx = (obj as any).x + w / 2;
            cy = (obj as any).y + h / 2;
          }
          return (
            <Rect
              key={`remote-sel-${obj.id}`}
              x={cx}
              y={cy}
              offsetX={totalW / 2}
              offsetY={totalH / 2}
              width={totalW}
              height={totalH}
              rotation={rot}
              stroke={color}
              strokeWidth={2}
              dash={[6, 4]}
              cornerRadius={4}
              listening={false}
            />
          );
        })}
        {/* Standard Konva Transformer */}
        {selectedIds.length > 0 && (
          <Transformer
            ref={trRef}
            resizeEnabled={true}
            rotateEnabled={true}
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
      <MemoCursorLayer cursors={cursors} />
    </Stage>
    {stickyEditor}
    {contextMenu && (
      <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 999,
        }}
        onClick={() => setContextMenu(null)}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
      />
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
          minWidth: 140,
        }}
      >
        {contextMenu.objectId ? (
          <>
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
                const obj = objectMap.get(contextMenu.objectId!);
                if (obj) {
                  setDrawingConnector({
                    startObjectId: contextMenu.objectId!,
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
                const obj = objectMap.get(contextMenu.objectId!);
                if (obj) {
                  setClipboard(obj);
                }
                setContextMenu(null);
              }}
            >
              Copy
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
                  onObjectDelete(contextMenu.objectId!);
                }
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            {clipboard ? (
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
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"}
                onMouseLeave={(e) => e.currentTarget.style.background = "white"}
                onClick={() => {
                  const id = `${clipboard.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  const x = contextMenu.canvasX ?? 0;
                  const y = contextMenu.canvasY ?? 0;
                  onObjectCreateRef.current({ ...clipboard, id, x, y } as BoardObject);
                  setContextMenu(null);
                }}
              >
                Paste
              </button>
            ) : (
              <div style={{ padding: "8px 12px", fontSize: 13, color: "#999" }}>
                No items copied
              </div>
            )}
          </>
        )}
      </div>
      </>
    )}
    </>
  );
}
