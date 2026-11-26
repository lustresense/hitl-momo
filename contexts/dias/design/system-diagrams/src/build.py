"""Build the system diagrams (SVG) for Sketchbook Universe.

Run:  python3 contexts/dias/design/system-diagrams/src/build.py
Then: node contexts/dias/design/system-diagrams/src/render.mjs   (SVG -> PNG)
Content follows the code on main (0.30.x): backend/app, frontend/admin, frontend/implementation.
"""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parent.parent
FONT = "Inter, 'DejaVu Sans', sans-serif"
INK = "#2b2b2b"
LINE = "#6b6b6b"

TERM = {  # fill, stroke
    "plain": ("#ffffff", "#555555"),
    "orange": ("#ffe3c4", "#f59a3c"),
    "red": ("#ffc9c4", "#ef4a35"),
    "yellow": ("#ffeab0", "#f2c230"),
    "green": ("#cdf3d4", "#5fcf72"),
    "pink": ("#ffc6ec", "#e94fbd"),
}


class Svg:
    def __init__(self, w, h, bg="#f8f8f8"):
        self.w, self.h, self.items = w, h, []
        self.items.append(f'<rect x="1" y="1" width="{w-2}" height="{h-2}" rx="22" fill="{bg}" stroke="#e2e2e2" stroke-width="2"/>')

    def add(self, s):
        self.items.append(s)

    def text(self, x, y, txt, size=17, weight=400, color=INK, anchor="middle", lh=1.35, family=FONT, italic=False):
        lines = txt.split("\n")
        y0 = y - (len(lines) - 1) * size * lh / 2
        style = ' font-style="italic"' if italic else ""
        for i, line in enumerate(lines):
            self.add(
                f'<text x="{x}" y="{y0 + i*size*lh:.1f}" font-family="{FONT if family == FONT else family}" font-size="{size}" '
                f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}" dominant-baseline="central"{style}>{escape(line)}</text>'
            )

    # ---- flow nodes (x, y = centre)
    def proc(self, x, y, txt, w=230, h=92):
        self.add(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="6" fill="#fff" stroke="{LINE}" stroke-width="3"/>')
        self.text(x, y, txt)
        return dict(x=x, y=y, w=w, h=h)

    def term(self, x, y, txt, kind="plain", w=200, h=80):
        f, s = TERM[kind]
        self.add(f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="{min(h/2, 34)}" fill="{f}" stroke="{s}" stroke-width="3"/>')
        self.text(x, y, txt)
        return dict(x=x, y=y, w=w, h=h)

    def dec(self, x, y, txt, w=250, h=170):
        pts = f"{x},{y-h/2} {x+w/2},{y} {x},{y+h/2} {x-w/2},{y}"
        self.add(f'<polygon points="{pts}" fill="#fff" stroke="{LINE}" stroke-width="3" stroke-linejoin="round"/>')
        self.text(x, y, txt)
        return dict(x=x, y=y, w=w, h=h)

    def arrow(self, pts, label=None, lpos=None, dashed=False, head=True, color=LINE, width=3):
        d = path_rounded(pts, 16)
        dash = ' stroke-dasharray="9 7"' if dashed else ""
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"{dash}/>')
        if head:
            (x1, y1), (x2, y2) = pts[-2], pts[-1]
            self.add(chevron(x1, y1, x2, y2, color, width))
        if label:
            lx, ly = lpos
            wbox = 9.6 * len(label) + 22
            self.add(f'<rect x="{lx-wbox/2}" y="{ly-15}" width="{wbox}" height="30" fill="#f8f8f8"/>')
            self.text(lx, ly, label, size=16, weight=500)

    def svg(self):
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
                f'viewBox="0 0 {self.w} {self.h}">' + "".join(self.items) + "</svg>")


def path_rounded(pts, r):
    if len(pts) == 2:
        return f"M{pts[0][0]},{pts[0][1]} L{pts[1][0]},{pts[1][1]}"
    d = f"M{pts[0][0]},{pts[0][1]}"
    for i in range(1, len(pts) - 1):
        (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
        def towards(ax, ay, bx, by, dist):
            L = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 or 1
            dd = min(dist, L / 2)
            return ax + (bx - ax) * dd / L, ay + (by - ay) * dd / L
        ax, ay = towards(x1, y1, x0, y0, r)
        bx, by = towards(x1, y1, x2, y2, r)
        d += f" L{ax:.1f},{ay:.1f} Q{x1},{y1} {bx:.1f},{by:.1f}"
    d += f" L{pts[-1][0]},{pts[-1][1]}"
    return d


def chevron(x1, y1, x2, y2, color, width):
    import math
    a = math.atan2(y2 - y1, x2 - x1)
    s = 13
    p1 = (x2 - s * math.cos(a - 0.6), y2 - s * math.sin(a - 0.6))
    p2 = (x2 - s * math.cos(a + 0.6), y2 - s * math.sin(a + 0.6))
    return (f'<path d="M{p1[0]:.1f},{p1[1]:.1f} L{x2},{y2} L{p2[0]:.1f},{p2[1]:.1f}" fill="none" '
            f'stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>')


def top(n): return (n["x"], n["y"] - n["h"] / 2)
def bot(n): return (n["x"], n["y"] + n["h"] / 2)
def left(n): return (n["x"] - n["w"] / 2, n["y"])
def right(n): return (n["x"] + n["w"] / 2, n["y"])


def down(s, a, b, **kw):
    s.arrow([bot(a), (top(b)[0], top(b)[1] - 4)], **kw) if a["x"] == b["x"] else \
        s.arrow([bot(a), (a["x"], (bot(a)[1] + top(b)[1]) / 2), (b["x"], (bot(a)[1] + top(b)[1]) / 2), (b["x"], top(b)[1] - 4)], **kw)


def badge(s, txt):
    s.text(48, 72, txt, size=56, weight=800, color="#8a8a8a", anchor="start", family="Inter", italic=True)


# ====================================================================== Phase 1
def phase1():
    s = Svg(900, 2380)
    badge(s, "#1")
    s.text(450, 150, "Fase 1 · Membuat input", size=22, weight=700)
    cx = 560
    t0 = s.term(cx, 240, "Mulai: kamera aktif", w=240)
    p1 = s.proc(cx, 390, "Lambaikan tangan\nke kamera (atau lewati)", w=260)
    p2 = s.proc(cx, 540, "Pilih nomor absen\n(penggaris)", w=260)
    d1 = s.dec(cx, 730, "Dibuka lewat\nlink kelas?")
    pj = s.proc(cx, 930, "Daftar ke kelas\n(token sesi siswa)", w=250)
    pf = s.proc(230, 930, "Mode bebas\n(keputusan tidak\ndikirim ke server)", w=230, h=110)
    pm = s.proc(cx, 1100, "Kartu tutorial\nbersama Momo", w=250)
    pl = s.proc(cx, 1260, "Pilih level\n(terbuka berurutan)", w=250)
    pi = s.proc(cx, 1420, "Pengenalan misi level\n(objek yang dibutuhkan)", w=270)
    tg = s.term(190, 1570, "Gambar ulang /\nobjek berikutnya\n(dari Fase 2 / 3)", "green", w=230, h=100)
    pd = s.proc(450, 1740, "Menggambar objek di kanvas\n(jari + MediaPipe\natau mouse/sentuh)", w=290, h=120)
    pk = s.proc(450, 1920, "Selesai menggambar\n(kirim ke Momo)", w=250)
    d2 = s.dec(450, 2100, "Ada\ngoresan?", w=220, h=150)
    t2 = s.term(450, 2290, "Fase 2", "yellow", w=200)

    down(s, t0, p1)
    down(s, p1, p2)
    down(s, p2, d1)
    s.arrow([bot(d1), top(pj)], label="Ya", lpos=(cx, 845))
    s.arrow([left(d1), (230, 730), top(pf)], label="Tidak", lpos=(330, 730))
    down(s, pj, pm)
    s.arrow([bot(pf), (230, 1100), left(pm)])
    down(s, pm, pl)
    down(s, pl, pi)
    s.arrow([bot(pi), (cx, 1630), (pd["x"] + 40, 1630), (pd["x"] + 40, top(pd)[1] - 4)])
    s.arrow([bot(tg), (190, 1650), (pd["x"] - 40, 1650), (pd["x"] - 40, top(pd)[1] - 4)])
    down(s, pd, pk)
    down(s, pk, d2)
    s.arrow([bot(d2), top(t2)], label="Ya", lpos=(450, 2200))
    s.arrow([right(d2), (760, 2100), (760, 1740), right(pd)], label="Tidak: Momo minta\nmenggambar dulu", lpos=(760, 1920))
    return s


# ====================================================================== Phase 2
def phase2():
    s = Svg(1240, 2100)
    badge(s, "#2")
    s.text(620, 150, "Fase 2 · Keputusan siswa (HITL)", size=22, weight=700)
    cx = 620
    t0 = s.term(cx, 240, "Dari Fase 1", "orange", w=220)
    pp = s.proc(cx, 400, "Backend memprediksi gambar\nPOST /predict + levelId\n(MobileNetV2)", w=300, h=110)
    d0 = s.dec(cx, 590, "Prediksi\nberhasil?", w=230, h=150)
    pe = s.proc(1010, 590, "Pesan gagal\ndari Momo", w=230)
    tr = s.term(1010, 790, "Fase 1:\nGambar ulang", "green", w=210, h=90)
    pk = s.proc(cx, 790, "Level kesulitan diterapkan\n(diatur superadmin\ndi Level Kesulitan)", w=300, h=110)
    pt = s.proc(cx, 960, "Momo menampilkan\nTop-3 + confidence", w=280)
    dk = s.dec(cx, 1170, "Keputusan\nsiswa", w=250, h=170)
    pa = s.proc(170, 1440, "Label akhir\n= Top-1", w=220)
    pc = s.proc(470, 1440, "Label akhir\n= Top-2 / Top-3", w=220)
    po = s.proc(770, 1440, "Label akhir\n= label pilihan siswa", w=230)
    tg = s.term(1070, 1440, "Fase 1:\nGambar ulang", "green", w=210, h=90)
    ps = s.proc(470, 1640, "Simpan keputusan\noutbox → POST /api/submissions\n(hanya mode kelas)", w=340, h=110)
    pl = s.proc(470, 1810, "Lempar stiker gambar\nke dunia game", w=280)
    t3 = s.term(470, 1980, "Fase 3", "red", w=200)

    down(s, t0, pp)
    down(s, pp, d0)
    s.arrow([right(d0), (left(pe)[0] - 4, 590)], label="Tidak", lpos=(820, 590))
    s.arrow([bot(pe), top(tr)], label="Gambar ulang", lpos=(1010, 690))
    s.arrow([top(pe), (1010, 400), (right(pp)[0] + 4, 400)], label="Coba lagi (gambar sama)", lpos=(1010, 470))
    s.arrow([bot(d0), top(pk)], label="Ya", lpos=(cx, 690))
    down(s, pk, pt)
    down(s, pt, dk)
    yb = 1320
    s.arrow([bot(dk), (cx, yb)], head=False)
    for n, lab in ((pa, "Accept"), (pc, "Correct"), (po, "Override")):
        s.arrow([(cx, yb), (n["x"], yb), (n["x"], top(n)[1] - 4)], label=lab, lpos=(n["x"], 1355))
    s.arrow([right(dk), (1070, 1170), (1070, top(tg)[1] - 4)], label="Gambar ulang", lpos=(1070, 1260), dashed=True)
    ym = 1555
    for n in (pa, pc, po):
        s.arrow([bot(n), (n["x"], ym), (ps["x"] + (n["x"] - pc["x"]) / 6, ym), (ps["x"] + (n["x"] - pc["x"]) / 6, top(ps)[1] - 4)])
    down(s, ps, pl)
    down(s, pl, t3)
    s.text(1040, 1560, "Gambar ulang = jalur pemulihan,\nbukan pilihan HITL ke-4", size=15, color="#777")
    return s


# ====================================================================== Phase 3
def phase3():
    s = Svg(1240, 2400)
    badge(s, "#3")
    s.text(620, 150, "Fase 3 · Konsekuensi di gameplay", size=22, weight=700)
    cx = 620
    t0 = s.term(cx, 240, "Dari Fase 2", "red", w=220)
    pj = s.proc(cx, 390, "Objek jatuh ke\ndunia game", w=260)
    pp = s.proc(cx, 550, "Siswa menempatkan /\nmenggeser objek", w=260)
    db = s.dec(cx, 760, "Perilaku\nobjek", w=230, h=160)
    xs = (170, 470, 770, 1070)
    pdg = s.proc(xs[0], 1020, "Danger\n(membahayakan)", w=230)
    pn = s.proc(xs[1], 1020, "Neutral\n(tidak membantu)", w=230)
    pu = s.proc(xs[2], 1020, "Unresolved\n(label tak dikenal\ndi level ini)", w=230, h=110)
    ps = s.proc(xs[3], 1020, "Solid\n(membantu stickman)", w=230)
    pg = s.proc(cx, 1230, "Stickman bergerak\n(gameplay 2D, KAPLAY)", w=280)
    dh = s.dec(cx, 1430, "Rintangan\nterlewati?", w=230, h=160)
    pf = s.proc(250, 1430, "Outcome: gagal\nMomo memberi umpan balik", w=300)
    tg = s.term(250, 1620, "Fase 1: gambar ulang\n(level yang sama)", "green", w=260, h=90)
    pok = s.proc(cx, 1640, "Outcome: berhasil", w=260, h=80)
    dl = s.dec(cx, 1830, "Level\nselesai?", w=220, h=150)
    tn = s.term(990, 1830, "Fase 1: gambar\nobjek berikutnya", "green", w=240, h=90)
    d3 = s.dec(cx, 2050, "Level 3?", w=200, h=140)
    pr = s.term(250, 2050, "Ringkasan level\n→ daftar level", "plain", w=250, h=90)
    pe = s.term(cx, 2250, "Penutup cerita (ending)", "plain", w=290, h=80)

    down(s, t0, pj)
    down(s, pj, pp)
    down(s, pp, db)
    yb = 900
    s.arrow([bot(db), (cx, yb)], head=False)
    for n, x in zip((pdg, pn, pu, ps), xs):
        s.arrow([(cx, yb), (x, yb), (x, top(n)[1] - 4)])
    ym = 1130
    for n, x in zip((pdg, pn, pu, ps), xs):
        tx = cx + (x - cx) / 8
        s.arrow([bot(n), (x, ym), (tx, ym), (tx, top(pg)[1] - 4)])
    down(s, pg, dh)
    s.arrow([left(dh), (right(pf)[0] + 4, 1430)], label="Tidak", lpos=(450, 1430))
    down(s, pf, tg)
    s.arrow([bot(dh), top(pok)], label="Ya", lpos=(cx, 1540))
    down(s, pok, dl)
    s.arrow([right(dl), (left(tn)[0] - 4, 1830)], label="Belum", lpos=(800, 1830))
    s.arrow([bot(dl), top(d3)], label="Ya", lpos=(cx, 1940))
    s.arrow([left(d3), (right(pr)[0] + 4, 2050)], label="Tidak", lpos=(450, 2050))
    s.arrow([bot(d3), top(pe)], label="Ya", lpos=(cx, 2160))
    s.text(990, 1500, "Setiap outcome (berhasil / gagal)\ndikirim ke server:\nPATCH /api/submissions/{id}/outcome\n(hanya mode kelas)", size=15, color="#777")
    return s


# ====================================================================== Use case
def usecase():
    s = Svg(1500, 1330, bg="#ffffff")
    s.text(750, 80, "Use Case · Sketchbook Universe", size=34, weight=800)
    s.add('<rect x="380" y="140" width="740" height="1150" rx="10" fill="#f7f7f7" stroke="#d6d6d6" stroke-width="2"/>')
    s.text(750, 175, "Sistem", size=20, weight=700, color="#777")

    def actor(x, y, name, color="#666"):
        s.add(f'<circle cx="{x}" cy="{y-80}" r="26" fill="#fff" stroke="{color}" stroke-width="3"/>')
        s.add(f'<path d="M{x},{y-54} V{y+10} M{x-50},{y-30} H{x+50} M{x},{y+10} L{x-36},{y+60} M{x},{y+10} L{x+36},{y+60}" stroke="{color}" stroke-width="3" fill="none" stroke-linecap="round"/>')
        s.text(x, y + 100, name, size=22, weight=700)
        return (x, y)

    def uc(x, y, txt, w=270, h=96, fill="#fff"):
        s.add(f'<ellipse cx="{x}" cy="{y}" rx="{w/2}" ry="{h/2}" fill="{fill}" stroke="{INK}" stroke-width="3"/>')
        s.text(x, y, txt, size=17)
        return dict(x=x, y=y, w=w, h=h)

    lx, rx = 560, 940
    st = actor(170, 700, "Siswa")
    sa = actor(1340, 470, "Super Admin")
    ad = actor(1340, 1110, "Admin (Guru)")

    student = [
        uc(lx, 260, "Gabung kelas\n(link + nomor absen)"),
        uc(lx, 400, "Memainkan level"),
        uc(lx, 540, "Menggambar objek\n(jari / mouse)"),
        uc(lx, 680, "Melihat Top-3\n+ confidence"),
        uc(lx, 820, "Mengambil keputusan\nAccept / Correct / Override"),
        uc(lx, 960, "Menggambar ulang"),
        uc(lx, 1100, "Melihat ringkasan level"),
    ]
    sup = [
        uc(rx, 260, "Mengelola sekolah", fill="#e6f1ff"),
        uc(rx, 380, "Mengelola akun admin", fill="#e6f1ff"),
        uc(rx, 500, "Mengatur level kesulitan\nper level", fill="#e6f1ff"),
    ]
    adm = [
        uc(rx, 650, "Login dashboard"),
        uc(rx, 770, "Membuat & mengelola kelas"),
        uc(rx, 890, "Membagikan link kelas"),
        uc(rx, 1010, "Melihat jawaban\n& gambar siswa"),
        uc(rx, 1130, "Ekspor data\n(CSV / ZIP)"),
    ]
    for u in student:
        s.arrow([(st[0] + 60, st[1] - 20), (u["x"] - u["w"] / 2, u["y"])], head=False, color="#444", width=2.5)
    for u in sup:
        s.arrow([(sa[0] - 60, sa[1] - 20), (u["x"] + u["w"] / 2, u["y"])], head=False, color="#444", width=2.5)
    for u in adm:
        s.arrow([(ad[0] - 60, ad[1] - 20), (u["x"] + u["w"] / 2, u["y"])], head=False, color="#3aa655", width=2.5)
    # generalisation: Super Admin is an Admin
    x = sa[0]
    s.add(f'<path d="M{x},{sa[1]+130} V{ad[1]-130}" stroke="#444" stroke-width="2.5" fill="none"/>')
    s.add(f'<polygon points="{x},{ad[1]-110} {x-14},{ad[1]-134} {x+14},{ad[1]-134}" fill="#fff" stroke="#444" stroke-width="2.5"/>')
    s.text(x + 18, (sa[1] + ad[1]) / 2, "mewarisi semua\nfungsi Admin", size=15, color="#555", anchor="start")
    # extend: redraw extends drawing
    s.arrow([(lx + 150, 960), (lx + 190, 960), (lx + 190, 540), (lx + 140, 540)], dashed=True, color="#777", width=2)
    s.text(lx + 190, 995, "«extend»", size=15, color="#777")
    # include: decision includes seeing top-3
    s.text(380 + 20, 1250, "Biru = khusus Super Admin. Garis hijau = Admin (guru).\nSiswa tidak perlu akun; identitas dari link kelas + nomor absen.",
           size=15, color="#666", anchor="start")
    return s


# ====================================================================== Global system design
def system():
    W, H = 2200, 1180
    s = Svg(W, H, bg="#ececec")
    s.text(W / 2, 70, "PROCESS", size=34, weight=800, color="#333")

    def panel(x, y, w, h, title, fill, stroke, tsize=20):
        s.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{fill}" stroke="{stroke}" stroke-width="2.5"/>')
        if title:
            s.text(x + w / 2, y - 22, title, size=tsize, weight=800, color="#333")

    def card(x, y, w, h, title, sub, owner=None):
        s.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="#ffffff" stroke="#00000014" stroke-width="2"/>')
        s.text(x + w / 2, y + 34, title, size=17, weight=700)
        s.text(x + w / 2, y + h / 2 + 20, sub, size=14, color="#555")

    # INPUT
    s.add(f'<rect x="40" y="120" width="300" height="1000" rx="22" fill="#ffe3c4" stroke="#f5b06a" stroke-width="2.5"/>')
    s.text(190, 170, "INPUT", size=30, weight=800)
    for i, (t, sub) in enumerate([
        ("Kamera", "gerakan jari\n(MediaPipe Hands)"),
        ("Kanvas", "goresan gambar\n(jari / mouse / sentuh)"),
        ("Keputusan siswa", "Accept / Correct /\nOverride (+ Gambar ulang)"),
        ("Akses kelas", "link kelas +\nnomor absen"),
        ("Pengaturan admin", "kelas, sekolah,\nlevel kesulitan"),
    ]):
        card(65, 220 + i * 178, 250, 150, t, sub)

    # PROCESS frame
    s.add(f'<rect x="380" y="110" width="1440" height="1010" rx="26" fill="#ffffff" stroke="#9a9a9a" stroke-width="2.5"/>')

    # Layer 1 (Can) - orange
    panel(420, 190, 640, 230, "LAYER 1 · INTERAKSI (Can)", "#ffe9d2", "#f5b06a")
    for i, (t, sub) in enumerate([("Finger tracking", "MediaPipe\nHand Landmarker"), ("Maskot Momo", "teks arahan\n& umpan balik"), ("Gameplay 2D", "KAPLAY,\nstickman + rintangan")]):
        card(440 + i * 205, 215, 190, 185, t, sub)
    # Layer 2 (Dias) - blue
    panel(1140, 190, 640, 230, "LAYER 2 · KLASIFIKASI AI (Dias)", "#dcecff", "#7fb2f0")
    for i, (t, sub) in enumerate([("FastAPI /predict", "stroke → gambar\n28×28"), ("CNN MobileNetV2", "Keras, weights/\n20 label objek"), ("Top-3 + confidence", "+ level kesulitan\nper level")]):
        card(1160 + i * 205, 215, 190, 185, t, sub)
    # Layer 3 - green
    panel(700, 500, 800, 230, "LAYER 3 · KEPUTUSAN (HITL)", "#dbf5df", "#78d08a")
    for i, (t, sub) in enumerate([("Decision resolver", "Accept / Correct /\nOverride → label akhir"), ("Pemetaan objek", "label → Solid / Danger /\nNeutral / Unresolved"), ("Gambar ulang", "jalur pemulihan,\nkembali ke kanvas")]):
        card(720 + i * 260, 525, 240, 185, t, sub)
    # Layer 4 (Dias) - blue
    panel(420, 820, 1360, 260, "LAYER 4 · DATA & DASHBOARD (Dias)", "#dcecff", "#7fb2f0")
    for i, (t, sub) in enumerate([
        ("Outbox (game)", "IndexedDB di browser,\nkirim ulang otomatis"),
        ("REST API", "/api/join, /api/submissions,\n/outcome (token sesi)"),
        ("SQLite", "sekolah, kelas, siswa,\nsubmission, level kesulitan"),
        ("Dashboard", "Admin & Superadmin\n(Next.js, /admin)"),
        ("Ekspor data", "CSV / ZIP\n(gambar + jawaban)"),
    ]):
        card(440 + i * 266, 850, 250, 205, t, sub)

    # OUTPUT
    s.add(f'<rect x="1860" y="120" width="300" height="1000" rx="22" fill="#ffffff" stroke="#9a9a9a" stroke-width="2.5"/>')
    s.text(2010, 170, "OUTPUT", size=30, weight=800)
    for i, (t, sub) in enumerate([
        ("Prototipe literasi AI", "simulasi berlevel\nuntuk siswa SMP"),
        ("Hasil gameplay", "berhasil / gagal\nper percobaan"),
        ("Dashboard guru", "jawaban & gambar\nper siswa"),
        ("Data keputusan", "Accept/Correct/Override\nsiap diekspor untuk analisis"),
    ]):
        card(1885, 230 + i * 215, 250, 180, t, sub)

    A = dict(color="#222", width=3)
    s.arrow([(340, 620), (400, 620), (400, 305), (418, 305)], **A)                        # input -> L1
    s.arrow([(1060, 305), (1136, 305)], **A)                                              # L1 -> L2
    s.arrow([(1640, 420), (1640, 615), (1504, 615)], **A)                                 # L2 -> L3
    s.arrow([(760, 420), (760, 496)], **A)                                                # L1 -> L3
    s.arrow([(700, 615), (600, 615), (600, 424)], **A)                                    # L3 -> L1
    s.arrow([(1400, 730), (1400, 816)], **A)                                              # L3 -> L4
    s.arrow([(1780, 950), (1840, 950), (1840, 620), (1858, 620)], **A)                    # L4 -> output
    # legend
    for i, (c, b, t) in enumerate([("#ffe9d2", "#f5b06a", "Ranah Can (interaksi & gameplay)"),
                                   ("#dcecff", "#7fb2f0", "Ranah Dias (AI, backend, data, dashboard)"),
                                   ("#dbf5df", "#78d08a", "Lapisan keputusan (jembatan AI ↔ siswa)")]):
        x = 420 + i * 470
        s.add(f'<rect x="{x}" y="1135" width="26" height="26" rx="6" fill="{c}" stroke="{b}" stroke-width="2"/>')
        s.text(x + 38, 1148, t, size=16, anchor="start", color="#444")
    return s


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in [
        ("01_desain_sistem_global", system),
        ("02_use_case", usecase),
        ("03_userflow_fase_1", phase1),
        ("04_userflow_fase_2", phase2),
        ("05_userflow_fase_3", phase3),
    ]:
        (OUT / f"{name}.svg").write_text(fn().svg(), encoding="utf-8")
        print("wrote", name)
