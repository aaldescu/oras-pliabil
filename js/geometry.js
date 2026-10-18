// Geometrie 2D: proiecție, simplificare, forme de clădiri.
// Toate poligoanele sunt liste de puncte [x, y] în metri, x = est, y = nord, sens trigonometric (CCW).

export const FLOOR_H = 3.2;

export function projectLatLngs(latlngs, origin) {
  const lat0 = origin ? origin[0] : latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
  const lng0 = origin ? origin[1] : latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110540;
  return latlngs.map(([lat, lng]) => [(lng - lng0) * kx, (lat - lat0) * ky]);
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function ensureCCW(pts) {
  return signedArea(pts) < 0 ? pts.slice().reverse() : pts.slice();
}

export function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function centroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const b = bbox(pts);
    return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function perimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) p += dist(pts[i], pts[(i + 1) % pts.length]);
  return p;
}

function cross(o, a, b) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

export function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > 0.05) out.push([p[0], p[1]]);
  }
  if (out.length > 1 && dist(out[0], out[out.length - 1]) <= 0.05) out.pop();
  return out;
}

// Visvalingam–Whyatt: scoate pe rând colțul care contează cel mai puțin.
export function simplify(pts, maxN, minRelArea = 0.01) {
  let p = cleanRing(pts);
  const total = Math.abs(signedArea(p)) || 1;
  const per = perimeter(p) || 1;
  const effArea = (i) => {
    const n = p.length;
    return Math.abs(cross(p[(i - 1 + n) % n], p[i], p[(i + 1) % n])) / 2;
  };
  while (p.length > 3) {
    const n = p.length;
    let best = -1, bestA = Infinity;
    for (let i = 0; i < n; i++) {
      const a = effArea(i);
      if (a < bestA) { bestA = a; best = i; }
    }
    // pereți foarte scurți sunt greu de tăiat: îi scoatem și pe ei
    let shortIdx = -1;
    for (let i = 0; i < n && n > 4; i++) {
      const prev = p[(i - 1 + n) % n];
      if (dist(prev, p[i]) < per * 0.035) { shortIdx = i; break; }
    }
    if (n > maxN || bestA < total * minRelArea) p.splice(best, 1);
    else if (shortIdx >= 0) p.splice(shortIdx, 1);
    else break;
  }
  return p;
}

export function removeCollinear(pts, tolDeg = 6) {
  let p = pts.slice();
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const n = p.length;
      const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
      const ang = Math.abs(turnAngle([b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]));
      if (ang < (tolDeg * Math.PI) / 180) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}

export function turnAngle(d1, d2) {
  return Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
}

export function convexHull(pts) {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const lower = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// Cel mai mic dreptunghi care cuprinde forma; primul perete e cel lung.
export function minAreaRect(pts) {
  const hull = convexHull(pts);
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    const rot = hull.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const bb = bbox(rot);
    const area = bb.w * bb.h;
    if (!best || area < best.area) best = { area, ang, bb };
  }
  if (!best) return pts;
  let { ang, bb } = best;
  if (bb.h > bb.w) {
    // rotim cu 90° ca latura lungă să fie prima
    ang += Math.PI / 2;
    bb = { minX: bb.minY, maxX: bb.maxY, minY: -bb.maxX, maxY: -bb.minX, w: bb.h, h: bb.w };
  }
  const c = Math.cos(ang), s = Math.sin(ang);
  const corners = [
    [bb.minX, bb.minY], [bb.maxX, bb.minY], [bb.maxX, bb.maxY], [bb.minX, bb.maxY],
  ];
  return corners.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function segIntersect(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function isSimple(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function isStarFrom(pts, c) {
  for (let i = 0; i < pts.length; i++) {
    if (cross(c, pts[i], pts[(i + 1) % pts.length]) <= 1e-6) return false;
  }
  return true;
}

export const DIFFICULTY = {
  usor: { label: 'Ușor', maxN: 4 },
  mediu: { label: 'Mediu', maxN: 8 },
  expert: { label: 'Expert', maxN: 14 },
};

// Forma finală a clădirii, gata de desfășurat: puncte centrate, înălțime, acoperiș.
export function buildingShape(b) {
  const st = b.style;
  const H = Math.max(2.5, st.levels * FLOOR_H);
  let pts;
  const raw = ensureCCW(cleanRing(b.footprint));
  let rect = st.difficulty === 'usor' || st.roof === 'gable' || raw.length < 3;
  if (!rect) {
    pts = removeCollinear(simplify(raw, DIFFICULTY[st.difficulty]?.maxN ?? 8));
    pts = ensureCCW(pts);
    if (pts.length < 3 || !isSimple(pts)) rect = true;
  }
  if (rect) pts = ensureCCW(minAreaRect(raw.length >= 3 ? raw : [[0, 0], [10, 0], [10, 8], [0, 8]]));
  if (rect && st.roof === 'gable' && dist(pts[0], pts[1]) < dist(pts[1], pts[2])) {
    pts = [pts[1], pts[2], pts[3], pts[0]];
  }
  const bb = bbox(pts);
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  pts = pts.map(([x, y]) => [x - cx, y - cy]);

  let roof = st.roof;
  const cen = centroid(pts);
  if (roof === 'gable' && pts.length !== 4) roof = 'flat';
  if (roof === 'pyramid' && !isStarFrom(pts, cen)) roof = 'flat';
  const minDim = Math.min(bb.w, bb.h);
  let rise = 0;
  if (roof === 'gable') rise = (dist(pts[1], pts[2]) / 2) * st.pitch;
  if (roof === 'pyramid') rise = (minDim / 2) * st.pitch;
  return { pts, H, roof, rise, apex: cen, levels: st.levels, center: [cx, cy] };
}

export function roofOptions(b) {
  const raw = ensureCCW(cleanRing(b.footprint));
  const s = buildingShape({ ...b, style: { ...b.style, roof: 'pyramid' } });
  return { flat: true, gable: raw.length >= 3, pyramid: s.roof === 'pyramid' };
}
