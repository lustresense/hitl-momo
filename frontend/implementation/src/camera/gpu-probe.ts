/**
 * Finds out whether the browser draws WebGL on a software renderer (SwiftShader, llvmpipe, Microsoft Basic
 * Render). On such machines MediaPipe's GPU delegate copies every frame through the CPU anyway, and it froze
 * Momo's typing on a school PC, so the hand model should start on the CPU delegate there.
 */

/** Renderer names of software rasterisers. Matched case-insensitively. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|swrast|software|microsoft basic render/i;

/** True for a software renderer string. An unknown (null) renderer is not software: the GPU is then tried. */
export function isSoftwareRenderer(renderer: string | null | undefined): boolean {
  if (!renderer) return false;
  return SOFTWARE_RENDERER.test(renderer);
}

/** Cached: a throwaway WebGL context is created once per page, not once per landmarker. */
let cached: { renderer: string | null } | null = null;

/**
 * The unmasked GPU renderer string, or null when WebGL or the debug extension is missing. Never throws.
 * Runs in a canvas that is not attached to the page, and frees its context at once.
 */
export function readRenderer(): string | null {
  if (cached) return cached.renderer;
  cached = { renderer: probe() };
  return cached.renderer;
}

function probe(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    const gl: WebGLRenderingContext | null = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    try {
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const raw = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return typeof raw === "string" ? raw : null;
    } finally {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    return null;
  }
}

/** TEST ONLY: forget the cached answer. */
export function resetGpuProbeForTest(): void {
  cached = null;
}
