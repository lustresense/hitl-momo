"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { COVER_NAME_COPY } from "@/src/domain/copy/cover";
import { parseBubbleSegments } from "@/src/features/shared";
import { computeCurlFrame } from "./book-curl-math";
import { CoverSpiralBinding } from "./CoverDecorations";
import "./cover-book.css";

export interface BookCurlHandle {
  applyProgress(progress: number): void;
  resize(): void;
}

export interface BookCurlTransitionProps {
  readonly visible: boolean;
  readonly viewportWidth: number;
  readonly rulerPageRef: RefObject<HTMLDivElement>;
  readonly bookFrontCoverRef: RefObject<HTMLDivElement>;
  readonly bookInsideBubbleRef: RefObject<HTMLDivElement>;
  readonly insideBubbleText: string;
  readonly insideBubbleVisible: boolean;
  readonly blankInsidePage?: boolean;
  readonly children: ReactNode;
}

/**
 * Transisi buka buku 3D diagonal cover-matching (`proto-html/r83/index.html:509-532, 1013-1073`).
 * `#book-front-cover` mengkloning tampilan sampul bersih (serat abu-abu + dots + spiral)
 * dan mengelupas dari pojok kanan bawah menggunakan `clip-path: url(#front-unpeeled-clip)` tanpa scrim gelap.
 */
