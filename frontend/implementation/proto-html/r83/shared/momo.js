/* Momo engine: faces, rig, spring wings, tail, flight paths.
   Ported from the cover prototype (V5) which ports src/components/momo/momo-wing.ts.
   API: const m = SU.createMomo(); m.express('Senang'); await m.move(m.pathFrom([...]), ms); m.pose = {x,y,s,r}. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;

  const WING = {
    L: { a: [151.7, 599.3], b: [184.4, 767.4], tip: [110, 940] },
    R: { a: [1254.9, 646.8], b: [1196.4, 775.4], tip: [1306, 917] },
  };
  const WING_MAX_SHIFT = 56, WING_FULL_ANGLE = 32, WING_LIMIT_ANGLE = 50;

  /* tip-only shear: the cloth attachment A-B never moves */
  function wingTransform(side, angleDeg) {
    const { a, b, tip } = WING[side];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    let nx = -uy, ny = ux;
    if (nx * (tip[0] - a[0]) + ny * (tip[1] - a[1]) < 0) { nx = -nx; ny = -ny; }
    const dTip = nx * (tip[0] - a[0]) + ny * (tip[1] - a[1]);
    const k = (clamp(angleDeg, -WING_LIMIT_ANGLE, WING_LIMIT_ANGLE) / WING_FULL_ANGLE * WING_MAX_SHIFT) / dTip;
    const aa = 1 + k * ux * nx, cc = k * ux * ny, bb = k * uy * nx, dd = 1 + k * uy * ny;
    const e = a[0] - aa * a[0] - cc * a[1], g = a[1] - bb * a[0] - dd * a[1];
    return `matrix(${aa.toFixed(8)} ${bb.toFixed(8)} ${cc.toFixed(8)} ${dd.toFixed(8)} ${e.toFixed(8)} ${g.toFixed(8)})`;
  }

  const FK = ['eyesOpen', 'eyesClosed', 'sleepM', 'yawnM', 'shockM', 'thinkM', 'smile', 'zzz', 'lid', 'brA', 'bLy', 'bRy', 'bLr', 'bRr', 'wavy', 'lookX', 'lookY', 'smileS'];
  const FD = { eyesOpen: 1, eyesClosed: 0, sleepM: 0, yawnM: 0, shockM: 0, thinkM: 0, smile: 0, zzz: 0, lid: 1, brA: 0, bLy: 0, bRy: 0, bLr: 0, bRr: 0, wavy: 0, lookX: 0, lookY: 0, smileS: 1 };
  const FX = (o) => FK.map((k) => (o[k] != null ? o[k] : FD[k]));
  const FACES = {
    Ngantuk: FX({ eyesOpen: 0, eyesClosed: 1, sleepM: 1, zzz: 1, lid: .3 }),
    Ngelindur: FX({ sleepM: 1, zzz: .55, lid: .34 }),
    SetengahBangun: FX({ thinkM: 1, zzz: .2, lid: .7, brA: 1, bLy: 2, bRy: -8, bRr: -6 }),
    Kaget: FX({ shockM: 1, brA: 1, bLy: -44, bRy: -44 }),
    Menguap: FX({ eyesOpen: 0, eyesClosed: 1, yawnM: 1 }),
    Penasaran: FX({ smile: 1, brA: 1, bLy: -4, bRy: -30, bRr: -8, lookX: 30, lookY: -20 }),
    Berpikir: FX({ thinkM: .1, smile: 1, brA: 1, bLy: -6, bRy: -6, bLr: 10, bRr: -10, lookX: -26, lookY: -24 }),
    Senang: FX({ smile: 1 }),
    Semangat: FX({ smile: 1, brA: 1, bLy: -16, bRy: -16 }),
    Grumbel: FX({ wavy: 1, lid: .5, brA: 1, bLy: 4, bRy: -4, bLr: -8, bRr: 8, lookY: 8 }),
    Datar: FX({ thinkM: 1, lid: .45, lookY: 6 }),
    MelekDikit: FX({ thinkM: 1, lid: .55 }),
    SenyumMulai: FX({ smile: 1, smileS: .55, lid: .82 }),
    Bangga: FX({ smile: 1, smileS: 1.1, brA: 1, bLy: -16, bRy: -16, lookY: -8 }),
    Terkejut: FX({ shockM: 1, brA: 1, bLy: -34, bRy: -34 }),
    Tarik: FX({ shockM: 1, brA: 1, bLy: -14, bRy: -14, lookX: -8 }),
  };
  /* [wing frequency, wing swing, bob, tilt, stretch, bias] */
  const RIGS = {
    Ngantuk: [.48, 7, 2, 2, 0], Kaget: [2.9, 30, 2.8, 5.5, 0], Menguap: [.82, 24, 5.5, 3, 1], Penasaran: [2.2, 22, 8, 3.4, 0, 3],
    Berpikir: [1.65, 16, 7, 4.2, 0, -6], Senang: [2.5, 27, 9, 3.2, 0], Semangat: [5.9, 44, 4.8, 4.8, 0], Ngelindur: [.72, 11, 2.8, 2.8, 0, 0],
    SetengahBangun: [1.1, 15, 4.2, 3.2, 0, -5], Grumbel: [1.3, 14, 5, 3.5, 0, -3], Datar: [.9, 10, 3, 2.5, 0, 0], MelekDikit: [1, 13, 4, 3, 0, 2],
    SenyumMulai: [1.7, 19, 6.5, 3.2, 0, 3], Bangga: [3.2, 34, 8, 3.4, 0, 4], Terkejut: [3.8, 36, 3, 4, 0, 0], Tarik: [4.2, 34, 4, 4.5, 0, -7],
  };

  /* cubic Hermite through knots; x,y,s,r share one clock */
  function samplePath(points, t) {
    let j = 0;
    while (j < points.length - 2 && t > points[j + 1].t) j++;
    const a = points[j], b = points[j + 1], d = b.t - a.t, u = clamp((t - a.t) / d, 0, 1), u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, out = {};
    for (const k of ['x', 'y', 's', 'r']) {
      const prev = points[Math.max(0, j - 1)], next = points[Math.min(points.length - 1, j + 2)];
      const sa = j === 0 ? 0 : (b[k] - prev[k]) / (b.t - prev.t), sb = j === points.length - 2 ? 0 : (next[k] - a[k]) / (next.t - a.t);
      out[k] = h00 * a[k] + h10 * d * sa + h01 * b[k] + h11 * d * sb;
    }
    return out;
  }

  SU.createMomo = function createMomo() {
    const host = document.createElement('div');
    host.innerHTML = SU.MOMO_HTML;
    const el = host.firstElementChild;
    document.body.appendChild(el);
    const $ = (id) => el.querySelector('#' + id);
    const parts = {
      body: el.querySelector('.sleep-breath'), left: el.querySelector('.wing-left'), right: el.querySelector('.wing-right'),
      eyesOpen: $('eyes-open'), eyesClosed: $('eyes-closed'), sleepM: $('sleep-mouth'), yawnM: $('yawn-mouth'), shockM: $('surprised-mouth'),
      thinkM: $('thoughtful-mouth'), smile: $('smile'), zzz: $('sleep-zzz'), browL: $('brow-l'), browR: $('brow-r'), wavy: $('wavy-mouth'), eyesLook: $('eyes-look'),
    };
    const lidRect = $('lid-rect');
    const tail = [el.querySelector('.tail-twirl'), el.querySelector('.tail-segment-b'), el.querySelector('.tail-segment-c'), el.querySelector('.momo-bow')];
    const spring = { L: { a: 8, v: 0 }, R: { a: 8, v: 0 } };
    const follow = (s, target, dt) => { const h = Math.min(dt, .05) / 2; for (let i = 0; i < 2; i++) { s.v += (70 * (target - s.a) - 6.2 * s.v) * h; s.a += s.v * h; } };

    const api = { el, pose: { x: 0, y: 0, s: 1, r: 0 }, base: { w: 176, h: Math.round(176 * 2058 / 1389) }, expression: 'Senang' };
    let flight = null, prev = { x: 0, y: 0 }, idleBlend = 1, wingPhase = 0, idlePhase = 0, last = performance.now(), blinkAt = performance.now() + 2200;
    let faceT = Object.fromEntries(FK.map((k, i) => [k, FACES.Senang[i]])), faceC = { ...faceT };
    let rigT = { freq: 2.5, wing: 27, bob: 9, tilt: 3.2, stretch: 0, bias: 0 }, rigC = { ...rigT };

    api.gaze = null;
    api.express = function (name) {
      if (!FACES[name]) return;
      api.expression = name; el.dataset.expression = name;
      FK.forEach((k, i) => { faceT[k] = FACES[name][i] != null ? FACES[name][i] : (k === 'lid' || k === 'smileS' ? 1 : 0); });
      ['freq', 'wing', 'bob', 'tilt', 'stretch', 'bias'].forEach((k, i) => { rigT[k] = RIGS[name][i] != null ? RIGS[name][i] : 0; });
      if (name !== 'Ngantuk' && name !== 'Menguap') blinkAt = performance.now() + 1400 + Math.random() * 900;
    };
    api.pathFrom = (items) => [{ t: 0, ...api.pose }, ...items];
    api.move = (points, ms) => {
      if (flight) flight.resolve();
      return new Promise((resolve) => { flight = { start: performance.now(), duration: ms, points, resolve }; });
    };
    /* base size follows the viewport so Momo reads the same on every desktop ratio */
    api.fit = function () {
      const w = clamp(Math.round(Math.min(innerWidth, innerHeight * 1.78) * .122), 150, 260);
      api.base = { w, h: Math.round(w * 2058 / 1389) };
    };
    api.hide = () => { el.style.display = 'none'; };
    api.show = () => { el.style.display = ''; };

    function frame(now) {
      const dt = clamp((now - last) / 1000, 0, .05); last = now;
      const { pose, base } = api;
      if (flight) {
        const t = clamp((now - flight.start) / flight.duration, 0, 1);
        Object.assign(pose, samplePath(flight.points, t));
        if (t >= 1) { const done = flight.resolve; flight = null; done(); }
      }
      idlePhase += dt;
      rigC.freq = mix(rigC.freq, rigT.freq, 1 - Math.exp(-dt * 2.9));
      wingPhase += dt * rigC.freq * Math.PI * 2;
      for (const k of Object.keys(rigC)) if (k !== 'freq') rigC[k] = mix(rigC[k], rigT[k], 1 - Math.exp(-dt * 3.4));
      if (api.gaze) { faceT.lookX = api.gaze.x; faceT.lookY = api.gaze.y; }   /* eyes follow a target (the ending: Thinman) */
      for (const k of FK) faceC[k] = mix(faceC[k], faceT[k], 1 - Math.exp(-dt * 6.8));
      let blink = 0;
      if (api.expression !== 'Menguap' && api.expression !== 'Ngantuk') {
        const diff = now - blinkAt;
        if (diff > 0 && diff < 215) blink = Math.sin(Math.PI * diff / 215);
        if (diff >= 215) blinkAt = now + 3300 + Math.random() * 1900;
      }
      const eyeO = clamp(faceC.eyesOpen * faceC.lid * (1 - blink * .96), 0, 1);
      parts.eyesOpen.style.opacity = '1';
      parts.eyesClosed.style.opacity = clamp((.35 - eyeO) / .2, 0, 1).toFixed(3);
      lidRect.setAttribute('y', (626 - 120 * eyeO).toFixed(2));
      lidRect.setAttribute('height', Math.max(.01, 120 * eyeO).toFixed(2));
      parts.browL.setAttribute('opacity', faceC.brA.toFixed(3)); parts.browR.setAttribute('opacity', faceC.brA.toFixed(3));
      parts.browL.setAttribute('transform', `translate(0 ${faceC.bLy.toFixed(1)}) rotate(${faceC.bLr.toFixed(2)} 522 470)`);
      parts.browR.setAttribute('transform', `translate(0 ${faceC.bRy.toFixed(1)}) rotate(${faceC.bRr.toFixed(2)} 867 470)`);
      for (const [key, node] of [['sleepM', parts.sleepM], ['yawnM', parts.yawnM], ['shockM', parts.shockM], ['thinkM', parts.thinkM], ['smile', parts.smile]]) node.style.opacity = faceC[key];
      parts.zzz.style.opacity = faceC.zzz;
      parts.wavy.setAttribute('opacity', faceC.wavy.toFixed(3));
      parts.wavy.setAttribute('transform', `translate(${(Math.sin(idlePhase * 9) * 7).toFixed(1)} ${(Math.sin(idlePhase * 13) * 3).toFixed(1)})`);
      parts.eyesLook.setAttribute('transform', `translate(${faceC.lookX.toFixed(1)} ${faceC.lookY.toFixed(1)})`);
      parts.smile.setAttribute('transform', `translate(695 705) scale(${faceC.smileS.toFixed(3)}) translate(-695 -705)`);

      const active = flight !== null;
      idleBlend = mix(idleBlend, active ? .34 : 1, 1 - Math.exp(-dt * 4.6));
      const vx = (pose.x - prev.x) / Math.max(.006, dt), vy = (pose.y - prev.y) / Math.max(.006, dt);
      prev = { x: pose.x, y: pose.y };
      const bob = Math.sin(idlePhase * 2.25) * rigC.bob * idleBlend;
      const lean = Math.sin(idlePhase * 1.24) * rigC.tilt * idleBlend + rigC.bias;
      const breath = Math.sin(idlePhase * 1.42) * .012, yawn = rigC.stretch;
      const bobArt = (bob - 4 * yawn) * 2058 / Math.max(60, base.h * Math.max(.25, pose.s));
      parts.body.setAttribute('transform', `translate(695 640) translate(0 ${bobArt.toFixed(2)}) rotate(${lean.toFixed(2)}) scale(${(1 + breath * .55 + yawn * .028).toFixed(5)} ${(1 - breath * .35 + yawn * .035).toFixed(5)}) translate(-695 -640)`);

      const wave = Math.sin(wingPhase), swing = rigC.wing;
      const speedBoost = clamp(Math.hypot(vx, vy) / 260, 0, 4), airDrag = clamp(-vy * .009, -7, 7);
      const rest = ({ Ngantuk: 10, Ngelindur: 8, SetengahBangun: 4 })[api.expression] || 0;
      const flapAmp = clamp(swing * (active ? .90 : .69) + speedBoost, 3, 26);
      follow(spring.L, rest + airDrag + flapAmp * wave, dt);
      follow(spring.R, rest + airDrag + flapAmp * Math.sin(wingPhase - .05), dt);
      parts.left.setAttribute('transform', wingTransform('L', clamp(spring.L.a, -50, 50)));
      parts.right.setAttribute('transform', wingTransform('R', clamp(spring.R.a, -50, 50)));

      const tl = Math.sin(idlePhase * .75 + wingPhase * .10) * 5.4 + clamp(-vx * .017, -7, 7);
      tail[0].setAttribute('transform', `rotate(${tl.toFixed(2)} 696 1388)`);
      tail[1].setAttribute('transform', `rotate(${(-tl * .66).toFixed(2)} 747.4 1600)`);
      tail[2].setAttribute('transform', `rotate(${(tl * .58).toFixed(2)} 952.4 1830)`);
      tail[3].setAttribute('transform', `rotate(${(tl * .11).toFixed(2)} 696 1350)`);

      if (!active) {            /* resting: native-size vector painting, no texture scaling */
        const vw = base.w * pose.s, vh = base.h * pose.s;
        el.style.transform = 'none';
        el.style.left = Math.round(pose.x - vw / 2) + 'px'; el.style.top = Math.round(pose.y - vh / 2) + 'px';
        el.style.width = vw.toFixed(2) + 'px'; el.style.height = vh.toFixed(2) + 'px';
      } else {
        el.style.left = '0px'; el.style.top = '0px'; el.style.width = base.w + 'px'; el.style.height = base.h + 'px';
        el.style.transform = `translate3d(${pose.x.toFixed(2)}px,${(pose.y + Math.sin(idlePhase * 3.5)).toFixed(2)}px,0) translate(-50%,-50%) rotate(${pose.r.toFixed(2)}deg) scale(${Math.max(.015, pose.s).toFixed(4)})`;
      }
      requestAnimationFrame(frame);
    }
    api.fit();
    api.express('Senang');
    requestAnimationFrame(frame);
    return api;
  };
})();
