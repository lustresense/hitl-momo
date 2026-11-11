import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ControlGuide } from "@/src/components/game/ControlGuide";

afterEach(cleanup);

/** Exact sentences are the spec: each must describe the gesture or key the code really reads. */
const CAMERA = {
  title: "Pakai tanganmu",
  left: "Telunjuk mendatar ke kiri, Thinman jalan ke kiri.",
  right: "Telunjuk mendatar ke kanan, Thinman jalan ke kanan.",
  jump: "Telunjuk tegak ke atas untuk lompat. Miring ke kiri atau kanan untuk lompat sambil jalan.",
  note: "Telunjuk turun ke bawah, Thinman berhenti.",
};
const FALLBACK = {
  title: "Pakai keyboard atau tombol",
  left: "Tekan panah kiri atau A, atau tombol Kiri di layar.",
  right: "Tekan panah kanan atau D, atau tombol Kanan di layar.",
  jump: "Tekan Spasi, panah atas, atau W, atau tombol Lompat di layar.",
  note: "Lepas tombol, Thinman berhenti.",
};

describe("ControlGuide: camera (NUI) mode", () => {
  it("shows three cards Kiri, Kanan, Lompat with a hand/gesture picture and one sentence each", () => {
    render(<ControlGuide mode="camera" onClose={vi.fn()} />);
    expect(screen.getByText(CAMERA.title)).toBeTruthy();

    const left = screen.getByTestId("guide-card-left");
    const right = screen.getByTestId("guide-card-right");
    const jump = screen.getByTestId("guide-card-jump");
    expect(left.textContent).toContain("Kiri");
    expect(left.textContent).toContain(CAMERA.left);
    expect(right.textContent).toContain("Kanan");
    expect(right.textContent).toContain(CAMERA.right);
    expect(jump.textContent).toContain("Lompat");
    expect(jump.textContent).toContain(CAMERA.jump);

    for (const card of [left, right, jump]) {
      expect(card.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByText(CAMERA.note)).toBeTruthy();
  });

  it("does not mention keys or mouse buttons in camera mode", () => {
    const { container } = render(<ControlGuide mode="camera" onClose={vi.fn()} />);
    expect(container.textContent).not.toMatch(/Spasi|WASD|panah|tombol/i);
  });
});

describe("ControlGuide: fallback mode (keyboard / on-screen buttons)", () => {
  it("shows the same three cards with keyboard and on-screen button wording", () => {
    render(<ControlGuide mode="fallback" onClose={vi.fn()} />);
    expect(screen.getByText(FALLBACK.title)).toBeTruthy();
    expect(screen.getByTestId("guide-card-left").textContent).toContain(FALLBACK.left);
    expect(screen.getByTestId("guide-card-right").textContent).toContain(FALLBACK.right);
    expect(screen.getByTestId("guide-card-jump").textContent).toContain(FALLBACK.jump);
    expect(screen.getByText(FALLBACK.note)).toBeTruthy();
  });

  it("the guidance text differs from camera mode on every card", () => {
    const camera = render(<ControlGuide mode="camera" onClose={vi.fn()} />);
    const cameraTexts = ["guide-card-left", "guide-card-right", "guide-card-jump"].map(
      (id) => camera.getByTestId(id).textContent,
    );
    camera.unmount();
    render(<ControlGuide mode="fallback" onClose={vi.fn()} />);
    const fallbackTexts = ["guide-card-left", "guide-card-right", "guide-card-jump"].map(
      (id) => screen.getByTestId(id).textContent,
    );
    cameraTexts.forEach((text, i) => expect(fallbackTexts[i]).not.toBe(text));
  });
});

describe("ControlGuide: closing", () => {
  it("the close button reports the close request", () => {
    const onClose = vi.fn();
    render(<ControlGuide mode="camera" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("control-guide-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
