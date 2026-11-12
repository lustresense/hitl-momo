import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StageHeader } from "@/src/components/game/StageHeader";
import type { InputMode } from "@/src/components/game/game-stage-types";

afterEach(() => cleanup());

const decision = { type: "accept" as const, finalLabel: "papan", sourceRank: 1 as const };

function header(mode: InputMode, onDrawAgain = vi.fn()) {
  render(<StageHeader characterName="Thinman" decision={decision} onDrawAgain={onDrawAgain} mode={mode} />);
  return onDrawAgain;
}

describe("StageHeader in camera mode: Gambar lagi stays a small secondary click target", () => {
  it("camera: the button is marked quiet and small, not the primary action", () => {
    header("camera");
    const button = screen.getByTestId("btn-draw-again");
    expect(button.classList.contains("is-quiet")).toBe(true);
    expect(button.classList.contains("nb-btn--primary")).toBe(false);
    expect(button.classList.contains("btn-small")).toBe(true);
  });

  it("camera: a click still fires once (the fallback path stays), and the label stays for screen readers", () => {
    const onDrawAgain = header("camera");
    const button = screen.getByTestId("btn-draw-again");
    expect(button.textContent).toContain("Gambar lagi");
    fireEvent.click(button);
    expect(onDrawAgain).toHaveBeenCalledTimes(1);
  });

  it("fallback: the button is the primary action, unchanged", () => {
    header("fallback");
    const button = screen.getByTestId("btn-draw-again");
    expect(button.classList.contains("is-quiet")).toBe(false);
    expect(button.classList.contains("nb-btn--primary")).toBe(true);
  });
});
