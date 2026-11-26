/* Thinman's physics, pure (no DOM): used by the play scene and by the solvability test in Node.
   Units are stage source units (art viewBox 490 x 325). Solids are lists of [x, y, w, h]. */
(function () {
  'use strict';
  const SU = (typeof window !== 'undefined' ? (window.SU = window.SU || {}) : (global.SU = global.SU || {}));

  const PH = { WALK: 70, JUMP: 185, G: 500, BW: 14.7, BH: 24.5, FALL: 300, STEP: 5 };
  const simInit = (L) => ({ x: SU.GEO[L].spawn[0], y: SU.GEO[L].spawn[1], vx: 0, vy: 0, on: false, coy: 0, face: 1 });
  const overlap = (st, r) => st.x - PH.BW / 2 < r[0] + r[2] && st.x + PH.BW / 2 > r[0] && st.y - PH.BH < r[1] + r[3] && st.y > r[1];
  function simStep(st, inp, dt, solids) {
    const { BW, BH } = PH;
    st.vx = inp.dir * PH.WALK; if (inp.dir) st.face = Math.sign(inp.dir);   /* r8.3: dir bisa pecahan (joystick: makin jauh makin cepat) */
    if (inp.jump && st.coy > 0) { st.vy = -PH.JUMP; st.coy = 0; st.on = false; }
    inp.jump = false;
    st.vy = Math.min(st.vy + PH.G * dt, PH.FALL);
    st.x += st.vx * dt;
    for (const r of solids) {
      if (overlap(st, r)) {
        if (st.y - r[1] <= PH.STEP && st.vy >= 0) { st.y = r[1]; st.vy = 0; }           /* a low edge is stepped onto (small stairs, ramps) */
        else if (st.vx > 0) st.x = r[0] - BW / 2; else if (st.vx < 0) st.x = r[0] + r[2] + BW / 2;
      }
    }
    const prevY = st.y; st.y += st.vy * dt; st.on = false;
    for (const r of solids) {
      if (overlap(st, r)) {
        if (st.vy >= 0 && prevY <= r[1] + .01) { st.y = r[1]; st.vy = 0; st.on = true; }
        else if (st.vy < 0) { st.y = r[1] + r[3] + BH; st.vy = 0; }
      }
    }
    st.coy = st.on ? .1 : Math.max(0, st.coy - dt);
  }
  /* one 1/120 s tick as two 1/240 s sub-steps: the fastest fall (300 u/s) moves 1.25 u per sub-step, less than a drawn line is thick */
  const tick120 = (st, inp, solids) => { simStep(st, inp, 1 / 240, solids); simStep(st, inp, 1 / 240, solids); };
  const bodyOf = (st) => [st.x - PH.BW / 2, st.y - PH.BH, PH.BW, PH.BH];
  SU.sim = { PH, simInit, simStep, tick120, bodyOf };
})();
