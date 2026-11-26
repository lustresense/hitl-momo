/* Level intro, ported from src/components/level/LevelIntro.tsx + SkyBackdrop.tsx.
   Momo tells the story in beats while the stage is dark except one lit spot; the thumb "Aku mengerti" then lifts the camera
   through a band of clouds into the clean sky where the drawing page lives (camera column = three screens tall). */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { clamp, esc, fmt } = SU, W = SU.world;

  const FLY_IN_S = .95, GLIDE_S = 1.1, SPOT_S = .9, CAMERA_START = -66.6667;
  /* consecutive lines about the same thing share one bubble: Momo glides and the spot moves once per topic.
     A line without its own focus keeps the focus before it, so the spot never leaves and comes back for the same place. */
  function buildBeats(lv) {
    const items = [...lv.story.map((t, i) => ({ kind: 'story', focus: lv.focus[i] || 'thinman', text: t })),
      ...lv.nudge.map((t, i) => ({ kind: 'nudge', focus: i === 1 ? 'ahead' : null, text: t }))];
    const beats = []; let eff = items[0].focus;
    for (const it of items) {
      eff = it.focus || eff;
      const last = beats[beats.length - 1];
      if (last && last.kind === it.kind && last.focus === eff) last.lines.push(it.text);
      else beats.push({ kind: it.kind, focus: eff, lines: [it.text] });
    }
    return beats;
  }

  SU.introScene = (L) => ({
    id: 'intro', label: `Level ${L} · Cerita`, hint: 'Baca dulu · setelah Momo selesai, cubit dan tahan di mana aja',
    async run(S) {
      const lv = SU.LV[L], Gm = SU.GEO[L], root = S.root, beats = buildBeats(lv);
      root.classList.add('level-intro'); root.dataset.phase = 'drop';
      root.innerHTML = `<div class="intro-camera" id="icam"><div class="cam-screen sky-top"></div><div class="cam-screen band">${W.cloudBand('far')}</div><div class="cam-screen world-screen">${W.html(L)}</div></div>
        <div class="intro-near" id="inear">${W.cloudBand('near')}</div><div class="intro-dim" id="idim"></div>
        <div class="hud tr gs"><span class="k-chip">${esc(lv.title)}</span></div>`;
      const cam = SU.Q('icam'), near = SU.Q('inear'), dim = SU.Q('idim'), act = SU.Q('act');
      const hero = W.Hero(act, Gm.spawn[0], Gm.spawn[1]); hero.el.classList.add('intro-thinman');
      S.offs.push(SU.gazeAt(() => hero.el));                       /* her eyes follow Thinman */
      G.set(cam, { yPercent: CAMERA_START });
      const m = SU.momo();

      /* where Momo hovers for a focus, in screen px (centre of her body) */
      const spotOf = (focus) => {
        if (!focus) return null;
        const vw = innerWidth, vh = innerHeight, s = .8;
        if (focus === 'thinman') { const r = hero.el.getBoundingClientRect(); return { x: clamp(r.right + m.base.w * s * .55 + 40, m.base.w * s / 2 + 16, vw - m.base.w * s / 2 - 16), y: clamp(r.top - m.base.h * s * .32, m.base.h * s / 2 + 12, vh * .5), s }; }
        return { x: vw * .5, y: Math.max(m.base.h * s / 2 + 12, vh * .22), s };
      };
      const litOf = (focus) => {
        const vw = innerWidth, vh = innerHeight;
        if (focus === 'thinman') { const r = hero.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(110, Math.round(vh * .22)) }; }
        if (focus === 'ahead') return { x: vw * .62, y: vh * .8, r: Math.max(140, Math.round(vw * .2)) };
        return { x: vw * .5, y: vh * .5, r: 0 };
      };
      const spot = { x: innerWidth / 2, y: innerHeight / 2, r: 0 };
      const paint = () => { dim.style.setProperty('--spot-x', spot.x + 'px'); dim.style.setProperty('--spot-y', spot.y + 'px'); dim.style.setProperty('--spot-r', spot.r + 'px'); };
      paint();
      SU.dbg = SU.dbg || {}; SU.dbg.spots = 0;
      const moveSpot = (focus) => { SU.dbg.spots++; const t = litOf(focus); S.tls.push(G.to(spot, { ...t, duration: SPOT_S, ease: 'power2.inOut', onUpdate: paint })); };

      /* 1. Momo flies in to the first topic (book-open pause first, so her first line starts as she lands) */
      S.tls.push(G.from('.hud.tr', { opacity: 0, y: -14, duration: .5, delay: .3 }));
      const first = spotOf(beats[0].focus);
      m.express('Semangat');
      await S.sleep(500);
      await SU.momoTo('side', 1);   /* start where the previous page left her; flight below */
      if (first) await m.move(m.pathFrom([{ t: .55, x: (m.pose.x + first.x) / 2, y: Math.min(m.pose.y, first.y) - 40, s: (m.pose.s + first.s) / 2, r: -4 }, { t: 1, x: first.x, y: first.y, s: first.s, r: 0 }]), FLY_IN_S * 1000);

      /* 2. the story, beat by beat */
      root.dataset.phase = 'story'; let cur = null;
      for (let bi = 0; bi < beats.length && S.alive() && !S.skipped; bi++) {
        const b = beats[bi];
        if (b.kind === 'nudge') root.dataset.phase = 'nudge';
        const sp = spotOf(b.focus);
        if (bi === 0) moveSpot(b.focus);
        else if (b.focus !== cur) {
          moveSpot(b.focus);
          await S.until(m.move(m.pathFrom([{ t: .5, x: (m.pose.x + sp.x) / 2, y: Math.min(m.pose.y, sp.y) - 30, s: (m.pose.s + sp.s) / 2, r: -3 }, { t: 1, x: sp.x, y: sp.y, s: sp.s, r: 0 }]), GLIDE_S * 1000));
        }
        cur = b.focus;
        await S.say(b.lines.map(fmt), b.kind === 'nudge' ? 'Penasaran' : (b.focus === 'ahead' ? 'Berpikir' : 'Senang'));
        if (bi < beats.length - 1) await S.sleep(clamp(b.lines[b.lines.length - 1].length * 55, 1700, 3600));
      }
      /* 3. only after the last line and its reading pause does the thumb appear */
      if (!S.skipped) { await S.sleep(clamp(beats[beats.length - 1].lines[0].length * 45, 1500, 3000)); await S.ring('Aku mengerti', 2000); }
      SU.ringClose();

      /* 4. rise: Momo and the camera go up through the clouds into the clean sky */
      root.dataset.phase = 'rise'; SU.hideBubble(); SU.setHint('');
      const tl = G.timeline(); S.tls.push(tl);
      const a = SU.anchors.corner();
      m.express('Semangat');
      tl.to(cam, { yPercent: 0, duration: 2.1, ease: 'power2.inOut' }, .36)
        .fromTo(near, { y: -220 }, { y: 260, duration: 2.1, ease: 'power1.inOut' }, .36)
        .to(spot, { r: 0, duration: .6, onUpdate: paint }, 0)
        .to('.hud.tr', { opacity: 0, duration: .4 }, 0);
      const rise = new Promise((r) => tl.add(r, 2.6));
      SU.momoTo('corner', 1900);
      await rise;
      root.dataset.phase = 'sky';       /* near clouds off, dim off: the frame the canvas page starts from */
    },
  });
})();
