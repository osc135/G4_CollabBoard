import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

vi.mock("./Board", () => ({ Board: () => null }));
vi.mock("./useSocket", () => ({
  useSocket: () => ({
    connected: true,
    objects: [],
    cursors: {},
    presence: [{ userId: "u1", name: "Test User" }],
    emitCursor: vi.fn(),
    createObject: vi.fn(),
    updateObject: vi.fn(),
    deleteObject: vi.fn(),
  }),
}));

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders toolbar with name input and connection status", () => {
    render(<App />);
    expect(screen.getByRole("textbox", { name: /your name/i })).toBeInTheDocument();
    expect(screen.getByTestId("connection-status")).toHaveTextContent("Connected");
  });

  it("renders tool buttons Pan, Sticky, Rectangle", () => {
    render(<App />);
    expect(screen.getByTestId("tool-pan")).toHaveTextContent("Pan");
    expect(screen.getByTestId("tool-sticky")).toHaveTextContent("Sticky");
    expect(screen.getByTestId("tool-rectangle")).toHaveTextContent("Rectangle");
  });

  it("shows Online count and presence names", () => {
    render(<App />);
    expect(screen.getByText(/Online:/)).toBeInTheDocument();
    expect(screen.getByText(/Test User/)).toBeInTheDocument();
  });

  it("does not show Delete button when nothing selected", () => {
    render(<App />);
    expect(screen.queryByTestId("delete-btn")).not.toBeInTheDocument();
  });
});
