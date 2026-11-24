/**
 * Non-identifying environment metadata and camera device class heuristic.
 * Never stores raw user-agent strings, raw camera device names, IP addresses, or usernames.
 */
import type { CameraProfile, SessionMeta } from "./schema";

export const LAB_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.29.1-alpha+r22b";
export const LAB_GIT_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT ?? "745bb6d840793dcab8558f65aef6bfac58807e79";
export const LAB_GIT_BRANCH = process.env.NEXT_PUBLIC_GIT_BRANCH ?? "r22b-handstate";

export function getAppBuildInfo(): { version: string; gitCommit: string; gitBranch: string } {
  return { version: LAB_APP_VERSION, gitCommit: LAB_GIT_COMMIT, gitBranch: LAB_GIT_BRANCH };
}

function coarseBrowserFamily(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge/Chromium";
  if (/Chrome\//i.test(ua) || /Chromium\//i.test(ua)) return "Chromium";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return "Unknown";
}

function coarsePlatform(ua: string, platform: string): string {
  const s = `${platform} ${ua}`;
  if (/Android/i.test(s)) return "Android";
  if (/iPhone|iPad|iPod/i.test(s)) return "iOS";
  if (/Win/i.test(s)) return "Windows";
  if (/Mac/i.test(s)) return "macOS";
  if (/Linux/i.test(s)) return "Linux";
  return "Unknown";
}

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

export function collectNonIdentifyingEnvironment(
  storage: "indexeddb" | "memory-only" = "indexeddb",
): SessionMeta["environment"] {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return {
      userAgentFamily: "Unknown",
      platform: "Unknown",
      hardwareConcurrency: null,
      deviceMemoryGb: null,
      devicePixelRatio: null,
      viewport: null,
      secureContext: false,
      storage,
    };
  }
  const nav = navigator as NavigatorWithMemory;
  return {
    userAgentFamily: coarseBrowserFamily(nav.userAgent ?? ""),
    platform: coarsePlatform(nav.userAgent ?? "", nav.platform ?? ""),
    hardwareConcurrency:
      typeof nav.hardwareConcurrency === "number" && Number.isFinite(nav.hardwareConcurrency)
        ? nav.hardwareConcurrency
        : null,
    deviceMemoryGb:
      typeof nav.deviceMemory === "number" && Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
    devicePixelRatio:
      typeof window.devicePixelRatio === "number" && Number.isFinite(window.devicePixelRatio)
        ? Math.round(window.devicePixelRatio * 100) / 100
        : null,
    viewport:
      typeof window.innerWidth === "number" && typeof window.innerHeight === "number"
        ? { w: window.innerWidth, h: window.innerHeight }
        : null,
    secureContext: Boolean(window.isSecureContext),
    storage,
  };
}

const VIRTUAL_CAM_RE = /fake|virtual|obs|snap\s*cam|manycam|droidcam|iriun|camo|y4m|v4l2loopback|dummy|test/i;

/**
 * Heuristic classification of the camera track label into physical vs virtual.
 * The label text itself is discarded immediately and NEVER stored or exported.
 */
export function classifyCameraTrack(track: MediaStreamTrack | undefined): CameraProfile {
  if (!track) {
    return { width: null, height: null, frameRate: null, deviceClass: "unknown" };
  }
  const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
  const label = typeof track.label === "string" ? track.label.trim() : "";
  let deviceClass: CameraProfile["deviceClass"] = "unknown";
  if (label.length > 0) {
    deviceClass = VIRTUAL_CAM_RE.test(label) ? "virtual-suspected" : "physical-presumed";
  }
  return {
    width: typeof settings.width === "number" ? settings.width : null,
    height: typeof settings.height === "number" ? settings.height : null,
    frameRate: typeof settings.frameRate === "number" ? Math.round(settings.frameRate * 10) / 10 : null,
    deviceClass,
  };
}
