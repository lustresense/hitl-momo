// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSoftwareRenderer, readRenderer, resetGpuProbeForTest } from "@/src/camera/gpu-probe";

const SWIFTSHADER = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)";
const UNMASKED = 0x9246;

/** A fake WebGL context: only the parts readRenderer uses. */
function fakeGl(renderer: string) {
  const loseContext = vi.fn();
  const gl = {
    RENDERER: 0x1f01,
    getExtension: (name: string) => {
      if (name === "WEBGL_debug_renderer_info") return { UNMASKED_RENDERER_WEBGL: UNMASKED };
      if (name === "WEBGL_lose_context") return { loseContext };
      return null;
    },
    getParameter: (p: number) => (p === UNMASKED ? renderer : "plain"),
  };
  return { gl, loseContext };
}

beforeEach(() => resetGpuProbeForTest());
afterEach(() => {
  vi.restoreAllMocks();
  resetGpuProbeForTest();
});

describe("isSoftwareRenderer", () => {
  it.each([
    SWIFTSHADER,
    "Mesa llvmpipe (LLVM 15.0.7, 256 bits)",
    "softpipe",
    "Mesa Offscreen (Software Rasterizer)",
    "Google SwiftShader",
    "ANGLE (Microsoft, Microsoft Basic Render Driver (0x008C), D3D11)",
  ])("is true for software renderer %s", (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(true);
  });

  it.each([
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)",
    "Apple M2",
    "AMD Radeon Graphics",
  ])("is false for a real GPU %s", (renderer) => {
    expect(isSoftwareRenderer(renderer)).toBe(false);
  });

  it("is false when the renderer is unknown: the GPU is then tried as before", () => {
    expect(isSoftwareRenderer(null)).toBe(false);
    expect(isSoftwareRenderer(undefined)).toBe(false);
    expect(isSoftwareRenderer("")).toBe(false);
  });
});

describe("readRenderer", () => {
  it("returns the unmasked renderer string and frees the throwaway context", () => {
    const { gl, loseContext } = fakeGl(SWIFTSHADER);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as never);
    expect(readRenderer()).toBe(SWIFTSHADER);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("asks the browser once: a second call reuses the answer and creates no context", () => {
    const { gl } = fakeGl(SWIFTSHADER);
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(gl as never);
    readRenderer();
    readRenderer();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("returns null when the browser has no WebGL, without throwing", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(readRenderer()).toBeNull();
  });

  it("returns null when creating the context throws, without throwing", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("blocked by policy");
    });
    expect(() => readRenderer()).not.toThrow();
    expect(readRenderer()).toBeNull();
  });
});
