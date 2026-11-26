/* r5: gradien lembut untuk Momo dan pita (nuansa "objek pastel" ala Polo Factory). Warna = tint/shade dari token repo. Tanpa ini fill jatuh ke warna datar lama (lihat fallback di lc.css). */
(function () {
  'use strict';
  function add() {
    if (document.getElementById('lc-defs') || !document.body) return;
    var g = function (id, x1, y1, x2, y2, stops) {
      return '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '">' +
        stops.map(function (s) { return '<stop offset="' + s[0] + '" stop-color="' + s[1] + '"/>'; }).join('') + '</linearGradient>';
    };
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.id = 'lc-defs'; s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('aria-hidden', 'true');
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    s.innerHTML = '<defs>' +
      g('lc-body', .2, 0, .8, 1, [[0, '#e3f4d2'], [.5, '#bfe0a1'], [1, '#9ccb78']]) +
      g('lc-wing', 0, 0, 1, 1, [[0, '#f0925a'], [.55, '#e4551b'], [1, '#c9481a']]) +
      g('lc-rib-or', 0, 0, 0, 1, [[0, '#f39a64'], [.5, '#ef7a37'], [1, '#e0672a']]) +
      g('lc-rib-gr', 0, 0, 0, 1, [[0, '#93cc63'], [.5, '#7fbf4a'], [1, '#6aab38']]) +
      g('lc-rib-lk', 0, 0, 0, 1, [[0, '#ddd8cb'], [.5, '#cfc9bb'], [1, '#bdb6a5']]) +
      '</defs>';
    document.body.appendChild(s);

    /* r8.3 perf: the same paper grain (feTurbulence, same numbers), but as a small tile the browser rasterises once and repeats, without
       mix-blend-mode. The old full-screen live filter + multiply cost about 35-40% of a CPU core on every page (measured, Chrome, no GPU). */
    if (!document.getElementById('lc-paper-overlay')) {
      var ov = document.createElement('div');
      ov.id = 'lc-paper-overlay';
      ov.setAttribute('aria-hidden', 'true');
      var tile = "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='g' x='0' y='0' width='100%' height='100%'>" +
        "<feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/>" +
        "<feColorMatrix type='matrix' values='0 0 0 0 0.18   0 0 0 0 0.13   0 0 0 0 0.08   0 0 0 0.36 0'/></filter>" +
        "<rect width='256' height='256' filter='url(#g)' fill='#fff'/></svg>";
      ov.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;opacity:0.32;overflow:hidden;' +
        'background-image:url("data:image/svg+xml,' + encodeURIComponent(tile) + '");background-size:256px 256px;background-repeat:repeat;';
      document.body.appendChild(ov);
    }
  }
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
