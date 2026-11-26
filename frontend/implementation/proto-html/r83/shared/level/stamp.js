/* The decided drawing becomes a sticker on the sky page (repo StickerStamp.tsx, REVISI §18A): the student's own strokes with the
   final label under them, on a strip of tape. Two rings sit BESIDE the sticker (the eye stays on it):
   Lempar (thumb held 2 s) and Gambar lagi (open palm).
   Two scenes, two pages: stampScene runs on the canvas page and ends with the choice; dropScene runs on the level page, starting from the
   very same sticker (position, tilt, size handed over) while the camera comes down and the sticker slides ahead of it (1200 ms). */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { esc, nameOf, strokesSvg, GL } = SU, W = SU.world;

  const STAMP_HOLD_MS = 2000, STAMP_THROW_MS = 1200, THROW_TRAVEL = .6;
  const stampLine = (label) => `${label} sudah jadi stiker! Cubit, lalu **sentil ke atas** buat melemparnya ke dunia. Kalau mau ulang, dekatkan tangan ke **Gambar lagi** dan tahan.`;

  SU.makeSticker = (obj) => {
    const st = document.createElement('div'); st.className = 'sticker';
    st.innerHTML = `<div class="sheet"><span class="tape"></span><div class="art">${strokesSvg(obj.strokes)}</div><div class="lab">${esc(nameOf(obj.label))}</div></div>`;
    return st;
  };

  /* canvas page. Returns {choice:'redraw'} or {choice:'throw', rot, scale} (the sticker stays on the page as it is) */
  SU.stampScene = (L) => ({
    id: 'stiker', keep: true, label: `Level ${L} · Stiker`, hint: 'Cubit lalu sentil ke atas = Lempar · atau dekatkan tangan ke pilihan, cubit dan tahan · G = Gambar lagi',
    async run(S, { obj }) {
      const root = S.root, label = nameOf(obj.label);
      root.querySelectorAll('.draw-tools,.drawing-corner,.mission-pop').forEach((e) => G.to(e, { opacity: 0, duration: .25 }));
      G.to(SU.Q('skw'), { opacity: 0, duration: .35 });
      const st = SU.makeSticker(obj); root.appendChild(st);
      G.set(st, { xPercent: -50, yPercent: -50 });
      S.tls.push(G.from(st, { scale: .3, rotation: -14, opacity: 0, duration: .7, ease: 'back.out(1.7)' }));
      S.tls.push(G.to(st, { rotation: 1.6, duration: 2.4, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: .8 }));
      await SU.momoTo('side', 700);
      SU.say1(stampLine(label)); SU.momo().express('Bangga');

      /* two rings, one above the other, pinned beside the sticker */
      const wrap = document.createElement('div'); wrap.className = 'stamp-rings'; document.body.appendChild(wrap);
      const mk = (cls, lbl, glyph) => { const el = document.createElement('div'); el.className = 'thumb-confirm ' + cls; el.setAttribute('role', 'progressbar'); el.tabIndex = 0; el.innerHTML = SU.ringMarkup(lbl); if (glyph) el.querySelector('.thumb-confirm__thumb').innerHTML = glyph; wrap.appendChild(el); return el; };
      const elT = mk('r-throw', 'Lempar'), elR = mk('r-redraw', 'Gambar lagi');
      const unpin = SU.pinBeside(wrap, st);
      const rT = SU.makeRing(elT), rR = SU.makeRing(elR); rR.keyOff = true;
      G.from(wrap, { opacity: 0, y: 12, duration: .45, delay: .5, ease: 'back.out(1.7)' });
      const choice = await new Promise((res) => {
        rT.open('Lempar', STAMP_HOLD_MS).then(() => res('throw'));
        rR.open('Gambar lagi', STAMP_HOLD_MS).then(() => res('redraw'));
        S.on(window, 'keydown', (e) => { if (e.key === 'g' || e.key === 'G') res('redraw'); });
        if (SU.nui) { const off = SU.nui.flick(() => res('throw')); S.offs.push(off); }   /* r8.3 aturan C: sentil ke atas = lempar */
        S.skipP.then(() => res('throw'));
      });
      rT.close(); rR.close(); unpin(); wrap.remove();
      SU.hideBubble();
      if (choice === 'redraw') {
        await SU.tw(st, { scale: .2, rotation: 24, opacity: 0, duration: .45, ease: 'back.in(1.6)' });
        st.remove(); return { choice: 'redraw' };
      }
      SU.setHint('');
      S.tls.forEach((t) => { try { t.pause(); } catch (e) { /* ignore */ } });   /* the wobble stops where it is: the next page continues from this pose */
      await S.sleep(260);                                                          /* the bubble has faded out */
      return { choice: 'throw', rot: +G.getProperty(st, 'rotation') || 0, scale: +G.getProperty(st, 'scale') || 1 };
    },
  });

  /* level page: starts as the last frame of the canvas page (sticker over the clean sky), then the camera comes down and the sticker is thrown after it */
  SU.dropScene = (L) => ({
    id: 'lempar', keep: true, label: `Level ${L} · Lempar`, hint: '',
    async run(S, { obj, placed, sticker }) {
      const root = S.root, dur = STAMP_THROW_MS / 1000;
      const col = W.column(root, L, 0);
      W.addObjs(col.act, placed);
      col.hero = W.Hero(col.act, SU.GEO[L].spawn[0], SU.GEO[L].spawn[1]);
      const st = SU.makeSticker(obj); st.style.zIndex = 4; root.appendChild(st);
      G.set(st, { xPercent: -50, yPercent: -50, rotation: (sticker && sticker.rot) || 0, scale: (sticker && sticker.scale) || 1 });
      await SU.momoTo('side', 0); SU.momo().express('Bangga');
      await S.sleep(S.skipped ? 0 : 120);
      const tl = G.timeline(); S.tls.push(tl);
      const travel = innerHeight * THROW_TRAVEL;
      tl.add(W.cameraMove(col, 'descend', 1.5), 0)
        .to(st, { y: travel, rotation: 10, scale: .62, duration: dur, ease: 'power2.in' }, 0)
        .to(st, { opacity: 0, duration: .25 }, dur - .1);
      SU.momoTo('corner', 1100);
      await S.until(new Promise((r) => tl.add(r, 1.55)));
      st.remove(); root._col = col;
      return 'ok';
    },
  });
})();
