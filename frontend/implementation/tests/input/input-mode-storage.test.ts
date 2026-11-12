// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "skb-input-mode-fallback";

async function freshModule() {
  vi.resetModules();
  return import("@/src/input/input-mode");
}

describe("input mode survives a refresh in the same tab (IM)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("a camera failure is remembered and restored after a module reload, on subscribe", async () => {
    const first = await freshModule();
    first.reportCameraUnavailable();
    expect(window.sessionStorage.getItem(KEY)).toBe("1");

    const reloaded = await freshModule();
    const seen: string[] = [];
    const off = reloaded.subscribeInputMode((m) => seen.push(m));
    expect(seen[0]).toBe("fallback");
    expect(reloaded.getInputMode()).toBe("fallback");
    off();
  });

  it("a live stream after the restore clears the fallback and removes the stored flag", async () => {
    window.sessionStorage.setItem(KEY, "1");
    const mod = await freshModule();
    // Same module graph as the input mode module: a stream set on the other instance would not reach it.
    const { setSharedStream } = await import("@/src/camera/shared-stream");
    const off = mod.subscribeInputMode(() => {});
    expect(mod.getInputMode()).toBe("fallback");
    setSharedStream({} as MediaStream);
    expect(mod.getInputMode()).toBe("camera");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    off();
  });

  it("with nothing stored, a fresh module starts in camera mode (cover stays camera-first)", async () => {
    const mod = await freshModule();
    const off = mod.subscribeInputMode(() => {});
    expect(mod.getInputMode()).toBe("camera");
    off();
  });

  it("forced test modes are not persisted", async () => {
    const mod = await freshModule();
    mod.forceInputMode("fallback");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    mod.forceInputMode(null);
  });

  it("blocked sessionStorage does not break the mode", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const mod = await freshModule();
    expect(() => mod.reportCameraUnavailable()).not.toThrow();
    expect(mod.getInputMode()).toBe("fallback");
    spy.mockRestore();
  });
});
