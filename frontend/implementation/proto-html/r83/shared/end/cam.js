/* The ending's camera: the art is drawn for a 16:9 page, far too small to read on a desktop screen. The world is scaled so that Thinman is
   about a fifth of the screen height (whatever the screen), the ground sits in the lower part and the camera follows him sideways. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { clamp } = SU, W = SU.world;
  const GROUND_Y = 250, GROUND_AT = .72, THINMAN_H = .21;   /* source y of the grass, where it sits on screen, Thinman's height / screen height */

  SU.endCam = (camEl, worldEl, hero) => {
    const c = { s: 1, tx: 0, ty: 0, tgt: null };
    /* r8.3 perf: the world's size only changes on resize; reading it every frame forced a layout per frame */
    let D = null; const dims = () => (D || (D = { w: worldEl.offsetWidth, h: worldEl.offsetHeight }));
    addEventListener('resize', () => { D = null; });
    c.fit = () => {
      G.set(camEl, { x: 0, y: 0, scale: 1, transformOrigin: '0 0' }); D = null;
      const { w, h } = dims(), hh = hero.el.getBoundingClientRect().height || w * .056;
      c.s = Math.max(innerHeight / h * 1.02, THINMAN_H * innerHeight / hh);
      c.ty = clamp(innerHeight * GROUND_AT - c.s * h * (GROUND_Y - W.WY0) / W.WH, innerHeight - c.s * h, 0);
      c.at(c.tgt ? c.tgt.x : 160, c.tgt ? c.tgt.f : .3, true);
    };
    /* put source x at screen fraction f (instantly or smoothed by follow()) */
    c.tx_for = (x, f) => { const { w } = dims(); return clamp(innerWidth * f - c.s * w * (x / 490), innerWidth - c.s * w, 0); };
    c.at = (x, f = .5, snap) => { c.tgt = { x, f }; if (snap) { c.tx = c.tx_for(x, f); } G.set(camEl, { x: c.tx, y: c.ty, scale: c.s, transformOrigin: '0 0' }); };
    c.follow = (x, f = .5) => { c.tgt = x === null ? null : { x, f }; };
    const tick = () => { if (c.tgt) { const t = c.tx_for(c.tgt.x, c.tgt.f); if (Math.abs(t - c.tx) > .4) { c.tx += (t - c.tx) * .12; G.set(camEl, { x: c.tx }); } } };
    G.ticker.add(tick);
    addEventListener('resize', () => c.fit());
    c.stop = () => G.ticker.remove(tick);
    /* source units <-> screen px on the live (scaled) world */
    c.unitsToPx = (u) => u / 490 * dims().w * c.s;
    c.pxToUnits = (px) => { const r = worldEl.getBoundingClientRect(); return (px - r.left) / r.width * 490; };
    return c;
  };
})();
