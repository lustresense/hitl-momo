/* Falling and placing (repo phases "falling" -> "placing"). After Lempar the object drops from the sky with gravity and lands on
   whatever is under it. The student can pick it up and move it (drag), rotate it (wheel / R); letting go drops it again.
   The thumb ring "Taruh di sini" appears under Momo's bubble once the object rests. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, W = SU.world, { clamp } = SU;

  const GRAV = 900, VMAX = 420, FLOOR = 294;   /* rubble / floor of the page, inside the visible area */
  const spawnX = (L) => ({ 1: 250, 2: 232, 3: 247 })[L];
  const bottom = (o) => { const b = W.rotAabb(o); return b[1] + b[3]; };
  const supports = (L, placed, self) => SU.GEO[L].plat.concat(placed.filter((p) => p !== self && p.behavior !== 'danger').map((p) => W.rotAabb(p)));

  /* one physics step; returns 'rest' / 'lost' / null */
  function step(L, placed, o, st, dt) {
    st.vy = Math.min(st.vy + GRAV * dt, VMAX);
    const oldB = bottom(o); o.y += st.vy * dt; const nb = bottom(o), bb = W.rotAabb(o);
    let rest = null;
    for (const s of supports(L, placed, o)) {
      if (bb[0] < s[0] + s[2] && bb[0] + bb[2] > s[0] && oldB <= s[1] + .8 && nb >= s[1]) rest = rest === null ? s[1] : Math.min(rest, s[1]);
    }
    if (rest !== null) { o.y -= bottom(o) - rest; return 'rest'; }
    if (bottom(o) >= FLOOR) { o.y -= bottom(o) - FLOOR; return 'rest'; }
    return null;
  }
  SU.dropNow = (L, placed, o) => { const st = { vy: 0 }; for (let i = 0; i < 2400; i++) { const r = step(L, placed, o, st, 1 / 120); if (r) return r; } return 'lost'; };
  function settle(S, L, placed, o, fx) {
    return new Promise((res) => {
      const st = { vy: 0 }; let last = performance.now();
      const f = (now) => {
        if (!S.alive()) return res('gone');
        if (S.skipped) return res(SU.dropNow(L, placed, o));
        const dt = Math.min(.033, (now - last) / 1000); last = now;
        const r = step(L, placed, o, st, dt); W.syncObjEl(o.el, o, fx ? fx.rot(o) : 0); if (fx) fx.tick(o);
        if (r) return res(r);
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
  }

  SU.placeScene = (L) => ({
    id: 'taruh', keep: true, hintTop: 'tr', label: `Level ${L} · Taruh`, hint: 'Cubit lalu geser = benda ikut tanganmu · lepas = tetap di situ · cubit dan tahan diam = Taruh di sini · putar: roda mouse atau R',
    async run(S, { obj, placed }) {
      const root = S.root, Gm = SU.GEO[L], col = root._col, act = col.act, world = col.world;
      const d = W.objEl(obj, true); d.classList.add('fresh'); act.appendChild(d); obj.el = d;
      const spawn = () => { obj.x = spawnX(L); obj.y = -obj.h; obj.rot = 0; W.syncObjEl(d, obj); };
      spawn();
      const heroRect = [Gm.spawn[0] - 8, Gm.spawn[1] - 25, 16, 25];
      const bad = () => W.hit(W.rotAabb(obj), heroRect) || W.hit(W.rotAabb(obj), Gm.goalRect);
      let dragging = false, prev = null, done, resting = false, busy = false;
      const finished = new Promise((r) => (done = r));

      /* the fall is only the entrance; after it the student moves the object freely and it stays where it is let go */
      const fall = async () => {
        busy = true; resting = false; SU.ringClose();
        const probe = Object.assign({}, obj); SU.dropNow(L, placed, probe);   /* where it will come to rest */
        const fx = SU.fallFx(act, obj, probe);
        const r = await settle(S, L, placed, obj, fx);
        busy = false; W.syncObjEl(d, obj); fx.land(d, r === 'rest');
        if (r === 'rest') {
          resting = true;
          SU.say1('Benda itu sudah mendarat. Cubit lalu geser tanganmu, bendanya ikut pindah. Kalau sudah pas, cubit dan tahan tanpa bergerak sampai **Taruh di sini** penuh.'); SU.momo().express('Semangat');
          offer();
        }
      };
      const land = () => { resting = true; if (bad() && prev) { Object.assign(obj, prev); W.syncObjEl(d, obj); } offer(); };
      let offered = false;
      const offer = () => {
        if (offered || dragging || !resting) return; offered = true;
        S.sleep(700).then(() => { if (!dragging && resting && S.alive()) SU.ringOpen('Taruh di sini', 1500, d, 'side').then(() => done()); offered = false; });
      };

      /* r8.3 aturan C: cubit di mana aja lalu geser = bendanya ikut gerak tangan (tidak perlu menunjuk bendanya).
         Cubit yang diam tidak memindah apa-apa, jadi cubit-tahan tetap bisa mengisi ring "Taruh di sini". */
      let grab = null;
      const chrome = (el) => (SU.nui ? SU.nui.isChrome(el) : !!(el.closest && el.closest('#skipbar')));
      S.on(window, 'pointerdown', (e) => { if (busy || chrome(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return; grab = { x: e.clientX, y: e.clientY, u: W.toUnits(world, e.clientX, e.clientY), ox: obj.x, oy: obj.y }; }, true);
      S.on(window, 'pointermove', (e) => {
        if (!grab || busy) return;
        if (!dragging) {
          if (Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 12) return;
          dragging = true; resting = false; SU.ringClose(); prev = { x: obj.x, y: obj.y, rot: obj.rot }; d.classList.add('sel'); G.to(d, { scale: 1.08, duration: .15 });
        }
        const u = W.toUnits(world, e.clientX, e.clientY);
        obj.x = clamp(grab.ox + u.x - grab.u.x, 6, 484); obj.y = clamp(grab.oy + u.y - grab.u.y, 30, 330); W.syncObjEl(d, obj);
      }, true);
      const up = () => { grab = null; if (!dragging) return; dragging = false; d.classList.remove('sel'); G.to(d, { scale: 1, duration: .15 }); land(); };
      S.on(window, 'pointerup', up, true); S.on(window, 'pointercancel', up, true);
      const rotate = (dir) => { if (dragging || busy) return; const old = obj.rot; obj.rot = (obj.rot + dir * 15 + 360) % 360; if (bad()) obj.rot = old; G.to(d, { rotation: obj.rot, duration: .2, ease: 'back.out(2)' }); SU.ringClose(); resting = true; offer(); };
      S.on(window, 'keydown', (e) => { if (e.key === 'r' || e.key === 'R') rotate(e.shiftKey ? -1 : 1); });
      S.on(world, 'wheel', (e) => { e.preventDefault(); rotate(e.deltaY > 0 ? 1 : -1); }, { passive: false });

      SU.say1('Wah, bendanya jatuh dari langit!'); SU.momo().express('Semangat');
      await S.sleep(400);
      fall();
      await S.until(finished);
      SU.ringClose();
      if (S.skipped && !resting) SU.dropNow(L, placed, obj);
      d.style.pointerEvents = 'none'; d.classList.remove('fresh'); d.classList.add('still');
      d.querySelector('.olabel').textContent = '';
      W.syncObjEl(d, obj);
      return 'ok';
    },
  });
})();
