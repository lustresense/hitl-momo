"use client";

/**
 * SAKLAR TOMBOL "LEWATI" (UI r8.3). Ini satu-satunya tempat aturan tampil/sembunyinya.
 * Cara mengubahnya (admin, command, env): lihat `docs/SKIP_BUTTON.md`.
 *
 * Urutan yang menang:
 *   1. Pilihan admin di server: GET /api/settings/skip-button -> { enabled: true | false }.
 *   2. Kalau admin belum memilih (`enabled: null`): bawaan build.
 * Bawaan build: NEXT_PUBLIC_SKIP_BUTTON ("1" tampil, "0" sembunyi); kalau kosong, ikut NEXT_PUBLIC_DEV_TOOLS.
 * Kalau server tidak terjangkau, jawaban server terakhir yang tersimpan di browser tetap dipakai.
 */
import { useEffect, useState } from "react";
import { env } from "./env";

export const SKIP_BUTTON_SETTING_PATH = "/api/settings/skip-button";
const CACHE_KEY = "momo.skipButton";

export function skipButtonBuildDefault(): boolean {
  const raw = (process.env.NEXT_PUBLIC_SKIP_BUTTON ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return env.devTools;
}

/** `undefined` = belum ada jawaban server yang tersimpan; `null` = admin belum memilih. */
function readCachedSetting(): boolean | null | undefined {
  try {
    const value = window.localStorage.getItem(CACHE_KEY);
    if (value === "1") return true;
    if (value === "0") return false;
    return value === "default" ? null : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedSetting(value: boolean | null): void {
  try {
    window.localStorage.setItem(CACHE_KEY, value === null ? "default" : value ? "1" : "0");
  } catch {
    /* storage disabled */
  }
}

/** Jawaban server, atau `undefined` bila tidak terjangkau / endpoint belum ada. */
export async function fetchSkipButtonSetting(baseUrl: string): Promise<boolean | null | undefined> {
  try {
    const res = await fetch(`${baseUrl}${SKIP_BUTTON_SETTING_PATH}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { enabled?: unknown };
    if (typeof data.enabled === "boolean") return data.enabled;
    return data.enabled === null ? null : undefined;
  } catch {
    return undefined;
  }
}

/** Apakah tombol "Lewati" harus tampil. Dibaca ulang saat tab game kembali difokuskan. */
export function useSkipButtonVisible(): boolean {
  const [setting, setSetting] = useState<boolean | null | undefined>(() =>
    typeof window === "undefined" ? undefined : readCachedSetting(),
  );

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (typeof fetch !== "function") return;
      void fetchSkipButtonSetting(env.apiBaseUrl).then((next) => {
        if (!alive || next === undefined) return;
        writeCachedSetting(next);
        setSetting(next);
      });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return typeof setting === "boolean" ? setting : skipButtonBuildDefault();
}
