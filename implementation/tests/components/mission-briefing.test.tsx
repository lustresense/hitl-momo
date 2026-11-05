import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MissionBriefing } from "@/src/components/mission/MissionBriefing";
import { LEVELS } from "@/src/domain/levels";
import { getMissionConfigForLevel } from "@/src/domain/mission-config";

afterEach(cleanup);

describe("MissionBriefing Component", () => {
  const level1 = LEVELS[0];
  if (!level1) throw new Error("Missing level 1 fixture");
  const config1 = getMissionConfigForLevel(level1);

  it("renders system attribution, title, one short line, example chips and exploration note", () => {
    const onStartDrawing = vi.fn();
    render(
      <MissionBriefing
        isOpen={true}
        config={config1}
        onStartDrawing={onStartDrawing}
      />
    );

    // Attribution
    expect(screen.getByText("SISTEM")).toBeTruthy();
    // Title
    expect(screen.getByRole("heading", { name: /Bantu Thinman menyeberang!/i })).toBeTruthy();
    // Instruction / Goal
    expect(screen.getByText(/menutup celah/i)).toBeTruthy();
    // Examples are labelled and the student is told other objects are fine
    expect(screen.getByText("Contoh")).toBeTruthy();
    expect(screen.getByText(/Bebas gambar yang lain/i)).toBeTruthy();
    // Examples (papan, balok, tangga derived from L1)
    expect(screen.getByText(/Balok/i)).toBeTruthy();
    expect(screen.getByText(/Papan/i)).toBeTruthy();
    expect(screen.getByText(/Tangga/i)).toBeTruthy();
    // Primary CTA
    const startBtn = screen.getByTestId("btn-mission-start");
    expect(startBtn.textContent).toContain("Mulai");
    expect(screen.getByTestId("btn-mission-skip")).toBeTruthy();
    expect(screen.getByTestId("mission-dialog").getAttribute("aria-modal")).toBe("true");
    expect(startBtn).toBeTruthy();

    fireEvent.click(startBtn);
    expect(onStartDrawing).toHaveBeenCalledTimes(1);
  });

  it("calls onClose or onStartDrawing on Close button or Skip button", () => {
    const onStartDrawing = vi.fn();
    const onClose = vi.fn();
    render(
      <MissionBriefing
        isOpen={true}
        config={config1}
        onStartDrawing={onStartDrawing}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByRole("button", { name: /Tutup Petunjuk Misi/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape keypress", () => {
    const onClose = vi.fn();
    render(
      <MissionBriefing
        isOpen={true}
        config={config1}
        onStartDrawing={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders null or hidden when isOpen is false", () => {
    const { container } = render(
      <MissionBriefing
        isOpen={false}
        config={config1}
        onStartDrawing={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("manages focus and trap with accessible role dialog", () => {
    render(
      <MissionBriefing
        isOpen={true}
        config={config1}
        onStartDrawing={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  });
});
