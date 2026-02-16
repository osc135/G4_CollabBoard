import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Konva/Canvas: jsdom has no getContext("2d")
const noop = () => {};
const mockCtx = {
  fillRect: noop,
  clearRect: noop,
  getImageData: () => ({ data: new Uint8ClampedArray(0) }),
  putImageData: noop,
  createImageData: () => ({ data: new Uint8ClampedArray(0) }),
  setTransform: noop,
  drawImage: noop,
  save: noop,
  restore: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  stroke: noop,
  translate: noop,
  scale: noop,
  rotate: noop,
  arc: noop,
  fill: noop,
  measureText: () => ({ width: 0 }),
  transform: noop,
  rect: noop,
  clip: noop,
};
HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx as unknown as CanvasRenderingContext2D) as unknown as typeof HTMLCanvasElement.prototype.getContext;
