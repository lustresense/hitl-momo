/* Visual polish of the fall (outcome of the physics untouched): the object sways a little while it falls, a shadow grows on the spot where it
   will land, and at landing it squashes, bounces once and kicks up a little dust. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, W = SU.world, { clamp } = SU;

  /* act: the actors layer; o: the falling object; end: a copy of o already dropped to where it will rest */
  SU.fallFx = (act, o, end) => {
    const y0 = o.y, y1 = end.y, b = SU.shape.aabb(end), t0 = performance.now();
    const sh = document.createElement('i'); sh.className = 'land-shadow'; act.appendChild(sh);
    sh.style.left = W.SX(b[0] + b[2] / 2) + '%'; sh.style.top = W.SY(b[1] + b[3]) + '%'; sh.style.width = W.SW(Math.max(14, b[2]) * 1.3) + '%';
    G.set(sh, { xPercent: -50, yPercent: -50, scale: .25, opacity: 0 });
    const prog = (p) => clamp((p.y - y0) / Math.max(1, y1 - y0), 0, 1);
    return {
      rot: (p) => 5 * Math.sin((performance.now() - t0) / 1000 * 8) * (1 - prog(p)),   /* sways, calms down towards the ground */
      tick: (p) => { const k = prog(p); G.set(sh, { scale: .25 + .75 * k * k, opacity: .1 + .4 * k }); },
      land(d, rest) {
        G.to(sh, { opacity: 0, duration: .5, delay: .15, onComplete: () => sh.remove() });
        if (!rest) return;
        G.fromTo(d, { scaleY: .82, scaleX: 1.1 }, { scaleY: 1, scaleX: 1, duration: .45, ease: 'elastic.out(1,.4)' });
        G.fromTo(d, { y: 0 }, { y: -5, duration: .13, yoyo: true, repeat: 1, ease: 'power1.out', overwrite: false });
        for (let k = 0; k < 8; k++) {
          const i = document.createElement('i'); i.className = 'dust'; act.appendChild(i);
          const side = k % 2 ? 1 : -1;
          i.style.left = W.SX(b[0] + b[2] / 2 + side * b[2] * .42) + '%'; i.style.top = W.SY(b[1] + b[3] - 1) + '%';
          G.set(i, { xPercent: -50, yPercent: -50, scale: .5 + Math.random() * .5 });
          G.to(i, { x: side * (10 + Math.random() * 26), y: -(4 + Math.random() * 16), scale: 1.4 + Math.random(), opacity: 0, duration: .55 + Math.random() * .25, ease: 'power2.out', onComplete: () => i.remove() });
        }
      },
    };
  };
})();
