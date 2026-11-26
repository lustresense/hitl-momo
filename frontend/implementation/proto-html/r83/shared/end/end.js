/* Penutup (Pusat Halaman). Order and copy follow src/components/ending/CenterOfPage.tsx + domain/ending-script.ts:
   portal (Thinman goes in, comes out alive, Momo: "Eh! Kamu... hidup?") -> talk (Momo explains she is an AI) -> recap (neutral counts + one card
   per chapter) -> finish ("Kembali ke sampul"). New in the sandbox: Thinman first lands by parachute, and the student walks him to the portal
   (keys / click) and can keep walking him while Momo talks. Display only: nothing here changes a decision or a number. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { clamp, esc, GL, CHAR } = SU, W = SU.world;

  /* ending-script.ts */
  const PORTAL_REACTION = 'Eh! Kamu... hidup?';
  /* PROPOSAL (E-4): replaces the repo line "Aku ini AI."; needs the Owner's approval before it goes to ending-script.ts */
  const AI_TALK = ['Aku ini gambaran dari AI, bukan AI yang sebenarnya.', 'Aku menebak dari pola goresan yang pernah kulihat, jadi tebakanku bisa salah.', 'Kamu yang memutuskan benda apa yang masuk ke dunia ini.'];
  const RECAP_LINES = ['Ini semua yang kamu gambar dan pilih tadi.'];
  const FINISH = [`${CHAR} sekarang sudah bisa jalan sendiri.`, 'Terima kasih sudah ikut bermain.'];
  const NOT_RECORDED = 'tidak tercatat';

  const CHUTE = '<svg viewBox="0 0 120 132" aria-hidden="true"><g class="lines" stroke="#111" stroke-width="2" stroke-linecap="round"><path d="M8 62L60 126M34 62L60 126M60 62L60 126M86 62L60 126M112 62L60 126"/></g><path class="canopy" d="M6 62C6 26 30 6 60 6C90 6 114 26 114 62Q101 50 87 62Q74 50 60 62Q46 50 33 62Q19 50 6 62Z" fill="#ef7a37" stroke="#111" stroke-width="3.4" stroke-linejoin="round"/><path d="M33 61Q36 26 60 7M60 61V7M87 61Q84 26 60 7" fill="none" stroke="#111" stroke-width="2.4"/><path d="M33 61Q36 26 60 7Q50 28 46 61Z" fill="#f0d487" opacity=".95"/><path d="M87 61Q84 26 60 7Q70 28 74 61Z" fill="#f0d487" opacity=".95"/></svg>';

  /* ground line of the art, so Thinman follows the hill: y of the grass top at source x */
  const GROUND_D = 'M-10 262Q120 236 245 250T500 246';
  function groundFn(world) {
    const ns = 'http://www.w3.org/2000/svg', p = document.createElementNS(ns, 'path'); p.setAttribute('d', GROUND_D);
    const L = p.getTotalLength ? (() => { world.querySelector('svg').appendChild(p); return p.getTotalLength(); })() : 0;
    const exact = (x) => { let a = 0, b = L; for (let i = 0; i < 26; i++) { const m = (a + b) / 2, pt = p.getPointAtLength(m); if (pt.x < x) a = m; else b = m; } return p.getPointAtLength(a).y + 4; };
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'none');
    /* r8.3 perf: the hill is sampled once (one value per source unit) and read by interpolation; it used to be 27 path queries per frame */
    const T = []; for (let x = -10; x <= 500; x++) T.push(exact(x));
    return (x) => { const u = Math.max(-10, Math.min(500, x)) + 10, i = Math.min(T.length - 2, Math.floor(u)), k = u - i; return T[i] + (T[i + 1] - T[i]) * k; };
  }

  /* recorded data -> recap. rec[L] = [{first, firstPct, decision, final, redraw}...]; falls back to a labelled sample so the page is demoable alone. */
  const SAMPLE = [
    { L: 1, title: 'Level 1', final: 'papan', first: 'papan', pct: 62, decision: 'Terima', cat: 'padat' },
    { L: 2, title: 'Level 2', final: 'balok', first: 'tangga', pct: 55, decision: 'Pakai', cat: 'padat' },
    { L: 3, title: 'Level 3', final: 'papan', first: 'tali', pct: 67, decision: 'Pakai', cat: 'padat' },
  ];
  function recapRows() {
    const st = SU.state.get(), rows = [];
    for (const L of [1, 2, 3]) {
      const list = ((st.rec || {})[L] || []).filter((r) => r && r.final);
      list.forEach((r, i) => rows.push({ L, title: `Level ${L}`, final: r.final, first: r.first || '', pct: r.firstPct, decision: r.decision || 'Terima', cat: (SU.LV[L].map[r.final] === 'danger') ? 'bahaya' : 'padat', redraw: r.redraw || 0, strokes: SU.state.strokes(L, i) }));
    }
    return rows.length ? { rows, sample: false } : { rows: SAMPLE, sample: true };
  }
  /* counts for Momo's sentence: agreed / picked another guess / rejected all / drew again */
  function recapData() {
    const st = SU.state.get(), { rows, sample } = recapRows(), all = [1, 2, 3].flatMap((L) => (st.rec || {})[L] || []);
    const pool = sample ? rows : all.filter((r) => r && r.final), n = (d) => pool.filter((r) => r.decision === d).length;
    return { rows, sample, counts: { accept: n('Terima'), other: n('Pakai'), none: n('Bukan ini') + n('Bukan semua'), redraw: sample ? 0 : all.reduce((a, r) => a + ((r && r.redraw) || 0), 0) } };
  }
  const DEC = { Terima: 'Terima', Pakai: 'Pilih lain', 'Bukan ini': 'Bukan semua', 'Gambar lagi': 'Gambar lagi' };
  const behaviorText = (c) => (c === 'padat' ? 'Aman' : c === 'bahaya' ? 'Bahaya' : c === 'netral' ? 'Netral' : NOT_RECORDED);
  function pathOf(strokes, w, h, pad = 6) {
    const pts = strokes.flat(); if (!pts.length) return '';
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const s = Math.min((w - 2 * pad) / Math.max(1e-6, x1 - x0), (h - 2 * pad) / Math.max(1e-6, y1 - y0)), ox = (w - (x1 - x0) * s) / 2, oy = (h - (y1 - y0) * s) / 2;
    return strokes.filter((st) => st.length).map((st) => st.map((p, i) => `${i ? 'L' : 'M'}${(ox + (p[0] - x0) * s).toFixed(1)} ${(oy + (p[1] - y0) * s).toFixed(1)}`).join('')).join('');
  }

  SU.endFlow = async function () {
    document.body.insertAdjacentHTML('beforeend', SU.centerArt.defs);
    SU.mount({ at: 'corner', title: 'Pusat Halaman', skip: 'right' });
    let hero, walk, ground, pondEl, actEl, worldEl, cam, pal;

    /* 1. parachute landing */
    await SU.run({
      id: 'payung', label: 'Terjun payung', hint: 'Cukup tonton. Thinman mendarat di Pusat Halaman',
      async run(S) {
        const root = S.root;
        root.innerHTML = `<div class="stage" data-l="4"><div class="cam" id="cam"><div class="world" id="world">${SU.centerArt.svg()}<div class="actors" id="act"></div></div></div></div>`;
        worldEl = SU.Q('world'); actEl = SU.Q('act'); ground = groundFn(worldEl);
        G.from(worldEl, { opacity: 0, duration: .6 });
        const x0 = 160; hero = W.Hero(actEl, x0, ground(x0) - 150); hero.el.classList.add('intro-thinman');
        cam = SU.endCam(SU.Q('cam'), worldEl, hero); cam.fit();       /* Thinman about a fifth of the screen high, whatever the screen */
        const chute = document.createElement('div'); chute.className = 'chute'; chute.style.width = W.SW(40) + '%'; chute.innerHTML = CHUTE; actEl.appendChild(chute); G.set(chute, { xPercent: -50, yPercent: -100, transformOrigin: '50% 100%' });
        const canopy = chute.querySelector('.canopy'), lines = chute.querySelector('.lines');
        G.set([canopy, lines], { scaleY: .12, svgOrigin: '60 62', opacity: 0 });
        await SU.momoTo('corner', 800);
        SU.say1(`Selamat! ${CHAR} sudah keluar dari lorong.`); SU.momo().express('Bangga');
        const off = { y: 150, sway: 0 }, gy = ground(x0), st = { vx: 0, vy: 0, on: false, face: 1 };
        const open = { v: 0 };
        const tl = G.timeline(); S.tls.push(tl);
        tl.to(off, { y: 60, duration: .9, ease: 'power2.in' }, 0)
          .to(open, { v: 1, duration: .85, ease: 'elastic.out(1,.45)', onUpdate: () => { G.set([canopy, lines], { scaleY: .12 + .88 * Math.min(1, open.v), opacity: Math.min(1, open.v * 3) }); } }, .85)
          .to(off, { y: 0, duration: 3.3, ease: 'power1.out' }, .95)
          .to(off, { sway: 1, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: 3 }, .95);
        const landed = new Promise((r) => tl.add(r, 4.3));
        const sync = (t, dtm) => {
          const dt = Math.min(.05, dtm / 1000), vy = off.y > 0 ? clamp((off.y - (sync.prev ?? off.y)) / Math.max(.001, dt), -400, 400) : 0; sync.prev = off.y;
          st.on = off.y <= .5; st.vy = off.y > .5 ? Math.max(60, -vy) : 0;
          hero.place(x0 + off.sway * 6 - 3, gy - off.y); hero.update(st, dt);
          const hr = hero.el.getBoundingClientRect(), wr = worldEl.getBoundingClientRect();
          chute.style.left = ((hr.left + hr.width / 2 - wr.left) / wr.width * 100) + '%'; chute.style.top = ((hr.top - wr.top + hr.height * .08) / wr.height * 100) + '%';
          G.set(chute, { rotation: (off.sway - .5) * 12 });
        };
        G.ticker.add(sync); S.offs.push(() => G.ticker.remove(sync));
        tl.to(chute, { opacity: 0, scaleY: .2, duration: .5, ease: 'power2.in' }, 4.25);
        for (let k = 0; k < 5; k++) { const d = document.createElement('i'); d.className = 'spark puff'; d.style.left = W.SX(x0) + '%'; d.style.top = W.SY(gy) + '%'; actEl.appendChild(d); G.set(d, { opacity: 0 }); tl.fromTo(d, { x: 0, y: 0, opacity: 1, scale: .6, immediateRender: false }, { x: (k - 2) * 26, y: -12 - Math.random() * 14, opacity: 0, scale: 1.3, duration: .7, ease: 'power2.out' }, 4.3); }
        await S.until(landed); await S.sleep(500);
        G.ticker.remove(sync); chute.remove(); hero.place(x0, gy); hero.stand();
        await S.say([`${CHAR} mendarat dengan selamat.`, 'Ini Pusat Halaman.'], 'Senang');
        await S.sleep(500);
      },
    });

    /* a spot for Thinman that is clear of Momo's bubble: from the left edge of the screen to the left edge of the bubble */
    const zoneNow = () => {
      const b = SU.Q('su-bubble').getBoundingClientRect(), half = hero.el.getBoundingClientRect().width / 2, hi = (b.width ? b.left - 30 : innerWidth - 40) - half;
      const a = Math.max(8, cam.pxToUnits(24 + half)), z = Math.max(a + 30, cam.pxToUnits(hi));
      walk.setZone(clamp(a, 8, 470), clamp(z, 40, 470)); walk.st.x = clamp(walk.st.x, walk.zone[0], walk.zone[1]);
    };

    /* 2. the ink pond: the student walks Thinman to it (arrow keys / hold the mouse); "Lewati" walks him there */
    await SU.run({
      id: 'kolam', keep: true, label: 'Kolam tinta', hint: 'Cubit lalu geser ke kanan = jalan · lepas = berhenti · atau Lewati',
      async run(S) {
        const gx = 410;
        pondEl = SU.endPond.make(actEl, ground, gx);
        S.tls.push(G.from(pondEl, { scale: 0, opacity: 0, duration: 1, ease: 'back.out(1.5)' }));
        walk = SU.endWalker(hero, ground, [20, 470], 160); walk.onMove = (x) => cam.follow(x, .5); 
        if (SU.nui) { walk.pad = SU.nui.joystick({}); S.offs.push(() => { if (walk.pad) { walk.pad.destroy(); walk.pad = null; } }); }   /* r8.3 aturan C: tuntun */
        SU.say1(`Itu kolam tinta ajaib! Antar ${CHAR} ke sana: cubit, lalu geser tanganmu ke **kanan**.`); SU.momo().express('Penasaran');
        let reached; const arrive = new Promise((r) => (reached = r));
        walk.onMove = (x) => { cam.follow(x, .5); if (x >= gx - 46) reached(); };
        S.skipP.then(() => walk.goTo(gx - 40));
        await Promise.race([arrive, S.skipP.then(() => arrive)]);
        walk.onMove = null; walk.enable(false); walk.goTo(null); if (walk.pad) { walk.pad.destroy(); walk.pad = null; }
        await SU.endPond.dive(S, { hero, ground, act: actEl, worldEl, walk, cam, gx, pond: pondEl });
        walk.enable(true);
        await S.say([PORTAL_REACTION], 'Kaget'); await S.sleep(1100);
      },
    });

    /* 3. Thinman walks (smoothly) to a spot left of the middle of the screen and faces the user; Momo settles beside him, a little higher, at the
          user's centre point, and explains with the bubble to her right. He is alive: he breathes, sways and nods, never hops. */
    await SU.run({
      id: 'bicara', keep: true, hintTop: 'tr', label: 'Penjelasan Momo', hint: 'Dengarkan Momo dulu · lalu cubit dan tahan di mana aja',
      async run(S) {
        const X = 300;
        walk.enable(true); walk.goTo(X); cam.follow(X, .42);
        for (let i = 0; i < 160 && !S.skipped && Math.abs(walk.pos() - X) > 3; i++) await S.sleep(50);
        walk.goTo(null); walk.st.x = X; hero.place(X, ground(X)); walk.st.vx = 0; walk.hold = true;
        pal = SU.endPal({ hero, walk, cam, worldEl }); await pal.face(); pal.wave();
        SU.anchors.ending = () => {
          const b = SU.momo().base, sc = clamp(innerHeight * .27 / b.h, .5, .85), hr = hero.el.getBoundingClientRect();
          return { x: clamp(hr.right + b.w * sc * .5 + 22, b.w * sc / 2 + 12, innerWidth - b.w * sc / 2 - 12), y: clamp(hr.top - hr.height * .06, b.h * sc / 2 + 12, innerHeight - b.h * sc / 2 - 12), s: sc };
        };
        await SU.momoTo('ending', 1000);
        SU.say1(AI_TALK[0]); SU.momo().express('Berpikir'); await S.sleep(500);
        for (let i = 0; i < AI_TALK.length && !S.skipped; i++) {
          if (i) { SU.say1(AI_TALK[i]); SU.momo().express(i === 1 ? 'Penasaran' : 'Senang'); }
          pal.nod();
          await S.sleep(clamp(AI_TALK[i].length * 55, 1700, 3600));
        }
        if (S.skipped) SU.say1(AI_TALK[AI_TALK.length - 1]);
        await S.sleep(S.skipped ? 0 : 300); await S.ring('Aku mengerti', 1000);
      },
    });

    /* 4. the recap, in her chat: the drawings fly in from the left, then her counts */
    await SU.run({
      id: 'rekap', keep: true, hintTop: 'tr', label: 'Rekap', hint: 'Ini catatan dari permainanmu, bukan nilai',
      async run(S) {
        const d = recapData(); zoneNow();
        await SU.endRecap(S, { rows: d.rows, sample: d.sample, pathOf, counts: d.counts, lines: { intro: RECAP_LINES, counts: (c) => `Kamu setuju sama tebakanku ${c.accept} kali, pilih tebakan lain ${c.other} kali, tolak semua ${c.none} kali, gambar ulang ${c.redraw} kali.` } });
      },
    });

    /* 5. finish: one control inside the bubble, back to the cover */
    await SU.run({
      id: 'akhir', keep: true, hintTop: 'tr', label: 'Akhir', hint: 'Tidak ada loop otomatis · Kembali ke sampul: cubit dan tahan 2 detik di mana aja',
      async run(S) {
        await S.say(FINISH, 'Bangga'); await S.sleep(S.skipped ? 0 : 400);
        /* r8.3 aturan A: satu pilihan, cubit dan tahan di mana aja; keluar dari game = keputusan, jadi 2 detik */
        const ex = SU.bubbleExtra(`<div class="ending-finish"><div class="thumb-confirm" id="back" tabindex="0" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${SU.ringMarkup('Kembali ke sampul')}</div></div>`); G.from(ex, { opacity: 0, y: 8, duration: .4 });
        let go; const clicked = new Promise((r) => (go = r)); const backRing = SU.makeRing(SU.Q('back')); backRing.open('Kembali ke sampul', 2000).then(() => go());
        S.offs.push(() => backRing.close());
        SU.onSkip = () => go(); S.offs.push(() => { SU.onSkip = null; });
        await clicked; pal.stop();
      },
    });
    SU.go('cover');
  };
})();
