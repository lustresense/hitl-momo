import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StagePreview } from "@/src/components/stage-preview/StagePreview";

describe("stage preview shows the three chapters (Owner 2026-11-16: only 3 levels, one word: Bab)", () => {
  it("counts 01 / 03, with exactly three slides and no fourth", () => {
    const { container } = render(<StagePreview />);
    expect(container.querySelectorAll("section[data-slide]")).toHaveLength(3);
    expect(screen.getByText(/01\s*\/\s*03/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/\/\s*04/);
  });

  it("names every slide Bab N and never Level", () => {
    const { container } = render(<StagePreview />);
    const labels = [...container.querySelectorAll("section[data-slide]")].map((s) => s.getAttribute("aria-label"));
    expect(labels).toEqual([
      expect.stringContaining("Bab 1"),
      expect.stringContaining("Bab 2"),
      expect.stringContaining("Bab 3"),
    ]);
    expect(container.textContent).not.toMatch(/\bLevel\b/);
  });
});
