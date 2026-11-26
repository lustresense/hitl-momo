/* One level = two pages, like the repo's /levelN and /canvasN routes.
   levelN  : intro (dark stage, spotlight), the camera rising into the sky; then (back from the canvas) the sticker thrown down, falling, placing,
             playing and winning.
   canvasN : the drawing page in the sky: drawing, Momo's guess, the decision, the sticker and its Lempar.
   The pages hand over through SU.handoff; each one starts on a frame identical to the last frame of the page before it. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, W = SU.world;
  const qs = () => Object.fromEntries(new URLSearchParams(location.search));

  /* the camera goes back up to the sky page for the next drawing; the last frame is the clean sky with Momo in the corner */
  SU.riseScene = (L) => ({
    id: 'naik', keep: true, label: `Level ${L} · Ke langit`, hint: '',
    async run(S) {
      const col = S.root._col; if (!col) return;
      SU.say1('Satu benda lagi. Yuk ke langit!'); SU.momo().express('Semangat');
      SU.momoTo('corner', 1700);
      const tl = W.cameraMove(col, 'rise', 1.8); S.tls.push(tl);
      await S.until(new Promise((r) => tl.add(r, 1.85)));
      SU.hideBubble(); await S.sleep(320);
    },
  });
  const guide = (id, label, line, mood, ring, ms = 900) => ({
    id, keep: true, label, hint: '',
    async run(S) { SU.say1(line); SU.momo().express(mood); await S.sleep(ms); await S.ring(ring, 1500); },
  });

  /* ------------------------------------------------------------------ level page */
  SU.levelPage = async function (L) {
    const q = qs(), lv = SU.LV[L];
    if (q.fase !== 'falling') SU.handoff.clear();      /* a level started from its beginning never inherits an old run */
    SU.mount({ at: 'side', title: lv.title, skip: 'right' });
    const h = SU.handoff.peek(), run = h && h.L === L ? h : SU.run0(L);
    const placed = run.placed.map((p) => SU.unpack(L, p)), recs = run.recs.slice();
    let idx = run.idx; SU.dbg = Object.assign(SU.dbg || {}, { placed, recs });
    const save = (extra) => SU.saveRun({ L, idx, placed: placed.map(SU.pack), recs }, extra);
    const toCanvas = async (expr) => { save({ expr: expr || 'Semangat' }); await SU.leaveTo('c' + L); };

    if (q.fase !== 'falling' || !run.obj) {
      /* 1. intro, then up into the sky: the canvas page takes over from the last frame */
      SU.momo().express('Senang');
      if (!q.skipIntro) await SU.run(SU.introScene(L));
      return toCanvas('Semangat');
    }

    /* 2. back from the canvas: the sticker is thrown down after the camera, the object falls, the student places it */
    const obj = SU.unpack(L, run.obj), rec = run.rec || {};
    await SU.run(SU.dropScene(L), { obj, placed, sticker: run.sticker });
    await SU.run(SU.placeScene(L), { obj, placed });
    placed.push(obj); recs.push(rec); SU.state.putStrokes(L, placed.length - 1, obj.strokes); idx++;
    if (placed.length < lv.minDrawings) {
      await SU.run(guide('lagi', `Level ${L} · Benda berikutnya`, `${SU.CHAR} masih butuh ${lv.minDrawings - placed.length} benda lagi buat ${L === 2 ? 'naik' : 'lewat'}. Cubit dan tahan di mana aja buat menggambar lagi.`, 'Penasaran', 'Gambar lagi'));
      await SU.run(SU.riseScene(L));
      return toCanvas('Semangat');
    }
    await SU.run(guide('siap', `Level ${L} · Siap`, 'Bendanya sudah cukup! Cubit dan tahan di mana aja, terus kita coba jalan.', 'Semangat', 'Mulai', 700));

    /* 3. play; the fail sheet can send the student back */
    const rebuild = (label) => ({ id: 'geser', label, hint: '', async run(S) { const c = W.column(S.root, L, W.CAM_WORLD); S.root._col = c; W.addObjs(c.act, placed); } });
    for (;;) {
      const r = await SU.run(SU.playScene(L), { placed, rec });
      if (r === 'win') break;
      if (r === 'retry') continue;
      if (r === 'draw') { placed.pop(); recs.pop(); idx--; await SU.run(rebuild(`Level ${L} · Ke langit`)); await SU.run(SU.riseScene(L)); return toCanvas('Semangat'); }
      if (r === 'place') {
        /* move the last object again: rebuild the world and let it drop from above */
        const last = placed.pop(); idx--;
        await SU.run(rebuild(`Level ${L} · Geser`));
        await SU.run(SU.placeScene(L), { obj: last, placed }); placed.push(last); idx++;
        await SU.run(guide('siap', `Level ${L} · Siap`, 'Sudah pas? Cubit dan tahan buat mencoba lagi.', 'Semangat', 'Mulai', 500));
      }
    }

    /* 4. win; unlock the next chapter and go back to the list */
    await SU.run(SU.winScene(L), { placed, rec: recs[recs.length - 1] || {} });
    const s0 = SU.state.get(), rc = Object.assign({}, s0.rec); rc[L] = recs;
    SU.state.set({ done: [...new Set([...(s0.done || []), L])], unlocked: Math.max(s0.unlocked || 1, Math.min(L + 1, 4)), rec: rc, fresh: L < 3 && L + 1 > (s0.unlocked || 1) ? L + 1 : null });
    SU.handoff.clear();
    SU.go(q.next || (L < 3 ? 'bab' : 'end'));
  };

  /* ------------------------------------------------------------------ canvas page */
  SU.canvasPage = async function (L) {
    const lv = SU.LV[L], q = qs();
    SU.mount({ at: 'corner', title: lv.title });
    const h = SU.handoff.peek(), run = h && h.L === L ? h : SU.run0(L);
    const recs = run.recs.slice(); let carry = null;
    SU.momo().express(SU.mood(run.expr || 'Senang'));
    if (q.freeze) return;                              /* test hook: stop on the first frame */
    for (;;) {
      const strokes = await SU.run(SU.canvasScene(L, run.idx), { carry }); carry = null;
      const rec = {};
      /* Momo's guess in her chat, then the student decides */
      const d = await SU.run(SU.guessScene(L, run.idx), { strokes, rec });
      if (d.kind === 'Gambar lagi') { carry = strokes; rec.decision = 'Gambar lagi'; rec.redraw = 1; recs.push(rec); continue; }
      const obj = W.toObj(L, strokes); obj.label = d.label; obj.behavior = lv.map[d.label] || 'solid';
      /* the sticker, then Lempar (on to the level page) or back to drawing */
      const s = await SU.run(SU.stampScene(L), { obj });
      if (s.choice === 'redraw') { rec.redraw = 1; recs.push(rec); continue; }
      SU.saveRun({ L, idx: run.idx, placed: run.placed, recs, rec, obj: SU.pack(obj), sticker: { rot: s.rot, scale: s.scale }, expr: 'Bangga' });
      return SU.leaveTo('l' + L, 'fase=falling');
    }
  };
})();
