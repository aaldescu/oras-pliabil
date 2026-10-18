// Desfășurarea clădirii în piese plane (milimetri), gata de tipărit.
// Piesele folosesc coordonate matematice (y în sus); randarea le întoarce pe hârtie.

import { dist, turnAngle, bbox } from './geometry.js';
import { wallDecor, gableDecor, roofTiles, darken } from './decor.js';

export const TAB = 6; // adâncimea urechiușelor de lipit, mm
export const PAGE = { w: 210, h: 297, margin: 10, header: 16, footer: 12 };
export const USABLE = {
  w: PAGE.w - 2 * PAGE.margin,
  h: PAGE.h - 2 * PAGE.margin - PAGE.header - PAGE.footer,
};
const CAPTION_H = 6;

function tab(a, b, inside, depth = TAB) {
  const len = dist(a, b);
  const d = Math.min(depth, len * 0.45);
  const s = Math.min(d * 0.9, len * 0.28);
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
  let nx = -uy, ny = ux;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  if ((inside[0] - mx) * nx + (inside[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
  return {
    pts: [a, b, [b[0] - ux * s + nx * d, b[1] - uy * s + ny * d], [a[0] + ux * s + nx * d, a[1] + uy * s + ny * d]],
  };
}

function faceCenter(pts) {
  const b = bbox(pts);
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

function moveDecor(decor, x0, y0, k) {
  return decor.map((d) => ({ ...d, pts: d.pts.map(([x, y]) => [x0 + x * k, y0 + y * k]) }));
}

function edgeLabels(pts, offset = 3.5) {
  // numărul peretelui lângă fiecare latură, spre interior
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = dist(a, b);
    if (len < 4) continue;
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len; // spre stânga = spre interior (CCW)
    out.push({ p: [(a[0] + b[0]) / 2 + nx * offset, (a[1] + b[1]) / 2 + ny * offset], text: String(i + 1), size: 7, color: '#777777' });
  }
  return out;
}

export function buildNet(shape, style, k, opts = {}) {
  const { pts, H, roof, rise, levels } = shape;
  const n = pts.length;
  const Hm = H * k;
  const R = rise * k;
  const widths = pts.map((p, i) => dist(p, pts[(i + 1) % n]));
  const doorWall = widths.indexOf(Math.max(...widths));
  const isGable = (i) => roof === 'gable' && (i === 1 || i === 3);
  const reflex = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    return turnAngle([p[0] - a[0], p[1] - a[1]], [c[0] - p[0], c[1] - p[1]]) < 0;
  });
  const pieces = [];

  // --- pereții, într-una sau mai multe fâșii ---
  const maxStrip = USABLE.w - TAB - 2;
  const strips = [];
  let cur = [], curW = 0;
  for (let i = 0; i < n; i++) {
    const w = widths[i] * k;
    if (cur.length && curW + w > maxStrip) { strips.push(cur); cur = []; curW = 0; }
    cur.push(i); curW += w;
  }
  strips.push(cur);

  strips.forEach((ids, si) => {
    const piece = { kind: 'walls', faces: [], tabs: [], valley: [], texts: [] };
    let x = 0;
    ids.forEach((i, j) => {
      const w = widths[i] * k;
      const face = isGable(i)
        ? [[x, 0], [x + w, 0], [x + w, Hm], [x + w / 2, Hm + R], [x, Hm]]
        : [[x, 0], [x + w, 0], [x + w, Hm], [x, Hm]];
      let decor = wallDecor(widths[i], H, levels, style, { door: style.door && i === doorWall });
      if (isGable(i)) decor = decor.concat(gableDecor(widths[i], H, rise, style));
      const inside = faceCenter(face);
      piece.faces.push({ pts: face, fill: style.wallColor, decor: moveDecor(decor, x, 0, k), wall: i });
      if (opts.bottomTabs !== false) piece.tabs.push(tab([x, 0], [x + w, 0], inside));
      if (isGable(i)) {
        piece.tabs.push(tab([x + w, Hm], [x + w / 2, Hm + R], inside));
        piece.tabs.push(tab([x + w / 2, Hm + R], [x, Hm], inside));
      } else {
        piece.tabs.push(tab([x + w, Hm], [x, Hm], inside));
      }
      // numărul peretelui stă pe urechiușa de jos, unde nu-l acoperă ferestrele
      piece.texts.push({ p: [x + w / 2, -TAB * 0.5], text: String(i + 1), size: 7, color: '#555555' });
      if (j > 0 && reflex[i]) piece.valley.push([[x, 0], [x, Hm]]);
      x += w;
    });
    // urechiușa care închide fâșia: se lipește sub primul perete al fâșiei următoare
    const next = strips[(si + 1) % strips.length][0];
    const last = piece.faces[piece.faces.length - 1].pts;
    piece.tabs.push(tab([x, 0], [x, Hm], faceCenter(last)));
    if (reflex[next]) piece.valley.push([[x, 0], [x, Hm]]);
    piece.texts.push({ p: [x + TAB * 0.45, Hm / 2], text: `lipește sub ${next + 1}`, size: 5.5, color: '#555555', angle: 90 });
    piece.caption = strips.length > 1 ? `PEREȚI — partea ${si + 1} din ${strips.length}` : 'PEREȚI';
    pieces.push(piece);
  });

  // --- acoperișul ---
  const P = pts.map(([x, y]) => [x * k, y * k]);
  if (roof === 'gable') {
    const L = widths[0] * k;
    const S = Math.hypot((widths[1] * k) / 2, R);
    const A = [[0, 0], [L, 0], [L, S], [0, S]];
    const B = [[0, S], [L, S], [L, 2 * S], [0, 2 * S]];
    const tileColor = darken(style.roofColor, 0.3);
    const tilesA = roofTiles(widths[0], S / k, tileColor);
    const tilesB = tilesA.map((d) => ({ ...d, pts: d.pts.map(([x, y]) => [x, 2 * S / k - y]) }));
    pieces.push({
      kind: 'roof', caption: 'ACOPERIȘ — îndoaie la mijloc',
      faces: [
        { pts: A, fill: style.roofColor, decor: moveDecor(tilesA, 0, 0, k) },
        { pts: B, fill: style.roofColor, decor: moveDecor(tilesB, 0, 0, k) },
      ],
      tabs: [], valley: [],
      texts: [
        { p: [L / 2, 3.5], text: '1', size: 7, color: '#ffffff' },
        { p: [L - 3.5, S], text: '2', size: 7, color: '#ffffff' },
        { p: [L / 2, 2 * S - 3.5], text: '3', size: 7, color: '#ffffff' },
        { p: [3.5, S], text: '4', size: 7, color: '#ffffff' },
      ],
    });
  } else if (roof === 'pyramid') {
    const apex3 = [shape.apex[0] * k, shape.apex[1] * k, R];
    const rad = P.map(([x, y]) => Math.hypot(x - apex3[0], y - apex3[1], apex3[2]));
    const faces = [];
    const texts = [];
    let phi = -Math.PI / 2;
    let prev = [Math.cos(phi) * rad[0], Math.sin(phi) * rad[0]];
    const tileColor = darken(style.roofColor, 0.3);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = rad[i], b = rad[j], c = widths[i] * k;
      const ang = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b))));
      phi += ang;
      const nextP = [Math.cos(phi) * b, Math.sin(phi) * b];
      const tri = [[0, 0], prev, nextP];
      const mid = [(prev[0] + nextP[0]) / 2, (prev[1] + nextP[1]) / 2];
      const decor = [];
      for (let t = 0.25; t < 0.95; t += 0.18) {
        decor.push({ pts: [[prev[0] * t, prev[1] * t], [nextP[0] * t, nextP[1] * t]], open: true, stroke: tileColor, lw: 0.25 });
      }
      faces.push({ pts: tri, fill: style.roofColor, decor });
      texts.push({ p: [mid[0] * 0.82, mid[1] * 0.82], text: String(i + 1), size: 7, color: '#ffffff' });
      prev = nextP;
    }
    const tabs = [tab([0, 0], prev, faces[n - 1].pts[1])];
    pieces.push({ kind: 'roof', caption: 'ACOPERIȘ (piramidă)', faces, tabs, valley: [], texts });
  } else {
    pieces.push({
      kind: 'roof', caption: 'ACOPERIȘ',
      faces: [{ pts: P, fill: style.roofColor, decor: [] }],
      tabs: [], valley: [],
      texts: edgeLabels(P).map((t) => ({ ...t, color: '#ffffff' })),
    });
  }

  if (opts.base !== false) {
    pieces.push({
      kind: 'base', caption: 'BAZA (opțional)',
      faces: [{ pts: P, fill: '#eeeeee', decor: [] }],
      tabs: [], valley: [], texts: edgeLabels(P),
    });
  }
  return pieces;
}

