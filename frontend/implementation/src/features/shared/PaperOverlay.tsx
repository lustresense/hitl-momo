"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";

export interface GradientStopSpec {
  readonly offset: number;
  readonly stopColor: string;
}

export interface LinearGradientSpec {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stops: readonly GradientStopSpec[];
}

/* Exact gradients from proto-html/r83/shared/lc.js:14-18 */
export const LC_GRADIENTS: readonly LinearGradientSpec[] = [
  {
    id: "lc-body",
    x1: 0.2,
    y1: 0,
    x2: 0.8,
    y2: 1,
    stops: [
      { offset: 0, stopColor: "#e3f4d2" },
      { offset: 0.5, stopColor: "#bfe0a1" },
      { offset: 1, stopColor: "#9ccb78" },
    ],
  },
  {
    id: "lc-wing",
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 1,
    stops: [
      { offset: 0, stopColor: "#f0925a" },
      { offset: 0.55, stopColor: "#e4551b" },
      { offset: 1, stopColor: "#c9481a" },
    ],
  },
  {
    id: "lc-rib-or",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
    stops: [
      { offset: 0, stopColor: "#f39a64" },
      { offset: 0.5, stopColor: "#ef7a37" },
      { offset: 1, stopColor: "#e0672a" },
    ],
  },
  {
    id: "lc-rib-gr",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
    stops: [
      { offset: 0, stopColor: "#93cc63" },
      { offset: 0.5, stopColor: "#7fbf4a" },
      { offset: 1, stopColor: "#6aab38" },
    ],
  },
  {
    id: "lc-rib-lk",
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 1,
    stops: [
      { offset: 0, stopColor: "#ddd8cb" },
      { offset: 0.5, stopColor: "#cfc9bb" },
      { offset: 1, stopColor: "#bdb6a5" },
    ],
  },
];

/* Exact 256px static paper grain tile from proto-html/r83/shared/lc.js:28-31 */
export const R83_PAPER_GRAIN_TILE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'>" +
  "<filter id='g' x='0' y='0' width='100%' height='100%'>" +
  "<feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/>" +
  "<feColorMatrix type='matrix' values='0 0 0 0 0.18   0 0 0 0 0.13   0 0 0 0 0.08   0 0 0 0.36 0'/>" +
  "</filter>" +
  "<rect width='256' height='256' filter='url(#g)' fill='#fff'/></svg>";

export const R83_PAPER_GRAIN_TILE_URI = `url("data:image/svg+xml,${encodeURIComponent(R83_PAPER_GRAIN_TILE_SVG)}")`;

const DEFS_SVG_STYLE: CSSProperties = {
  position: "absolute",
  width: 0,
  height: 0,
  overflow: "hidden",
  pointerEvents: "none",
};

const OVERLAY_DIV_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: "100vh",
  pointerEvents: "none",
  zIndex: 9999,
  opacity: 0.32,
  overflow: "hidden",
  backgroundImage: R83_PAPER_GRAIN_TILE_URI,
  backgroundSize: "256px 256px",
  backgroundRepeat: "repeat",
};

interface OwnershipState {
  defsOwner: number | null;
  overlayOwner: number | null;
}

let nextInstanceId = 1;
const mountedDefsCandidates = new Set<number>();
const mountedOverlayCandidates = new Set<number>();
const listeners = new Set<() => void>();
let state: OwnershipState = { defsOwner: null, overlayOwner: null };

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OwnershipState {
  return state;
}

const SERVER_SNAPSHOT: OwnershipState = { defsOwner: null, overlayOwner: null };

function getServerSnapshot(): OwnershipState {
  return SERVER_SNAPSHOT;
}

function hasExternalElement(elementId: string, selfId: number): boolean {
  if (typeof document === "undefined") return false;
  const existing = document.getElementById(elementId);
  if (!existing) return false;
  return existing.getAttribute("data-r83-owner") !== String(selfId);
}

