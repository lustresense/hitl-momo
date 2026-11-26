/* Level select: three bookmarks hang from the spiral binding. Ported from src/components/level/LevelRibbonBookmark.tsx.
   open = orange, ready to pull; done = green with a check; locked = grey, short, with a padlock.
   Pull a ribbon down by its ring (mouse drag): it "clicks" every notch (tek, tek); past the 4th notch the ring turns green and on release
   the ribbon bounces up and the book opens. Click / Enter pulls by itself; keys 1 2 3 stand in for the finger rings.
   The thumb under the next ribbon is a 2 s confirm. A stage that a win has just unlocked breaks its lock when the page opens. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { clamp, esc, GL } = SU;

  const NOTCH_PX = 38, NOTCHES_TO_ARM = 4, PULL_MAX = 230, LOCK_RESIST = .07, LOCK_MAX = 12, TAIL = 44, SHADOW = 7;
  const MIN_RIBBON_W = 84, THUMB_PILL_W = 124, NARROW_RIBBON_W = 120, PAGE_GUTTER = 16, NOTCH_ROOM = 14;
  const STAGES = [{ stage: 1, name: 'Halaman yang Sobek' }, { stage: 2, name: 'Menara Lipatan' }, { stage: 3, name: 'Lorong Kabut Penghapus' }];

  const shelfGap = (w) => (w <= 600 ? 14 : Math.min(76, Math.max(26, w * .05)));
  function shelfLayout(count, vw, vh) {
    const gap = shelfGap(vw), room = vw - 2 * PAGE_GUTTER - 2 * NOTCH_ROOM;
    const widestInRow = (n) => { const budget = room - gap * (n - 1) - SHADOW * n; return Math.floor(Math.min(budget / n, (budget - THUMB_PILL_W) / Math.max(1, n - 1))); };
    const perRow = widestInRow(count) >= MIN_RIBBON_W ? count : Math.min(count, 2);
    const rows = Math.ceil(count / perRow);
    /* sandbox: on short desktop windows the ribbon also leaves room for the thumb pill and the footer (no page scroll) */
    const h = Math.round(rows > 1 ? clamp(vh * .42, 250, 330) : Math.max(250, Math.min(clamp(vh * .58, 290, 470), vh - 450)));
    return { w: Math.round(Math.min(184, h * .4, widestInRow(perRow))), h, perRow };
  }
  /* r8.3: ikon set Owner (koleksi_ikon_pure_svg.html) menggantikan ikon lama halaman ini; ICO lama dipakai kalau icons.js tidak termuat */
  const OWN = () => (SU.icon ? { lock: SU.icon('lock', 24), check: SU.icon('check', 26), play: SU.icon('play', 22), down: SU.icon('pull-down', 20), pull: SU.icon('pull-down', 22), star: SU.icon('star', 22) } : {});
  const outerPath = (w, l) => `M3 3H${w - 3}V${l - 3}L${w / 2} ${l - 3 - TAIL}L3 ${l - 3}Z`;
  const stitchPath = (w, l) => `M15 15H${w - 15}V${l - 15}L${w / 2} ${l - 15 - TAIL + 9}L15 ${l - 15}Z`;

  const ICO = {
    lock: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M8 5l11 7-11 7z"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    pull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v13M6 12l6 6 6-6"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"><path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 17l-5.6 3 1.3-6.2L3 9.5l6.3-.7z"/></svg>',
  };
  Object.assign(ICO, OWN());

  SU.babScene = SU.levelScene = () => ({
    id: 'bab', label: 'Pilih level', hint: 'Dekatkan tangan ke pita (yang dekat menyala) · cubit lalu tarik ke bawah = mulai level',
    async run(S) {
      const root = S.root, st = SU.state.get(), done = new Set(st.done || []), unlocked = st.unlocked || 1;
      const fresh = st.fresh || null;                          /* the stage a win has just unlocked */
      const isOpen = (n) => n <= unlocked;
      const next = STAGES.map((s) => s.stage).find((n) => isOpen(n) && !done.has(n)) || null;
      const allDone = STAGES.every((s) => done.has(s.stage));
      let dims = shelfLayout(3, innerWidth, innerHeight);
      let revealed = fresh === null, launching = false;

      root.innerHTML = `<section class="level-ribbon-page bm-page" aria-label="Pilih level cerita"><div class="bm-logo-slot" aria-hidden="true"></div>
        <div class="bm-binding" aria-hidden="true">${Array.from({ length: 28 }, () => '<i></i>').join('')}</div>
        <div class="bm-shelf level-list" role="group" aria-label="Daftar level" style="flex-wrap:wrap;row-gap:24px"></div>
        <div class="bm-foot"><h2 class="bm-title">${allDone ? ICO.star : ICO.pull}${allDone ? 'Semua level selesai' : 'Pilih level'}</h2><div class="bm-status" role="status" aria-live="polite"></div></div></section>`;
      const shelf = root.querySelector('.bm-shelf'), statusEl = root.querySelector('.bm-status');
      const flash = (text) => { statusEl.innerHTML = `<span class="k-chip">${ICO.lock.replace('width="24" height="24"', 'width="14" height="14"')}${esc(text)}</span>`; G.fromTo(statusEl.firstChild, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: .3 }); clearTimeout(flash.t); flash.t = setTimeout(() => { statusEl.innerHTML = ''; }, 2400); };

      const slots = STAGES.map((lv) => {
        const open = isOpen(lv.stage), isFresh = fresh === lv.stage, locked = !open || (isFresh && !revealed);
        const state = locked ? 'locked' : done.has(lv.stage) ? 'done' : 'open';
        const slot = document.createElement('div'); slot.className = `bm-slot bm-${state}${!locked && next === lv.stage ? ' is-next' : ''}`; slot.dataset.stage = lv.stage;
        slot.innerHTML = `<span class="bm-ring-clip" aria-hidden="true"></span>
          <button type="button" class="bm-ribbon level-card ${locked ? 'is-locked' : 'is-playable'}" data-state="${state}" aria-label="Level ${lv.stage}, ${esc(lv.name)}${locked ? ', terkunci' : state === 'done' ? ', sudah selesai' : ''}">
            <span class="bm-body"><svg class="bm-shape" aria-hidden="true" focusable="false"><path class="bm-outer bm-outer--shadow"/><path class="bm-outer bm-outer--body"/><path class="bm-stitch"/></svg>
            <span class="bm-content"><span class="bm-tag">Level</span><span class="bm-number">${lv.stage}</span><span class="bm-name">${esc(lv.name)}</span><span class="bm-badge" aria-hidden="true">${locked ? ICO.lock : state === 'done' ? ICO.check : ICO.play}</span></span>
            <span class="bm-ring" aria-hidden="true">${ICO.down}</span><span class="bm-notches" aria-hidden="true">${Array.from({ length: NOTCHES_TO_ARM }, () => '<i></i>').join('')}</span></span>
          </button>`;
        shelf.appendChild(slot);
        return { lv, slot, btn: slot.querySelector('.bm-ribbon'), state, locked, len: { length: 0 }, rest: 0 };
      });

      const paint = (s, length) => {
        s.len.length = length; s.btn.style.setProperty('--bm-len', length + 'px');
        const svg = s.btn.querySelector('.bm-shape'), w = dims.w;
        svg.setAttribute('width', w + SHADOW); svg.setAttribute('viewBox', `0 0 ${w + SHADOW} ${length + SHADOW}`); svg.setAttribute('height', length + SHADOW);
        svg.querySelectorAll('.bm-outer').forEach((p) => p.setAttribute('d', outerPath(w, length)));
        svg.querySelector('.bm-outer--shadow').setAttribute('transform', `translate(${SHADOW} ${SHADOW})`);
        svg.querySelector('.bm-stitch').setAttribute('d', stitchPath(w, length));
      };
      const size = () => {
        dims = shelfLayout(3, innerWidth, innerHeight);
        slots.forEach((s) => {
          s.rest = s.locked ? Math.round(dims.h * .66) : dims.h; s.btn.style.width = dims.w + 'px'; s.btn.style.setProperty('--bm-w', dims.w + 'px');
          s.btn.querySelector('.bm-name').style.maxWidth = dims.w < NARROW_RIBBON_W ? (dims.w - 8) + 'px' : '';
          G.killTweensOf(s.len); paint(s, s.rest);
        });
      };
      size(); SU.onResize = () => { if (!launching) size(); };

      /* the lock breaks: shackle jolt, the ribbon unrolls with a spring */
      const unlockAnim = (s) => {
        const tl = G.timeline(); S.tls.push(tl);
        tl.to(s.btn, { x: -6, duration: .06 }).to(s.btn, { x: 6, duration: .07 }).to(s.btn, { x: -4, duration: .06 }).to(s.btn, { x: 0, duration: .06 });
        s.slot.classList.add('is-unlocking');
        paint(s, Math.round(dims.h * .66)); G.to(s.len, { length: dims.h, duration: .9, ease: 'elastic.out(1, 0.45)', onUpdate: () => paint(s, s.len.length) });
      };

      const launch = (s) => {
        if (launching) return; launching = true;
        const tl = G.timeline(); S.tls.push(tl); G.killTweensOf(s.len);
        tl.to(s.len, { length: s.rest + 24, duration: .12, ease: 'power2.out', onUpdate: () => paint(s, s.len.length) })
          .to(s.len, { length: s.rest, duration: .18, ease: 'power1.in', onUpdate: () => paint(s, s.len.length) });
        tl.fromTo(s.btn, { y: 0 }, { y: -Math.round(dims.h * .22), duration: .42, ease: 'back.out(2.2)' }, .12).to(s.btn, { y: 0, duration: .5, ease: 'bounce.out' }, .62);
        tl.add(() => { SU.hideBubble(); finish(s.lv.stage); }, .5);
      };
      let finish; const chosen = new Promise((r) => (finish = r));
      const autoPull = (s) => {
        if (launching) return; G.killTweensOf(s.len); let ticked = 0;
        G.to(s.len, { length: s.rest + NOTCHES_TO_ARM * NOTCH_PX, duration: .42, ease: 'power1.inOut', onUpdate: () => { paint(s, s.len.length); const n = Math.floor((s.len.length - s.rest) / NOTCH_PX); if (n > ticked) ticked = n; }, onComplete: () => launch(s) });
      };
      const tug = (s) => { flash(s.lv.stage > 1 ? `Selesaikan Level ${s.lv.stage - 1} dulu` : 'Belum bisa dipilih'); G.timeline().to(s.btn, { x: -7, duration: .07 }).to(s.btn, { x: 7, duration: .08 }).to(s.btn, { x: 0, duration: .07 }); };

      /* r8.3 aturan B + C: pita yang paling dekat tangan menyala; cubit di mana aja lalu tarik ke bawah = menarik pita yang menyala.
         Tarikannya sudah jadi konfirmasi, jadi tidak ada ring "Mulai Level". Klik pita / Enter / tombol 1 2 3 tetap jalan (mouse, keyboard). */
      slots.forEach((s) => {
        let drag = null, suppress = false;
        s.begin = (y, id) => {
          if (launching || drag) return; G.killTweensOf(s.len); drag = { startY: y, raw: 0, id, notch: 0, armed: false }; suppress = false; s.btn.classList.add('is-pulling');
        };
        s.move = (y, id) => {
          const d = drag; if (!d || d.id !== id) return;
          d.raw = Math.max(0, y - d.startY); if (d.raw > 4) suppress = true;
          const pull = s.locked ? Math.min(d.raw * LOCK_RESIST, LOCK_MAX) : Math.min(PULL_MAX, d.raw <= 40 ? d.raw : 40 + (d.raw - 40) * .8);
          paint(s, s.rest + pull);
          if (!s.locked) {
            const n = Math.min(NOTCHES_TO_ARM, Math.floor(d.raw / NOTCH_PX));
            if (n !== d.notch) { if (n > d.notch) G.fromTo(s.btn, { scaleX: 1.045 }, { scaleX: 1, duration: .22, ease: 'back.out(3)', transformOrigin: '50% 0%' }); d.notch = n; s.btn.dataset.notch = String(n); }
            const armed = n >= NOTCHES_TO_ARM; if (armed !== d.armed) { d.armed = armed; s.btn.classList.toggle('is-armed', armed); }
          }
        };
        s.end = (id, cancelled) => {
          const d = drag; if (!d || d.id !== id) return; drag = null;
          s.btn.classList.remove('is-pulling', 'is-armed'); delete s.btn.dataset.notch;
          if (s.locked) { G.to(s.len, { length: s.rest, duration: .5, ease: 'elastic.out(1, 0.5)', onUpdate: () => paint(s, s.len.length) }); if (!cancelled && d.raw > 6) tug(s); return; }
          if (!cancelled && d.notch >= NOTCHES_TO_ARM) launch(s);
          else G.to(s.len, { length: s.rest, duration: .9, ease: 'elastic.out(1, 0.4)', onUpdate: () => paint(s, s.len.length) });
        };
        s.btn.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return; s.begin(e.clientY, e.pointerId);
          try { s.btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        });
        s.btn.addEventListener('pointermove', (e) => s.move(e.clientY, e.pointerId));
        const endP = (e, c) => { s.end(e.pointerId, c); try { s.btn.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
        s.btn.addEventListener('pointerup', (e) => endP(e, false)); s.btn.addEventListener('pointercancel', (e) => endP(e, true));
        s.btn.addEventListener('click', () => { if (suppress) { suppress = false; return; } if (s.locked) { tug(s); return; } autoPull(s); });
        s.btn.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); if (s.locked) tug(s); else autoPull(s); });
      });
      S.on(window, 'keydown', (e) => { const n = '123'.indexOf(e.key) + 1; if (!n || e.target.closest('input,textarea')) return; const s = slots[n - 1]; if (s.locked) tug(s); else autoPull(s); });

      /* the hand lights the nearest ribbon; a pinch that does not start on a ribbon pulls the lit one */
      let lit = null, vgrab = null;
      const light = (x) => {
        if (launching || vgrab) return; let best = null, bd = 1e9;
        slots.forEach((s) => { const r = s.btn.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x); if (d < bd) { bd = d; best = s; } });
        if (best !== lit) { if (lit) lit.btn.classList.remove('nui-lit'); lit = best; if (lit) lit.btn.classList.add('nui-lit'); }
      };
      const chrome = (el) => (SU.nui ? SU.nui.isChrome(el) : false);
      S.on(window, 'pointermove', (e) => { if (vgrab) vgrab.move(e.clientY, e.pointerId); else light(e.clientX); }, true);
      S.on(window, 'pointerdown', (e) => {
        if (launching || chrome(e.target) || (e.target.closest && e.target.closest('.bm-ribbon')) || (e.pointerType === 'mouse' && e.button !== 0)) return;
        light(e.clientX); if (!lit) return; vgrab = lit; lit.begin(e.clientY, e.pointerId);
      }, true);
      const vend = (e, c) => { if (!vgrab) return; const s = vgrab; vgrab = null; s.end(e.pointerId, c); };
      S.on(window, 'pointerup', (e) => vend(e, false), true); S.on(window, 'pointercancel', (e) => vend(e, true), true);
      S.offs.push(() => { if (lit) lit.btn.classList.remove('nui-lit'); });

      S.tls.push(S.in(root.querySelectorAll('.bm-slot'), { y: -60, stagger: .12, ease: 'back.out(1.4)' }));
      await SU.momoTo('strip', 700);
      SU.momo().express('Senang');
      if (fresh) { await S.sleep(750); revealed = true; const s = slots.find((x) => x.lv.stage === fresh); if (s) { s.locked = false; s.state = 'open'; s.rest = dims.h; s.slot.classList.remove('bm-locked'); s.slot.classList.add('bm-open', 'is-next'); s.btn.classList.replace('is-locked', 'is-playable'); s.btn.dataset.state = 'open'; s.btn.querySelector('.bm-badge').innerHTML = ICO.play; unlockAnim(s); } SU.state.set({ fresh: null }); }
      SU.say1(fresh ? `Level ${fresh} sudah kebuka! Dekatkan tangan ke pitanya, lalu cubit dan tarik ke bawah.` : allDone ? 'Semua level sudah selesai. Hebat! Mau main lagi? Tarik salah satu pitanya.' : `Ini daftar levelnya. Dekatkan tangan ke pita **Level ${next || 1}**, lalu cubit dan tarik ke bawah.`);
      const chosenStage = await S.until(chosen);
      SU.onResize = null;
      return chosenStage || next || 1;
    },
  });
})();
