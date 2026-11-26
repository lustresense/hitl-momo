/* A student's drawing as a body: the collider is the drawing itself, not a box around it.
   - the strokes are scaled uniformly (aspect kept) into the level's size limit;
   - every stroke is T thick (the same T the picture is drawn with);
   - what the strokes enclose is solid (closed loops, also when drawn with several strokes): found by flood-filling the outside;
   - the result is a short list of rectangles per rotation, which is what the physics tests against.
   Pure (no DOM), also used by the Node tests. Units: stage source units, object-local, origin at the centre of the drawing. */
(function () {
  'use strict';
  const SU = (typeof window !== 'undefined' ? (window.SU = window.SU || {}) : (global.SU = global.SU || {}));

  const T = 3.2, CELL = .5;

  function raster(o, rot) {
    const a = (rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const half = Math.hypot(o.w, o.h) / 2 + 2, n = Math.ceil(2 * half / CELL) + 2, g = new Uint8Array(n * n);
    const toCell = (p) => { const x = (p.x - o.cx) * o.sc, y = (p.y - o.cy) * o.sc; return [((x * ca - y * sa) + half) / CELL, ((x * sa + y * ca) + half) / CELL]; };
    const rad = T / 2 / CELL, r2 = rad * rad;
    const stamp = (ax, ay, bx, by) => {
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rad)), x1 = Math.min(n - 1, Math.ceil(Math.max(ax, bx) + rad));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rad)), y1 = Math.min(n - 1, Math.ceil(Math.max(ay, by) + rad));
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
        const px = i + .5 - ax, py = j + .5 - ay, t = l2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / l2)) : 0, ex = px - t * dx, ey = py - t * dy;
        if (ex * ex + ey * ey <= r2) g[j * n + i] = 1;
      }
    };
    for (const s of o.strokes) {
      if (!s.length) continue;
      let p = toCell(s[0]); if (s.length === 1) stamp(p[0], p[1], p[0], p[1]);
      for (let k = 1; k < s.length; k++) { const q = toCell(s[k]); stamp(p[0], p[1], q[0], q[1]); p = q; }
    }
    /* the outside = empty cells reachable from the border; everything else (ink and the inside of closed shapes) is solid */
    const out = new Uint8Array(n * n), st = [];
    const push = (i, j) => { if (i >= 0 && j >= 0 && i < n && j < n && !g[j * n + i] && !out[j * n + i]) { out[j * n + i] = 1; st.push(i, j); } };
    for (let i = 0; i < n; i++) { push(i, 0); push(i, n - 1); push(0, i); push(n - 1, i); }
    while (st.length) { const j = st.pop(), i = st.pop(); push(i + 1, j); push(i - 1, j); push(i, j + 1); push(i, j - 1); }
    const rects = []; let open = new Map();
    for (let j = 0; j < n; j++) {
      const next = new Map(); let i = 0;
      while (i < n) {
        if (out[j * n + i]) { i++; continue; }
        const i0 = i; while (i < n && !out[j * n + i]) i++;
        const key = i0 + ',' + i, r = open.get(key);
        if (r) { r[3] += CELL; next.set(key, r); } else { const nr = [i0 * CELL - half, j * CELL - half, (i - i0) * CELL, CELL]; rects.push(nr); next.set(key, nr); }
      }
      open = next;
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const r of rects) { x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0] + r[2]); y1 = Math.max(y1, r[1] + r[3]); }
    return { rects, bb: rects.length ? [x0, y0, x1, y1] : [-T / 2, -T / 2, T / 2, T / 2] };
  }

  /* cached per rotation on the object */
  const get = (o) => { const k = Math.round(o.rot || 0) % 360; if (!o._sh || o._sh.k !== k) { o._sh = raster(o, k); o._sh.k = k; } return o._sh; };
  const world = (o) => { const s = get(o); return s.rects.map((r) => [o.x + r[0], o.y + r[1], r[2], r[3]]); };
  const aabb = (o) => { const b = get(o).bb; return [o.x + b[0], o.y + b[1], b[2] - b[0], b[3] - b[1]]; };
  /* unrotated solid, for the faint tint the picture shows inside closed shapes */
  const flat = (o) => { if (!o._sh0) o._sh0 = raster(o, 0); return o._sh0.rects; };

  SU.shape = { T, CELL, raster, get, world, aabb, flat };
})();
