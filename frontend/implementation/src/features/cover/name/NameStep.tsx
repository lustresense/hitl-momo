"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { audio } from "@/src/audio";
import { COVER_NAME_COPY } from "@/src/domain/copy/cover";
import { ringAriaLabel } from "@/src/domain/copy/nui";
import { OwnerIcon } from "@/src/components/ui/owner-icons";
import { useNuiTarget } from "@/src/nui";
import { HOLD_MS_DEFAULT, NAME_MAX_CHARS, RING_SVG_RADIUS_PX } from "@/src/nui/core/constants";
import { createDefaultNameProviders, listenWithFallback } from "./name-provider";
import { normalizeName } from "./normalize-name";
import { createSimNameProvider, SIM_SAMPLE_NAME } from "./providers/sim";
import { createTypedNameProvider, type TypedNameProvider } from "./providers/typed";

const RING_CIRC = (2 * Math.PI * RING_SVG_RADIUS_PX).toFixed(4);
const WAVE_BARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export interface NameStepProps {
  readonly ready: boolean;
  readonly devTools?: boolean;
  readonly cardRef: RefObject<HTMLDivElement>;
  readonly onSay: (text: string) => void;
  readonly onCaptured: (name: string) => void;
}

/**
 * Langkah kenalan nama walkie-talkie (`proto-html/r83/index.html:516, 1110-1194`).
 * - Ring "Mulai bicara" (aturan A, 1000 ms, ikon cubit + mik).
 * - Gelombang 13 bar hijau `#sound-wave`, durasi dengar `NAME_LISTEN_MS = 7000`.
 * - Fallback ketik chrome (`[data-nui-off]`) untuk guru/anak saat `stt-lab` unavailable.
 * - Privasi anak: nama tidak pernah masuk console atau Web Storage.
 */
