/* r8.3 · mesin NUI sandbox (mouse = tangan di depan kamera). Satu gestur: cubit. Empat aturan:
   A  satu pilihan   : cuma ada satu target aktif -> cubit dan tahan di mana aja sampai ring penuh.
   B  beberapa pilihan: target yang paling dekat ke tangan nyala (tanpa kursor) -> cubit dan tahan. Target dikunci saat cubitan mulai,
                        jadi tangan goyang tidak memindah pilihan. Lepas untuk ganti.
   C  gerakin sesuatu : cubit, tahan, geser (Thinman pakai joystick dari titik awal cubit, benda ikut gerak tangan, pita ditarik).
   D  kanvas          : satu-satunya tempat ada kursor (ikon pensil / bulatan hapus). Tunjuk lalu cubit; ring di kanvas harus ditunjuk.
   Aturan bersama: cubitan yang bergeser lebih dari 26 px itu tarikan, bukan tahan, jadi ring berhenti terisi. Ring yang muncul saat
   tangan masih mencubit menunggu cubitan dilepas dulu. Enter/Spasi ditahan = cubit-tahan pada pilihan yang nyala (keyboard).
   Di sandbox: gerak mouse = tangan, tahan klik = cubit-tahan, lepas klik = lepas cubit. Tombol H = kursor mouse biasa (simulasi mati).
   Bar Lewati/Menu dan gerbang izin tetap mouse (untuk guru). Plain script, jalan dari file://. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const ic = (n) => (SU.icon ? SU.icon(n, 24) : '');
  const GL = (SU.GL = SU.GL || {});
  for (const [k, n] of [['pinch', 'gesture-pinch'], ['open', 'gesture-open'], ['pencil', 'tool-pencil'], ['eraser', 'tool-eraser'], ['undo', 'tool-undo'], ['redo', 'tool-redo'],
    ['clear', 'tool-clear'], ['mic', 'mic'], ['retry', 'retry'], ['check', 'check'], ['lock', 'lock'], ['flag', 'flag'], ['bulb', 'bulb'], ['jump', 'jump'], ['star', 'star'], ['play', 'play']]) {
    const s = ic(n); if (s) GL[k] = s;
  }
  GL.hold = GL.pinch;

  const root = document.documentElement;
  const CHROME = '#skipbar,#gate,#replay,#hand-legend,.name-typelink,#name-type,[data-nui-off]';
  const isChrome = (el) => !!(el && el.closest && el.closest(CHROME));
  const MOVE_CANCEL = 26;
  const now = () => performance.now();
  const P = { x: -1e4, y: -1e4, in: false, down: false, key: false, t0: 0, x0: 0, y0: 0, moved: false, lock: null };
  const T = new Set();
  let canvasMode = false, lastLit = null, simOn = false, want = false;

  /* ---------------- targets ---------------- */
  const ringC = (circle) => 2 * Math.PI * (+circle.getAttribute('r') || 30);
  function fillEl(t) {
    if (t.fill === undefined) t.fill = t.el.querySelector('.thumb-confirm__fill, #ring-fill, .nui-badge .f') || null;
    return t.fill;
  }
  function paint(t) {
    const f = fillEl(t); if (!f) return;
    if (!t.C) t.C = ringC(f);
    f.style.strokeDashoffset = (t.C * (1 - t.p)).toFixed(2);
    t.el.setAttribute('aria-valuenow', String(Math.round(t.p * 100)));
  }
  function badge(el) {
    const b = document.createElement('span'); b.className = 'nui-badge'; b.setAttribute('aria-hidden', 'true');
    b.innerHTML = `<svg viewBox="0 0 40 40"><circle class="t" cx="20" cy="20" r="16"/><circle class="f" cx="20" cy="20" r="16" stroke-dasharray="100.53" stroke-dashoffset="100.53" transform="rotate(-90 20 20)"/></svg><span class="i">${GL.pinch || ''}</span>`;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(b); return b;
  }
  /* add(el, {ms, mode:'any'|'point', onFire, badge}) -> handle. 'any' targets follow rules A/B, 'point' targets need the pinch to start on them. */
  function add(el, o = {}) {
    const t = { el, ms: o.ms || 1000, mode: o.mode === 'point' ? 'point' : 'any', p: 0, pp: -1, since: now(), onFire: o.onFire, done: false };
    if (!el.querySelector('.thumb-confirm__fill, #ring-fill') && o.badge !== false) t.badge = badge(el);
    el.classList.add('nui-target'); T.add(t); paint(t);
    return {
      t,
      remove() { T.delete(t); if (P.lock === t) P.lock = null; el.classList.remove('nui-target', 'nui-lit', 'nui-holding'); delete el.dataset.nui; if (t.badge) t.badge.remove(); },
      reset() { t.p = 0; t.done = false; t.since = now(); el.classList.remove('nui-fired'); paint(t); },
    };
  }
  const visible = (t) => { if (!t.el.isConnected || t.done) return null; const r = t.el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  function dist(r, x, y) { const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom); return Math.hypot(dx, dy) + Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y) * .001; }
  function actives() { const out = []; for (const t of T) { const r = visible(t); if (r) out.push([t, r]); } return out; }
  function nearest(list, x, y) { let best = null, bd = 1e9; for (const [t, r] of list) { const d = dist(r, x, y); if (d < bd) { bd = d; best = t; } } return best; }
  function lockAt(x, y, target) {
    const t0 = now(), act = actives();
    const hit = act.find(([t]) => t.mode === 'point' && t.el.contains(target));
    if (hit) return hit[0].since < t0 - 30 ? hit[0] : null;
    if (canvasMode) return null;
    const pool = act.filter(([t]) => t.mode !== 'point' && t.since < t0 - 30);
    if (pool.length === 1) return pool[0][0];
    if (pool.length > 1) return nearest(pool, x, y);
    return null;
  }

  /* ---------------- pointer = hand ---------------- */
  const setXY = (e) => { P.x = e.clientX; P.y = e.clientY; P.in = true; };
  addEventListener('pointermove', (e) => {
    setXY(e);
    if (P.down && !P.moved && Math.hypot(P.x - P.x0, P.y - P.y0) > MOVE_CANCEL) P.moved = true;
    if (lost) { lost = false; if (cur) cur.classList.remove('is-lost'); }
  }, { passive: true, capture: true });
  addEventListener('pointerdown', (e) => {
    setXY(e); if (isChrome(e.target)) return;
    P.down = true; P.t0 = now(); P.x0 = P.x; P.y0 = P.y; P.moved = false;
    P.lock = lockAt(P.x, P.y, e.target);
    if (cur) cur.classList.add('is-pinch');
  }, true);
  const release = () => { P.down = false; P.lock = P.key ? P.lock : null; if (cur) cur.classList.remove('is-pinch'); };
  addEventListener('pointerup', release, true); addEventListener('pointercancel', release, true);
  addEventListener('blur', () => { release(); P.key = false; P.lock = null; });
  let lost = false;
  document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) { lost = true; P.in = false; if (cur) cur.classList.add('is-lost'); } });
  /* a target is only ever confirmed by holding; a quick click on it (the mouse standing in for a hand) does nothing on its own */
  addEventListener('click', (e) => {
    if (!simOn || isChrome(e.target)) return;
    for (const t of T) if (t.el.contains(e.target) && !t.el.matches('input,select,textarea')) { e.preventDefault(); e.stopPropagation(); return; }
  }, true);
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) return;
    if (e.key === 'h' || e.key === 'H') { try { localStorage.setItem('su.hand', pref() ? 'off' : 'on'); } catch (err) { /* ignore */ } setSim(want); legend(true); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest && e.target.closest('button,a') && !e.target.closest('.nui-target')) return;
    if (!P.key) { const act = actives().filter(([t]) => t.mode !== 'point' || canvasMode); P.lock = lastLit && act.some(([t]) => t === lastLit) ? lastLit : (act.length === 1 ? act[0][0] : P.lock); }
    if (P.lock) { P.key = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') { P.key = false; if (!P.down) P.lock = null; } });

  /* ---------------- frame: light, fill, fire ---------------- */
  let last = now();
  function frame(tnow) {
    const dt = Math.min(50, tnow - last); last = tnow;
    const act = actives(), pool = act.filter(([t]) => t.mode !== 'point');
    let lit = null;
    if (P.lock && act.some(([t]) => t === P.lock)) lit = P.lock;
    else if (!canvasMode && pool.length === 1) lit = pool[0][0];
    else if (!canvasMode && pool.length > 1 && P.in) lit = nearest(pool, P.x, P.y);
    lastLit = lit;
    const kind = pool.length > 1 ? 'B' : 'A';
    for (const [t] of act) {
      const k = t.mode === 'point' || canvasMode ? 'D' : kind;
      if (t.el.dataset.nui !== k) t.el.dataset.nui = k;
      t.el.classList.toggle('nui-lit', t === lit && k !== 'D');
      const holding = t === P.lock && (P.down || P.key) && !P.moved;
      t.el.classList.toggle('nui-holding', holding);
      t.p = holding ? Math.min(1, t.p + dt / t.ms) : Math.max(0, t.p - dt / t.ms * 1.5);
      if (t.p !== t.pp) { t.pp = t.p; paint(t); }
      if (t.p >= 1 && !t.done) {
        t.done = true; P.lock = null; t.el.classList.remove('nui-holding', 'nui-lit'); t.el.classList.add('nui-fired');
        setTimeout(() => t.el.classList.remove('nui-fired'), 500);
        if (t.onFire) Promise.resolve().then(t.onFire);
      }
    }
    for (const t of T) if (!act.some(([a]) => a === t)) t.el.classList.remove('nui-lit', 'nui-holding');
    drawCursor(); drawPip();
    requestAnimationFrame(frame);
  }

  /* ---------------- cursor (D only) and the hand in the camera card ---------------- */
  let cur = null, pipHand = null, pipKind = '';
  function drawCursor() {
    if (!cur) return;
    const show = simOn && canvasMode && P.in && !overPaper();
    cur.style.display = show ? 'block' : 'none';
    if (show) cur.style.transform = `translate(${P.x}px,${P.y}px)`;
  }
  const overPaper = () => { const el = document.elementFromPoint(P.x, P.y); return !!(el && el.closest('.sk-wrap') && !el.closest('.nui-target,button')); };
  function drawPip() {
    if (!simOn) { if (pipHand) pipHand.style.display = 'none'; return; }
    const host = document.getElementById('cam-pip') || document.querySelector('#camera .video-inner, #camera');
    if (!host) return;
    if (!pipHand || pipHand.parentNode !== host) { pipHand = document.createElement('span'); pipHand.className = 'nui-pip-hand'; pipHand.setAttribute('aria-hidden', 'true'); if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; host.appendChild(pipHand); pipKind = ''; }
    const k = (P.down || P.key) ? 'pinch' : 'open';
    if (k !== pipKind) { pipKind = k; pipHand.innerHTML = GL[k] || ''; pipHand.classList.toggle('is-pinch', k === 'pinch'); }
    pipHand.style.display = 'block'; pipHand.style.opacity = P.in ? '1' : '.3';
    pipHand.style.left = (Math.max(0, Math.min(1, P.x / innerWidth)) * 100).toFixed(1) + '%';
    pipHand.style.top = (Math.max(0, Math.min(1, P.y / innerHeight)) * 100).toFixed(1) + '%';
  }

  /* ---------------- C helpers ---------------- */
  /* joystick: the first pinch point is the centre; distance left/right = direction and speed; release = stop;
     a quick pinch or a flick up while holding = jump */
  function joystick(o = {}) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'nui-joy');
    svg.innerHTML = '<circle class="a" r="24"/><line class="l"/><circle class="k" r="10"/>';
    document.body.appendChild(svg);
    const [ca, ln, kb] = svg.children;
    let a = null, hist = [], flickAt = 0, dead = false;
    const ok = (e) => !dead && !isChrome(e.target) && !(o.ignore && e.target.closest && e.target.closest(o.ignore)) && !(o.when && !o.when());
    const down = (e) => { if (!ok(e)) return; a = { x: e.clientX, y: e.clientY, t: now(), moved: false }; hist = []; svg.classList.add('on'); draw(); };
    const move = (e) => {
      if (!a) return; if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 10) a.moved = true;
      const t = now(); hist.push([t, e.clientY]); while (hist.length && t - hist[0][0] > 140) hist.shift();
      if (hist.length > 1 && hist[0][1] - e.clientY > 40 && t - flickAt > 420) { flickAt = t; hist = []; if (o.onJump) o.onJump('flick'); }
      draw();
    };
    const up = () => { if (a && !a.moved && now() - a.t < 230 && o.onJump) o.onJump('tap'); a = null; svg.classList.remove('on'); };
    function draw() { if (!a) return; const x = P.x, y = P.y; ca.setAttribute('cx', a.x); ca.setAttribute('cy', a.y); ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', x); ln.setAttribute('y2', y); kb.setAttribute('cx', x); kb.setAttribute('cy', y); }
    addEventListener('pointerdown', down, true); addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
    return {
      dir() { if (!a) return 0; const dx = P.x - a.x; if (Math.abs(dx) < 14) return 0; return Math.sign(dx) * Math.min(1, .35 + (Math.abs(dx) - 14) / 110 * .65); },
      active: () => !!a,
      destroy() { dead = true; a = null; svg.remove(); removeEventListener('pointerdown', down, true); removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); },
    };
  }
  /* flick: a quick upward flick while pinching, anywhere (throw the sticker) */
  function flick(cb, o = {}) {
    let a = null, hist = [];
    const down = (e) => { if (isChrome(e.target) || (o.ignore && e.target.closest && e.target.closest(o.ignore))) return; a = true; hist = []; };
    const move = (e) => { if (!a) return; const t = now(); hist.push([t, e.clientY]); while (hist.length && t - hist[0][0] > 160) hist.shift(); if (hist.length > 1 && hist[0][1] - e.clientY > 50) { a = null; cb(); } };
    const up = () => { a = null; };
    addEventListener('pointerdown', down, true); addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
    return () => { removeEventListener('pointerdown', down, true); removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); };
  }

  /* ---------------- simulation on/off, legend ---------------- */
  const pref = () => { try { return localStorage.getItem('su.hand') !== 'off'; } catch (e) { return true; } };
  function setSim(v) { want = !!v; simOn = want && pref(); root.classList.toggle('hand-sim', simOn); }
  let legendEl = null;
  function legend(force) {
    if (!legendEl) return;
    let seen = false; try { seen = sessionStorage.getItem('su.nuiLegend') === '1'; } catch (e) { /* ignore */ }
    if (seen && !force) return;
    try { sessionStorage.setItem('su.nuiLegend', '1'); } catch (e) { /* ignore */ }
    legendEl.innerHTML = pref()
      ? '<b>Simulasi tangan</b> · mouse = tangan (lihat kartu kamera) · <b>tahan klik</b> = cubit-tahan · tahan lalu geser = tarik · kursor cuma ada di kanvas · H = mouse biasa'
      : '<b>Simulasi tangan mati</b> · kursor mouse biasa · H = nyalakan lagi';
    legendEl.classList.add('on'); clearTimeout(legend.t); legend.t = setTimeout(() => legendEl.classList.remove('on'), 7000);
  }

  SU.nui = {
    add, joystick, flick, isChrome,
    canvas(on) { canvasMode = !!on; root.classList.toggle('nui-canvas', canvasMode); },
    pointer: () => ({ x: P.x, y: P.y, down: P.down, in: P.in }),
    /* ring length by meaning: decisions 2 s, putting an object down 1.5 s, everything else 1 s */
    msFor(label, ms) { const s = String(label || ''); if (/^(Tebak Gambarku|Kembali ke sampul|Ya,)/.test(s)) return 2000; if (/^Taruh di sini/.test(s)) return 1500; return ms && ms < 1000 ? ms : 1000; },
  };
  SU.handSim = { set: setSim, get on() { return simOn; } };
  SU.handLegend = legend;

  function init() {
    cur = document.createElement('div'); cur.id = 'hand-cursor'; cur.setAttribute('aria-hidden', 'true'); cur.innerHTML = '<span class="hc-ring"></span>';
    legendEl = document.createElement('div'); legendEl.id = 'hand-legend'; legendEl.setAttribute('role', 'status');
    document.body.appendChild(cur); document.body.appendChild(legendEl);
    if (window.__SU_HAND_AUTO !== false) { setSim(true); setTimeout(() => legend(false), 600); }
    requestAnimationFrame(frame);
  }
  if (document.body) init(); else addEventListener('DOMContentLoaded', init);
})();
