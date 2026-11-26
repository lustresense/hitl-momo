/* Level data. Copy comes from the repo (src/domain/levels.ts, world-intro-script.ts, mission-config.ts);
   geometry is in stage source units (art viewBox 490 x 325), same as src/game/stage-geometry.ts. */
(function () {
  'use strict';
  const SU = (window.SU = window.SU || {});

  /* platforms [x, y(top), w, h]; hazards; spawn / goal feet; size limits of a student's object */
  const GEO = (() => {
    const g = {
      1: { plat: [[0, 196, 154, 129], [358, 192, 132, 133]], haz: [], spawn: [42, 196], goal: [458, 192], lim: { maxW: 60, maxH: 36, minW: 24, minH: 6 } },
      2: { plat: [[40, 190, 74, 12], [44, 202, 66, 123], [146, 130, 74, 10], [150, 140, 66, 185], [170, 116, 28, 16], [254, 190, 60, 9], [334, 130, 94, 10], [340, 140, 82, 185], [82, 262, 68, 9], [300, 86, 56, 9]], haz: [], spawn: [77, 190], goal: [379, 66], lim: { maxW: 50, maxH: 36, minW: 24, minH: 6 } },
      3: { plat: [[0, 198, 130, 127], [362, 160, 128, 165], [184, 262, 66, 30], [204, 150, 76, 9], [304, 212, 52, 9]], haz: [[130, 278, 238, 47]], spawn: [48, 198], goal: [436, 160], lim: { maxW: 80, maxH: 36, minW: 24, minH: 6 } },
    };
    /* the pyramid roof of the tower is a staircase of thin slabs */
    for (let top = 62; top < 130; top += 2) {
      const bottom = top + 2, left = 330 + (130 - bottom) * 48 / 68, right = 432 - (130 - bottom) * 54 / 68;
      g[2].plat.push([left, top, right - left, 2]);
    }
    for (const k of [1, 2, 3]) { const [gx, gy] = g[k].goal; g[k].goalRect = [gx - 7.35, gy - 14.7, 14.7, 14.7]; }
    return g;
  })();

  const TO_SKY = 'Yuk kita ke langit, tempat kamu menggambar!';
  const LV = {
    1: {
      title: 'Level 1 · Jembatan Pertama', name: 'Halaman yang Sobek', minDrawings: 2,
      map: { papan: 'solid', balok: 'solid', tangga: 'solid', batu: 'danger' }, vocab: ['papan', 'batu', 'tangga', 'balok'], cat: ['Balok', 'Papan', 'Batu', 'Tangga'],
      mission: ['Bantu {c} menyeberang!', 'Di depan ada celah. Gambar benda yang menurutmu bisa membantu {c} mencapai seberang.'],
      story: ['Ini dunia {c}. Dia harus sampai ke papan petunjuk di seberang.', 'Kalau berhasil, dia bisa jalan sendiri tanpa bantuanmu.', 'Tapi ada celah di depan.'],
      focus: ['thinman', 'thinman', 'ahead'],
      nudge: ['Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.', '{c} butuh pijakan buat nyebrang. Kamu mau gambar pijakannya di langit?', TO_SKY],
      win: ['Kamu berhasil membuat jalur untuk {c} menyeberangi celah!', 'AI hanya menebak. Kamu yang memutuskan.'],
    },
    2: {
      title: 'Level 2 · Menara Lipatan', name: 'Menara Lipatan', minDrawings: 2,
      map: { papan: 'solid', balok: 'solid', tangga: 'solid', duri: 'danger' }, vocab: ['papan', 'balok', 'duri', 'tangga'], cat: ['Papan', 'Balok', 'Duri', 'Tangga'],
      mission: ['Bantu {c} naik lebih tinggi!', 'Pikirkan posisi dan bentuk benda yang dapat membantu {c} mencapai platform atas.'],
      story: ['Halaman ini terlipat ke atas. {c} harus naik sampai dataran paling tinggi.', 'Setelah sampai, dia bisa jalan sendiri tanpa bantuanmu.', 'Dia butuh pijakan buat naik.'],
      focus: ['thinman', 'thinman', 'ahead'],
      nudge: ['Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.', '{c} butuh pijakan buat naik. Kamu mau gambar pijakannya di langit?', TO_SKY],
      win: ['Kamu berhasil menemukan jalan ke halaman atas!', 'Bandingkan ketiga tebakan. Persen tinggi belum tentu benar.'],
    },
    3: {
      title: 'Level 3 · Lorong Kabut Penghapus', name: 'Lorong Kabut Penghapus', minDrawings: 2,
      map: { tali: 'danger', papan: 'solid', tangga: 'solid', ember: 'solid' }, vocab: ['papan', 'tali', 'tangga', 'ember'], cat: ['Papan', 'Tali', 'Tangga', 'Ember'],
      mission: ['Bantu {c} memilih jalan aman!', 'Perhatikan rintangan di depan, lalu gambar benda yang menurutmu aman dan berguna untuk {c}.'],
      story: ['Lorong ini berkabut dan lantainya penuh duri.', '{c} harus keluar sampai ke papan petunjuk.', 'Kalau selamat, dia bisa jalan sendiri tanpa bantuanmu.', 'Pilih benda yang aman buat dia.'],
      focus: ['ahead', 'thinman', 'thinman', 'ahead'],
      nudge: ['Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu.', 'Lantainya penuh duri. Kamu mau gambar benda yang aman buat {c} di langit?', TO_SKY],
      win: ['Kamu berhasil keluar dari Lorong Kabut!', 'Persen tinggi tidak menjamin benar. Periksa gambar dan akibatnya.'],
    },
  };

  /* Momo's guess is a demo heuristic on the drawing's shape (the real model is the partner's). Labelled as such in the UI. */
  function feats(strokes) {
    const b = SU.bboxOf(strokes); let turns = 0, pts = 0;
    for (const s of strokes) {
      let pa = null;
      for (let i = 2; i < s.length; i += 3) {
        const a = s[i - 2], c = s[i], ang = Math.atan2(c.y - a.y, c.x - a.x);
        if (pa !== null) { let d = Math.abs(ang - pa); if (d > Math.PI) d = 2 * Math.PI - d; if (d > 1.0) turns++; }
        pa = ang; pts++;
      }
    }
    return { aspect: b.w / Math.max(b.h, 1), zig: turns / Math.max(pts, 1) };
  }
  function guessFor(L, strokes) {
    const f = feats(strokes); let o;
    if (L === 1) o = f.aspect > 2.4 ? ['papan', 'balok', 'tangga'] : f.aspect < .55 ? ['tangga', 'balok', 'papan'] : (f.aspect > .7 && f.aspect < 1.4 && f.zig > .12) ? ['batu', 'balok', 'papan'] : ['balok', 'papan', 'tangga'];
    else if (L === 2) o = f.zig > .22 ? ['duri', 'papan', 'tangga'] : f.aspect > 2.2 ? ['papan', 'balok', 'tangga'] : f.aspect < .6 ? ['tangga', 'papan', 'balok'] : ['balok', 'papan', 'tangga'];
    else o = f.aspect > 2 ? ['tali', 'papan', 'tangga'] : f.aspect < .6 ? ['tangga', 'papan', 'tali'] : ['papan', 'tangga', 'tali'];
    const base = [[.62, .24, .09], [.55, .27, .12], [.67, .2, .08]][(Math.round(f.aspect * 7) + L) % 3];
    return o.map((l, i) => ({ label: l, pct: Math.round(base[i] * 100) }));
  }
  const nameOf = (l) => l.charAt(0).toUpperCase() + l.slice(1);
  const fmt = (t) => t.replace(/\{c\}/g, SU.CHAR);

  Object.assign(SU, { GEO, LV, guessFor, nameOf, fmt });
})();
