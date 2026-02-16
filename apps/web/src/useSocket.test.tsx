import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSocket } from "./useSocket";

type Listener = (...args: unknown[]) => void;
function createMockSocket() {
  const listeners = new Map<string, Listener[]>();
  return {
    on: vi.fn(function (this: ReturnType<typeof createMockSocket>, event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
      return this;
    }),
    off: vi.fn(function (this: ReturnType<typeof createMockSocket>) { return this; }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    trigger(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
  };
}

let mockSocket: ReturnType<typeof createMockSocket>;

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    mockSocket = createMockSocket();
    setTimeout(() => mockSocket.trigger("connect"), 0);
    return mockSocket;
  }),
}));

describe("useSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects with auth containing name", async () => {
    const { io } = await import("socket.io-client");
    renderHook(() => useSocket("user-alice", "Alice"));
    await act(async () => {});
    expect(io).toHaveBeenCalledWith("", expect.objectContaining({ auth: expect.objectContaining({ name: "Alice", userId: "user-alice" }) }));
  });

  it("reports connected after connect event", async () => {
    const { io } = await import("socket.io-client");
    (io as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const s = createMockSocket();
      mockSocket = s;
      return s;
    });
    const { result } = renderHook(() => useSocket("user-bob", "Bob"));
    expect(result.current.connected).toBe(false);
    await act(async () => mockSocket.trigger("connect"));
    expect(result.current.connected).toBe(true);
  });

  it("updates objects when board:state is received", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    const payload = { objects: [{ id: "sticky-1", type: "sticky" as const, x: 0, y: 0, width: 100, height: 100, text: "Hi", color: "#fff" }] };
    await act(async () => mockSocket.trigger("board:state", payload));
    expect(result.current.objects).toEqual(payload.objects);
  });

  it("updates cursors when cursor:moved is received", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    await act(async () => mockSocket.trigger("cursor:moved", { socketId: "s1", userId: "u1", name: "Alice", x: 10, y: 20 }));
    expect(result.current.cursors["s1"]).toEqual({ id: "s1", userId: "u1", name: "Alice", x: 10, y: 20 });
  });

  it("removes cursor when cursor:left is received", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    await act(async () => mockSocket.trigger("cursor:moved", { socketId: "s1", userId: "u1", name: "A", x: 0, y: 0 }));
    await act(async () => mockSocket.trigger("cursor:left", "s1"));
    expect(result.current.cursors["s1"]).toBeUndefined();
  });

  it("emitCursor emits cursor:move with x and y", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    act(() => result.current.emitCursor(50, 100));
    expect(mockSocket.emit).toHaveBeenCalledWith("cursor:move", { x: 50, y: 100 });
  });

  it("createObject emits object:create with payload", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    const obj = { id: "sticky-1", type: "sticky" as const, x: 0, y: 0, width: 150, height: 100, text: "Note", color: "#fef08a" };
    act(() => result.current.createObject(obj));
    expect(mockSocket.emit).toHaveBeenCalledWith("object:create", obj);
  });

  it("updateObject emits object:update with payload", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    const obj = { id: "sticky-1", type: "sticky" as const, x: 10, y: 20, width: 150, height: 100, text: "Updated", color: "#fef08a" };
    act(() => result.current.updateObject(obj));
    expect(mockSocket.emit).toHaveBeenCalledWith("object:update", obj);
  });

  it("deleteObject emits object:delete with id", async () => {
    const { result } = renderHook(() => useSocket("user-1", "User"));
    await act(async () => mockSocket.trigger("connect"));
    act(() => result.current.deleteObject("sticky-1"));
    expect(mockSocket.emit).toHaveBeenCalledWith("object:delete", "sticky-1");
  });
});
