/* Shared page chrome: Momo anchors, speech bubble (repo MomoChat skin), thumb ring placed under the bubble,
   hint chip, skip bar, scene runner and cross-page routing. Plain script, no modules (works from file://). */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /* never `await` a GSAP tween (it is thenable); wrap it */
  const tw = (t, v) => new Promise((r) => G.to(t, { ...v, onComplete: r }));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  Object.assign(SU, { clamp, sleep, tw, esc, CHAR: 'Thinman' });
  const Q = (id) => document.getElementById(id);
  SU.Q = Q;

  /* ------------------------------------------------------------------ routing + state */
  const PAGES = {
    hub: 'hub/index.html', boot: 'index.html', cover: 'onboarding/cam/index.html', kartu: 'p2-kartu/index.html', bab: 'p3-pilih-bab/index.html',
    l1: 'level1/index.html', l2: 'level2/index.html', l3: 'level3/index.html', c1: 'canvas1/index.html', c2: 'canvas2/index.html', c3: 'canvas3/index.html', end: 'p6-penutup/index.html',
  };
  const DEFAULT = { name: '', unlocked: 1, done: [], rec: { 1: [], 2: [], 3: [] } };   /* r8.1: nama (STT) menggantikan nomor absen */
  const state = {
    get() {
      let s = null;
      try { const p = new URLSearchParams(location.search).get('s'); if (p) s = JSON.parse(decodeURIComponent(p)); } catch (e) { /* ignore */ }
      if (!s) { try { s = JSON.parse(localStorage.getItem('su.state') || 'null'); } catch (e) { /* ignore */ } }
      return Object.assign({}, DEFAULT, s || {});
    },
    set(patch) {
      const s = Object.assign(state.get(), patch);
      try { localStorage.setItem('su.state', JSON.stringify(s)); } catch (e) { /* ignore */ }
      state._mem = s;
      return s;
    },
  };
  /* the student's drawings for the recap live in localStorage only (too big for the URL) */
  state.putStrokes = (L, i, strokes) => {
    try { const all = JSON.parse(localStorage.getItem('su.strokes') || '{}'); all[L + ':' + i] = strokes.map((s) => s.filter((_, j) => j % 3 === 0).map((p) => [Math.round(p.x), Math.round(p.y)])); localStorage.setItem('su.strokes', JSON.stringify(all)); } catch (e) { /* ignore */ }
  };
  state.strokes = (L, i) => { try { return (JSON.parse(localStorage.getItem('su.strokes') || '{}'))[L + ':' + i] || []; } catch (e) { return []; } };
  SU.state = state;
  /* from a part page, the hub is one folder up */
  /* a page that is not shipped yet falls back to the hub */
  SU.href = (name, extra) => '../' + PAGES[(SU.READY && SU.READY.length && !SU.READY.includes(name)) ? 'hub' : name] + '?s=' + encodeURIComponent(JSON.stringify(state._mem || state.get())) + (extra ? '&' + extra : '');
  SU.go = (name, extra) => { location.href = SU.href(name, extra); };

  /* ------------------------------------------------------------------ chrome */
  const THUMB = () => SU.GL.thumb;
  let momo = null, anchorName = 'corner', bubbleOn = false, ringShown = false, ringAnchor = null;
  let bubbleEl, bubbleText, ringEl, hintEl, skipEl, labelEl, sceneEl;

  const ANCH = {
    corner: () => { const b = momo.base, s = .62; return { x: clamp(innerWidth * .026, 24, 50) + b.w * s / 2, y: clamp(innerHeight * .03, 22, 40) + b.h * s / 2, s }; },
    side: () => ({ x: innerWidth * .16, y: innerHeight * .5, s: 1 }),
    /* the decision moments (Thinman failed): Momo and her bubble are one group, centred on the screen */
    mid: () => { const b = momo.base, sc = clamp(innerHeight * .3 / b.h, .55, 1), mw = b.w * sc, bw = Math.min(clamp(innerWidth * .3, 340, 460), innerWidth - 24) + 42, total = mw + 30 + bw;
      return { x: clamp((innerWidth - total) / 2 + mw / 2, mw / 2 + 12, innerWidth - mw / 2 - 12), y: innerHeight * .46, s: sc }; },
    /* bottom centre, as big as the screen allows: the ending, where Momo explains with the bubble above her head */
    bottom: () => { const b = momo.base, sc = clamp(innerHeight * .3 / b.h, .5, 1); return { x: innerWidth / 2, y: innerHeight - b.h * sc / 2 - clamp(innerHeight * .035, 20, 40), s: sc }; },
    strip: () => { const b = momo.base, s = .55; return { x: innerWidth - clamp(innerWidth * .02, 20, 40) - b.w * s / 2, y: innerHeight - b.h * s / 2 - clamp(innerHeight * .03, 20, 34), s }; },
  };
  SU.anchors = ANCH;
  function momoTo(name, ms = 900, tilt = 0) {
    anchorName = name;
    const a = ANCH[name](), p = momo.pose;
    if (Math.hypot(p.x - a.x, p.y - a.y) < 3 && Math.abs(p.s - a.s) < .02) return Promise.resolve();
    if (ms <= 0) { Object.assign(p, { x: a.x, y: a.y, s: a.s, r: 0 }); return Promise.resolve(); }
    return momo.move(momo.pathFrom([
      { t: .5, x: (p.x + a.x) / 2, y: Math.min(p.y, a.y) - 26, s: (p.s + a.s) / 2, r: tilt },
      { t: 1, x: a.x, y: a.y, s: a.s, r: 0 }]), ms);
  }
  SU.momoTo = momoTo;
  /* Momo's eyes follow an element (Thinman while he walks). Returns the stop function; call it when the scene ends. */
  SU.gazeAt = (getEl) => {
    const f = () => {
      const el = getEl(); if (!el || !momo.el) return; const hr = el.getBoundingClientRect(), mr = momo.el.getBoundingClientRect();
      momo.gaze = { x: clamp(((hr.left + hr.width / 2) - (mr.left + mr.width / 2)) / innerWidth * 240, -30, 30), y: clamp(((hr.top + hr.height / 3) - (mr.top + mr.height * .3)) / innerHeight * 140, -24, 24) };
    };
    G.ticker.add(f); return () => { G.ticker.remove(f); momo.gaze = null; };
  };
  SU.momoAnchor = () => anchorName;

  /* ---- bubble ---- */
  function say1(text) {
    const first = !bubbleOn;
    bubbleText.replaceChildren(...String(text).split('**').map((p, i) => {
      if (i % 2 === 0) return document.createTextNode(p);
      const s = document.createElement('strong'); s.textContent = p; return s;
    }));
    bubbleOn = true; G.killTweensOf([bubbleEl, bubbleText]);
    if (first) G.fromTo(bubbleEl, { opacity: 0, y: 10, scale: .94 }, { opacity: 1, y: 0, scale: 1, duration: .4, ease: 'back.out(1.7)' });
    else G.fromTo(bubbleText, { opacity: 0, y: 5 }, { opacity: 1, y: 0, duration: .3, ease: 'power2.out' });
  }
  function hideBubble() { if (!bubbleOn) return; bubbleOn = false; G.killTweensOf(bubbleEl); G.to(bubbleEl, { opacity: 0, duration: .2 }); }
  function placeBubble() {
    if (!bubbleOn) return;
    const mr = momo.el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    if (anchorName === 'bottom') {              /* above her head, tail pointing down at her */
      const bw = Math.min(clamp(W * .42, 360, 600), W - 24); bubbleEl.style.width = bw + 'px';
      const bh = bubbleEl.offsetHeight, left = clamp(mr.left + mr.width / 2 - bw / 2, 12, W - bw - 12), top = clamp(mr.top - bh - 10, 12, H - bh - 12);
      bubbleEl.style.left = Math.round(left) + 'px'; bubbleEl.style.top = Math.round(top) + 'px'; bubbleEl.dataset.side = 'up';
      bubbleEl.style.setProperty('--tail-x', Math.round(clamp(mr.left + mr.width / 2 - left, 36, bw - 36)) + 'px');
      return;
    }
    let bw = Math.min(clamp(W * .24, 300, 420), W - 24);
    const side = (anchorName === 'ending' || anchorName === 'mid') ? 'left' : ((mr.left + mr.width / 2) < W * .55 ? 'left' : 'right');
    const GAPB = 30;                                    /* jarak bubble ke badan Momo: sayap dan ekor bubble tidak boleh bertumpuk dengannya */
    bubbleEl.style.width = bw + 'px'; const extra = bubbleEl.offsetWidth - bw;     /* padding + border: lebar CSS belum termasuk ini (dulu inilah yang membuat bubble menimpa Momo) */
    let left;
    if (side === 'left') { left = mr.right + GAPB; bw = Math.max(150, bw - (GAPB - 14)); const room = W - left - 10 - extra; if (room < bw) bw = Math.max(150, room); }   /* gap lebih lebar, lebar bubble dikurangi sama banyak: tepi kanannya tidak maju (stiker dan lain-lain tidak jadi tertimpa) */
    else { bw = Math.min(bw, Math.max(200 - extra, mr.left - GAPB - 10 - extra)); left = Math.max(10, mr.left - (bw + extra) - GAPB); }
    bubbleEl.style.width = bw + 'px';
    if (side === 'right') left = Math.max(10, mr.left - bubbleEl.offsetWidth - GAPB);      /* lebar akhir yang sebenarnya (termasuk padding, border, dan aturan !important) */
    const bh = bubbleEl.offsetHeight, top = clamp(mr.top + mr.height * .1, 12, H - bh - 96);
    bubbleEl.style.left = Math.round(left) + 'px'; bubbleEl.style.top = Math.round(top) + 'px'; bubbleEl.dataset.side = side;
    bubbleEl.style.setProperty('--tail-y', Math.round(clamp(mr.top + mr.height * .3 - top, 34, Math.max(35, bh - 34))) + 'px');
  }

  /* ---- round buttons, r8.3: every ring is "cubit dan tahan" (pinch icon in the middle). Which ring a pinch fills is decided by the
     NUI engine (hand.js): A = the only ring on screen, anywhere; B = the ring nearest the hand; D = on the canvas, the ring you point at.
     A ring opened while the hand is already pinching waits for a fresh pinch. Enter/Space held = the keyboard way. */
  const RC = 2 * Math.PI * 30;
  function ringMarkup(label) {
    return `<span class="thumb-confirm__face"><svg class="thumb-confirm__ring" viewBox="0 0 72 72" aria-hidden="true"><circle class="thumb-confirm__track" cx="36" cy="36" r="30"/><circle class="thumb-confirm__fill" cx="36" cy="36" r="30" stroke-dasharray="188.4956" stroke-dashoffset="188.4956" transform="rotate(-90 36 36)"/></svg><span class="thumb-confirm__thumb">${SU.GL.pinch || THUMB()}</span></span><span class="thumb-confirm__label">${esc(label || 'Cubit')}</span>`;
  }
  function makeRing(el) {
    const fill = () => el.querySelector('.thumb-confirm__fill'), label = () => el.querySelector('.thumb-confirm__label'), glyph = () => el.querySelector('.thumb-confirm__thumb');
    let h = null;
    const r = {
      el, p: 0, act: false, locked: false, res: null, ms: 1000,
      set(p) { r.p = p; const f = fill(); if (f) f.style.strokeDashoffset = (RC * (1 - p)).toFixed(2); el.setAttribute('aria-valuenow', String(Math.round(p * 100))); },
      /* mode: 'any' (rules A/B, default) or 'point' (rule D: canvas) */
      open(lbl, ms, mode) {
        return new Promise((res) => {
          if (h) h.remove();
          r.res = res; r.act = true; r.set(0);
          const l = label(); if (lbl && l) l.textContent = lbl;
          const g = glyph(); if (g) g.innerHTML = SU.GL.pinch || THUMB();
          r.ms = SU.nui ? SU.nui.msFor(lbl, ms) : (ms || 1000);
          el.setAttribute('aria-label', (lbl || '') + ', cubit dan tahan');
          if (!SU.nui) return;
          h = SU.nui.add(el, { ms: r.ms, mode, onFire: () => { const f = r.res; r.act = false; r.res = null; if (h) { h.remove(); h = null; } el.classList.add('is-confirmed');
            G.fromTo(el.querySelector('.thumb-confirm__face'), { scale: 1 }, { scale: 1.2, duration: .2, yoyo: true, repeat: 1, ease: 'power2.out' });
            setTimeout(() => el.classList.remove('is-confirmed'), 480); if (f) f(); } });
        });
      },
      close() { r.act = false; r.res = null; if (h) { h.remove(); h = null; } r.set(0); el.classList.remove('is-holding', 'is-confirmed'); },
      holding() {},
    };
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return r;
  }
  SU.makeRing = makeRing; SU.ringMarkup = ringMarkup;
  /* bubble and ring placement read layout; only redo it when something it depends on changed (or every 200 ms for moving anchors) */
  let placeSig = '', placeAt = 0;
  function ringTick(now) {
    const p = momo && momo.pose, sig = p ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.s.toFixed(3)},${(p.r || 0).toFixed(2)},${bubbleOn},${bubbleText.textContent.length},${bubbleEl.className},${innerWidth}x${innerHeight},${ringShown},${PINNED.size},${anchorName}` : '';
    if (sig !== placeSig || now - placeAt > 200) { placeSig = sig; placeAt = now; placeBubble(); placeRing(); }
    requestAnimationFrame(ringTick);
  }

  /* the main ring sits directly under the bubble of Momo, wherever she is, so the eye never travels */
  let RMAIN;
  /* Ring placement. 'under' = directly under the anchor (Momo's bubble); 'side' = beside the anchor (a drawing, a sticker, an object)
     so the eye does not travel. The first spot that fits the viewport wins; it follows the anchor every frame. */
  const PINNED = new Map();                           /* el -> {anchor, side} */
  let ringSide = 'under';
  function put(el, anchor, side) {
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth || 96, h = el.offsetHeight || 112, M = 8, GAP = 12;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fits = (x, y) => x >= M && y >= M && x + w <= innerWidth - M && y + h <= innerHeight - M;
    /* keep clear of the page chrome (hint chip, skip bar, camera preview) and, beside an object, of Momo's bubble */
    const live = (e) => { if (!e) return null; const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < .05) return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
    const avoid = [hintEl, Q('skipbar'), Q('cam-pip'), anchor === bubbleEl || !bubbleOn ? null : bubbleEl].map(live).filter(Boolean);
    const free = (x, y) => avoid.every((a) => x + w + 4 <= a.left || x >= a.right + 4 || y + h + 4 <= a.top || y >= a.bottom + 4);
    const up = anchor === bubbleEl && bubbleEl.dataset.side === 'up';       /* bubble di atas kepala Momo: ring di bawahnya akan menutupi Momo, jadi di samping bubble */
    const c = side === 'side'
      ? [[r.right + GAP, cy - h / 2], [r.left - GAP - w, cy - h / 2], [cx - w / 2, r.bottom + GAP], [cx - w / 2, r.top - GAP - h]]
      : up ? [[r.right + GAP, cy - h / 2], [r.left - GAP - w, cy - h / 2], [cx - w / 2, r.top - GAP - h], [cx - w / 2, r.bottom + GAP]]
      : [[cx - w / 2, r.bottom + GAP], [cx - w / 2, r.top - GAP - h], [r.right + GAP, cy - h / 2], [r.left - GAP - w, cy - h / 2]];
    /* when the anchor sits at the edge of the screen or behind the chrome, slide the ring along it until a free spot is found */
    for (const k of [-.7, .7, -1.4, 1.4, -2.1, 2.1]) c.push([r.right + GAP, cy - h / 2 + k * h], [r.left - GAP - w, cy - h / 2 + k * h]);
    const p = c.find((q) => fits(q[0], q[1]) && free(q[0], q[1])) || c.find((q) => fits(q[0], q[1])) || [clamp(c[0][0], M, innerWidth - w - M), clamp(c[0][1], M, innerHeight - h - M)];
    el.style.left = Math.round(p[0]) + 'px'; el.style.top = Math.round(p[1]) + 'px';
  }
  SU.pinUnderBubble = (el) => { PINNED.set(el, { anchor: null, side: 'under' }); el.style.position = 'fixed'; el.style.zIndex = 47; return () => PINNED.delete(el); };
  SU.pinBeside = (el, anchor) => { PINNED.set(el, { anchor, side: 'side' }); el.style.position = 'fixed'; el.style.zIndex = 47; return () => PINNED.delete(el); };
  /* a rectangle that is not an element (the bounding box of a drawing) can anchor a ring too */
  SU.rectAnchor = (fn) => ({ getBoundingClientRect: () => { const [l, t, r, b] = fn(); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; } });
  SU.bubbleExtra = (html) => { const e = Q('su-bubble-extra'); e.innerHTML = html || ''; bubbleEl.classList.toggle('has-extra', !!html); return e; };
  function placeRing() {
    for (const [el, o] of PINNED) { if (o.side === 'under' && !bubbleOn) continue; put(el, o.anchor || bubbleEl, o.side); }
    if (!ringShown || !ringAnchor) return;
    put(ringEl, ringAnchor, ringSide);
  }
  function ringShow() { ringShown = true; ringEl.style.display = 'inline-flex'; placeRing(); G.killTweensOf(ringEl); G.fromTo(ringEl, { opacity: 0, y: 10, scale: .9 }, { opacity: 1, y: 0, scale: 1, duration: .45, ease: 'back.out(1.7)' }); }
  function ringHide() { if (!ringShown) return; ringShown = false; G.killTweensOf(ringEl); G.to(ringEl, { opacity: 0, y: 6, duration: .2, onComplete: () => { if (!ringShown) ringEl.style.display = 'none'; } }); }
  function ringOpen(label, ms = 2000, anchor, side, mode) { ringAnchor = anchor || bubbleEl; ringSide = anchor ? (side || 'side') : 'under'; ringShow(); return RMAIN.open(label, ms, mode); }
  function ringClose() { RMAIN.close(); ringHide(); }

  function setHint(t, top) { hintEl.textContent = t || ''; hintEl.classList.toggle('top', !!top); hintEl.classList.toggle('tr', top === 'tr'); G.to(hintEl, { opacity: t ? 1 : 0, duration: .25 }); }

  /* ------------------------------------------------------------------ scene runner */
  let sceneTok = 0, curS = null, lastRoot = null;
  const MOOD = { Senang: 'Senang', Tenang: 'Senang', Semangat: 'Semangat', Penasaran: 'Penasaran', Bingung: 'Berpikir', Khawatir: 'Berpikir', Berpikir: 'Berpikir', Kaget: 'Kaget', Bangga: 'Bangga', Terkejut: 'Terkejut', Tarik: 'Tarik' };
  function mkScene(def) {
    const S = { def, tok: ++sceneTok, skipped: false, over: false, offs: [], tls: [] };
    S.skipP = new Promise((r) => { S.doSkip = () => { if (S.skipped) return; S.skipped = true; G.globalTimeline.timeScale(7); r(); }; });
    S.sleep = (ms) => (S.skipped ? Promise.resolve() : Promise.race([sleep(ms), S.skipP]));
    S.until = (p) => (S.skipped ? Promise.resolve() : Promise.race([Promise.resolve(p), S.skipP]));
    S.alive = () => !S.over;
    S.on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); S.offs.push(() => t.removeEventListener(ev, fn, o)); };
    S.hush = () => { S._st = (S._st || 0) + 1; };                 /* r8.1: stop a running S.say sequence (the student acted first) */
    S.say = async (lines, mood) => {
      if (!Array.isArray(lines)) lines = [lines];
      if (!S.alive()) return;
      const tok = (S._st = (S._st || 0) + 1);
      momo.express(MOOD[mood] || 'Senang');
      for (let i = 0; i < lines.length; i++) {
        if (!S.alive()) return;
        say1(lines[i].replace(/\{c\}/g, SU.CHAR));
        if (i < lines.length - 1) {
          await S.sleep(clamp(lines[i].length * 55, 1700, 3600));
          if (S._st !== tok) return;
          if (S.skipped) { say1(lines[lines.length - 1].replace(/\{c\}/g, SU.CHAR)); return; }
        }
      }
    };
    S.ring = async (label, ms, anchor, side, mode) => { if (S.skipped || !S.alive()) return; const p = ringOpen(label, ms, anchor, side, mode); await S.until(p); ringClose(); };
    S.in = (targets, vars) => G.from(targets, { opacity: 0, y: 26, duration: .6, ease: 'power3.out', stagger: .09, ...vars });
    return S;
  }
  async function run(def, args) {
    if (curS) { curS.over = true; curS.offs.forEach((f) => f()); curS.tls.forEach((t) => { try { t.kill(); } catch (e) { /* ignore */ } }); }
    const S = mkScene(def); curS = S;
    labelEl.textContent = def.label;
    if (!def.keep) {
      ringClose(); hideBubble(); setHint('');
      await tw(sceneEl, { opacity: 0, y: -10, duration: .28, ease: 'power2.in' });
      sceneEl.replaceChildren(); G.set(sceneEl, { opacity: 1, y: 0 });
    }
    G.globalTimeline.timeScale(1);
    if (def.keep && lastRoot) S.root = lastRoot;
    else { const root = document.createElement('div'); root.className = 'sc'; sceneEl.appendChild(root); S.root = root; lastRoot = root; }
    setHint(def.hint || '', def.hintTop);
    let r; try { r = await def.run(S, args); } catch (err) { console.error('scene', def.id, err); }
    S.over = true; S.offs.forEach((f) => f());
    return r;
  }
  SU.run = run; SU.say1 = say1; SU.hideBubble = hideBubble; SU.setHint = setHint;
  SU.ringOpen = ringOpen; SU.ringClose = ringClose; SU.scene = () => curS;
  SU.momo = () => momo;

  /* ------------------------------------------------------------------ mount */
  SU.mount = function (opts = {}) {
    document.body.insertAdjacentHTML('beforeend',
      `<div id="app" aria-label="${esc(opts.title || 'Sketchbook Universe')}"><div id="scene"></div></div>
       <div id="su-bubble" role="status" aria-live="polite" data-side="left"><div id="su-bubble-text"></div><div id="su-bubble-extra"></div></div>
       <div id="su-ring" class="thumb-confirm" role="progressbar" tabindex="0" aria-label="Cubit" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${ringMarkup('Cubit')}</div>
       <div id="su-hint" role="note"></div>
       <div id="skipbar"><span id="sk-label"></span><button id="skip" type="button" class="nb-btn" aria-label="Lewati bagian ini">Lewati ›</button><a id="sk-hub" href="${SU.href('hub')}" aria-label="Kembali ke menu">Menu</a></div>
       ${opts.pip === false ? '' : '<div id="cam-pip" aria-hidden="true"><i></i></div>'}`);
    bubbleEl = Q('su-bubble'); bubbleText = Q('su-bubble-text'); ringEl = Q('su-ring'); hintEl = Q('su-hint'); skipEl = Q('skip'); labelEl = Q('sk-label'); sceneEl = Q('scene');
    if (opts.skip === 'right') document.body.classList.add('skip-right');   /* world pages: the bottom centre is where objects land */
    RMAIN = makeRing(ringEl); ringAnchor = bubbleEl;
    momo = SU.createMomo();
    const a = ANCH[opts.at || 'corner'](); Object.assign(momo.pose, { x: a.x, y: a.y, s: a.s, r: 0 }); anchorName = opts.at || 'corner';
    skipEl.addEventListener('click', () => { skipEl.blur(); if (SU.onSkip) SU.onSkip(); else if (curS) curS.doSkip(); });
    addEventListener('resize', () => {
      momo.fit(); const a2 = ANCH[anchorName](); Object.assign(momo.pose, { x: a2.x, y: a2.y, s: a2.s });
      if (SU.onResize) SU.onResize();
    });
    requestAnimationFrame(ringTick);
    return { momo };
  };
})();
