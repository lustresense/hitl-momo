/* Level run state that travels between pages, plus Momo's lines for the drawing step copied from the repo
   (src/domain/momo-script.ts, src/components/drawing/momo-cue.ts).
   Each level is two pages: levelN (the world) and canvasN (the drawing page in the sky). Everything the next page needs to build
   its FIRST frame identical to the last frame of the previous one goes through SU.handoff (sessionStorage, window.name as backup). */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});
  const KEY = 'su.handoff', NM = 'SUH:';

  const H = {
    put(o) {
      const s = JSON.stringify(Object.assign({}, o, { __t: Date.now() }));
      try { sessionStorage.setItem(KEY, s); } catch (e) { /* ignore */ }
      try { window.name = NM + s; } catch (e) { /* ignore */ }
    },
    peek() {
      let s = null;
      try { s = sessionStorage.getItem(KEY); } catch (e) { /* ignore */ }
      if (!s && String(window.name).indexOf(NM) === 0) s = window.name.slice(NM.length);
      if (!s) return null;
      try { const o = JSON.parse(s); return o && o.__t && Date.now() - o.__t > 30 * 60 * 1000 ? null : o; } catch (e) { return null; }   /* a handoff older than 30 min is from an abandoned run */
    },
    clear() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } try { window.name = ''; } catch (e) { /* ignore */ } },
  };

  /* an object as stored: the drawing and what the student decided; size/shape are derived again from the strokes on the next page */
  const pack = (o) => ({ strokes: o.strokes, label: o.label, behavior: o.behavior, x: o.x, y: o.y, rot: o.rot });
  const unpack = (L, p) => Object.assign(SU.world.toObj(L, p.strokes), { label: p.label, behavior: p.behavior, x: p.x, y: p.y, rot: p.rot });

  /* the run of one level: how many objects are placed, the records for the recap, a drawing to carry back after "Gambar lagi" */
  SU.run0 = (L) => ({ L, idx: 0, placed: [], recs: [], expr: 'Senang' });
  SU.pack = pack; SU.unpack = unpack; SU.handoff = H;
  SU.runOf = (L) => { const h = H.peek(); return h && h.L === L ? h : SU.run0(L); };
  SU.saveRun = (run, extra) => H.put(Object.assign({}, run, extra || {}));
  /* leaving a page: wait a beat so a fading bubble is gone, then go; a test can hook in right before the jump */
  SU.leaveTo = async (name, extra) => {
    if (window.__beforeNav) { try { await window.__beforeNav(); } catch (e) { /* ignore */ } }
    SU.go(name, extra);
  };

  /* ------------------------------------------------------------------ Momo's drawing-step lines (momo-script.ts / momo-cue.ts) */
  const TONES = { 1: { tone: 'confident', fog: 0, mood: 'Semangat' }, 2: { tone: 'doubtful', fog: .4, mood: 'Bingung' }, 3: { tone: 'humble', fog: .9, mood: 'Khawatir' } };
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  SU.TONE = (L) => TONES[L] || TONES[1];
  SU.MOMO_LINES = {
    cue: 'Gambar bendamu di kertas ini: cubit, tahan, lalu geser. Nanti aku coba tebak!',     /* momo-cue.ts "drawing" */
    empty: 'Kanvasnya masih kosong. Gambar sesuatu dulu ya.',    /* momo-script drawing-empty */
    predicting: 'Hmm... ini gambar apa, ya?',                    /* momo-cue.ts "predicting" */
    compare2: 'Persen bukan jaminan benar. Kamu yang memutuskan.',
  };
  SU.guessQuestion = (L, label, pct, second) => {
    switch (SU.TONE(L).tone) {
      case 'confident': return `Gampang! Ini pasti ${label}, ${pct}%. Bener gak?`;
      case 'doubtful': return second ? `${cap(label)}? Eh, atau ${second}? Kok aku jadi bingung. ${cap(label)} ${pct}%, bener gak?` : `${cap(label)}? Kok aku jadi bingung. ${pct}%, bener gak?`;
      default: return `Aku nggak bisa lihat jelas... mungkin ${label}, ${pct}%. Terserah kamu ya. Kamu yang lebih tahu.`;
    }
  };
  SU.mumble = (L, label) => {
    if (!label) return 'hmm...';
    switch (SU.TONE(L).tone) { case 'confident': return `${label}!`; case 'doubtful': return `${label}? eh...`; default: return `${label}...?`; }
  };
  /* the repo's moods that the sandbox Momo has no face for map to the nearest one she has */
  SU.MOOD_MAP = { Tenang: 'Senang', Bingung: 'Berpikir', Khawatir: 'Berpikir' };
  SU.mood = (m) => SU.MOOD_MAP[m] || m;
})();
