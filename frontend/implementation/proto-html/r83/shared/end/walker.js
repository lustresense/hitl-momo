/* Thinman on the hill: the student walks him with <- -> / A D or (r8.3) by the pinch joystick (api.pad = SU.nui.joystick: pinch, move right/left). `zone` limits where he may go (the ending keeps him
   out from under Momo's bubble); `hold` hands the body over to a scripted move (jump, dive, flight). */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const { clamp } = SU;

  SU.endWalker = (hero, ground, bounds, startX) => {
    const st = { x: startX, vx: 0, vy: 0, on: true, face: 1 }, keys = new Set(); let last = performance.now(), enabled = true, auto = null;
    const set = (e) => {
      if (e.target.closest && e.target.closest('input,textarea')) return;
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(e.key)) { e.preventDefault(); if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key); }
    };
    window.addEventListener('keydown', set); window.addEventListener('keyup', set);
    const api = { st, hold: false, pad: null, zone: bounds.slice(), onMove: null, enable(v) { enabled = v; }, goTo(x) { auto = x; }, pos: () => st.x, setZone(a, b) { api.zone = [a, b]; } };
    const tick = (now) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!api.hold) {
        let dir = 0;
        if (enabled) {
          if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) dir -= 1; if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dir += 1;
          if (!dir && api.pad) dir = api.pad.dir();
        }
        if (auto !== null) { if (Math.abs(auto - st.x) > 2) dir = auto > st.x ? 1 : -1; else auto = null; }
        st.vx = dir * (auto !== null ? 150 : 62); if (dir) st.face = dir; st.x = clamp(st.x + st.vx * dt, api.zone[0], api.zone[1]);
        hero.place(st.x, ground(st.x)); hero.update(st, dt);
        if (api.onMove) api.onMove(st.x);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return api;
  };
})();
