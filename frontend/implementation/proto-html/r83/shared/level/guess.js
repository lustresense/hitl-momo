/* Momo's guess lives in her chat, under her bubble (repo MomoGuessChat, R11): Top-3 with percents, then the decisions
   Terima / Pakai (rank 2-3) / Bukan ini, pilih lainnya / Gambar lagi.
   r8.3 (aturan B): rows, other objects and the actions are all targets; the one nearest the hand lights up and a pinch held on it decides
   (a label 2 s, the actions 1 s). Row 1 = Terima, rows 2-3 = Pakai. Keys 1-3 choose directly.
   Returns {kind:'Terima'|'Pakai'|'Bukan ini', label} or {kind:'Gambar lagi'}. Momo never decides. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { esc, nameOf, strokesSvg } = SU;

  SU.guessScene = (L, idx) => ({
    id: 'tebak', keep: true, label: `Level ${L} · Tebakan`, hint: 'Dekatkan tangan ke pilihan (yang dekat menyala) · cubit dan tahan = pilih · tombol 1 2 3 = pilih langsung',
    async run(S, { strokes, rec }) {
      const lv = SU.LV[L];
      /* the drawing stays on the page under Momo's chat; ink is off, tools and mission card step aside */
      S.root.querySelectorAll('.draw-tools,.drawing-corner,.mission-pop').forEach((e) => G.to(e, { opacity: 0, duration: .3 }));
      const skw = SU.Q('skw'); if (skw) skw.style.pointerEvents = 'none';
      await SU.momoTo('side', 700);
      const tone = SU.TONE(L); SU.momo().express(SU.mood(tone.mood));
      const prevBox = `<div class="g-thumb fc">${strokesSvg(strokes)}</div>`;
      /* 1. thinking: skeleton rows inside the bubble */
      SU.say1(SU.MOMO_LINES.predicting);
      const ex = SU.bubbleExtra(`<div class="momo-guess"><div class="g-head"><b>Tebakan Momo</b><span class="k-chip warn">Demo: tebakan simulasi</span></div><div class="g-body">${prevBox}<div class="t3">${[0, 1, 2].map(() => '<div class="t3-row sk"><span class="t3-rank">·</span><span class="t3-name" style="opacity:.4">Momo lagi menebak…</span><span></span></div>').join('')}</div></div></div>`);
      const pulse = G.to(ex.querySelectorAll('.sk'), { opacity: .45, duration: .45, yoyo: true, repeat: -1, stagger: .12 });
      await S.sleep(1100); pulse.kill();
      const g = SU.guessFor(L, strokes);
      rec.first = g[0].label; rec.firstPct = g[0].pct;
      const other = lv.vocab.filter((v) => !g.some((c) => c.label === v)).slice(0, 4);

      /* 2. the Top-3 and the decisions. r8.3 aturan B: semua pilihan di chat Momo adalah target; yang paling dekat tangan menyala,
         cubit dan tahan untuk memilih. Baris tebakan dan benda lain = keputusan label (2 detik); Bukan ini / Kembali / Gambar lagi = 1 detik. */
      let mode = 'top3', hs = [], settle = null;
      const paint = () => {
        hs.forEach((h) => h.remove()); hs = [];
        ex.innerHTML = `<div class="momo-guess"><div class="g-head"><b>Tebakan Momo</b><span class="k-chip warn">Demo: tebakan simulasi</span></div>
          <div class="g-body">${prevBox}<div class="t3">${g.map((c, k) => `<button type="button" class="t3-row pick" data-k="${k}" ${mode === 'other' ? 'disabled' : ''}><span class="t3-rank">${k + 1}</span><span class="t3-name">${esc(nameOf(c.label))}</span><span class="t3-pct">${c.pct}%</span><span class="t3-bar"><i style="width:${c.pct}%"></i></span></button>`).join('')}</div></div>
          ${mode === 'other' ? `<div class="g-other"><p>Benda lain di level ini:</p><div class="g-other-grid">${other.length ? other.map((v) => `<button type="button" class="nb-btn" data-o="${esc(v)}">${esc(nameOf(v))}</button>`).join('') : '<span class="k-chip">Tidak ada benda lain di level ini.</span>'}</div></div>` : ''}
          <div class="g-actions">${mode === 'top3'
            ? `<button type="button" class="nb-btn" data-a="other">Bukan ini, pilih lainnya</button><button type="button" class="nb-btn ghost" data-a="redraw">Gambar lagi</button>`
            : `<button type="button" class="nb-btn" data-a="back">Kembali</button><button type="button" class="nb-btn ghost" data-a="redraw">Gambar lagi</button>`}</div></div>`;
        const on = (el, ms, fn) => { if (SU.nui) hs.push(SU.nui.add(el, { ms, onFire: fn })); else el.addEventListener('click', fn); };
        if (mode === 'top3') ex.querySelectorAll('.t3-row[data-k]').forEach((b) => { const k = +b.dataset.k; on(b, 2000, () => settle(k === 0 ? { kind: 'Terima', label: g[0].label } : { kind: 'Pakai', label: g[k].label })); });
        ex.querySelectorAll('[data-o]').forEach((b) => on(b, 2000, () => settle({ kind: 'Bukan ini', label: b.dataset.o })));
        ex.querySelectorAll('[data-a]').forEach((b) => on(b, 1000, () => {
          const a = b.dataset.a;
          if (a === 'redraw') settle({ kind: 'Gambar lagi' });
          else if (a === 'other') { mode = 'other'; paint(); S.hush(); SU.say1('Oke, bukan itu. Dekatkan tanganmu ke benda yang kamu gambar, lalu cubit dan tahan.'); }
          else if (a === 'back') { mode = 'top3'; paint(); S.hush(); SU.say1('Balik ke tebakanku. Pilih yang paling cocok, ya.'); }
        }));
      };
      paint();
      G.from(ex.querySelectorAll('.t3-row'), { opacity: 0, x: -24, duration: .45, ease: 'power3.out', stagger: .1 });
      G.from(ex.querySelectorAll('.g-actions .nb-btn'), { opacity: 0, y: 12, duration: .35, stagger: .07, delay: .3 });
      /* momo-cue.ts "evaluating": her question in the level's tone (the percent is the one shown in the list), the reminder, then how to answer */
      S.say([SU.guessQuestion(L, g[0].label, g[0].pct, g[1] && g[1].label), SU.MOMO_LINES.compare2, 'Dekatkan tanganmu ke jawaban yang benar, lalu cubit dan tahan sampai lingkarannya penuh.'], tone.mood);

      const decision = await new Promise((res) => {
        let done = false;
        settle = (d) => { if (done) return; done = true; S.hush(); hs.forEach((h) => h.remove()); hs = []; res(d); };
        S.on(window, 'keydown', (e) => { if (mode === 'other' || done) return; const k = '123'.indexOf(e.key); if (k >= 0 && g[k]) settle(k === 0 ? { kind: 'Terima', label: g[0].label } : { kind: 'Pakai', label: g[k].label }); });
        S.offs.push(() => hs.forEach((h) => h.remove()));
        S.skipP.then(() => settle({ kind: 'Terima', label: g[0].label, auto: true }));
      });
      SU.bubbleExtra('');
      rec.decision = decision.kind; rec.final = decision.label || null;
      return decision;
    },
  });
})();
