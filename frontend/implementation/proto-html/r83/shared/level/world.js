/* World stage: the repo's real StageArtwork SVG (dumped to stage-art.js), the fullscreen surface
   (same rule as game-stage.module.css), source-unit mapping, Thinman (the repo's real rig) and object elements. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap;

  /* the surface is always 16:9; art is `slice` inside it, so 490 x 325 units show as 490 x 275.6 starting at y 24.7 */
  const WH = 275.6, WY0 = 24.7;
  const SX = (x) => x / 4.9, SY = (y) => (y - WY0) / WH * 100, SW = (w) => w / 4.9, SH = (h) => h / WH * 100;

  /* world html: L1 and L3 span the full width, L2 stays 16:9 in the middle (it is tall), exactly as the repo does */
  const html = (L, extra = '') =>
    `<div class="stage" data-l="${L}"><div class="world" id="world">${SU.STAGE_SVG[L]}<div class="actors" id="act"></div></div></div>${extra}`;

  /* Thinman: the repo's CharacterAnimationAdapter drives the pose every frame (walk wave, rise/apex/fall, land squash) */
  const K = 2.6;                                     /* source units/s -> repo px/s for the adapter */
  function Hero(parent, x, y, wUnits = 13.5) {
    const el = document.createElement('div'); el.className = 'tm';
    const art = document.createElement('div'); art.className = 'tm-art'; el.appendChild(art);
    el.style.width = SW(wUnits) + '%';
    parent.appendChild(el); G.set(el, { xPercent: -50, yPercent: -100 });
    const ad = new SU.CharacterAnimationAdapter({ variant: 'A' });
    const h = {
      el, art, ad, face: 1,
      place(px, py) { el.style.left = SX(px) + '%'; el.style.top = SY(py) + '%'; },
      /* st: {vx, vy, on, face}; terminal: 'win' | 'fail' | undefined */
      update(st, dt, terminal) {
        ad.update({ x: 0, y: 0, vx: st.vx * K, vy: st.vy * K, grounded: st.on, facing: st.face, terminalPhase: terminal }, dt);
        art.innerHTML = ad.renderSvg(st.face);
        h.face = st.face; el.classList.toggle('flip', st.face < 0);
      },
      stand() { ad.reset(); ad.update({ x: 0, y: 0, vx: 0, vy: 0, grounded: true, facing: h.face }, .016); art.innerHTML = ad.renderSvg(h.face); },
      /* walk in place for cutscenes: call every frame with the direction */
      walk(dir, dt) { h.update({ vx: dir * 70, vy: 0, on: true, face: dir || h.face }, dt); },
    };
    h.place(x, y); h.stand();
    return h;
  }

  /* a student's drawing as an object in the world. The picture and the collider are the same thing (see shape.js):
     uniform scale into the level's size limit, strokes T thick, no stretching, no box. */
  const rotAabb = (o) => SU.shape.aabb(o);
  const hit = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
  function objectSvg(o) {
    const T = SU.shape.T, f = (p) => ((p.x - o.cx) * o.sc + o.w / 2).toFixed(2) + ' ' + ((p.y - o.cy) * o.sc + o.h / 2).toFixed(2);
    const d = o.strokes.map((s) => (s.length === 1 ? 'M' + f(s[0]) + 'l0 .01' : 'M' + f(s[0]) + s.slice(1).map((p) => 'L' + f(p)).join(''))).join('');
    const tint = SU.shape.flat(o).map((r) => `M${(r[0] + o.w / 2).toFixed(2)} ${(r[1] + o.h / 2).toFixed(2)}h${r[2].toFixed(2)}v${r[3].toFixed(2)}h${(-r[2]).toFixed(2)}z`).join('');
    return `<svg viewBox="0 0 ${o.w.toFixed(2)} ${o.h.toFixed(2)}" preserveAspectRatio="none" aria-hidden="true"><path d="${tint}" fill="rgba(30,33,38,.10)"/><path d="${d}" fill="none" stroke="#1e2126" stroke-width="${T}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function objEl(o, interactive) {
    const d = document.createElement('div'); d.className = 'obj' + (interactive ? '' : ' still'); d.style.pointerEvents = interactive ? 'auto' : 'none';
    d.innerHTML = objectSvg(o) + `<span class="olabel">${o.label ? SU.esc(SU.nameOf(o.label)) : ''}</span>`;
    return d;
  }
  function syncObjEl(d, o, extraRot) {
    d.style.left = SX(o.x) + '%'; d.style.top = SY(o.y) + '%'; d.style.width = SW(o.w) + '%'; d.style.height = SH(o.h) + '%';
    G.set(d, { xPercent: -50, yPercent: -50, rotation: o.rot + (extraRot || 0) });
  }
  function toObj(L, strokes) {
    const lim = SU.GEO[L].lim, T = SU.shape.T, b = SU.bboxOf(strokes);
    const sc = Math.min((lim.maxW - T) / Math.max(b.w, 1), (lim.maxH - T) / Math.max(b.h, 1));
    return { strokes, sc, cx: b.x0 + b.w / 2, cy: b.y0 + b.h / 2, w: b.w * sc + T, h: b.h * sc + T, rot: 0, x: 0, y: 0, label: null, behavior: 'solid' };
  }
  /* where a client point lands in source units (inverse of SX/SY on the live surface) */
  function toUnits(w, clientX, clientY) {
    const r = w.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * 490, y: WY0 + (clientY - r.top) / r.height * WH };
  }


  /* camera column: three screens tall (clean sky / band of clouds / world). yPercent 0 = sky, -66.667 = world */
  const CAM_WORLD = -66.6667;
  const CLOUD = 'M24 92 C4 92 2 62 26 60 C26 34 62 26 80 46 C92 20 134 20 144 46 C168 36 196 54 190 74 C214 74 216 94 192 94 Z';
  const cloud = (x, y, w, flip) => `<svg class="sky-cloud" style="left:${x}%;top:${y}%;width:${w}px${flip ? ';transform:scaleX(-1)' : ''}" viewBox="0 0 220 110" aria-hidden="true"><path d="${CLOUD}" fill="#fffdf6" stroke="#1a1a1a" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/><path d="M52 78 q14 -9 28 0 M110 66 q12 -8 24 0 M150 82 q10 -6 20 0" fill="none" stroke="#1a1a1a" stroke-width="2.4" stroke-linecap="round" opacity=".5"/></svg>`;
  const cloudBand = (layer) => {
    const k = innerWidth / 1440;
    const far = [[4, 10, 210], [62, 4, 170, 1], [34, 44, 240], [76, 58, 150], [8, 72, 160, 1], [52, 84, 190]];
    const near = [[-4, 26, 380], [70, 38, 420, 1], [22, 70, 340]];
    return `<div class="cloud-band cloud-band--${layer}" aria-hidden="true">${(layer === 'far' ? far : near).map(([x, y, w, f]) => cloud(x, y, Math.round(w * k), f)).join('')}</div>`;
  };
  function column(root, L, startPercent) {
    root.insertAdjacentHTML('afterbegin', `<div class="intro-camera" id="icam"><div class="cam-screen sky-top"></div><div class="cam-screen band">${cloudBand('far')}</div><div class="cam-screen world-screen">${html(L)}</div></div><div class="intro-near" id="inear">${cloudBand('near')}</div>`);
    const cam = SU.Q('icam'); G.set(cam, { yPercent: startPercent });
    return { cam, near: SU.Q('inear'), world: SU.Q('world'), act: SU.Q('act') };
  }
  /* rise = camera goes up into the sky; descend = camera comes down to the world. Same 2.1 s feel as the repo's rise. */
  function cameraMove(c, dir, dur = 2.1) {
    c.near.classList.add('on');
    const tl = G.timeline();
    tl.to(c.cam, { yPercent: dir === 'rise' ? 0 : CAM_WORLD, duration: dur, ease: 'power2.inOut' }, 0)
      .add(() => c.near.classList.remove('on'), dur)
      .fromTo(c.near, dir === 'rise' ? { y: -220 } : { y: 260 }, dir === 'rise' ? { y: 260, duration: dur, ease: 'power1.inOut' } : { y: -220, duration: dur, ease: 'power1.inOut' }, 0);
    return tl;
  }
  function addObjs(act, objs) {
    objs.forEach((o) => { const d = objEl(o, false); if (o.behavior === 'danger') d.classList.add('danger'); act.appendChild(d); syncObjEl(d, o); o.el = d; });
  }

  SU.world = { CAM_WORLD, column, cameraMove, cloudBand, addObjs, WH, WY0, SX, SY, SW, SH, html, Hero, rotAabb, hit, objEl, objectSvg, syncObjEl, toObj, toUnits };
})();
