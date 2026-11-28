"use client";
import { useEffect, useRef, useState } from "react";
import { audio } from "../index";
import { useAudioPrefs, useAudioState } from "../react/hooks";

/** Self-drawn speaker glyph (the Owner icon set has no speaker; flagged for Owner approval in docs/audio/AUDIO_ARCHITECTURE.md). */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor" fillOpacity="0.15" />
      {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />}
    </svg>
  );
}

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
};

/**
 * Mouse/touch audio control (master, music, effects, mute). Lives outside the NUI target set (`data-nui-off`), so hand
 * tracking never interacts with it and it never competes with ring targets. Sound is never the only feedback in the game,
 * so muting changes nothing about what is shown.
 */
export function AudioControl() {
  const prefs = useAudioPrefs();
  const state = useAudioState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if ((e.key === "m" || e.key === "M") && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !isTyping(e.target)) {
        const next = !audio.getPrefs().muted;
        audio.setPrefs({ muted: next });
        if (!next) audio.emit("ui.toggle_on");
      }
    };
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  if (state === "unsupported") return null;
  const muted = prefs.muted || prefs.master <= 0;
  const pct = (v: number) => Math.round(v * 100);

  return (
    <div ref={rootRef} className="r83-audio" data-nui-off="true" data-testid="audio-control" data-audio-state={state}>
      <button
        type="button"
        className="r83-audio-btn"
        data-nui-off="true"
        data-testid="audio-toggle"
        aria-label="Pengaturan suara"
        aria-expanded={open}
        aria-controls="r83-audio-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <SpeakerIcon muted={muted} />
      </button>
      {open ? (
        <div id="r83-audio-panel" className="r83-audio-panel" role="group" aria-label="Suara" data-nui-off="true" data-testid="audio-panel">
          <button
            type="button"
            className="r83-audio-mute"
            data-nui-off="true"
            data-testid="audio-mute"
            aria-pressed={prefs.muted}
            onClick={() => {
              audio.setPrefs({ muted: !prefs.muted });
              if (prefs.muted) audio.emit("ui.toggle_on");
            }}
          >
            {prefs.muted ? "Nyalakan suara" : "Bisukan"}
          </button>
          {(
            [
              ["master", "Utama", "audio-master"],
              ["music", "Musik", "audio-music"],
              ["sfx", "Efek", "audio-sfx"],
            ] as const
          ).map(([key, label, testId]) => (
            <label key={key} className="r83-audio-row">
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={pct(prefs[key])}
                data-nui-off="true"
                data-testid={testId}
                aria-label={`Volume ${label.toLowerCase()}`}
                aria-valuetext={`${pct(prefs[key])} persen`}
                onChange={(e) => audio.setPrefs({ [key]: Number(e.target.value) / 100, muted: false })}
                onPointerUp={() => {
                  if (key !== "music") audio.emit("ui.tap");
                }}
              />
              <output>{pct(prefs[key])}</output>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
