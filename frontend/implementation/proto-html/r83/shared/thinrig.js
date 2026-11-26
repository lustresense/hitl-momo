/* Thinman rig for cutscenes (ending, win). The repo's front-facing Character A is cut into real body parts and driven with GSAP the way a game
   animator would: a rooted body (weight shift), squash and stretch about the feet, anticipation before every action, overlapping action
   (arms lag the torso, the head lags the arms), follow-through with elastic settles, blinks at random, and a soft contact shadow.
   Parts (outermost first): rg (weight shift) > bd (squash/stretch/dip, pivot at the feet) > legs + up (breathing, pivot at the hips)
   > aLo/aL, aRo/aR (arms: action layer / sway layer, pivot at the shoulders) + torso + hn (nod) > hd (head, lags) > eyes (blink, glance). */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap;
  const split = (d) => String(d).split(/(?=M)/).filter(Boolean);
  const firstXY = (d) => { const m = /M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(d); return m ? [+m[1], +m[2]] : [100, 150]; };
  const P = { feet: '100 389', hip: '101 300', neck: '100 124', eyes: '100 77', sh: '100 391' };

  SU.thinRig = (hero) => {
    let R = null, T = [], blinkT = 0, pL = P.hip, pR = P.hip;
    const keep = (t) => { T.push(t); return t; };
    const front = (g) => { if (R) R.up.appendChild(g); };                                  /* arm above head and torso while it is raised */
    const back = (g) => { if (R) R.up.insertBefore(g, R.up.querySelector(':scope > path.fill')); };  /* ... and behind the torso again at rest */
    const kill = () => { T.forEach((t) => t.kill()); T = []; clearTimeout(blinkT); };

    /* cut the front pose into parts and put them in hero.art */
    function mount() {
      const ad = hero.ad; ad.currentPoseName = 'WIN';
      const src = new DOMParser().parseFromString(ad.renderSvg(1), 'image/svg+xml').documentElement, ch = src.querySelector('g.ch');
      if (!ch) return false;
      const plain = [...ch.querySelectorAll(':scope > path')].filter((e) => !e.classList.contains('hnd') && !e.classList.contains('fill'));
      const hnd = [...ch.querySelectorAll(':scope > path.hnd')], torso = ch.querySelector(':scope > path.fill'), head = ch.querySelector(':scope > ellipse.fill'), eyes = [...ch.querySelectorAll(':scope > ellipse.eye')];
      if (plain.length < 3 || hnd.length < 2 || !torso || !head || eyes.length < 2) return false;
      const legs = split(plain[0].getAttribute('d')), feet = split(plain[1].getAttribute('d')), arms = split(plain[2].getAttribute('d'));
      pL = firstXY(arms[0]).join(' '); pR = firstXY(arms[1]).join(' ');
      const at = (e, names) => names.map((n) => `${n}="${e.getAttribute(n)}"`).join(' ');
      hero.art.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${src.getAttribute('viewBox')}" width="${src.getAttribute('width')}" height="${src.getAttribute('height')}" role="img" aria-label="Thinman"><style>${src.querySelector('style').textContent}</style>
<ellipse class="sh" cx="100" cy="391" rx="58" ry="6" fill="rgba(55,31,13,.22)"/>
<g class="ch"><g class="rg"><g class="bd">
<path d="${legs[0]}"/><path d="${legs[1] || legs[0]}"/><path d="${feet[0]}"/><path d="${feet[1] || feet[0]}"/>
<g class="up">
<g class="aLo"><g class="aL"><path d="${arms[0]}"/><path class="hnd" transform="${hnd[0].getAttribute('transform')}" d="${hnd[0].getAttribute('d')}"/></g></g>
<g class="aRo"><g class="aR"><path d="${arms[1] || arms[0]}"/><path class="hnd" transform="${hnd[1].getAttribute('transform')}" d="${hnd[1].getAttribute('d')}"/></g></g>
<path class="fill" d="${torso.getAttribute('d')}"/>
<g class="hn"><g class="hd"><ellipse class="fill" ${at(head, ['cx', 'cy', 'rx', 'ry'])}/><g class="eyes"><ellipse class="eye dot" ${at(eyes[0], ['cx', 'cy', 'rx', 'ry'])}/><ellipse class="eye dot" ${at(eyes[1], ['cx', 'cy', 'rx', 'ry'])}/></g></g></g>
</g></g></g></g></svg>`;
      const q = (s) => hero.art.querySelector(s);
      R = { rg: q('.rg'), bd: q('.bd'), up: q('.up'), aLo: q('.aLo'), aL: q('.aL'), aRo: q('.aRo'), aR: q('.aR'), hn: q('.hn'), hd: q('.hd'), eyes: q('.eyes'), sh: q('.sh') };
      return true;
    }

    /* the figure turns round to face the user: a quick anticipation squash, the side view narrows to a sliver, the front view opens with an overshoot */
    function turn() {
      return new Promise((res) => {
        hero.el.classList.remove('flip'); G.killTweensOf(hero.art);
        const tl = G.timeline({ onComplete: () => { G.set(hero.art, { clearProps: 'transform' }); res(); } });
        tl.to(hero.el, { scaleY: .95, scaleX: 1.03, duration: .1, ease: 'power2.in' })
          .to(hero.art, { scaleX: .1, duration: .16, ease: 'power2.in', transformOrigin: '50% 100%' }, '<')
          .add(() => { mount(); G.set(hero.art, { scaleX: .1 }); })
          .to(hero.art, { scaleX: 1, duration: .45, ease: 'back.out(2.6)' })
          .to(hero.el, { scaleY: 1, scaleX: 1, duration: .8, ease: 'elastic.out(1,.4)' }, '<.05');
        keep(tl);
      });
    }

    /* breathing (arms lag the chest, the head lags the arms), a slow weight shift, random blinks */
    function idle() {
      if (!R) return; const e = 'sine.inOut';
      keep(G.timeline({ repeat: -1, yoyo: true, defaults: { ease: e } })
        .to(R.up, { y: -2.4, scaleY: 1.012, svgOrigin: P.hip, duration: 1.8 }, 0)
        .to(R.aL, { rotation: 2.4, svgOrigin: pL, duration: 1.8 }, .16)
        .to(R.aR, { rotation: -2.4, svgOrigin: pR, duration: 1.8 }, .16)
        .to(R.hd, { y: -1.3, rotation: .9, svgOrigin: P.neck, duration: 1.8 }, .3)
        .to(R.sh, { scaleX: .95, opacity: .8, svgOrigin: P.sh, duration: 1.8 }, 0));
      const w = { ease: 'power2.inOut' };
      keep(G.timeline({ repeat: -1, repeatDelay: 1.4 })
        .to(R.rg, { x: 4, ...w, duration: 1.2 }, 0).to(R.up, { rotation: -.9, svgOrigin: P.hip, ...w, duration: 1.2 }, 0).to(R.hn, { rotation: 1.2, svgOrigin: P.neck, ...w, duration: 1.2 }, .1)
        .to(R.rg, { x: -3, ...w, duration: 1.5 }, '+=2.2').to(R.up, { rotation: .8, svgOrigin: P.hip, ...w, duration: 1.5 }, '<').to(R.hn, { rotation: -1, svgOrigin: P.neck, ...w, duration: 1.5 }, '<.1')
        .to(R.rg, { x: 0, ...w, duration: 1.3 }, '+=2.6').to(R.up, { rotation: 0, svgOrigin: P.hip, ...w, duration: 1.3 }, '<').to(R.hn, { rotation: 0, svgOrigin: P.neck, ...w, duration: 1.3 }, '<.1'));
      const blink = () => {
        blinkT = setTimeout(() => {
          if (!R || !R.eyes.isConnected) return;
          keep(G.timeline().to(R.eyes, { scaleY: .08, svgOrigin: P.eyes, duration: .07, ease: 'power1.in' }).to(R.eyes, { scaleY: 1, duration: .13, ease: 'power1.out' }));
          blink();
        }, 2200 + Math.random() * 3400);
      };
      blink();
    }

    /* a small listening nod: the head lifts a hair (anticipation), dips with the body, then settles with a soft overshoot */
    function nod() {
      if (!R) return Promise.resolve();
      return new Promise((res) => {
        keep(G.timeline({ onComplete: res })
          .to(R.hn, { rotation: -2.2, svgOrigin: P.neck, duration: .14, ease: 'sine.out' })
          .to(R.hn, { rotation: 9, duration: .2, ease: 'power2.out' })
          .to(R.bd, { y: 2.5, svgOrigin: P.feet, duration: .2, ease: 'power2.out' }, '<')
          .to(R.aLo, { rotation: 3, svgOrigin: pL, duration: .24, ease: 'power2.out' }, '<.04')
          .to(R.aRo, { rotation: -3, svgOrigin: pR, duration: .24, ease: 'power2.out' }, '<')
          .to(R.hn, { rotation: 0, duration: .75, ease: 'elastic.out(1,.55)' })
          .to(R.bd, { y: 0, duration: .6, ease: 'elastic.out(1,.6)' }, '<.05')
          .to([R.aLo, R.aRo], { rotation: 0, duration: .7, ease: 'elastic.out(1,.6)' }, '<'));
      });
    }

    /* a friendly wave with the right-hand arm: anticipation (dip), swing up with overshoot, wiggle the forearm, lower with follow-through */
    function wave() {
      if (!R) return Promise.resolve();
      return new Promise((res) => {
        const t = G.timeline({ onComplete: () => { back(R.aRo); res(); } });
        t.add(() => front(R.aRo))
          .to(R.aRo, { rotation: 12, svgOrigin: pR, duration: .14, ease: 'sine.out' })
          .to(R.aRo, { rotation: -125, duration: .5, ease: 'back.out(1.6)' })
          .to(R.up, { rotation: 1.4, svgOrigin: P.hip, duration: .5, ease: 'sine.out' }, '<')
          .to(R.hn, { rotation: -4, svgOrigin: P.neck, duration: .4, ease: 'sine.out' }, '<.1')
          .to(R.aRo, { rotation: -108, duration: .17, ease: 'sine.inOut', yoyo: true, repeat: 5 })
          .to(R.aRo, { rotation: 4, duration: .7, ease: 'power2.inOut' })
          .to(R.up, { rotation: 0, duration: .6, ease: 'power2.inOut' }, '<')
          .to(R.hn, { rotation: 0, duration: .6, ease: 'power2.inOut' }, '<')
          .to(R.aRo, { rotation: 0, duration: .5, ease: 'elastic.out(1,.55)' });
        keep(t);
      });
    }

    /* a click: anticipation squash, a quick upward stretch with the eyes wide and the arms lifting, then an elastic settle */
    function react() {
      if (!R) return Promise.resolve();
      return new Promise((res) => {
        keep(G.timeline({ onComplete: res })
          .to(R.bd, { scaleY: .93, scaleX: 1.04, svgOrigin: P.feet, duration: .1, ease: 'power2.in' })
          .to(R.bd, { scaleY: 1.06, scaleX: .97, y: -7, duration: .16, ease: 'power2.out' })
          .to(R.eyes, { scaleY: 1.25, scaleX: 1.15, svgOrigin: P.eyes, duration: .1 }, '<')
          .to(R.aLo, { rotation: 16, svgOrigin: pL, duration: .16, ease: 'power2.out' }, '<')
          .to(R.aRo, { rotation: -16, svgOrigin: pR, duration: .16, ease: 'power2.out' }, '<')
          .to(R.bd, { scaleY: 1, scaleX: 1, y: 0, duration: .85, ease: 'elastic.out(1,.45)' })
          .to([R.eyes], { scaleY: 1, scaleX: 1, duration: .4, ease: 'power2.out' }, '<')
          .to([R.aLo, R.aRo], { rotation: 0, duration: .7, ease: 'elastic.out(1,.6)' }, '<'));
      });
    }

    /* the win celebration: crouch (anticipation), arms up, launch with a stretch, hang, fall, land squash, elastic settle; the shadow shrinks in the air */
    function cheer() {
      if (!R) return;
      front(R.aLo); front(R.aRo);
      keep(G.timeline({ repeat: -1 })
        .to(R.bd, { scaleY: .88, scaleX: 1.07, svgOrigin: P.feet, duration: .17, ease: 'power2.in' })
        .to(R.aLo, { rotation: 138, svgOrigin: pL, duration: .26, ease: 'back.out(2)' }, '<.05')
        .to(R.aRo, { rotation: -138, svgOrigin: pR, duration: .26, ease: 'back.out(2)' }, '<')
        .to(R.bd, { scaleY: 1.1, scaleX: .95, y: -46, duration: .28, ease: 'power2.out' })
        .to(R.sh, { scaleX: .6, opacity: .45, svgOrigin: P.sh, duration: .28, ease: 'power2.out' }, '<')
        .to(R.bd, { y: -52, scaleY: 1.02, scaleX: .99, duration: .1, ease: 'sine.out' })
        .to(R.bd, { y: 0, scaleY: 1.04, scaleX: .98, duration: .26, ease: 'power2.in' })
        .to(R.sh, { scaleX: 1, opacity: .8, duration: .26, ease: 'power2.in' }, '<')
        .to(R.bd, { scaleY: .9, scaleX: 1.06, duration: .07, ease: 'power1.out' })
        .to(R.bd, { scaleY: 1, scaleX: 1, duration: .55, ease: 'elastic.out(1,.4)' })
        .to([R.aLo, R.aRo], { rotation: 0, duration: .5, ease: 'power2.inOut' }, '<.12')
        .to({}, { duration: .35 }));
    }

    /* a glance: the eyes slide toward x (units) */
    const look = (x = 0) => { if (R) keep(G.to(R.eyes, { x, duration: .35, ease: 'power2.out' })); };

    return { mount, turn, idle, nod, wave, react, cheer, look, kill };
  };
})();