export const BookCurlTransition = forwardRef<BookCurlHandle, BookCurlTransitionProps>(
  function BookCurlTransition(
    {
      visible,
      viewportWidth,
      rulerPageRef,
      bookFrontCoverRef,
      bookInsideBubbleRef,
      insideBubbleText,
      insideBubbleVisible,
      blankInsidePage = false,
      children,
    },
    ref,
  ) {
    const pageStageRef = useRef<SVGSVGElement | null>(null);
    const outerRectRef = useRef<SVGRectElement | null>(null);
    const frontClipPathRef = useRef<SVGPathElement | null>(null);
    const greenBendOverlayRef = useRef<SVGRectElement | null>(null);
    const greenBendGradRef = useRef<SVGLinearGradientElement | null>(null);
    const curlBackGradRef = useRef<SVGLinearGradientElement | null>(null);
    const flapShadowPathRef = useRef<SVGPathElement | null>(null);
    const curlFlapPathRef = useRef<SVGPathElement | null>(null);
    const lastProgressRef = useRef(0);

    const applyProgress = useCallback(
      (progress: number) => {
        lastProgressRef.current = progress;
        if (typeof window === "undefined") return;
        const w = window.innerWidth || 1024;
        const h = window.innerHeight || 768;
        const geom = computeCurlFrame(progress, w, h);

        if (rulerPageRef.current) {
          rulerPageRef.current.style.clipPath = geom.rulerClipPath;
        }
        if (frontClipPathRef.current) {
          frontClipPathRef.current.setAttribute("d", geom.frontClipD);
        }
        if (bookFrontCoverRef.current) {
          bookFrontCoverRef.current.style.visibility = geom.frontVisible ? "visible" : "hidden";
          bookFrontCoverRef.current.style.clipPath = "url(#front-unpeeled-clip)";
        }
        if (greenBendOverlayRef.current) {
          greenBendOverlayRef.current.setAttribute("opacity", String(geom.bendOpacity));
        }
        if (flapShadowPathRef.current) {
          flapShadowPathRef.current.setAttribute("d", geom.flapD);
          flapShadowPathRef.current.setAttribute("opacity", String(geom.shadowOpacity));
        }
        if (curlFlapPathRef.current) {
          curlFlapPathRef.current.setAttribute("d", geom.flapD);
          curlFlapPathRef.current.setAttribute("opacity", String(geom.flapOpacity));
        }
        if (curlBackGradRef.current) {
          curlBackGradRef.current.setAttribute("x1", String(geom.curlBackGrad.x1));
          curlBackGradRef.current.setAttribute("y1", String(geom.curlBackGrad.y1));
          curlBackGradRef.current.setAttribute("x2", String(geom.curlBackGrad.x2));
          curlBackGradRef.current.setAttribute("y2", String(geom.curlBackGrad.y2));
        }
        if (greenBendGradRef.current) {
          greenBendGradRef.current.setAttribute("x1", String(geom.greenBendGrad.x1));
          greenBendGradRef.current.setAttribute("y1", String(geom.greenBendGrad.y1));
          greenBendGradRef.current.setAttribute("x2", String(geom.greenBendGrad.x2));
          greenBendGradRef.current.setAttribute("y2", String(geom.greenBendGrad.y2));
        }
      },
      [bookFrontCoverRef, rulerPageRef],
    );

    const resize = useCallback(() => {
      if (typeof window === "undefined") return;
      const w = window.innerWidth || 1024;
      const h = window.innerHeight || 768;
      if (pageStageRef.current) {
        pageStageRef.current.setAttribute("viewBox", `0 0 ${w} ${h}`);
      }
      if (outerRectRef.current) {
        outerRectRef.current.setAttribute("width", String(w));
        outerRectRef.current.setAttribute("height", String(h));
      }
      if (greenBendOverlayRef.current) {
        greenBendOverlayRef.current.setAttribute("width", String(w));
        greenBendOverlayRef.current.setAttribute("height", String(h));
      }
      applyProgress(lastProgressRef.current);
    }, [applyProgress]);

    useImperativeHandle(ref, () => ({ applyProgress, resize }), [applyProgress, resize]);

    const bubbleSegments = parseBubbleSegments(insideBubbleText);

    return (
      <section
        id="book"
        className="camera-prototype-root"
        data-arrived={!blankInsidePage && insideBubbleVisible ? "true" : "false"}
        data-testid="r83-book"
        aria-label={COVER_NAME_COPY.bookAriaLabel}
        style={{ display: visible ? "block" : "none" }}
      >
        <div
          ref={rulerPageRef}
          id="ruler-page"
          data-testid="r83-name-page"
          aria-label={blankInsidePage ? undefined : COVER_NAME_COPY.pageAriaLabel}
          aria-hidden={blankInsidePage ? "true" : undefined}
          style={
            blankInsidePage
              ? {
                  backgroundColor: "var(--nb-paper)",
                  backgroundImage:
                    "radial-gradient(circle at 1px 1px, rgba(49, 45, 38, .20) 1.1px, transparent 1.5px)",
                  backgroundSize: "22px 22px",
                }
              : undefined
          }
        >
          {blankInsidePage ? null : (
            <>
              <h1 className="ruler-heading">{COVER_NAME_COPY.heading}</h1>
              <p className="ruler-sub">{COVER_NAME_COPY.subheading}</p>
              {children}
            </>
          )}
        </div>

        <div
          ref={bookFrontCoverRef}
          id="book-front-cover"
          data-testid="r83-book-front-cover"
          aria-hidden="true"
        >
          <CoverSpiralBinding id="cover-binding-clone" viewportWidth={viewportWidth} />
        </div>

        {blankInsidePage ? null : (
          <div
            ref={bookInsideBubbleRef}
            id="book-inside-bubble"
            data-side="right"
            data-testid="r83-book-inside-bubble"
            role="status"
            aria-live="polite"
          >
            {bubbleSegments.map((seg, i) => (seg.bold ? <strong key={i}>{seg.text}</strong> : seg.text))}
          </div>
        )}

        <svg ref={pageStageRef} id="page-stage" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <clipPath id="card-outer-clip">
              <rect ref={outerRectRef} id="outer-rect" x="0" y="0" width="1024" height="768" />
            </clipPath>
            <clipPath id="front-unpeeled-clip" clipPathUnits="userSpaceOnUse">
              <path ref={frontClipPathRef} id="front-clip-path" d="" />
            </clipPath>
            <linearGradient id="curl-back-grad" ref={curlBackGradRef} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#ded9cc" />
              <stop offset="12%" stopColor="#ebe6da" />
              <stop offset="26%" stopColor="#fffaf0" />
              <stop offset="48%" stopColor="#f7f5ea" />
              <stop offset="78%" stopColor="#eee9da" />
              <stop offset="100%" stopColor="#dfdbce" />
            </linearGradient>
            <linearGradient id="green-bend-grad" ref={greenBendGradRef} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="0">
              <stop offset="0%" stopColor="#000" stopOpacity="0.32" />
              <stop offset="30%" stopColor="#000" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#000" stopOpacity="0" />
            </linearGradient>
            <filter id="flap-drop-shadow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="18" />
              <feOffset dx="-12" dy="-12" result="shadowOffset" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.34" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g clipPath="url(#card-outer-clip)">
            <g id="front-cover-group" clipPath="url(#front-unpeeled-clip)">
              <rect
                ref={greenBendOverlayRef}
                id="green-bend-overlay"
                x="0"
                y="0"
                width="1024"
                height="768"
                fill="url(#green-bend-grad)"
                opacity="0"
              />
            </g>
            <path
              ref={flapShadowPathRef}
              id="flap-shadow-path"
              d=""
              fill="#000"
              opacity="0"
              filter="url(#flap-drop-shadow)"
            />
            <path
              ref={curlFlapPathRef}
              id="curl-flap-path"
              d=""
              fill="url(#curl-back-grad)"
              stroke="rgba(55,31,13,.18)"
              strokeWidth="1"
              strokeLinejoin="round"
              opacity="0"
            />
          </g>
        </svg>
      </section>
    );
  },
);
