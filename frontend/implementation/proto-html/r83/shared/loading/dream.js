/* Momo Dream loader (root route "/"), from the Owner's HTML (deepseek_html_20261114_14c00d.html): the loading part is that file's logic as it is.
   Phases and timings: intro 1.5 s (Momo rises, the bar slides in) -> loading 6.0 s (0 to 100 %, Momo hovers in the middle and the cloud bank comes down
   above her, she stays BELOW it) -> blast 1.4 s (she shoots up through the bank) -> morph (the sky closes like an iris on the sleeping Momo, the progress bar
   becomes her bubble, the sleeping Momo squashes once) -> done.
   Only the morph target is adapted: the sleeping Momo, the bubble box and its words are those of the real cover (route /onboarding/cam) behind the loader. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, M = SU.DREAM_ART;

  /* ---- wing shear (identical to the repo) ---- */
  const WING = { L: { a: [151.7, 599.3], b: [184.4, 767.4], tip: [110, 940] }, R: { a: [1254.9, 646.8], b: [1196.4, 775.4], tip: [1306, 917] } };
  const WING_MAX_SHIFT = 56, WING_FULL_ANGLE = 32, WING_LIMIT_ANGLE = 50;
  const wingFrame = (side) => {
    const { a, b, tip } = WING[side], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    let nx = -uy, ny = ux; if (nx * (tip[0] - a[0]) + ny * (tip[1] - a[1]) < 0) { nx = -nx; ny = -ny; }
    return { ax: a[0], ay: a[1], ux, uy, nx, ny, dTip: nx * (tip[0] - a[0]) + ny * (tip[1] - a[1]) };
  };
  const FR = { L: wingFrame('L'), R: wingFrame('R') };
  function wingTransform(side, deg) {
    const f = FR[side], t = Math.max(-WING_LIMIT_ANGLE, Math.min(WING_LIMIT_ANGLE, deg)) / WING_FULL_ANGLE, k = (t * WING_MAX_SHIFT) / f.dTip;
    const a = 1 + k * f.ux * f.nx, c = k * f.ux * f.ny, b = k * f.uy * f.nx, d = 1 + k * f.uy * f.ny, e = f.ax - a * f.ax - c * f.ay, g = f.ay - b * f.ax - d * f.ay, r = (n) => n.toFixed(6);
    return `matrix(${r(a)} ${r(b)} ${r(c)} ${r(d)} ${r(e)} ${r(g)})`;
  }
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v); }, lerp = (a, b, t) => a + (b - a) * t;

  const MARKUP = `
    <button type="button" class="dream-skip-btn" id="dr-skip" aria-label="Lewati loading">Lewati ✕</button>
    <section class="dream-sky" id="dr-sky" aria-label="Langit mimpi Momo">
      <div class="chase" aria-hidden="true"></div><div class="dream-clouds" id="dr-clouds" aria-hidden="true"></div><div class="dream-speed" id="dr-speed" aria-hidden="true"></div>
      <svg class="dream-top-cloud-bank" id="dr-bank" viewBox="0 0 1440 460" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-80,0 L1520,0 L1520,285 C1410,375 1280,365 1190,295 C1080,395 920,390 810,305 C700,415 530,410 430,305 C330,390 180,385 95,295 C20,355 -35,345 -80,285 Z" fill="#edf3ea"/>
        <path d="M-60,0 L1500,0 L1500,235 C1380,315 1240,300 1140,230 C1020,330 860,320 750,235 C630,335 470,325 360,235 C240,315 90,305 -60,230 Z" fill="#fffaf0"/>
      </svg>
      <svg class="dream-momo" id="dr-momo" viewBox="0 0 1389 2058" role="img" aria-label="Momo terbang di mimpi"><g id="dr-mg">
        <g id="dr-tail"><path d="${M.tail}" fill="#2e0d06"/><path d="${M.bow}" fill="#2e0d06"/></g>
        <g id="dr-wl"><path d="${M.flapL}" fill="#2e0d06"/><path d="${M.o12}" fill="#e4551b"/></g>
        <g id="dr-wr"><path d="${M.flapR}" fill="#2e0d06"/><path d="${M.o11}" fill="#e4551b"/></g>
        <g><path d="${M.body}" fill="#2e0d06"/><path d="${M.green}" fill="#b5da93"/><path d="${M.w9}" fill="#e4551b"/><path d="${M.w10}" fill="#e4551b"/><path d="${M.d3}" fill="#e4551b"/><path d="${M.d4}" fill="#e4551b"/></g>
        <g transform="translate(0, -34)"><path d="${M.eyeLp}" fill="#380c02"/><path d="${M.eyeLh}" fill="#fff" transform="translate(0, -8)"/><path d="${M.eyeRp}" fill="#380c02"/><path d="${M.eyeRh}" fill="#fff" transform="translate(0, -8)"/><path d="${M.mouth}" fill="#380c02" transform="translate(0, 14)"/></g>
      </g></svg>
    </section>
    <div class="dream-shared" id="dr-shared" role="status" aria-live="polite">
      <div class="dream-bar-ui" id="dr-barui" role="progressbar" aria-label="Memuat Sketchbook Universe" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="dream-bar-fill" id="dr-fill"></div><span class="dream-bar-text" id="dr-text">0%</span></div>
      <div class="dream-bubble-copy" id="dr-copy" aria-hidden="true"></div><div class="dream-bubble-tail" id="dr-tail2" aria-hidden="true"></div>
    </div>`;

  const DUR = { intro: 1.5, loading: 6.0, blast: 1.4, morph: 1.8 };

  /* opts: {onReady(), onSkip(), cover(): {momo, gate}} */
  SU.dreamLoader = function (opts) {
    const root = document.createElement('div'); root.id = 'dream'; root.setAttribute('aria-label', 'Loading Momo Dream'); root.innerHTML = MARKUP; document.body.appendChild(root);
    const $ = (id) => document.getElementById(id), sky = $('dr-sky'), momo = $('dr-momo'), bank = $('dr-bank'), shared = $('dr-shared');
    const S = { phase: 'intro', introV: 0, progress: 0, blastV: 0, morphing: false, ph: 0, wind: 0 };
    let called = false, geo, tl = null;
    const ready = () => { if (called) return; called = true; opts.onReady && opts.onReady(); };

    /* geometry: the flight is the file's; the landing spot (sleeping head, bubble box) is measured on the real cover */
    function getGeo() {
      const vw = innerWidth, vh = innerHeight, w = clamp(Math.min(vw * .42, vh * .25), 140, 215), h = w * (2058 / 1389);
      const c = { x: (vw - w) / 2, y: (vh - h) / 2 - vh * .04, w, h };
      const barW = Math.min(340, vw * .84), bar = { x: (vw - barW) / 2, y: vh - 48 - (vw <= 580 ? 74 : 42), w: barW, h: 48 };
      const cv = opts.cover(), mr = cv.momo.getBoundingClientRect(), gr = cv.gate.getBoundingClientRect();
      return { vw, vh, c, bar, gate: cv.gate, momoEl: cv.momo, head: { x: mr.left + mr.width * .5, y: mr.top + mr.height * .3 }, bubble: { x: gr.left, y: gr.top, w: gr.width, h: gr.height } };
    }
    geo = getGeo();

    const clouds = [], streaks = [];
    for (let i = 0; i < 9; i++) { const n = document.createElement('div'), w = 115 + ((i * 53) % 130); n.className = 'cloud'; n.style.width = w + 'px'; n.style.height = Math.round(w * .25) + 'px'; $('dr-clouds').appendChild(n); clouds.push({ n, x: ((i * 43.7) % 112) - 6, y: ((i * 39.1) % 135) - 20, s: .52 + (i % 4) * .14, scale: .74 + (i % 3) * .2 }); }
    for (let i = 0; i < 10; i++) { const n = document.createElement('div'); n.className = 'streak'; n.style.height = 80 + ((i * 43) % 120) + 'px'; $('dr-speed').appendChild(n); streaks.push({ n, x: (i * 38.3) % 100, y: ((i * 31.1) % 120) - 10, s: .75 + (i % 3) * .18 }); }

    function flight(dt) {
      const fast = S.phase === 'blast', amp = fast ? 1 : .85; S.ph += dt * (fast ? 1.3 : .9); const T = S.ph;
      const fy = amp * 42 * Math.sin((Math.PI * 2 * T) / 2.1 + .5), fx = amp * 22 * Math.sin((Math.PI * 2 * T) / 3.1), roll = amp * (fx / 22) * 6, fw = T * Math.PI * 2 * .9;
      $('dr-wl').setAttribute('transform', wingTransform('L', Math.sin(fw) * 20 * amp)); $('dr-wr').setAttribute('transform', wingTransform('R', Math.sin(fw - .05) * 20 * amp));
      const sway = amp * 25 * Math.sin((Math.PI * 2 * T) / 3.1 - .6);
      $('dr-tail').setAttribute('transform', `translate(696 1388) rotate(${(amp * (sway / 25) * 8).toFixed(2)}) translate(-696 -1388)`);
      const sc = S.phase === 'intro' ? lerp(.84, 1, S.introV) : 1;
      $('dr-mg').setAttribute('transform', `translate(${(695 + fx).toFixed(1)} ${(640 + fy).toFixed(1)}) rotate(${roll.toFixed(2)}) scale(${sc.toFixed(3)}) translate(-695 -640)`);
    }
    /* Momo stays in the middle until the blast: the cloud bank comes down above her, she is under it, not in it */
    function momoPos() {
      let y = geo.c.y;
      if (S.phase === 'intro') y = geo.c.y + (1 - S.introV) * (geo.vh * .58);
      else if (S.phase === 'blast') y = geo.c.y - S.blastV * (geo.c.y + geo.c.h * 1.25);
      else if (S.phase === 'morph' || S.phase === 'done') y = -geo.c.h * 1.5;
      momo.style.width = geo.c.w + 'px'; momo.style.transform = `translate3d(${geo.c.x}px, ${y}px, 0)`;
    }
    function topClouds() {
      let y = -108;
      if (S.phase === 'loading') y = lerp(-108, -6, ease(clamp((S.progress - 65) / 35)));
      else if (S.phase === 'blast') y = lerp(-6, 6, ease(S.blastV));
      bank.style.transform = `translate3d(0, ${y.toFixed(2)}%, 0)`;
    }
    function environment(dt) {
      const sp = S.phase === 'blast' ? 2.5 : S.phase === 'intro' ? .8 : 1.2 + (S.progress / 100) * .8; S.wind += dt * 60 * sp;
      for (const c of clouds) { const yy = (((c.y / 100) * geo.vh + S.wind * c.s) % (geo.vh + 420) + geo.vh + 420) % (geo.vh + 420) - 200; c.n.style.transform = `translate3d(${((c.x / 100) * geo.vw).toFixed(1)}px, ${yy.toFixed(1)}px, 0) scale(${c.scale})`; }
      for (const s of streaks) { const yy = (((s.y / 100) * geo.vh + S.wind * s.s * 1.25) % (geo.vh + 380) + geo.vh + 380) % (geo.vh + 380) - 170; s.n.style.transform = `translate3d(${((s.x / 100) * geo.vw).toFixed(1)}px, ${yy.toFixed(1)}px, 0) scaleY(${1 + sp * .14})`; s.n.style.opacity = String(S.phase === 'intro' ? 0 : clamp(.14 + sp * .12, 0, .46)); }
    }
    function progressUI() {
      const p = Math.round(S.progress); $('dr-text').textContent = p + '%'; $('dr-barui').setAttribute('aria-valuenow', String(p));
      const f = $('dr-fill'); f.style.width = S.progress.toFixed(2) + '%'; f.classList.toggle('is-full', S.progress >= 99.5);
    }

    /* the bubble's tail goes where the real bubble's tail is (left of the box when Momo is beside it, under it when she is below) */
    function placeTail(cs) {
      const t = $('dr-tail2'), side = geo.gate.dataset.side, ink = '3px solid transparent';
      Object.assign(t.style, { background: cs.backgroundColor, border: '0', left: '', top: '', bottom: '', right: '' });
      if (side === 'above') { t.style.left = cs.getPropertyValue('--tail-x') || '50%'; t.style.bottom = '-9px'; t.style.transform = 'translateX(-50%) rotate(45deg)'; t.style.borderRight = ink; t.style.borderBottom = ink; }
      else { t.style.left = '-9px'; t.style.top = `clamp(18px, ${cs.getPropertyValue('--tail-y') || '22px'}, 46px)`; t.style.transform = 'translateY(-50%) rotate(45deg)'; t.style.borderLeft = ink; t.style.borderBottom = ink; }
    }

    function morph() {
      if (S.morphing || S.phase === 'done') return;
      S.phase = 'morph'; S.morphing = true; geo = getGeo(); momo.style.visibility = 'hidden';
      G.to($('dr-skip'), { opacity: 0, duration: .3, onComplete: () => { $('dr-skip').style.display = 'none'; } });
      const gate = geo.gate, cs = getComputedStyle(gate), copy = $('dr-copy'), D = DUR.morph, real = geo.momoEl;
      copy.textContent = (document.getElementById('gate-mumble') || {}).textContent || 'Zzz... coba sapa aku, dong.';
      placeTail(cs);
      gate.style.transition = 'none'; gate.style.opacity = '0';           /* the real bubble waits; the progress bar becomes it */
      const iris = { r: Math.hypot(geo.vw, geo.vh) }, sq = { x: 1, y: 1 };
      const squash = () => { real.style.scale = `${sq.x} ${sq.y}`; };
      const t = G.timeline({ onComplete: () => { real.style.scale = ''; S.phase = 'done'; S.morphing = false; handOver(); } });
      t.to(iris, { r: 0, duration: D * .82, ease: 'expo.inOut', onUpdate: () => { sky.style.clipPath = `circle(${Math.max(0, iris.r).toFixed(1)}px at ${geo.head.x.toFixed(1)}px ${geo.head.y.toFixed(1)}px)`; } }, 0);
      t.to(sky, { opacity: 0, duration: D * .35, ease: 'power2.in' }, D * .52);
      t.to(shared, { left: geo.bubble.x, top: geo.bubble.y, width: geo.bubble.w, height: geo.bubble.h, backgroundColor: cs.backgroundColor, boxShadow: cs.boxShadow,
        borderTopLeftRadius: cs.borderTopLeftRadius, borderTopRightRadius: cs.borderTopRightRadius, borderBottomRightRadius: cs.borderBottomRightRadius, borderBottomLeftRadius: cs.borderBottomLeftRadius, duration: D * .82, ease: 'expo.inOut' }, 0);
      t.to($('dr-barui'), { opacity: 0, duration: D * .28, ease: 'power2.out' }, .05);
      t.to(copy, { opacity: 1, duration: D * .38, ease: 'power2.out' }, D * .56);
      t.fromTo($('dr-tail2'), { opacity: 0, scale: .4 }, { opacity: 1, scale: 1, duration: D * .34, ease: 'back.out(1.8)' }, D * .62);
      /* the sleeping Momo (the real one on the cover) gets a squash as the bubble lands, like the file's sleepSlot */
      t.to(sq, { x: 1.03, y: .95, duration: D * .16, ease: 'power2.out', onUpdate: squash }, D * .68);
      t.to(sq, { x: 1, y: 1, duration: D * .32, ease: 'elastic.out(1, 0.5)', onUpdate: squash }, D * .84);
    }
    /* the bubble sits exactly on the real one: show the real one (with its card) under it, then let the loader's copy fade away */
    function handOver() {
      const gate = geo.gate; gate.style.opacity = ''; void gate.offsetWidth;
      G.to(shared, { opacity: 0, duration: .28, ease: 'power1.out', onComplete: () => { gate.style.transition = ''; ready(); } });
    }

    function build() {
      G.killTweensOf(S); G.killTweensOf(shared);
      tl = G.timeline();
      tl.call(() => { S.phase = 'intro'; });
      tl.fromTo(shared, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: DUR.intro * .85, ease: 'power3.out' }, 0);
      tl.to(S, { introV: 1, duration: DUR.intro, ease: 'power3.out' }, 0);
      tl.call(() => { S.phase = 'loading'; });
      tl.to(S, { progress: 100, duration: DUR.loading, ease: 'power1.inOut', onUpdate: () => { progressUI(); topClouds(); } });
      tl.call(() => { S.phase = 'blast'; progressUI(); });
      tl.to(shared, { scale: 1.03, duration: .18, yoyo: true, repeat: 1, ease: 'power2.out' }, '<');
      tl.to(S, { blastV: 1, duration: DUR.blast, ease: 'power2.in', onUpdate: topClouds });
      tl.call(morph);
    }
    const tick = (t, dtms) => { if (S.morphing || S.phase === 'done') return; const dt = Math.min(dtms / 1000, .05); flight(dt); momoPos(); environment(dt); };
    G.ticker.add(tick);

    /* start state (the file's reset()) */
    G.set(shared, { left: geo.bar.x, top: geo.bar.y, width: geo.bar.w, height: geo.bar.h });
    sky.style.clipPath = `circle(${Math.hypot(geo.vw, geo.vh).toFixed(1)}px at ${geo.head.x.toFixed(1)}px ${geo.head.y.toFixed(1)}px)`;
    flight(0); progressUI(); topClouds(); momoPos(); build();

    const onResize = () => {
      if (S.morphing || S.phase === 'done') return; geo = getGeo();
      G.set(shared, { left: geo.bar.x, top: geo.bar.y, width: geo.bar.w, height: geo.bar.h }); sky.style.clipPath = `circle(${Math.hypot(geo.vw, geo.vh).toFixed(1)}px at ${geo.head.x.toFixed(1)}px ${geo.head.y.toFixed(1)}px)`; momoPos();
    };
    addEventListener('resize', onResize);
    const skip = () => { if (!called) { called = true; opts.onSkip ? opts.onSkip() : opts.onReady && opts.onReady(); } };
    const onKey = (e) => { if (e.key === 'Escape') skip(); };
    $('dr-skip').addEventListener('click', skip); addEventListener('keydown', onKey);
    /* when the route changes in place (same document) the loader must leave nothing behind: no overlay catching clicks, no ticker, no listeners */
    function destroy() {
      try { G.ticker.remove(tick); } catch (e) { /* ignore */ } if (tl) tl.kill(); G.killTweensOf(S); G.killTweensOf([shared, sky, momo]);
      removeEventListener('resize', onResize); removeEventListener('keydown', onKey); root.remove(); SU.dream = null;
    }
    SU.dream = { root, state: S, geo: () => geo, destroy };
    return SU.dream;
  };
})();
