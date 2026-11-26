/* Tutorial brochure, ported from src/components/onboarding/TutorialBrochure.tsx (+ tutorial-layout/timing/card-gate, 99-tutorial.css).
   Three orange cards are dealt, fanned, opened one at a time (flip + bifold), each with a practice page and a locked thumb that fills
   during the read time (CARD_READ_MS) and then unlocks. Layout of the spread is computed from the viewport: safe on every desktop size.
   After every transition the end state is forced, so a skipped or throttled animation can never leave a card half-open. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { clamp, esc, GL, Q, CHAR } = SU;

  /* repo tutorial-timing.ts */
  const TT = { deal: { duration: .95, ease: 'back.out(1.25)', stagger: .13, afterDeal: .3, fromAboveVh: .6 }, tuck: { duration: .75, ease: 'power3.inOut' },
    open: { toCentre: .95, flip: .95, bifold: .8, bifoldAt: .88, pageShowAt: .9, openedAt: 1.45 },
    close: { duration: 1.0, foldDuration: .45, foldEase: 'power3.in', toCentreDuration: .35, flipDuration: .55, flipAt: .45, easeTuck: 'power3.out' },
    pause: 1.1, exit: { duration: .6, ease: 'power2.in', stagger: .07, startRotation: 8 } };
  const FAN = [-5, 1.5, 5.5], CARD_READ_MS = 3333, WALK_END = 76, WALK_START = 10;

  /* repo tutorial-layout.ts: card width, spread width, open height, scale to fit; the bottom 22% is kept for Momo and the stamps */
  function layout(vw, vh) {
    const gw = Math.round(clamp(vw * .3, 320, 480)), pw = Math.round(gw * 1.6), oh = Math.round(clamp(vh * .76, 480, 720));
    const top = Math.max(vh * .04, 46), freeH = vh - vh * .22 - top, fit = Math.min(1, (vw * .94) / (gw + pw), freeH / oh), cy = top + (oh * fit) / 2;   /* sandbox: 46px top room for the hint chip */
    const closedW = Math.min(214, Math.max(150, vw * .17)), rowCentre = vh * (1 - .22 / 2) - 10;
    return { gw, pw, oh, fit, s0: closedW / gw, gap: closedW * 1.1, mini: 46 / gw, miniGap: 62, miniY: rowCentre - cy, cy, vh };
  }
  /* copy: repo domain/tutorial-script.ts. The last thumb leads to the stage list, not to a chapter. */
  const COPY = [
    { title: `Kenalin ${CHAR}`, copy: 'Dia mau menyeberangi buku gambar ini. Bantu dia jalan sampai ke bendera.', cta: 'Lanjut', hold: 1000, label: 'Kartu 1 · Kenalin Thinman', hint: 'Cubit lalu geser ke kanan = jalan · cubit sebentar atau sentil ke atas = lompat · atau ← → ↑' },
    { title: 'Pijakan aman, atau bahaya', copy: `Gambar benda padat kayak balok atau tangga biar ${CHAR} bisa lewat. Hindari benda bahaya kayak duri biar bukunya nggak sobek.`, cta: 'Lanjut', hold: 1000, label: 'Kartu 2 · Aman atau bahaya', hint: 'Cukup baca dan lihat contohnya' },
    { title: 'Latihan kursor dan alat', copy: 'Di kertas, kursormu jadi pensil. Cubit, tahan, lalu geser buat menggambar. Coba juga Hapus, Mundur, Maju, dan Bersihkan: tunjuk tombolnya, lalu cubit. Tiap alat yang kamu coba akan tercentang.', cta: 'Pilih level', hold: 1000, label: 'Kartu 3 · Latihan kursor', hint: 'Cubit, tahan, geser di kertas = gambar · alat: tunjuk lalu cubit' },
  ];
  const HINT = [['pinch', 'Cubit, lalu geser ke kanan untuk jalan. Cubit sebentar untuk lompat.'], ['bulb', 'Baca dulu penjelasannya.'], ['pinch', 'Kursornya jadi pensil. Cubit, tahan, geser untuk menggambar. Alat: tunjuk, lalu cubit.']];
  const FLAG = '<svg class="tut-flag" viewBox="0 0 60 80" aria-hidden="true"><path d="M8 78V4" stroke="#111" stroke-width="3.4" stroke-linecap="round"/><path class="tut-flag__cloth" d="M10 6L52 20L10 36Z" fill="#ef7a37" stroke="#111" stroke-width="3.4" stroke-linejoin="round"/></svg>';

  /* ---------- Thinman on the practice pages: the repo rig, ticked every frame ---------- */
  const figs = new Set();
  function figure(el, preset = {}) {
    const f = { el, ad: new SU.CharacterAnimationAdapter({ variant: 'A' }), st: Object.assign({ vx: 0, vy: 0, on: true, face: 1, term: undefined }, preset) };
    figs.add(f); return f;
  }
  /* r8.3 perf: the rig is drawn at most 30 times a second, only while its card is on screen, and the DOM is only touched when the drawing changed */
  let figAcc = 0;
  G.ticker.add((t, dt) => { const d = Math.min(.05, dt / 1000); figAcc += d; if (figAcc < 1 / 30) return; const step = Math.min(.066, figAcc); figAcc = 0; for (const f of figs) { if (!f.el.isConnected) { figs.delete(f); continue; } if (!f.el.getClientRects().length) continue; f.ad.update({ x: 0, y: 0, vx: f.st.vx, vy: f.st.vy, grounded: f.st.on, facing: f.st.face, terminalPhase: f.st.term }, step); const svg = f.ad.renderSvg(f.st.face); if (svg !== f.last) { f.last = svg; f.el.innerHTML = svg; } } });

  /* ---------- state of the spread ---------- */
  const B = { on: false, opened: -1, l: null, tut: null, cards: [], flips: [], plays: [], thumbs: [] };
  function relayout() { const l = layout(innerWidth, innerHeight); B.l = l; const t = B.tut; t.style.setProperty('--gw', l.gw + 'px'); t.style.setProperty('--pw', l.pw + 'px'); t.style.setProperty('--oh', l.oh + 'px'); t.style.setProperty('--cy', l.cy + 'px'); return l; }
  const rest = (i, l) => ({ x: (i - 1) * l.miniGap, y: l.miniY, rotation: 0, scale: l.mini, opacity: 1 });

  /* the end state of "card i is open", set without animation */
  function forceOpen(i) {
    const l = B.l;
    B.cards.forEach((c, j) => G.set(c, { zIndex: j === i ? 60 : j < i ? 10 + j : 30 - j }));
    for (let j = 0; j < 3; j++) { if (j < i) { G.set(B.cards[j], rest(j, l)); G.set(B.flips[j], { rotationY: 0 }); B.cards[j].classList.add('is-done'); } else if (j > i) G.set(B.cards[j], rest(j, l)); }
    G.set(B.cards[i], { x: (-l.pw / 2) * l.fit, y: 0, rotation: 0, scale: l.fit, opacity: 1 }); G.set(B.flips[i], { rotationY: 180 }); G.set(B.plays[i], { rotationY: 0, opacity: 1 });
    B.opened = i; B.plays[i].style.pointerEvents = 'auto';
  }
  function openTl(i) {
    const l = B.l, card = B.cards[i], flip = B.flips[i], play = B.plays[i], O = TT.open; let done; const opened = new Promise((r) => (done = r));
    const tl = G.timeline();
    tl.add(() => { B.cards.forEach((c, j) => G.set(c, { zIndex: j === i ? 60 : j < i ? 10 + j : 30 - j })); }, 0);
    for (let j = i + 1; j < 3; j++) tl.to(B.cards[j], { ...rest(j, l), duration: TT.tuck.duration, ease: TT.tuck.ease }, 0);
    tl.to(card, { x: 0, y: 0, rotation: 0, scale: l.fit, opacity: 1, duration: O.toCentre, ease: 'power3.inOut' }, 0)
      .to(flip, { rotationY: 180, duration: O.flip, ease: 'power2.inOut' }, 0)
      .set(play, { opacity: 1 }, O.pageShowAt)
      .to(play, { rotationY: 0, duration: O.bifold, ease: 'power3.out' }, O.bifoldAt)
      .to(card, { x: (-l.pw / 2) * l.fit, duration: O.bifold, ease: 'power3.out' }, O.bifoldAt)
      .add(() => { forceOpen(i); done(); }, O.openedAt);
    return { tl, opened };
  }
  function closeTl(i) {
    const l = B.l, card = B.cards[i], flip = B.flips[i], play = B.plays[i], C = TT.close, doneEl = card.querySelector('.tut-front__done');
    const tl = G.timeline();
    tl.add(() => { B.opened = -1; play.style.pointerEvents = 'none'; card.classList.add('is-done'); }, 0)
      .to(play, { rotationY: -92, duration: C.foldDuration, ease: C.foldEase }, 0)
      .to(card, { x: 0, duration: C.toCentreDuration, ease: 'power2.inOut' }, 0)
      .set(play, { opacity: 0 }, C.foldDuration)
      .to(flip, { rotationY: 0, duration: C.flipDuration, ease: C.easeTuck }, C.flipAt)
      .to(card, { ...rest(i, l), duration: C.flipDuration, ease: C.easeTuck }, C.flipAt)
      .to(doneEl, { scale: 1, duration: .55, ease: 'back.out(2.2)' }, C.flipAt + .25);
    return tl;
  }
  function onResize() {
    if (!B.on || G.isTweening(B.cards)) return;
    const l = relayout(); if (B.opened >= 0) forceOpen(B.opened); else B.cards.forEach((c, i) => G.set(c, rest(i, l)));
  }
  SU.onResize = onResize;

  const THUMB_FACE = '<span class="thumb-confirm__face"><svg class="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true"><circle class="thumb-confirm__track" cx="36" cy="36" r="30"/><circle class="thumb-confirm__fill" cx="36" cy="36" r="30" stroke-dasharray="188.4956" stroke-dashoffset="188.4956" transform="rotate(-90 36 36)"/></svg><span class="thumb-confirm__thumb"></span></span>';
  function build(root) {
    root.innerHTML = `<div class="tut" id="tut"><div class="tut-shade"></div><main class="tut-stage" aria-label="Tutorial tiga kartu">${[0, 1, 2].map((i) => `<article class="tut-card" data-i="${i}" aria-label="Kartu tutorial ${i + 1}"><div class="tut-flip"><section class="tut-face tut-front"><span class="tut-front__stitch"></span><span class="tut-front__number">${i + 1}</span><span class="tut-front__done">${GL.check}</span></section><section class="tut-face tut-back"><div class="tut-steps">${[0, 1, 2].map((s) => `<i class="${s === i ? 'is-now' : s < i ? 'is-done' : ''}"></i>`).join('')}</div><h2 class="guide-title">${esc(COPY[i].title)}</h2><p class="guide-copy">${esc(COPY[i].copy)}</p><p class="tut-gesture"><span class="gi">${GL[HINT[i][0]]}</span><span class="gt">${esc(HINT[i][1])}</span></p><div class="brochure-cta brochure-cta--thumb"><div class="tut-thumb-slot" data-locked="true"><div class="thumb-confirm tut-thumb tut-thumb--locked" role="progressbar" tabindex="0" aria-label="Coba dulu, ya" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${THUMB_FACE}<span class="thumb-confirm__label">Coba dulu, ya</span></div></div></div></section></div><section class="tut-play"></section></article>`).join('')}</main></div>`;
    B.tut = root.querySelector('#tut'); B.cards = [...root.querySelectorAll('.tut-card')]; B.flips = B.cards.map((c) => c.querySelector('.tut-flip')); B.plays = B.cards.map((c) => c.querySelector('.tut-play'));
    B.thumbs = B.cards.map((c) => { const el = c.querySelector('.tut-thumb'); el.querySelector('.thumb-confirm__thumb').innerHTML = GL.lock; const r = SU.makeRing(el); r.locked = true; return r; });
    B.on = true; B.opened = -1; return relayout();
  }

  /* ---------- practice pages ---------- */
  function walkPage(cur) {
    const el = document.createElement('div'); el.className = 'tut-scene tut-walk';
    el.innerHTML = `<div class="tut-handhint"><span class="ha">${GL.left}</span><span class="tut-handhint__hand">${GL.pinch}</span><span class="ha">${GL.right}</span></div><svg class="tut-walk__ground" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14Q150 8 300 14T600 12" fill="none" stroke="#111" stroke-width="6" stroke-linecap="round"/><path d="M30 24l-6 10M90 24l-5 9M170 25l-6 10M260 24l-5 10M350 25l-6 9M450 24l-5 10M530 25l-6 9" stroke="#111" stroke-width="2.6" stroke-linecap="round" opacity=".45"/></svg><div class="tut-walk__trail" style="width:0"></div><div class="tut-walk__man" style="left:14%"><span class="wb"></span></div><div class="tut-walk__flag">${FLAG}</div><span class="tut-win">${GL.check}</span>`;
    const man = el.querySelector('.tut-walk__man'), body = el.querySelector('.wb'), trail = el.querySelector('.tut-walk__trail'), hint = el.querySelector('.tut-handhint'), flag = el.querySelector('.tut-flag__cloth'), win = el.querySelector('.tut-win'), hand = el.querySelector('.tut-handhint__hand');
    const fig = figure(body);
    G.set(man, { xPercent: -50 }); G.set(hand, { x: -22 }); const sweep = G.to(hand, { x: 22, duration: 1.1, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    let pos = 14, moved = false, done = false, res, lastMove = 0; const reached = new Promise((r) => (res = r));
    G.ticker.add(() => { if (done) return; if (performance.now() - lastMove > 140) fig.st.vx = 0; });
    const finish = () => {
      if (done) return; done = true; fig.st.vx = 0; fig.st.on = true; fig.st.term = 'win';
      G.fromTo(win, { rotation: -30, scale: 0 }, { scale: 1, rotation: 0, duration: .6, ease: 'back.out(2.2)' });
      G.to(flag, { skewY: 6, scaleX: .9, transformOrigin: '10px 20px', duration: .45, yoyo: true, repeat: -1, ease: 'sine.inOut' }); res();
    };
    const setPos = (p) => {
      p = clamp(p, WALK_START, WALK_END); const dx = p - pos;
      if (Math.abs(dx) < .01 && p < WALK_END - .01) return;     /* epsilon: the goal is reached at 76 within float error */
      if (!moved) { moved = true; G.to(hint, { opacity: 0, duration: .35 }); sweep.kill(); }
      fig.st.vx = (dx >= 0 ? 1 : -1) * 130; fig.st.face = dx >= 0 ? 1 : -1; lastMove = performance.now();
      pos = p; man.style.left = pos + '%'; trail.style.width = Math.max(0, pos - 14) + '%'; G.set(man, { xPercent: -50 });
      if (pos >= WALK_END - .01) finish();
    };
    /* r8.3 aturan C (tuntun): cubit di mana aja = titik tengah joystick, geser kanan/kiri = jalan (makin jauh makin cepat), lepas = berhenti,
       cubit cepat atau sentil ke atas = lompat. Sama persis dengan di level. */
    const hop = () => { if (done || !fig.st.on) return; fig.st.on = false; fig.st.vy = -420; G.fromTo(body, { y: 0 }, { y: -52, duration: .28, ease: 'power2.out', yoyo: true, repeat: 1, onUpdate() { if (this.progress() > .5) fig.st.vy = 420; }, onComplete() { fig.st.on = true; fig.st.vy = 0; } }); };
    const joy = SU.nui ? SU.nui.joystick({ onJump: hop, when: () => B.opened === 0 && !done }) : null;
    let pl = performance.now();
    const walkTick = () => { const now = performance.now(), dt = Math.min(.05, (now - pl) / 1000); pl = now; if (!el.isConnected || B.opened !== 0 && done) { G.ticker.remove(walkTick); if (joy) joy.destroy(); return; } if (done) return; const d = joy ? joy.dir() : 0; if (d) setPos(pos + d * 24 * dt); };
    G.ticker.add(walkTick);
    const key = (e) => {
      if (B.opened !== 0 || done) return;
      if (e.key === 'ArrowRight') { setPos(pos + 3); e.preventDefault(); } else if (e.key === 'ArrowLeft') { setPos(pos - 3); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hop(); e.preventDefault(); }
    };
    cur.on(window, 'keydown', key);
    return { el, reached, force() { pos = WALK_END - 1; lastMove = 0; setPos(WALK_END); } };
  }
  function safetyPage() {
    const el = document.createElement('div'); el.className = 'tut-scene tut-safety';
    const art = (inner) => `<svg viewBox="0 0 240 240" class="tut-zone__art" aria-hidden="true"><path d="M6 204Q120 198 234 204" fill="none" stroke="#111" stroke-width="5" stroke-linecap="round"/>${inner}</svg>`;
    const safe = '<g stroke="#111" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"><rect x="30" y="140" width="92" height="62" rx="4" fill="#d9a066"/><path d="M30 171h92M76 140v31M53 171v31M99 171v31" fill="none" stroke-width="3"/></g><g stroke="#111" stroke-width="4" stroke-linecap="round" fill="none"><path d="M158 202L170 96M196 202L208 96"/><path d="M162 176h36M165 148h36M168 122h36" stroke-width="3.6"/></g><g stroke="#111" stroke-width="3.6" stroke-linejoin="round"><rect x="130" y="206" width="104" height="14" rx="3" fill="#c28a52" transform="translate(-4 -8) rotate(-0.5 180 213)"/></g>';
    const bad = '<g stroke="#111" stroke-width="4" stroke-linejoin="round"><path d="M16 204l20-70 20 70z" fill="#f0e4cf"/><path d="M58 204l20-70 20 70z" fill="#f0e4cf"/><path d="M100 204l20-70 20 70z" fill="#f0e4cf"/></g>';
    el.innerHTML = `<section class="tut-zone tut-zone--safe" aria-label="Aman dipijak"><span class="tut-zone__badge tut-zone__badge--ok">${GL.check}Aman dipijak</span><div class="tut-zone__stage">${art(safe)}<div class="tut-zone__man tut-zone__man--hop"></div></div></section><section class="tut-zone tut-zone--danger" aria-label="Kertas sobek"><span class="tut-zone__badge tut-zone__badge--bad">${GL.close}Kertas sobek</span><div class="tut-zone__stage">${art(bad)}<div class="tut-zone__man tut-zone__man--ouch"></div></div></section><i class="tut-tear" aria-hidden="true"></i>`;
    const hop = el.querySelector('.tut-zone__man--hop'), ouch = el.querySelector('.tut-zone__man--ouch');
    figure(hop, { on: false, vy: -250 }); figure(ouch, { term: 'fail' });
    G.to(hop, { yPercent: -34, duration: .5, ease: 'power2.out', yoyo: true, repeat: -1, repeatDelay: .1 });
    G.to(ouch, { x: 3, rotation: 3, duration: .125, ease: 'none', yoyo: true, repeat: -1 });
    return { el };
  }
  function drawPage(cur) {
    const el = document.createElement('div'); el.className = 'tut-scene tut-draw';
    const T4 = [['draw', 'pencil', 'Pensil'], ['erase', 'eraser', 'Hapus'], ['undo', 'undo', 'Mundur'], ['redo', 'redo', 'Maju'], ['clear', 'clear', 'Bersihkan']];
    el.innerHTML = `<div class="tut-draw__paper"><div class="sk-wrap"></div><div class="tut-draw__ghost">${GL.pinch}</div></div><div class="tut-tools">${T4.map(([id, g, n]) => `<button type="button" class="nb-tool${id === 'draw' ? ' is-active' : ''}" data-t="${id}" aria-label="${n}"><span class="g">${GL[g]}</span><span class="nb-tool__label">${n}</span><span class="tut-tool__tick">${GL.check}</span></button>`).join('')}</div>`;
    const used = new Set(), ghost = el.querySelector('.tut-draw__ghost');
    const gtl = G.to(ghost, { x: 16, y: -8, rotation: 6, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: -1 }); G.set(ghost, { x: -16, y: 8, rotation: -8 });
    let all; const allP = new Promise((r) => (all = r));
    const tick = (id) => { if (used.has(id)) return; used.add(id); G.to(el.querySelector(`.nb-tool[data-t="${id}"] .tut-tool__tick`), { scale: 1, duration: .4, ease: 'back.out(2.4)' }); if (used.size >= 5) all(); };
    const sk = new SU.Sketch(el.querySelector('.sk-wrap'), { onChange: (k) => { if (k === 'stroke') { gtl.kill(); G.to(ghost, { opacity: 0, duration: .3 }); } tick(k === 'stroke' ? 'draw' : k); } });
    const act = (id) => { if (id === 'draw' || id === 'erase') { sk.toolErase = id === 'erase'; el.querySelectorAll('.nb-tool[data-t="draw"],.nb-tool[data-t="erase"]').forEach((b) => b.classList.toggle('is-active', b.dataset.t === id)); } else if (id === 'undo') sk.undo(); else if (id === 'redo') sk.redo(); else if (id === 'clear') sk.wipe(); };
    el.querySelectorAll('.nb-tool').forEach((b) => b.addEventListener('click', () => act(b.dataset.t)));
    cur.on(window, 'keydown', (e) => { if (B.opened !== 2) return; if (e.key === 'z' || e.key === 'Z') sk.undo(); else if (e.key === 'x' || e.key === 'X') sk.redo(); });
    return { el, sk, all: allP, force: () => ['draw', 'erase', 'undo', 'redo', 'clear'].forEach(tick) };
  }

  /* ---------- the scene: three cards in one run; "Lewati" jumps to the end state of the current card ---------- */
  SU.kartuScene = (opts = {}) => ({
    id: 'kartu', label: 'Kartu tutorial', hintTop: true, hint: '',
    async run(S) {
      const root = S.root; let cur;
      const newCur = () => { cur = { skipped: false, on: S.on }; cur.p = new Promise((r) => (cur.go = r)); G.globalTimeline.timeScale(1); return cur; };
      const U = (p) => Promise.race([Promise.resolve(p), cur.p]);          /* wait, but a skip releases the wait */
      SU.onSkip = () => { if (!cur || cur.skipped) return; cur.skipped = true; G.globalTimeline.timeScale(6); cur.go(); };
      S.offs.push(() => { SU.onSkip = null; });
      const label = (i) => { SU.Q('sk-label').textContent = COPY[i].label; SU.setHint(COPY[i].hint, true); };

      const fromName = opts.fromName != null ? opts.fromName : /[?&]from=name/.test(location.search);
      const l = build(root);
      SU.setHint('');
      G.set(B.plays, { transformPerspective: 1800, transformOrigin: '0% 50%', rotationY: -92, opacity: 0, pointerEvents: 'none' });
      G.set(B.flips, { rotationY: 0 });
      G.set(B.cards, { scale: l.s0 * .9, x: (k) => (k - 1) * l.gap, y: -l.vh * TT.deal.fromAboveVh, rotation: 0, opacity: 0, zIndex: (k) => 30 - k });

      /* intro: Momo flies to center, introduces the 3 guide cards, then moves to bottom-right before dealing */
      newCur();
      if (fromName) await U(SU.momoTo('mid', 950, -7));
      else await SU.momoTo('mid', 0);
      if (!cur.skipped) {
        SU.momo().express('Senang');
        const nm = (SU.state.get().name || '').trim();
        SU.say1(nm
          ? `Halo, **${nm}**! Selanjutnya kamu bisa baca **3 kartu panduan** ini untuk tahu cara main dan bantu ${CHAR}, ya.`
          : `Selanjutnya kamu bisa baca **3 kartu panduan** ini untuk tahu cara main dan bantu ${CHAR}, ya.`);
        await U(SU.sleep(3000));
      }
      if (!cur.skipped) {
        SU.hideBubble();
        await U(SU.sleep(220));
      }
      if (!cur.skipped) await U(SU.momoTo('strip', 950, 8));
      if (cur.skipped) {
        SU.hideBubble();
        await SU.momoTo('strip', 16);
        await SU.momoTo('strip', 0);
      }

      for (let i = 0; i < 3; i++) {
        newCur(); label(i);
        if (i === 0) {
          const D = TT.deal, tl = G.timeline(); S.tls.push(tl);
          tl.to(B.tut.querySelector('.tut-shade'), { backgroundColor: 'rgba(17,17,17,.42)', duration: .6 }, 0)
            .to(B.cards, { opacity: 1, y: 0, scale: l.s0, rotation: (k) => FAN[k], duration: D.duration, ease: D.ease, stagger: D.stagger }, 0);
          const op = openTl(0); tl.add(op.tl, D.duration + D.stagger * 2 + D.afterDeal);
          SU.say1('Kita mulai dari kartu pertama, ya.'); SU.momo().express('Senang');
          await U(op.opened);
        } else {
          const tl = G.timeline(); tl.add(closeTl(i - 1), 0); const op = openTl(i); tl.add(op.tl, TT.close.duration + TT.pause); S.tls.push(tl);
          await U(op.opened);
        }
        forceOpen(i);                                       /* end state, whatever the animation did */
        const page = [walkPage, safetyPage, drawPage][i](cur); B.plays[i].appendChild(page.el); G.from(page.el, { opacity: 0, duration: .4 });
        if (i === 2) { requestAnimationFrame(() => page.sk.resize()); S.on(window, 'resize', () => page.sk.resize()); if (SU.nui) { SU.nui.canvas(true); S.offs.push(() => SU.nui.canvas(false)); } }
        const say = async (lines, mood) => { await (async () => { SU.momo().express(mood === 'Semangat' ? 'Semangat' : mood === 'Berpikir' ? 'Berpikir' : 'Senang'); for (let k = 0; k < lines.length && !cur.skipped; k++) { SU.say1(lines[k]); if (k < lines.length - 1) await U(SU.sleep(clamp(lines[k].length * 55, 1700, 3600))); } })(); };
        if (i === 0) {
          await say([`Kenalin, ini ${CHAR}. Yuk, antar dia ke bendera!`, 'Cubit di mana aja, lalu geser tanganmu ke **kanan**. Makin jauh, makin cepat jalannya.', 'Mau lompat? Cubit sebentar, atau sentil tanganmu ke atas.'], 'Semangat');
          await U(page.reached); if (cur.skipped) page.force();
          await say([`Mantap, ${CHAR} sampai di bendera!`, 'Baca kartunya sebentar. Kalau sudah, cubit dan tahan di mana aja.'], 'Senang');
        } else if (i === 1) await say([`Benda padat bisa jadi pijakan yang aman buat ${CHAR}.`, 'Duri itu berbahaya. Nanti kamu yang memilih benda apa yang masuk ke dunianya.'], 'Berpikir');
        else {
          await say(['Di kertas, kursormu muncul jadi pensil. Cuma di sini ada kursor, ya.', 'Cubit, tahan, lalu geser buat menggambar. Buat ganti alat, tunjuk tombolnya lalu cubit.', 'Coba semuanya: Hapus cuma menghapus bagian yang kamu gosok, Bersihkan mengosongkan kertas.'], 'Semangat'); await U(page.all); if (cur.skipped) page.force(); if (SU.nui) SU.nui.canvas(false);
          await say(['Kamu sudah siap!', 'Cubit dan tahan di mana aja buat memilih level.'], 'Senang');
        }
        /* the locked thumb fills during the read time, then unlocks */
        const ring = B.thumbs[i], tel = ring.el, slot = tel.parentElement, prog = { v: 0 };
        if (!cur.skipped) { const read = G.to(prog, { v: 1, duration: CARD_READ_MS / 1000, ease: 'none', onUpdate: () => ring.set(prog.v) }); S.tls.push(read); await U(new Promise((r) => read.eventCallback('onComplete', r))); read.kill(); }
        ring.locked = false; tel.classList.remove('tut-thumb--locked'); slot.dataset.locked = 'false';
        tel.querySelector('.thumb-confirm__thumb').innerHTML = GL.pinch; tel.setAttribute('aria-label', 'Cubit'); ring.set(0);
        G.fromTo(tel, { scale: .85, opacity: .7 }, { scale: 1, opacity: 1, duration: .45, ease: 'back.out(2.2)' });
        const gt = tel.closest('.tut-back').querySelector('.tut-gesture'); gt.querySelector('.gi').innerHTML = GL.pinch; gt.querySelector('.gt').textContent = i === 2 ? 'Cubit dan tahan di mana aja untuk memilih level.' : 'Cubit dan tahan di mana aja untuk lanjut.';
        if (!cur.skipped) await U(ring.open(COPY[i].cta, COPY[i].hold)); ring.close();
      }
      /* exit: the last card closes, all three leave upward */
      newCur(); const l2 = B.l, tl = G.timeline(); S.tls.push(tl);
      tl.add(closeTl(2), 0)
        .to(B.cards, { y: -innerHeight, rotation: (k) => (k % 2 ? TT.exit.startRotation : -TT.exit.startRotation), duration: TT.exit.duration, ease: TT.exit.ease, stagger: TT.exit.stagger }, TT.close.duration + TT.pause * .4)
        .to(B.tut.querySelector('.tut-shade'), { backgroundColor: 'rgba(17,17,17,0)', duration: .4 }, TT.close.duration);
      SU.hideBubble();
      await new Promise((r) => tl.eventCallback('onComplete', r));
      B.on = false; SU.onResize = null;
      return 'done';
    },
  });
})();
