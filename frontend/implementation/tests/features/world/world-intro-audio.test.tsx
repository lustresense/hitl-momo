// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audioMock = vi.hoisted(() => ({ emit: vi.fn(), loop: vi.fn(), interrupt: vi.fn() }));
vi.mock("@/src/audio", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/audio")>()),
  audio: { emit: audioMock.emit, loop: audioMock.loop, interrupt: audioMock.interrupt },
}));

// Momo's own tweens are not under test (and gsap does not advance under fake timers): resolve moves immediately.
vi.mock("@/src/features/shared/MomoStage", async () => {
  const React = await import("react");
  const MomoStage = React.forwardRef<unknown, Record<string, unknown>>(function MomoStageStub(_props, ref) {
    React.useImperativeHandle(ref, () => ({
      moveTo: () => Promise.resolve(),
      moveAlong: () => Promise.resolve(),
      setPose: () => undefined,
      squash: () => undefined,
      rect: () => null,
      anchor: () => "side",
      pose: () => ({ x: 100, y: 100, s: 1, r: 0 }),
      element: () => null,
    }));
    return null;
  });
  return { MomoStage };
});

// The ring hold itself is the NUI engine's (tested elsewhere): a click stands in for "ring fired".
vi.mock("@/src/nui", async (importOriginal) => {
  const React = await import("react");
  const orig = await importOriginal<typeof import("@/src/nui")>();
  const NuiRing = (p: { onFire?: () => void; testId?: string }) =>
    React.createElement("button", { type: "button", "data-testid": p.testId, onClick: () => p.onFire?.() });
  return { ...orig, NuiRing };
});

import { LEVELS } from "@/src/domain/levels";
import { WorldIntroOverlay } from "@/src/features/world";

// bubble.show (shared bubble), ui.skip (shared skip bar) and momo.flap (MomoStage) are not this area's sounds.
const emitted = () => audioMock.emit.mock.calls.map((c) => c[0] as string).filter((e) => e !== "bubble.show" && e !== "ui.skip" && e !== "momo.flap");
const count = (id: string) => emitted().filter((e) => e === id).length;

async function run(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 50) {
    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });
  }
}

describe("world intro audio wiring (UNIT_ONLY: audio API mocked)", () => {
  beforeEach(() => {
    audioMock.emit.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("plays the intro jingle once, a fly-in whoosh and one spotlight tween per focus change", async () => {
    render(<WorldIntroOverlay level={LEVELS[0]!} characterDisplayName="Thinman" onFinish={vi.fn()} />);
    expect(emitted()).toEqual([]); // nothing on mount: the jingle waits for the book-open pause
    await run(40_000);
    expect(count("jingle.level_intro")).toBe(1);
    expect(count("momo.whoosh")).toBe(1);
    expect(count("intro.spotlight")).toBe(1); // thinman -> ahead (ahead -> ahead has no tween)
    expect(count("world.rise")).toBe(0);
    expect(emitted().indexOf("jingle.level_intro")).toBeLessThan(emitted().indexOf("momo.whoosh"));
    expect(emitted().indexOf("momo.whoosh")).toBeLessThan(emitted().indexOf("intro.spotlight"));
  });

  it("the real (1x) camera rise plays world.rise + momo.whoosh once; a second trigger is ignored", async () => {
    const onFinish = vi.fn();
    render(<WorldIntroOverlay level={LEVELS[0]!} characterDisplayName="Thinman" onFinish={onFinish} />);
    await run(40_000);
    const ring = screen.getByTestId("r83-intro-understand");
    audioMock.emit.mockClear();
    fireEvent.click(ring);
    fireEvent.click(ring);
    expect(emitted()).toEqual(["world.rise", "momo.whoosh"]);
    await run(4000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(emitted()).toEqual(["world.rise", "momo.whoosh"]);
  });

  it("StrictMode double effects do not double the jingle, whoosh or spotlight", async () => {
    render(
      <StrictMode>
        <WorldIntroOverlay level={LEVELS[0]!} characterDisplayName="Thinman" onFinish={vi.fn()} />
      </StrictMode>,
    );
    await run(40_000);
    expect(count("jingle.level_intro")).toBe(1);
    expect(count("momo.whoosh")).toBe(1);
    expect(count("intro.spotlight")).toBe(1);
  });

  it("dev skip runs the rise 7x faster and stays silent (no rise / whoosh)", async () => {
    const onFinish = vi.fn();
    render(<WorldIntroOverlay level={LEVELS[0]!} characterDisplayName="Thinman" devTools onFinish={onFinish} />);
    fireEvent.click(screen.getByTestId("r83-intro-skip"));
    await run(1000);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(emitted()).toEqual([]);
  });
});