function pickNextOwner(candidates: Set<number>, elementId: string): number | null {
  for (const candidate of candidates) {
    if (!hasExternalElement(elementId, candidate)) {
      return candidate;
    }
  }
  return null;
}

function registerInstance(id: number, wantsOverlay: boolean): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  mountedDefsCandidates.add(id);
  if (wantsOverlay) {
    mountedOverlayCandidates.add(id);
  }

  let nextDefs = state.defsOwner;
  let nextOverlay = state.overlayOwner;

  if (nextDefs === null && !hasExternalElement("lc-defs", id)) {
    nextDefs = id;
  }
  if (wantsOverlay && nextOverlay === null && !hasExternalElement("lc-paper-overlay", id)) {
    nextOverlay = id;
  }

  if (nextDefs !== state.defsOwner || nextOverlay !== state.overlayOwner) {
    state = { defsOwner: nextDefs, overlayOwner: nextOverlay };
    emitChange();
  }
}

function unregisterInstance(id: number): void {
  mountedDefsCandidates.delete(id);
  mountedOverlayCandidates.delete(id);

  let nextDefs = state.defsOwner;
  let nextOverlay = state.overlayOwner;

  if (nextDefs === id) {
    nextDefs = pickNextOwner(mountedDefsCandidates, "lc-defs");
  }
  if (nextOverlay === id) {
    nextOverlay = pickNextOwner(mountedOverlayCandidates, "lc-paper-overlay");
  }

  if (nextDefs !== state.defsOwner || nextOverlay !== state.overlayOwner) {
    state = { defsOwner: nextDefs, overlayOwner: nextOverlay };
    emitChange();
  }
}

export interface PaperOverlayProps {
  /** Render the static 256px paper grain overlay layer (default: true). */
  readonly showGrain?: boolean;
}

/**
 * Port of proto-html/r83/shared/lc.js:
 * - Renders `<svg id="lc-defs">` gradients once per document.
 * - Renders static 256px paper grain tile `<div id="lc-paper-overlay">` once per document.
 * - Guarded for SSR/static export and idempotent under React StrictMode.
 */
export function PaperOverlay({ showGrain = true }: PaperOverlayProps = {}) {
  const idRef = useRef<number | null>(null);
  if (idRef.current === null) {
    idRef.current = nextInstanceId++;
  }
  const instanceId = idRef.current;

  const ownership = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    registerInstance(instanceId, showGrain);
    return () => {
      unregisterInstance(instanceId);
    };
  }, [instanceId, showGrain]);

  const renderDefs = ownership.defsOwner === instanceId;
  const renderOverlay = showGrain && ownership.overlayOwner === instanceId;

  if (!renderDefs && !renderOverlay) {
    return null;
  }

  return (
    <>
      {renderDefs ? (
        <svg
          id="lc-defs"
          data-testid="r83-paper-defs"
          data-r83-owner={String(instanceId)}
          width={0}
          height={0}
          aria-hidden="true"
          style={DEFS_SVG_STYLE}
        >
          <defs>
            {LC_GRADIENTS.map((grad) => (
              <linearGradient
                key={grad.id}
                id={grad.id}
                x1={grad.x1}
                y1={grad.y1}
                x2={grad.x2}
                y2={grad.y2}
              >
                {grad.stops.map((stop) => (
                  <stop
                    key={`${grad.id}-${stop.offset}`}
                    offset={stop.offset}
                    stopColor={stop.stopColor}
                  />
                ))}
              </linearGradient>
            ))}
          </defs>
        </svg>
      ) : null}
      {renderOverlay ? (
        <div
          id="lc-paper-overlay"
          className="r83-paper-overlay"
          data-testid="r83-paper-overlay"
          data-r83-owner={String(instanceId)}
          aria-hidden="true"
          style={OVERLAY_DIV_STYLE}
        />
      ) : null}
    </>
  );
}
