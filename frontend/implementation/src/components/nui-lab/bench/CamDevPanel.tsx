"use client";

/**
 * R22B B7.2: Developer Camera Controls Panel (`?camdev=1`, default OFF).
 *
 * Inspects `MediaStreamTrack.getCapabilities()` and allows safe, `try/catch`-guarded adjustments to
 * supported UVC controls (`exposureMode`, `exposureCompensation`, `brightness`, `contrast`).
 * Every change logs `CAMERA_SETTING_CHANGED{before, after}` to the active benchmark session.
 */
import { useEffect, useRef, useState } from "react";
import { probeCameraExposureCapabilities, type CameraExposureCapabilities } from "./r20-lowlight";

export interface CamDevSettingChange {
  setting: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

interface InitialCamSettings {
  exposureMode: string | null;
  exposureCompensation: number | null;
  brightness: number | null;
  contrast: number | null;
}

export function CamDevPanel({
  track,
  capabilities,
  onCapabilitiesChange,
  onSettingChanged,
}: {
  track: MediaStreamTrack | null;
  capabilities: CameraExposureCapabilities | null;
  onCapabilitiesChange: (next: CameraExposureCapabilities) => void;
  onSettingChanged: (change: CamDevSettingChange) => void;
}) {
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initialRef = useRef<{ trackId: string; settings: InitialCamSettings } | null>(null);

  useEffect(() => {
    if (!track || !capabilities) {
      initialRef.current = null;
      return;
    }
    const tid = track.id || "primary-track";
    if (!initialRef.current || initialRef.current.trackId !== tid) {
      initialRef.current = {
        trackId: tid,
        settings: {
          exposureMode: capabilities.currentExposureMode,
          exposureCompensation: capabilities.currentExposureCompensation,
          brightness: capabilities.currentBrightness,
          contrast: capabilities.currentContrast,
        },
      };
    }
  }, [track, capabilities]);

  const applySetting = async (
    setting: string,
    constraint: Record<string, unknown>,
  ): Promise<void> => {
    if (!track || typeof track.applyConstraints !== "function") {
      setStatusMsg("Track kamera tidak mendukung applyConstraints().");
      return;
    }
    setBusy(true);
    setStatusMsg(null);
    const beforeCaps = probeCameraExposureCapabilities(track);
    const before = {
      exposureMode: beforeCaps.currentExposureMode,
      exposureCompensation: beforeCaps.currentExposureCompensation,
      brightness: beforeCaps.currentBrightness,
      contrast: beforeCaps.currentContrast,
    };
    try {
      await track.applyConstraints({
        advanced: [constraint as MediaTrackConstraintSet],
      });
      const afterCaps = probeCameraExposureCapabilities(track);
      const after = {
        exposureMode: afterCaps.currentExposureMode,
        exposureCompensation: afterCaps.currentExposureCompensation,
        brightness: afterCaps.currentBrightness,
        contrast: afterCaps.currentContrast,
      };
      onCapabilitiesChange(afterCaps);
      onSettingChanged({ setting, before, after });
      setStatusMsg(`Pengaturan ${setting} diperbarui.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg(`Gagal menerapkan ${setting}: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    const init = initialRef.current?.settings;
    if (!init || !track) return;
    const patch: Record<string, unknown> = {};
    if (init.exposureMode !== null) patch.exposureMode = init.exposureMode;
    if (init.exposureCompensation !== null) patch.exposureCompensation = init.exposureCompensation;
    if (init.brightness !== null) patch.brightness = init.brightness;
    if (init.contrast !== null) patch.contrast = init.contrast;
    if (Object.keys(patch).length === 0) {
      setStatusMsg("Tidak ada pengaturan awal yang dapat dipulihkan.");
      return;
    }
    await applySetting("reset", patch);
  };

  const hasAnyControl = Boolean(
    capabilities &&
      (capabilities.exposureMode?.length ||
        capabilities.exposureCompensation ||
        capabilities.brightness ||
        capabilities.contrast),
  );

  return (
    <section
      className="nui-lab__panel nui-lab__dev-panel"
      data-testid="camdev-panel"
      aria-label="Kontrol kamera pengembang (UVC)"
    >
      <div className="nui-lab__info-head">
        <h3>Kontrol Kamera UVC (?camdev=1)</h3>
        <button
          type="button"
          className="nui-lab__button nui-lab__button--compact"
          data-testid="camdev-reset-btn"
          disabled={!track || !hasAnyControl || busy}
          onClick={() => void handleReset()}
        >
          Reset ke default
        </button>
      </div>

      {!track || !capabilities ? (
        <p className="nui-lab__muted">Nyalakan kamera untuk memeriksa kapabilitas eksposur / brightness / contrast.</p>
      ) : !capabilities.hasGetCapabilities ? (
        <p className="nui-lab__muted">Browser/driver kamera tidak mendukung MediaStreamTrack.getCapabilities().</p>
      ) : !hasAnyControl ? (
        <p className="nui-lab__muted">
          Kapabilitas kamera terdeteksi, tetapi driver tidak menyediakan kontrol exposureMode, exposureCompensation,
          brightness, atau contrast.
        </p>
      ) : (
        <div className="nui-lab__dev-controls">
          {capabilities.exposureMode && capabilities.exposureMode.length > 0 && (
            <div className="nui-lab__dev-row">
              <span>
                Mode eksposur: <strong>{capabilities.currentExposureMode ?? "—"}</strong>
              </span>
              <div className="nui-lab__row">
                {capabilities.exposureMode.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className="nui-lab__button nui-lab__button--compact"
                    aria-pressed={capabilities.currentExposureMode === mode}
                    disabled={busy}
                    onClick={() => void applySetting("exposureMode", { exposureMode: mode })}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          )}

          {capabilities.exposureCompensation && (
            <label className="nui-lab__dev-slider">
              <span>
                Kompensasi eksposur:{" "}
                <strong>
                  {capabilities.currentExposureCompensation !== null
                    ? capabilities.currentExposureCompensation.toFixed(2)
                    : "—"}
                </strong>{" "}
                ({capabilities.exposureCompensation.min} .. {capabilities.exposureCompensation.max})
              </span>
              <input
                type="range"
                min={capabilities.exposureCompensation.min}
                max={capabilities.exposureCompensation.max}
                step={capabilities.exposureCompensation.step || 0.1}
                value={capabilities.currentExposureCompensation ?? capabilities.exposureCompensation.min}
                disabled={busy}
                onChange={(e) =>
                  void applySetting("exposureCompensation", { exposureCompensation: Number(e.target.value) })
                }
              />
            </label>
          )}

          {capabilities.brightness && (
            <label className="nui-lab__dev-slider">
              <span>
                Brightness:{" "}
                <strong>{capabilities.currentBrightness !== null ? capabilities.currentBrightness.toFixed(1) : "—"}</strong>{" "}
                ({capabilities.brightness.min} .. {capabilities.brightness.max})
              </span>
              <input
                type="range"
                min={capabilities.brightness.min}
                max={capabilities.brightness.max}
                step={capabilities.brightness.step || 1}
                value={capabilities.currentBrightness ?? capabilities.brightness.min}
                disabled={busy}
                onChange={(e) => void applySetting("brightness", { brightness: Number(e.target.value) })}
              />
            </label>
          )}

          {capabilities.contrast && (
            <label className="nui-lab__dev-slider">
              <span>
                Contrast:{" "}
                <strong>{capabilities.currentContrast !== null ? capabilities.currentContrast.toFixed(1) : "—"}</strong>{" "}
                ({capabilities.contrast.min} .. {capabilities.contrast.max})
              </span>
              <input
                type="range"
                min={capabilities.contrast.min}
                max={capabilities.contrast.max}
                step={capabilities.contrast.step || 1}
                value={capabilities.currentContrast ?? capabilities.contrast.min}
                disabled={busy}
                onChange={(e) => void applySetting("contrast", { contrast: Number(e.target.value) })}
              />
            </label>
          )}
        </div>
      )}

      {statusMsg && (
        <p className="nui-lab__muted" role="status" data-testid="camdev-status">
          {statusMsg}
        </p>
      )}
    </section>
  );
}