// --- așezarea pe pagini ---

function rotPts(pts, rot) {
  return rot ? pts.map(([x, y]) => [-y, x]) : pts;
}

export function pieceBBox(piece, rot = 0) {
  const all = [];
  for (const f of piece.faces) all.push(...rotPts(f.pts, rot));
  for (const t of piece.tabs) all.push(...rotPts(t.pts, rot));
  const b = bbox(all);
  return { ...b, h: b.h + (piece.caption ? CAPTION_H : 0) };
}

export function pieceFits(piece) {
  const a = pieceBBox(piece, 0), b = pieceBBox(piece, 1);
  return (a.w <= USABLE.w && a.h <= USABLE.h) || (b.w <= USABLE.w && b.h <= USABLE.h);
}

export function netFits(pieces) {
  return pieces.every(pieceFits);
}

// Cea mai mare scară (mm pe metru) ≤ k la care toate piesele încap pe A4.
export function fitScale(shape, style, k, opts) {
  let s = k;
  for (let i = 0; i < 40; i++) {
    if (netFits(buildNet(shape, style, s, opts))) return s;
    s *= 0.92;
  }
  return s;
}

// Rafturi simple: piesele, de la cea mai înaltă, rând după rând.
export function packPieces(pieces, gap = 5) {
  const items = pieces.map((piece) => {
    let rot = 0;
    const a = pieceBBox(piece, 0), b = pieceBBox(piece, 1);
    const fitsA = a.w <= USABLE.w && a.h <= USABLE.h;
    const fitsB = b.w <= USABLE.w && b.h <= USABLE.h;
    if (!fitsA && fitsB) rot = 1;
    else if (fitsA && fitsB && a.h > a.w * 1.6 && b.h < a.h) rot = 1;
    const bb = rot ? b : a;
    return { piece, rot, w: bb.w, h: bb.h };
  });
  items.sort((p, q) => q.h - p.h);
  const pages = [];
  let page = null, x = 0, y = 0, shelfH = 0;
  const newPage = () => { page = []; pages.push(page); x = 0; y = 0; shelfH = 0; };
  newPage();
  for (const it of items) {
    if (x > 0 && x + it.w > USABLE.w) { x = 0; y += shelfH + gap; shelfH = 0; }
    if (y + it.h > USABLE.h && (x > 0 || y > 0)) newPage();
    page.push({ ...it, x, y });
    x += it.w + gap;
    shelfH = Math.max(shelfH, it.h);
  }
  return pages;
}
