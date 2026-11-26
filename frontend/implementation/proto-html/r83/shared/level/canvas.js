/* Canvas page (the drawing page "up in the sky"): clean paper, the 4 tools, the mission behind a bulb button (as in the repo's DrawingScreen).
   Momo's words are the repo's: the cue while the page is empty, a mumble of her provisional guess while the hand moves, and, once the hand
   rests (GUESS_IDLE_MS = 1000), the thumb "Selesai" beside the drawing. One drawing = one object. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { esc, fmt, GL } = SU;

  const GUESS_IDLE_MS = 1000, MUMBLE_POLL_MS = 100, PROVISIONAL_MS = 500;
  const TOOLS = [['draw', 'pencil', 'Pensil'], ['erase', 'eraser', 'Hapus'], ['undo', 'undo', 'Mundur'], ['redo', 'redo', 'Maju'], ['clear', 'clear', 'Bersihkan']];   /* r8.3: Hapus = sebagian (yang digosok saja), Bersihkan = semua (bisa di-Mundur) */
  /* repo Icon "bulb" */
  const BULB = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"/><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"/><path d="M9.7 17h4.6"/></svg>';
  const BULB_ = () => (SU.icon ? SU.icon('bulb', 26) : BULB);   /* r8.3: ikon set Owner */
  const dense = (a) => { const o = [a[0]]; for (let i = 1; i < a.length; i++) { const p = o[o.length - 1], q = a[i], n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 5); for (let k = 1; k <= n; k++) o.push({ x: p.x + (q.x - p.x) * k / n, y: p.y + (q.y - p.y) * k / n }); } return o; };
  /* "Lewati" on an empty canvas draws a plank / a crate for the student, so a skip never dead-ends */
  function sample(kind, W, H) {
    const pts = (arr) => arr.map(([x, y]) => ({ x, y })), cx = W * .45, cy = H * .56, s = [];
    if (kind === 'plank') { const w = Math.min(190, W * .3), h = 26, x = cx - w / 2, y = cy - h / 2; s.push(dense(pts([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]))); for (let k = 1; k < 5; k++) s.push(dense(pts([[x + k * w / 5, y], [x + k * w / 5 + 10, y + h]]))); }
    else { const w = Math.min(96, W * .16), x = cx - w / 2, y = cy - w / 2; s.push(dense(pts([[x, y], [x + w, y], [x + w, y + w], [x, y + w], [x, y]]))); s.push(dense(pts([[x, y], [x + w, y + w]]))); s.push(dense(pts([[x + w, y], [x, y + w]]))); }
    return s;
  }

  /* returns the strokes of the finished drawing */
  SU.canvasScene = (L, idx) => ({
    id: 'canvas', label: `Level ${L} · Canvas`, hint: 'Cubit, tahan, geser di kertas = gambar · alat: tunjuk lalu cubit · Tebak Gambarku: tunjuk, cubit, tahan 2 detik',
    async run(S, args) {
      const lv = SU.LV[L], root = S.root, mis = lv.mission.map(fmt), carry = (args && args.carry) || null, LN = SU.MOMO_LINES;
      root.classList.add('paperfull');
      root.innerHTML = `<div class="sk-wrap" id="skw"></div>
        <div class="drawing-corner gs"><button type="button" class="nb-iconbtn nb-iconbtn--accent mission-hint-btn" id="mis-btn" aria-label="Petunjuk Misi" aria-expanded="false" title="Petunjuk misi">${BULB_()}</button></div>
        <section class="fc dots mission-pop" id="mis-pop" hidden><span class="k-kicker">${esc(lv.title.split(' · ')[0])}</span><h2 class="k-title">${esc(mis[0])}</h2><p class="k-text">${esc(mis[1])}</p><p class="k-text" style="margin-top:8px"><b>Contoh:</b> ${lv.cat.join(' · ')}</p></section>
        <div class="nb-toolbar draw-tools gs">${TOOLS.map(([id, g, n]) => `<button type="button" class="nb-tool${id === 'draw' ? ' is-active' : ''}" data-t="${id}" aria-label="${n}"><span class="g">${GL[g]}</span><span class="nb-tool__label">${n}</span><span class="tut-tool__tick">${GL.check}</span></button>`).join('')}</div>`;
      G.set(root.querySelector('.draw-tools'), { yPercent: -50 });
      const pop = SU.Q('mis-pop'), misBtn = SU.Q('mis-btn');
      misBtn.addEventListener('click', () => { const open = pop.hidden; pop.hidden = !open; misBtn.setAttribute('aria-expanded', String(open)); if (open) G.from(pop, { opacity: 0, y: -10, duration: .3, ease: 'power2.out' }); });
      S.tls.push(S.in(root.querySelectorAll('.gs'), { y: -30, delay: .35 }));
      await SU.momoTo('corner', 0);
      /* aturan D: di kanvas ada kursor (ikon pensil / bulatan hapus); alat dipilih dengan tunjuk + cubit */
      if (SU.nui) { SU.nui.canvas(true); S.offs.push(() => SU.nui.canvas(false)); }

      const tick = (k) => { const b = root.querySelector(`.nb-tool[data-t="${k}"] .tut-tool__tick`); if (b) G.to(b, { scale: 1, duration: .4, ease: 'back.out(2.4)' }); };
      let finish, mode = 'cue'; const finished = new Promise((r) => (finish = r));
      const sk = new SU.Sketch(SU.Q('skw'), { onChange: (kind) => { tick(kind === 'stroke' ? 'draw' : kind === 'erase' ? 'erase' : kind); SU.ringClose(); if (mode === 'ask') mode = 'cue'; } });
      if (carry) { sk.strokes = carry; sk.hist = [sk.clone()]; sk.hi = 0; sk.draw(); }
      const act = (id) => {
        if (id === 'draw' || id === 'erase') { sk.toolErase = id === 'erase'; root.querySelectorAll('.nb-tool[data-t="draw"],.nb-tool[data-t="erase"]').forEach((b) => b.classList.toggle('is-active', b.dataset.t === id)); }
        else if (id === 'undo') sk.undo(); else if (id === 'redo') sk.redo(); else if (id === 'clear') sk.wipe();
      };
      root.querySelectorAll('.nb-tool').forEach((b) => b.addEventListener('click', () => act(b.dataset.t)));
      S.on(window, 'keydown', (e) => { if (e.target.closest && e.target.closest('input,textarea')) return; if (e.key === 'z' || e.key === 'Z') sk.undo(); else if (e.key === 'x' || e.key === 'X') sk.redo(); });
      S.on(window, 'resize', () => sk.resize());

      /* Momo: cue while empty, mumble of the provisional guess while the hand moves, the thumb once it rests */
      const tone = SU.TONE(L);
      let shown = '', prov = null, provAt = 0;
      const speak = (text, mood, key) => { if (shown === key) return; shown = key; SU.say1(text); SU.momo().express(SU.mood(mood)); };
      const bbox = () => { const b = SU.bboxOf(sk.strokes), r = sk.cv.getBoundingClientRect(); return [r.left + b.x0, r.top + b.y0, r.left + b.x1, r.top + b.y1]; };
      const anchor = SU.rectAnchor(bbox);
      const t = setInterval(() => {
        if (!S.alive()) return;
        /* the stroke in progress counts as ink: Momo hums while the hand is still moving, as in the repo (stream.drawing) */
        const cur = sk.down && !sk.erasing && sk.act && sk.act.length > 3 ? [...sk.strokes, sk.act] : sk.strokes;
        const has = cur.length > 0, now = performance.now(), moving = has && (sk.down || now - sk.last < GUESS_IDLE_MS);
        if (!has) { if (!sk.down) { mode = 'cue'; speak(LN.cue, 'Tenang', 'cue'); } return; }
        if (moving) {
          mode = 'mumble';
          if (now - provAt > PROVISIONAL_MS) { provAt = now; try { prov = SU.guessFor(L, cur)[0].label; } catch (e) { prov = null; } }
          speak(SU.mumble(L, prov), 'Penasaran', 'mumble:' + prov);
          return;
        }
        if (mode !== 'ask') {
          mode = 'ask'; shown = 'ask'; SU.say1('Sudah selesai? Tunjuk **Tebak Gambarku**, lalu cubit dan tahan sampai penuh. Masih mau mengubah juga boleh.'); SU.momo().express('Senang');
          SU.ringOpen('Tebak Gambarku', 2000, anchor, 'side', 'point').then(() => { if (mode === 'ask') finish(); });
        }
      }, MUMBLE_POLL_MS);
      S.offs.push(() => clearInterval(t));
      speak(LN.cue, 'Tenang', 'cue');
      await S.until(finished);
      clearInterval(t); SU.ringClose();
      if (!sk.strokes.length) { sk.strokes = sample(idx % 2 === 0 ? 'plank' : 'block', sk.w, sk.h); sk.draw(); }
      await S.sleep(S.skipped ? 0 : 200);
      return sk.clone();
    },
  });
})();
