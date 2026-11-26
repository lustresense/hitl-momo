/* The recap, in Momo's chat (the same look as the camera gate): a bubble with her words, a dashed card with a small-caps label, the drawings
   that the student made flying in from the left one by one (stage 1 first), then her counts and the thumb "Lanjut" inside the bubble.
   Display only: nothing here changes a decision or a number. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const G = window.gsap, { esc, nameOf } = SU;

  const slotHtml = (r, pathOf) => {
    const d = r.strokes && r.strokes.length ? pathOf(r.strokes, 120, 80) : '';
    return `<span class="rc-chap">${esc(r.title)}</span>${d ? `<svg class="rc-art" viewBox="0 0 120 80" aria-hidden="true"><path d="${d}" fill="none" stroke="#1e2126" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>` : '<span class="rc-art"></span>'}<span class="rc-name">${esc(nameOf(r.final))}</span>`;
  };

  /* returns when the student has confirmed "Lanjut" */
  SU.endRecap = async (S, { rows, sample, pathOf, counts, lines }) => {
    const ex = SU.bubbleExtra(`<div class="rc"><span class="rc-label">Rekap tebakan</span>${sample ? '<span class="k-chip warn rc-sample">Data contoh: kamu belum main level ini</span>' : ''}<div class="rc-slots">${rows.map((r) => `<div class="rc-slot rc-slot--${r.cat}"></div>`).join('')}</div><div class="rc-foot"></div></div>`);
    /* many drawings: smaller slots so the bubble still fits above Momo */
    const bub = SU.Q('su-bubble'), room = () => SU.momo().el.getBoundingClientRect().top - 30;
    await S.sleep(S.skipped ? 0 : 120); if (bub.offsetHeight > room()) ex.querySelector('.rc').classList.add('compact');
    await S.say(lines.intro, 'Senang');
    await S.sleep(500);
    const slots = [...ex.querySelectorAll('.rc-slot')];
    for (let i = 0; i < rows.length && !S.skipped; i++) {
      const r = slots[i].getBoundingClientRect(), f = document.createElement('div');
      f.className = 'rc-slot rc-fly'; f.innerHTML = slotHtml(rows[i], pathOf);
      f.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:50`; document.body.appendChild(f);
      G.fromTo(f, { x: -(r.left + r.width + 60), y: 26 - (i % 3) * 22, rotation: -14, opacity: 1 }, { x: 0, y: 0, rotation: 0, duration: .75, ease: 'back.out(1.2)',
        onComplete: () => { slots[i].innerHTML = slotHtml(rows[i], pathOf); slots[i].classList.add('on'); f.remove(); } });
      await S.sleep(430);
    }
    await S.sleep(S.skipped ? 0 : 750);
    slots.forEach((s, i) => { if (!s.classList.contains('on')) { s.innerHTML = slotHtml(rows[i], pathOf); s.classList.add('on'); } }); document.querySelectorAll('.rc-fly').forEach((e) => e.remove());
    await S.say([lines.counts(counts)], 'Bangga');
    await S.sleep(600);
    const foot = ex.querySelector('.rc-foot'), el = document.createElement('div'); el.className = 'thumb-confirm rc-ring'; el.setAttribute('role', 'progressbar'); el.tabIndex = 0; el.innerHTML = SU.ringMarkup('Lanjut'); foot.appendChild(el);
    G.from(el, { opacity: 0, y: 10, duration: .4, ease: 'back.out(1.7)' });
    const ring = SU.makeRing(el); await S.until(ring.open('Lanjut', 1000)); ring.close();
    SU.bubbleExtra('');
  };
})();
