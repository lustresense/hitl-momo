"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import { AUDIO_EVENTS, AUDIO_SCENES, audio, type AudioEventId, type AudioSceneId } from "../index";
import { useAudioPrefs, useAudioState, useAudioUnlock } from "../react/hooks";
import type { DiagEvent, DiagSnapshot, LoopHandle } from "../types";

const box = { border: "1px solid #999", borderRadius: 8, padding: 12, background: "#fff" } as const;
const btn = { margin: 2, padding: "4px 8px", border: "1px solid #333", borderRadius: 6, background: "#f6f2e8", cursor: "pointer", font: "inherit", fontSize: 13 } as const;

/**
 * Developer-only Audio Lab (`/dev/audio`, needs NEXT_PUBLIC_DEV_TOOLS=1): preview every event and scene, test loops and
 * crossfades under stress, watch voices, buses, loads, drops and the live event log. Not part of the student experience.
 */
export function AudioLab() {
  useAudioUnlock();
  const prefs = useAudioPrefs();
  const state = useAudioState();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [log, setLog] = useState<readonly DiagEvent[]>([]);
  const [snap, setSnap] = useState<DiagSnapshot>(() => audio.snapshot());
  const [filter, setFilter] = useState("");
  const [loops] = useState(() => new Map<string, LoopHandle>());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    audio.setLogging(true);
    const off = audio.subscribeDiag(() => undefined);
    const id = setInterval(() => {
      setSnap(audio.snapshot());
      setLog([...audio.events()].slice(-80).reverse());
      tick();
    }, 400);
    return () => {
      off();
      clearInterval(id);
      for (const h of loops.values()) h.stop(50);
    };
  }, [loops]);

  const eventIds = useMemo(() => (Object.keys(AUDIO_EVENTS) as AudioEventId[]).filter((k) => k.includes(filter)), [filter]);
  const sceneIds = Object.keys(AUDIO_SCENES) as AudioSceneId[];
  if (!mounted) return <main data-testid="audio-lab" />; // client-only state (prefs, diagnostics): avoid a hydration mismatch

  const stress = () => {
    const seq: AudioSceneId[] = ["cover", "tutorial", "levels", "canvas", "world1", "cover", "ending", "canvas"];
    seq.forEach((s, i) => setTimeout(() => audio.scene(s), i * 120));
  };

  return (
    <main data-testid="audio-lab" style={{ padding: 16, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <h1 style={{ fontSize: 20 }}>Audio Lab (developer only)</h1>
      <p>
        State: <b data-testid="lab-state">{state}</b>. Tekan tombol apa pun untuk membuka AudioContext (kebijakan autoplay). Tidak ada suara yang dibuat di luar mesin
        audio tunggal.
      </p>

      <section style={box}>
        <h2 style={{ fontSize: 16 }}>Bus dan preferensi</h2>
        {(["master", "music", "sfx"] as const).map((k) => (
          <label key={k} style={{ display: "block" }}>
            {k}: <input type="range" min={0} max={100} value={Math.round(prefs[k] * 100)} onChange={(e) => audio.setPrefs({ [k]: Number(e.target.value) / 100 })} /> {Math.round(prefs[k] * 100)}
          </label>
        ))}
        <label>
          <input type="checkbox" checked={prefs.muted} onChange={(e) => audio.setPrefs({ muted: e.target.checked })} /> mute
        </label>
        <button style={btn} onClick={() => void audio.unlock()}>unlock</button>
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <h2 style={{ fontSize: 16 }}>Scene musik (crossfade)</h2>
        {sceneIds.map((s) => (
          <button key={s} style={btn} data-testid={`lab-scene-${s}`} onClick={() => audio.scene(s)}>{s}</button>
        ))}
        <button style={{ ...btn, background: "#ffe1b3" }} data-testid="lab-stress" onClick={stress}>stres: 8 scene dalam 1 detik</button>
        <button style={btn} onClick={() => audio.scene(null)}>diam</button>
        <button style={btn} onClick={() => audio.duck(-10, 1200)}>duck -10 dB</button>
        <button style={btn} onClick={() => audio.musicPatch({ gain: 0.6, lowpassHz: 3000, rampS: 0.6 })}>patch tenang</button>
        <button style={btn} onClick={() => audio.musicPatch({ gain: 1, lowpassHz: 20000, rampS: 0.6 })}>patch normal</button>
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <h2 style={{ fontSize: 16 }}>Loop</h2>
        {(["draw.pencil", "draw.eraser", "nui.hold"] as const).map((id) => (
          <button
            key={id}
            style={btn}
            onClick={() => {
              const cur = loops.get(id);
              if (cur?.active) {
                cur.stop(120);
                loops.delete(id);
              } else loops.set(id, audio.loop(id, { gain: 0.8 }));
            }}
          >
            {id} {loops.get(id)?.active ? "(on)" : ""}
          </button>
        ))}
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <h2 style={{ fontSize: 16 }}>Event ({eventIds.length})</h2>
        <input placeholder="filter (mis. ui., hitl.)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div>
          {eventIds.map((id) => (
            <button key={id} style={btn} title={AUDIO_EVENTS[id].assets.join(", ")} onClick={() => audio.emit(id)}>{id}</button>
          ))}
        </div>
        <button style={{ ...btn, background: "#ffe1b3" }} data-testid="lab-spam" onClick={() => { for (let i = 0; i < 40; i++) audio.emit("ui.tap"); }}>spam ui.tap x40 (uji cooldown)</button>
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <h2 style={{ fontSize: 16 }}>Diagnostik</h2>
        <pre data-testid="lab-snapshot" style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
{JSON.stringify({ ...snap, loadedBuffers: snap.loadedBuffers.map((b) => `${b.id} ${b.seconds.toFixed(1)}s ${(b.bytesEstimate / 1048576).toFixed(1)}MB`) }, null, 1)}
        </pre>
      </section>

      <section style={{ ...box, marginTop: 12 }}>
        <h2 style={{ fontSize: 16 }}>Log event (80 terakhir)</h2>
        <ol data-testid="lab-log" style={{ fontSize: 12, maxHeight: 260, overflow: "auto", margin: 0, paddingLeft: 20 }}>
          {log.map((e, i) => (
            <li key={`${e.t}-${i}`}>{e.t} ms · {e.kind} · {e.id}{e.detail ? ` · ${e.detail}` : ""}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
