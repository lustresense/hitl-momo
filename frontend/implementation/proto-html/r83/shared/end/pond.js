/* The magic ink pond (replaces the portal): a dark puddle of ink on the ground with a shiny rim and slow ripples.
   Thinman walks to it, jumps in (ink splashes, rings spread), sinks, a column of light rises from the pond, and he flies out of it glowing,
   lands, and is orange from then on. All GSAP; the walker is `hold`-ed during the scripted moves and handed back afterwards. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, W = SU.world;
  const POND = '<svg viewBox="0 0 150 40" aria-hidden="true"><ellipse cx="75" cy="22" rx="70" ry="15" fill="#15171b" stroke="#111" stroke-width="3.4"/><path d="M20 18Q42 8 76 9" fill="none" stroke="#fffdf6" stroke-opacity=".6" stroke-width="3.2" stroke-linecap="round"/><path d="M108 13Q122 15 128 20" fill="none" stroke="#fffdf6" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/><ellipse class="idle-rip" cx="75" cy="22" rx="34" ry="6.5" fill="none" stroke="#fffdf6" stroke-opacity=".32" stroke-width="1.6"/></svg>';
  const rnd = (a, b) => a + Math.random() * (b - a);

  SU.endPond = {
    make(act, ground, gx) {
      const el = document.createElement('div'); el.className = 'pond'; el.style.cssText = `left:${W.SX(gx)}%;top:${W.SY(ground(gx) + 1)}%;width:${W.SW(78)}%`; el.innerHTML = POND; act.appendChild(el);
      G.set(el, { xPercent: -50, yPercent: -50 });
      const rip = el.querySelector('.idle-rip'); G.set(rip, { transformOrigin: '50% 50%' }); G.fromTo(rip, { scale: .5, opacity: .9 }, { scale: 1.9, opacity: 0, duration: 2.6, repeat: -1, ease: 'sine.out' });
      return el;
    },
    /* c: {hero, ground, act, worldEl, walk, cam, gx, pond} */
    async dive(S, c) {
      const u = c.worldEl.offsetWidth / 490, el = (cls, css) => { const e = document.createElement('i'); e.className = cls; e.style.cssText = css || ''; c.act.appendChild(e); return e; };
      const px = W.SX(c.gx) + '%', cyu = c.ground(c.gx), py = W.SY(cyu) + '%';
      const arc = (from, to, dur, h, face, onT) => new Promise((res) => {
        const o = { t: 0 };
        G.to(o, { t: 1, duration: dur, ease: 'none', onUpdate() {
          const t = o.t, x = from[0] + (to[0] - from[0]) * t, y = from[1] + (to[1] - from[1]) * t - h * 4 * t * (1 - t);
          c.hero.place(x, y); c.hero.update({ vx: (to[0] - from[0]) / dur, vy: (to[1] - from[1]) / dur - h * 4 * (1 - 2 * t) / dur, on: false, face }, .016); c.cam.follow(x, .5); if (onT) onT(t);
        }, onComplete: res });
      });
      c.walk.hold = true;
      /* 1. the jump */
      const x0 = c.walk.pos(), y0 = c.ground(x0);
      await arc([x0, y0], [c.gx, cyu + 3], .85, 38, 1);
      /* 2. splash and rings */
      for (let k = 0; k < 14; k++) {
        const d = el('ink', `left:${px};top:${py};width:${u * rnd(1.6, 3)}px;height:${u * rnd(1.6, 3)}px`); G.set(d, { xPercent: -50, yPercent: -50 });
        G.to(d, { x: rnd(-1, 1) * u * 30, y: -u * rnd(14, 38), duration: rnd(.3, .5), ease: 'power2.out' }); G.to(d, { y: `+=${u * 34}`, opacity: 0, duration: .45, delay: .35, ease: 'power2.in', onComplete: () => d.remove() });
      }
      for (let k = 0; k < 3; k++) {
        const r = el('ripple', `left:${px};top:${py};width:${W.SW(70)}%`); G.set(r, { xPercent: -50, yPercent: -50 });
        G.fromTo(r, { scale: .3, opacity: .85 }, { scale: 1.5, opacity: 0, duration: 1.1, delay: k * .22, ease: 'power1.out', onComplete: () => r.remove() });
      }
      /* 3. he sinks */
      await SU.tw(c.hero.el, { y: u * 15, scaleY: .5, opacity: 0, duration: .55, ease: 'power2.in' });
      await S.sleep(450);
      /* 4. light from the pond */
      const beam = el('beam', `left:${px};top:${py};width:${W.SW(46)}%;height:${W.SH(150)}%`); G.set(beam, { xPercent: -50, yPercent: -100, transformOrigin: '50% 100%', scaleY: 0, opacity: 0 });
      G.to(c.pond, { filter: 'drop-shadow(0 0 24px #f0d487)', duration: .5, yoyo: true, repeat: 1 });
      for (let k = 0; k < 11; k++) {
        const g = el('glint', `left:${px};top:${py};width:${u * rnd(2, 3.6)}px;height:${u * rnd(2, 3.6)}px`); G.set(g, { xPercent: -50, yPercent: -50, x: rnd(-1, 1) * u * 14, opacity: 0 });
        G.fromTo(g, { y: 0, scale: .4, opacity: 0 }, { y: -u * rnd(30, 90), scale: 1, opacity: 1, duration: rnd(.7, 1.1), delay: .15 + k * .07, ease: 'power1.out', yoyo: true, repeat: 1, onComplete: () => g.remove() });
      }
      await SU.tw(beam, { scaleY: 1, opacity: 1, duration: .7, ease: 'power2.out' });
      /* 5. he comes out glowing (and orange from here on), flies in an arc and lands */
      c.hero.el.classList.add('alive');
      G.set(c.hero.el, { opacity: 1, y: 0, scaleY: 1, scale: .6, filter: 'drop-shadow(0 0 16px #fff4b0) brightness(1.5)' });
      const lx = c.gx - 90, ly = c.ground(lx);
      G.to(beam, { opacity: 0, duration: .9, delay: .5, onComplete: () => beam.remove() });
      await arc([c.gx, cyu], [lx, ly], 1.25, 64, -1, (t) => G.set(c.hero.el, { scale: .6 + .4 * t, rotation: t < .8 ? t * 540 : 0 }));
      G.set(c.hero.el, { rotation: 0, scale: 1, filter: 'none' });
      c.hero.update({ vx: 0, vy: 0, on: true, face: -1 }, .016); c.walk.st.x = lx; c.walk.st.face = -1; c.walk.hold = false;
      await S.sleep(350);
    },
  };
})();
