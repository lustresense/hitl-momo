// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import gsap from "gsap";
import { MomoEngine } from "@/src/components/momo/momo-engine";

/** Only the reduced-motion query matches; every other query is false, as on a student's device. */
function setReducedMotion(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

let engine: MomoEngine | null = null;
afterEach(() => {
  engine?.destroy();
  engine = null;
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

function makeMomo(reduced: boolean) {
  setReducedMotion(reduced);
  const host = document.createElement("div");
  document.body.appendChild(host);
  engine = new MomoEngine(host);
  engine.set("Semangat"); // the bounciest mood: its hops are the most visible motion
  return { host, momo: engine as unknown as { rt: unknown } };
}

describe("Momo avatar with prefers-reduced-motion (brief c)", () => {
  it("normal motion: the expression plays its hop, and the hop repeats by itself", () => {
    const { momo } = makeMomo(false);
    expect(momo.rt).not.toBeNull();
  });

  it("reduced motion: no hop, shake or repeat is scheduled; the face still changes", () => {
    const { host, momo } = makeMomo(true);
    expect(momo.rt).toBeNull();
    // Kaget opens the mouth (.mO). Reduced motion must not freeze the face on the old mood.
    engine!.set("Kaget", true);
    (engine as unknown as { step(dt: number): void }).step(0.016);
    expect(host.querySelector(".mO")!.getAttribute("opacity")).toBe("1");
  });

  it("reduced motion: the sweat drop and the tear do not bob or fall on a loop", () => {
    const { host } = makeMomo(true);
    expect(gsap.getTweensOf(host.querySelector(".sweatI")!).length).toBe(0);
    expect(gsap.getTweensOf(host.querySelector(".tearI")!).length).toBe(0);
  });

  it("normal motion: the sweat drop and the tear loop as before", () => {
    const { host } = makeMomo(false);
    expect(gsap.getTweensOf(host.querySelector(".sweatI")!).length).toBeGreaterThan(0);
    expect(gsap.getTweensOf(host.querySelector(".tearI")!).length).toBeGreaterThan(0);
  });
});
