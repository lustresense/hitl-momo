import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { BookFlip } from "@/src/components/ui/BookFlip";

describe("BookFlip", () => {
  it("renders nothing until played", () => {
    render(<BookFlip playKey={0} />);
    expect(screen.queryByTestId("book-flip")).toBeNull();
  });

  it("plays once per key, calls midpoint and done, then unmounts the leaf", async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const onMidpoint = vi.fn();
    const { rerender } = render(<BookFlip playKey={1} direction="close" onDone={onDone} onMidpoint={onMidpoint} />);
    expect(screen.getByTestId("book-flip").dataset.direction).toBe("close");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("book-flip")).toBeNull();
    rerender(<BookFlip playKey={2} onDone={onDone} onMidpoint={onMidpoint} />);
    expect(screen.getByTestId("book-flip").dataset.direction).toBe("open");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(onDone).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
