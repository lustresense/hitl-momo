/* Play: Thinman is driven by keyboard / mouse (stand-ins for hand steering); the repo's real rig animates him each frame.
   Win = reaches the signpost. Fail = falls, touches a hazard. FailOverlay offers Coba lagi / Geser benda / Gambar lagi. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, W = SU.world, { esc, fmt } = SU;

  const { PH, simInit, simStep, tick120, bodyOf } = SU.sim;

  const WHY = (r) => ({ fall: `${SU.CHAR} jatuh ke celah. Coba tambahkan pijakan, atau geser bendanya.`, spike: `${SU.CHAR} kena duri. Cari jalan yang lebih aman.`, danger: `Benda itu berbahaya buat ${SU.CHAR}. Mungkin tebakanku keliru, atau kamu bisa menggambar ulang.` })[r];

  /* returns 'win' | 'retry' | 'place' | 'draw' */
  SU.playScene = (L) => ({
    id: 'main', label: `Level ${L} · Bermain`, hint: 'Cubit lalu geser kanan/kiri = jalan · lepas = berhenti · cubit cepat atau sentil ke atas = lompat · keyboard: ← → dan Spasi',
    async run(S, { placed, rec }) {
      const Gm = SU.GEO[L], root = S.root, lv = SU.LV[L];
      root.innerHTML = W.html(L, `<div class="hud tr gs"><span class="k-chip">${esc(lv.title)}</span></div><div class="hud tr2 gs"><span class="k-chip" id="st">Jalan ke papan petunjuk</span></div>`);
      const world = SU.Q('world'), act = SU.Q('act');
      W.addObjs(act, placed); placed.forEach((o) => { o.el.classList.add('still'); const l = o.el.querySelector('.olabel'); if (l) l.textContent = ''; });
      const hero = W.Hero(act, Gm.spawn[0], Gm.spawn[1]);
      const ping = document.createElement('div'); ping.className = 'goalbox';
      ping.style.cssText = `left:${W.SX(Gm.goal[0])}%;top:${W.SY(Gm.goal[1] - 8)}%;width:${W.SW(30)}%`; act.appendChild(ping); G.set(ping, { xPercent: -50, yPercent: -50 });
      G.to(ping, { scale: 1.35, opacity: .2, duration: .9, repeat: -1, ease: 'sine.out' });
      S.tls.push(G.from(world, { opacity: 0, duration: .5 }), S.in(root.querySelectorAll('.gs'), { delay: .2 }));
      await SU.momoTo('corner', 700);
      S.offs.push(SU.gazeAt(() => hero.el));                       /* her eyes follow Thinman while he walks */

      const solids = Gm.plat.map((r) => r.slice()), haz = Gm.haz.map((r) => r.slice());
      placed.forEach((o) => { (o.behavior === 'danger' ? haz : solids).push(...SU.shape.world(o)); });
      const st = simInit(L), inp = { dir: 0, jump: false }, keys = new Set();
      let over = false, res, last = performance.now(), acc = 0, raf;
      const fin = new Promise((r) => (res = r));
      const place = () => hero.place(st.x, st.y);
      place(); window.__dbg = { st, solids, haz, hero };
      S.on(window, 'keydown', (e) => {
        if (e.target.closest && e.target.closest('input,textarea')) return; const k = e.key;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'A', 'd', 'D', 'w', 'W', ' '].includes(k)) { e.preventDefault(); if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') inp.jump = true; else keys.add(k); }
      });
      S.on(window, 'keyup', (e) => keys.delete(e.key));
      /* r8.3 aturan C (tuntun): tanpa tombol. Cubit di mana aja = titik tengah joystick; geser kanan/kiri = jalan, makin jauh makin cepat;
         lepas = berhenti; cubit cepat atau sentil ke atas = lompat */
      const pad = SU.nui ? SU.nui.joystick({ onJump: () => { inp.jump = true; } }) : null;
      if (pad) S.offs.push(() => pad.destroy());
      const finish = (r) => { if (over) return; over = true; res(r); };
      const tick = (now) => {
        if (over || !S.alive()) return;
        const dtr = Math.min(.05, (now - last) / 1000); acc += dtr; last = now;
        let dir = 0; if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) dir -= 1; if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) dir += 1;
        if (!dir && pad) dir = pad.dir();
        inp.dir = dir;
        while (acc >= 1 / 120) {
          tick120(st, inp, solids); acc -= 1 / 120;
          const body = bodyOf(st);
          if (W.hit(body, Gm.goalRect)) { finish({ win: true }); break; }
          for (const h of haz) if (W.hit(body, [h[0], h[1] + 1, h[2], h[3]])) { finish({ fail: Gm.haz.includes(h) || haz.indexOf(h) < Gm.haz.length ? 'spike' : 'danger' }); break; }
          if (st.y > 350) { finish({ fail: 'fall' }); break; }
        }
        hero.update(st, dtr); place();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick); S.offs.push(() => cancelAnimationFrame(raf));
      SU.say1(`Antar ${SU.CHAR} ke papan petunjuk. Cubit, lalu geser tanganmu ke arah tujuannya.`); SU.momo().express('Semangat');
      const r = await S.until(fin);
      cancelAnimationFrame(raf); if (pad) pad.destroy();
      if (S.skipped && !over) return 'win';
      if (r && r.win) { SU.Q('st').textContent = 'Sampai!'; hero.update(st, .016, 'win'); return 'win'; }

      /* fail: Thinman shakes (decaying, eased), Momo comes to the middle and explains, and her bubble offers three ways forward */
      rec.tries = (rec.tries || 0) + 1;
      const why = WHY(r.fail);
      hero.update(st, .016, 'fail');
      G.to(hero.el, { keyframes: [{ x: 8, duration: .06 }, { x: -7, duration: .08 }, { x: 5, duration: .08 }, { x: -3, duration: .08 }, { x: 1.5, duration: .08 }, { x: 0, duration: .1 }], ease: 'sine.inOut' });
      SU.momo().express('Berpikir');
      await SU.momoTo('mid', 650);
      SU.say1(why);
      const ex = SU.bubbleExtra(`<div class="fail-ask"><span class="k-kicker">Belum berhasil</span><h2 class="k-title">Mau coba apa?</h2><p class="k-text">Dekatkan tangan ke pilihanmu, lalu cubit dan tahan.</p><div class="row"><button class="nb-btn primary" data-a="retry">Coba lagi</button><button class="nb-btn" data-a="place">Geser benda</button><button class="nb-btn" data-a="draw">Gambar lagi</button></div></div>`);
      G.from(ex, { opacity: 0, y: 8, duration: .4, delay: .35, ease: 'power2.out' });
      /* r8.3 aturan B: tiga pilihan, yang paling dekat tangan menyala; cubit dan tahan 1 detik */
      return new Promise((rs) => {
        let done = false; const hs = [];
        const pick = (a) => { if (done) return; done = true; hs.forEach((h) => h.remove()); SU.bubbleExtra(''); SU.hideBubble(); rs(a); };
        ex.querySelectorAll('button[data-a]').forEach((b) => { if (SU.nui) hs.push(SU.nui.add(b, { ms: 1000, onFire: () => pick(b.dataset.a) })); else b.addEventListener('click', () => pick(b.dataset.a)); });
        S.offs.push(() => hs.forEach((h) => h.remove()));
        S.skipP.then(() => pick('win'));
      });
    },
  });

  /* win: confetti, Thinman hops at the signpost, Momo summarises (repo summary copy), thumb to go on */
  SU.winScene = (L) => ({
    id: 'menang', label: `Level ${L} · Selesai`, hint: 'Cubit dan tahan di mana aja (atau tahan Enter)',
    async run(S, { placed, rec }) {
      const Gm = SU.GEO[L], root = S.root, lv = SU.LV[L]; rec.result = 'menang';
      root.innerHTML = W.html(L, `<div class="hud bc gs"><span class="k-chip good">${L < 3 ? `Level ${L + 1} terbuka` : 'Pusat Halaman terbuka'}</span></div>`);
      const world = SU.Q('world'), act = SU.Q('act');
      W.addObjs(act, placed); placed.forEach((o) => { o.el.classList.add('still'); });
      const hero = W.Hero(act, Gm.goal[0] - 30, Gm.goal[1]); hero.update({ vx: 0, vy: 0, on: true, face: 1 }, .016, 'win');
      S.tls.push(G.from(world, { opacity: 0, duration: .5 }), S.in(root.querySelectorAll('.gs'), { delay: .3 }));
      const rig = SU.thinRig(hero); if (rig.mount()) { rig.idle(); rig.cheer(); } S.offs.push(() => rig.kill());
      S.offs.push(SU.gazeAt(() => hero.el));
      const cols = ['#ef7a37', '#f0d487', '#c8d9a4', '#4a8c1f', '#111'];
      for (let k = 0; k < 30; k++) {
        const s = document.createElement('i'); s.className = 'spark'; s.style.left = W.SX(Gm.goal[0]) + '%'; s.style.top = W.SY(Gm.goal[1] - 30) + '%'; s.style.background = cols[k % cols.length]; act.appendChild(s);
        G.fromTo(s, { x: 0, y: 0, opacity: 1, rotation: 0, scale: 1 }, { x: (Math.random() - .5) * 360, y: -80 - Math.random() * 180, rotation: Math.random() * 540, opacity: 0, scale: .6, duration: 1.3 + Math.random() * .6, ease: 'power2.out', delay: Math.random() * .3 });
      }
      await SU.momoTo('side', 800); SU.momo().express('Bangga');
      await S.say(lv.win.map(fmt).concat([L < 3 ? `Level ${L + 1} sudah kebuka!` : 'Semua level selesai!']), 'Bangga');
      await S.sleep(400); await S.ring('Lanjut', 1000);
      rig.kill();
    },
  });
})();
