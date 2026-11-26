// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSttLabProvider } from "@/src/features/cover/name/providers/stt-lab";
import { createTypedNameProvider } from "@/src/features/cover/name/providers/typed";
import { createSimNameProvider, SIM_SAMPLE_NAME } from "@/src/features/cover/name/providers/sim";
import { createDefaultNameProviders, listenWithFallback } from "@/src/features/cover/name/name-provider";

describe("name providers (§5.5, O-4, O-15, child privacy)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("stt-lab fails closed immediately with status 'unavailable' and never touches microphone/audio", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const stt = createSttLabProvider();
    expect(stt.kind).toBe("stt-lab");

    const ac = new AbortController();
    const res = await stt.listen(ac.signal);
    expect(res).toEqual({ status: "unavailable", reason: "stt-lab-unconfigured" });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("stt-lab respects pre-aborted signal", async () => {
    const stt = createSttLabProvider();
    const ac = new AbortController();
    ac.abort();
    const res = await stt.listen(ac.signal);
    expect(res).toEqual({ status: "cancelled" });
  });

  it("typed provider normalizes submitted name and supports cancellation without logging or storing PII", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const lsSpy = vi.spyOn(Storage.prototype, "setItem");

    const typed = createTypedNameProvider();
    expect(typed.kind).toBe("typed");

    const ac = new AbortController();
    const pending = typed.listen(ac.signal);
    typed.submit("halo nama saya alya zahra");
    const result = await pending;

    expect(result).toEqual({ status: "ok", name: "Alya Zahra" });
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(lsSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    // Cancellation path
    const ac2 = new AbortController();
    const pending2 = typed.listen(ac2.signal);
    ac2.abort();
    expect(await pending2).toEqual({ status: "cancelled" });
  });

  it("typed provider returns empty status for whitespace/symbol-only input", async () => {
    const typed = createTypedNameProvider();
    const ac = new AbortController();
    const pending = typed.listen(ac.signal);
    typed.submit("   123!  ");
    expect(await pending).toEqual({ status: "empty" });
  });

  it("sim provider is strictly disabled when devTools is false (never returns Bima)", async () => {
    const sim = createSimNameProvider({ devTools: false });
    expect(sim.kind).toBe("sim");
    const ac = new AbortController();
    const res = await sim.listen(ac.signal);
    expect(res).toEqual({ status: "unavailable", reason: "dev-tools-disabled" });
  });

  it("sim provider carries SIMULASI label when devTools is true and can resolve sample name without storage/console leaks", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const lsSpy = vi.spyOn(Storage.prototype, "setItem");

    const sim = createSimNameProvider({ devTools: true, fallbackDelayMs: 5 });
    expect(sim.label).toBe("SIMULASI");

    const ac = new AbortController();
    const res = await sim.listen(ac.signal);
    expect(res).toEqual({ status: "ok", name: SIM_SAMPLE_NAME, simulated: true });
    expect(logSpy).not.toHaveBeenCalled();
    expect(lsSpy).not.toHaveBeenCalled();
  });

  it("default production provider chain orders stt-lab -> typed (omits sim when !devTools)", async () => {
    const typed = createTypedNameProvider();
    const providers = createDefaultNameProviders({ devTools: false, typed });
    expect(providers.map((p) => p.kind)).toEqual(["stt-lab", "typed"]);

    const ac = new AbortController();
    const fallbackCalled = vi.fn();
    const pending = listenWithFallback(providers, ac.signal, { onFallbackToTyped: fallbackCalled });

    // Allow microtask for stt-lab unavailable -> fallback to typed
    await Promise.resolve();
    await Promise.resolve();
    expect(fallbackCalled).toHaveBeenCalledTimes(1);

    typed.submit("namaku citra");
    const outcome = await pending;
    expect(outcome).toEqual({ status: "ok", name: "Citra", provider: "typed" });
  });
});