export function NameStep({ ready, devTools = false, cardRef, onSay, onCaptured }: NameStepProps) {
  const startRef = useRef<HTMLDivElement>(null);
  const startFillRef = useRef<SVGCircleElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const typedProviderRef = useRef<TypedNameProvider | null>(null);
  const onSayRef = useRef(onSay);
  onSayRef.current = onSay;
  const onCapturedRef = useRef(onCaptured);
  onCapturedRef.current = onCaptured;

  const [listening, setListening] = useState(false);
  const [typedOpen, setTypedOpen] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const [interimText, setInterimText] = useState("");
  const [noteText, setNoteText] = useState("");

  const stopListening = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    typedProviderRef.current = null;
    setListening(false);
  }, []);

  useEffect(() => () => stopListening(), [stopListening]);

  const openTypedBox = useCallback(
    (note: string, bubblePrompt: string) => {
      stopListening();
      setTypedOpen(true);
      setInterimText("");
      setNoteText(note);
      onSayRef.current(bubblePrompt);
      if (typeof window !== "undefined") {
        window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
      }
    },
    [stopListening],
  );

  const startListening = useCallback(() => {
    if (!ready || listening || typedOpen) return;
    stopListening();

    const ac = new AbortController();
    abortRef.current = ac;
    const typedProvider = createTypedNameProvider();
    typedProviderRef.current = typedProvider;
    const providers = createDefaultNameProviders({
      devTools,
      typed: typedProvider,
      includeSimInChain: devTools,
      onInterim: (txt) => setInterimText(txt),
    });

    setListening(true);
    setInterimText("");
    setNoteText("");
    onSayRef.current(COVER_NAME_COPY.bubbleListening);

    void listenWithFallback(providers, ac.signal, {
      onFallbackToTyped: () => {
        setListening(false);
        setTypedOpen(true);
        setInterimText("");
        setNoteText(devTools ? COVER_NAME_COPY.simUnavailableNote : COVER_NAME_COPY.typedUnavailableNote);
        onSayRef.current(COVER_NAME_COPY.bubbleTypedPrompt);
        if (typeof window !== "undefined") {
          window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
        }
      },
    }).then((outcome) => {
      if (ac.signal.aborted) return;
      if (outcome.status === "ok") {
        setListening(false);
        setInterimText("");
        setNoteText(outcome.simulated ? COVER_NAME_COPY.simUnavailableNote : "");
        onCapturedRef.current(outcome.name);
        return;
      }
      if (outcome.status === "empty") {
        if (outcome.provider === "typed") {
          setNoteText(COVER_NAME_COPY.typedEmptyHint);
          return;
        }
        setListening(false);
        setInterimText("");
        onSayRef.current(COVER_NAME_COPY.bubbleNotHeard);
        return;
      }
      if (outcome.status === "unavailable") {
        openTypedBox(
          devTools ? COVER_NAME_COPY.simUnavailableNote : COVER_NAME_COPY.typedUnavailableNote,
          COVER_NAME_COPY.bubbleTypedPrompt,
        );
      }
    });
  }, [devTools, listening, openTypedBox, ready, stopListening, typedOpen]);

  const handleTypedSubmit = useCallback(() => {
    const cleaned = normalizeName(typedValue);
    if (!cleaned) {
      setNoteText(COVER_NAME_COPY.typedEmptyHint);
      return;
    }
    setNoteText("");
    audio.emit("ui.tap"); // valid typed name (empty input returned above)
    if (typedProviderRef.current) {
      typedProviderRef.current.submit(typedValue);
      return;
    }
    onCapturedRef.current(cleaned);
  }, [typedValue]);

  const handleSimSample = useCallback(() => {
    if (!devTools) return;
    const sim = createSimNameProvider({ devTools: true, fallbackDelayMs: 0 });
    void sim.listen(new AbortController().signal).then((res) => {
      if (res.status === "ok") {
        setNoteText(COVER_NAME_COPY.simUnavailableNote);
        onCapturedRef.current(res.name || SIM_SAMPLE_NAME);
      }
    });
  }, [devTools]);

  useNuiTarget(startRef, {
    label: COVER_NAME_COPY.startLabel,
    holdMs: HOLD_MS_DEFAULT,
    mode: "any",
    disabled: !ready || listening || typedOpen,
    fillRef: startFillRef,
    badge: false,
    trackState: false,
    onFire: startListening,
  });

  const cardClasses = [
    "name-card",
    ready ? "ready" : "",
    listening ? "is-listening" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={cardRef} id="name-card" className={cardClasses} aria-live="polite" data-testid="r83-name-card">
      <div id="name-heard" className={interimText ? "interim" : undefined} data-testid="r83-name-heard">
        {interimText}
      </div>

      <div
        id="sound-wave"
        className={`sound-wave${listening ? " is-active" : ""}`}
        aria-hidden="true"
        data-testid="r83-sound-wave"
      >
        {WAVE_BARS.map((n) => (
          <span key={n} className={`bar b${n}`} />
        ))}
      </div>

      {!listening && !typedOpen ? (
        <div
          ref={startRef}
          id="name-start"
          className="thumb-confirm"
          role="progressbar"
          tabIndex={ready ? 0 : undefined}
          aria-label={ringAriaLabel(COVER_NAME_COPY.startLabel)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          data-testid="r83-name-start"
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="thumb-confirm__face">
            <svg className="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true">
              <circle className="thumb-confirm__track" cx="36" cy="36" r={RING_SVG_RADIUS_PX} />
              <circle
                ref={startFillRef}
                className="thumb-confirm__fill"
                cx="36"
                cy="36"
                r={RING_SVG_RADIUS_PX}
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC}
                transform="rotate(-90 36 36)"
              />
            </svg>
            <span className="thumb-confirm__thumb">
              <OwnerIcon name="gesture-pinch" size={30} />
            </span>
          </span>
          <span className="thumb-confirm__label">
            <span className="nm-mic" aria-hidden="true">
              <OwnerIcon name="mic" size={18} />
            </span>
            {COVER_NAME_COPY.startLabel}
          </span>
        </div>
      ) : null}

      {!typedOpen ? (
        <button
          type="button"
          id="name-typelink"
          className="name-typelink"
          data-nui-off="true"
          data-testid="r83-name-typelink"
          disabled={!ready}
          onClick={() =>
            openTypedBox(
              devTools ? COVER_NAME_COPY.simUnavailableNote : COVER_NAME_COPY.typedUnavailableNote,
              COVER_NAME_COPY.bubbleTypedPrompt,
            )
          }
        >
          {COVER_NAME_COPY.typedLinkLabel}
        </button>
      ) : null}

      <div
        id="name-type"
        className={`name-type${typedOpen ? " on" : ""}`}
        data-nui-off="true"
        data-testid="r83-name-type"
      >
        <span className="name-sim">
          {devTools ? COVER_NAME_COPY.simBadgeLabel : COVER_NAME_COPY.typedBadgeLabel}
        </span>
        <input
          ref={inputRef}
          id="name-input"
          type="text"
          maxLength={NAME_MAX_CHARS}
          placeholder={COVER_NAME_COPY.typedPlaceholder}
          autoComplete="off"
          aria-label={COVER_NAME_COPY.typedInputAriaLabel}
          data-nui-off="true"
          data-testid="r83-name-input"
          value={typedValue}
          onChange={(e) => setTypedValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleTypedSubmit();
            }
          }}
        />
        <button
          type="button"
          id="name-type-ok"
          className="nb-btn"
          data-nui-off="true"
          data-testid="r83-name-type-submit"
          onClick={handleTypedSubmit}
        >
          {COVER_NAME_COPY.typedSubmitLabel}
        </button>
        {devTools ? (
          <button
            type="button"
            className="nb-btn ghost"
            data-nui-off="true"
            data-testid="r83-name-sim-sample"
            onClick={handleSimSample}
          >
            {COVER_NAME_COPY.simSampleActionLabel}
          </button>
        ) : null}
      </div>

      <p id="name-note" className="name-note" data-testid="r83-name-note">
        {noteText}
      </p>
    </div>
  );
}
