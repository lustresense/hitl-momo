import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingToolbar } from "@/src/components/drawing/DrawingToolbar";
import { ERASER_SIZE_PRESETS } from "@/src/input/eraser";

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

describe("Toolbar eraser size (S / M / L) appears with Hapus and sets the radius", () => {
  it("the size buttons are hidden while Gambar is active", () => {
    render(<DrawingToolbar enabled erasing={false} onErasingChange={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} eraserSize={28} onEraserSizeChange={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Ukuran penghapus" })).toBeNull();
  });

  it("with Hapus on, S / M / L set the radius to their preset and the current one is pressed", () => {
    const onEraserSizeChange = vi.fn();
    render(<DrawingToolbar enabled erasing onErasingChange={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} eraserSize={ERASER_SIZE_PRESETS.medium} onEraserSizeChange={onEraserSizeChange} />);
    expect(screen.getByRole("group", { name: "Ukuran penghapus" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hapus ukuran kecil" }));
    expect(onEraserSizeChange).toHaveBeenLastCalledWith(ERASER_SIZE_PRESETS.small);
    fireEvent.click(screen.getByRole("button", { name: "Hapus ukuran besar" }));
    expect(onEraserSizeChange).toHaveBeenLastCalledWith(ERASER_SIZE_PRESETS.large);
    expect(screen.getByRole("button", { name: "Hapus ukuran sedang" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Hapus ukuran kecil" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("without a size handler the size buttons stay hidden (nothing to click that does nothing)", () => {
    render(<DrawingToolbar enabled erasing onErasingChange={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Ukuran penghapus" })).toBeNull();
  });

  it("the size buttons are disabled while the drawing tools are idle", () => {
    render(<DrawingToolbar enabled={false} erasing onErasingChange={vi.fn()} onUndo={vi.fn()} onRedo={vi.fn()} eraserSize={28} onEraserSizeChange={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Hapus ukuran sedang" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the size buttons are at least 44 px square (touch target)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const css = readFileSync(resolve(process.cwd(), "src/components/drawing/eraser-size.css"), "utf8");
    expect(css).toMatch(/\.eraser-size__btn\s*{[^}]*min-width:\s*44px/);
    expect(css).toMatch(/\.eraser-size__btn\s*{[^}]*min-height:\s*44px/);
  });
});
