"use client";
import { useEffect, useState } from "react";
import { ErrorBox } from "@/components/ui";
import { api, type SkipButtonSetting } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";

function describe(enabled: boolean | null): { title: string; detail: string } {
  if (enabled === true) {
    return {
      title: "Tombol Lewati DITAMPILKAN di game",
      detail: "Untuk dev dan demo. Matikan sebelum pengujian ke siswa.",
    };
  }
  if (enabled === false) {
    return {
      title: "Tombol Lewati DISEMBUNYIKAN di game",
      detail: "Siswa tidak bisa melewati adegan. Ini pilihan untuk pengujian.",
    };
  }
  return {
    title: "Belum diatur",
    detail:
      "Game mengikuti bawaan build: build dev (NEXT_PUBLIC_SKIP_BUTTON=1 atau NEXT_PUBLIC_DEV_TOOLS=1) menampilkan tombol, build biasa menyembunyikannya.",
  };
}

export default function SkipButtonPage() {
  const user = useRequireUser("admin");
  const [setting, setSetting] = useState<SkipButtonSetting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .getSkipButton()
      .then(setSetting)
      .catch((e) => setError(e.message));
  }, [user]);

  if (!user) return null;
  if (!setting) return error ? <ErrorBox error={error} /> : <div className="empty">Memuat…</div>;

  const now = describe(setting.enabled);
  const save = async (enabled: boolean | null) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setSetting(await api.saveSkipButton(enabled));
      setNotice("Tersimpan. Berlaku saat tab game dimuat ulang atau diklik lagi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Tombol Lewati</h1>
          <p>
            Tombol &quot;Lewati&quot; di bagian bawah game (tampilan r8.3) untuk mempercepat dev dan demo. Satu pilihan
            ini berlaku untuk semua kelas.
          </p>
        </div>
      </div>

      <ErrorBox error={error} />
      {notice && <div className="alert alert-ok">{notice}</div>}

      <div className="card" data-testid="skip-button-card">
        <div className="card-head">
          <div>
            <h2 data-testid="skip-button-state">{now.title}</h2>
            <div className="muted small">{now.detail}</div>
          </div>
        </div>
        <div className="row">
          <button
            type="button"
            className={setting.enabled === true ? "btn btn-primary" : "btn"}
            aria-pressed={setting.enabled === true}
            disabled={busy}
            onClick={() => void save(true)}
          >
            Tampilkan
          </button>
          <button
            type="button"
            className={setting.enabled === false ? "btn btn-primary" : "btn"}
            aria-pressed={setting.enabled === false}
            disabled={busy}
            onClick={() => void save(false)}
          >
            Sembunyikan
          </button>
          {setting.enabled !== null && (
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void save(null)}>
              Ikut bawaan build
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Catatan</h2>
        <ul className="muted" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          <li>Jangan pakai data dari sesi yang sempat menekan Lewati sebagai data penelitian.</li>
          <li>Tampilan game lama (build dengan NEXT_PUBLIC_UI_R83=0) punya tombol Lewati sendiri yang tidak diatur dari sini.</li>
          <li>
            Cara lewat terminal: <code>python scripts/skip_button.py on</code> atau <code>off</code> (lihat
            docs/SKIP_BUTTON.md).
          </li>
        </ul>
      </div>
    </div>
  );
}
