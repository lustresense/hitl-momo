/* Thinman and Momo in the ending. Thinman turns to face the user and is driven by the rig (shared/thinrig.js): breathing with overlapping action,
   weight shifts, random blinks, a wave when he turns, a listening nod when Momo speaks, and an elastic reaction to a click. Momo's eyes follow him. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { clamp } = SU;

  SU.endPal = (c) => {
    const m = SU.momo(), hero = c.hero, rig = SU.thinRig(hero); let react = null;
    const look = () => {
      const hr = hero.el.getBoundingClientRect(), mr = m.el.getBoundingClientRect();
      m.gaze = { x: clamp(((hr.left + hr.width / 2) - (mr.left + mr.width / 2)) / innerWidth * 220, -30, 30), y: clamp(((hr.top + hr.height / 3) - (mr.top + mr.height * .3)) / innerHeight * 130, -24, 24) };
    };
    G.ticker.add(look);
    hero.el.style.pointerEvents = 'auto'; hero.el.style.cursor = 'pointer';
    hero.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); if (react) return; const was = m.expression;
      m.express('Kaget'); rig.react();
      G.fromTo(m.pose, { y: m.pose.y }, { y: m.pose.y - 12, duration: .35, yoyo: true, repeat: 1, ease: 'sine.inOut' });
      react = setTimeout(() => { m.express(was === 'Kaget' ? 'Senang' : was); react = null; }, 900);
    });
    return {
      /* park the walker, turn to the user, start living */
      async face() { c.walk.hold = true; await rig.turn(); rig.idle(); },
      wave: () => rig.wave(), nod: () => rig.nod(), look: (x) => rig.look(x),
      stop() { G.ticker.remove(look); m.gaze = null; rig.kill(); G.set(hero.art, { clearProps: 'transform' }); G.set(hero.el, { clearProps: 'scaleX,scaleY,y' }); G.set(hero.el, { xPercent: -50, yPercent: -100 }); c.walk.hold = false; },
    };
  };
})();
