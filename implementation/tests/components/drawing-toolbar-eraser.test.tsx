import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingToolbar } from "@/src/components/drawing/DrawingToolbar";

afterEach(cleanup);

describe("Toolbar Hapus is an eraser tool, not clear-all", () => {
  it("toggles erasing and Gambar returns to the pen", () => {
    const onErasingChange = vi.fn();
    const { rerender } = render(<DrawingToolbar enabled erasing={false} onErasingChange={onErasingChange} onUndo={vi.fn()} onRedo={vi.fn()} />);
    const hapus = screen.getByRole("button", { name: "Hapus" });
    expect(hapus.getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(hapus);
    expect(onErasingChange).toHaveBeenLastCalledWith(true);
    rerender(<DrawingToolbar enabled erasing onErasingChange={onErasingChange} onUndo={vi.fn()} onRedo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hapus" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Gambar/ }).getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    expect(onErasingChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: /Gambar/ }));
    expect(onErasingChange).toHaveBeenLastCalledWith(false);
  });
});
