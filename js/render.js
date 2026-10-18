// Desenarea pieselor printr-un „pix” abstract, comun pentru PDF și pentru previzualizarea pe ecran.
// Pixul primește coordonate de pagină în mm, cu y în jos.

import { pieceBBox } from './net.js';

const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
const ekey = (a, b) => { const ka = key(a), kb = key(b); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };

// O latură folosită de două forme se îndoaie; una folosită o singură dată se taie.
export function classifyEdges(piece) {
  const edges = new Map();
  const add = (pts) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const k = ekey(a, b);
      const e = edges.get(k);
      if (e) e.count++;
      else edges.set(k, { a, b, count: 1 });
    }
  };
  piece.faces.forEach((f) => add(f.pts));
  piece.tabs.forEach((t) => add(t.pts));
  const valleys = new Set(piece.valley.map(([a, b]) => ekey(a, b)));
  const cuts = [], folds = [], valley = [];
  for (const [k, e] of edges) {
    if (e.count === 1) cuts.push([e.a, e.b]);
    else if (valleys.has(k)) valley.push([e.a, e.b]);
    else folds.push([e.a, e.b]);
  }
  return { cuts, folds, valley };
}

export const LINE = {
  cut: { stroke: '#111111', lw: 0.45 },
  fold: { stroke: '#444444', lw: 0.3, dash: [2, 1.4] },
  valley: { stroke: '#1e6fd9', lw: 0.35, dash: [2.4, 1, 0.5, 1] },
  tabFill: '#dcdcdc',
};

export function drawPiece(pen, item, ox, oy, opts = {}) {
  const { piece, rot } = item;
  const bb = pieceBBox(piece, rot);
  const capH = piece.caption ? 6 : 0;
  const top = bb.maxY;
  const T = ([x, y]) => {
    const [rx, ry] = rot ? [-y, x] : [x, y];
    return [ox + rx - bb.minX, oy + (top - ry)];
  };
  const tp = (pts) => pts.map(T);
  const color = opts.coloring;

  for (const t of piece.tabs) pen.poly(tp(t.pts), { fill: LINE.tabFill });
  for (const f of piece.faces) {
    pen.poly(tp(f.pts), { fill: color ? '#ffffff' : f.fill });
    for (const d of f.decor || []) {
      if (d.open) pen.poly(tp(d.pts), { stroke: color ? '#555555' : d.stroke, lw: d.lw, open: true });
      else pen.poly(tp(d.pts), { fill: color ? '#ffffff' : d.fill, stroke: d.stroke ? (color ? '#333333' : d.stroke) : null, lw: d.lw });
    }
  }
  const { cuts, folds, valley } = classifyEdges(piece);
  for (const [a, b] of folds) pen.poly([T(a), T(b)], { ...LINE.fold, open: true });
  for (const [a, b] of valley) pen.poly([T(a), T(b)], { ...LINE.valley, open: true });
  for (const [a, b] of cuts) pen.poly([T(a), T(b)], { ...LINE.cut, open: true });

  for (const t of piece.texts) {
    const [x, y] = T(t.p);
    const c = color && t.color === '#ffffff' ? '#888888' : t.color;
    // într-o piesă întoarsă, textul rămâne orizontal ca să poată fi citit
    const angle = rot ? 0 : t.angle || 0;
    pen.text(t.text, x, y, { size: t.size, color: c, align: 'center', angle, badge: t.badge });
  }
  if (piece.caption) {
    pen.text(piece.caption, ox, oy + (bb.maxY - bb.minY) + capH - 1.2, { size: 7.5, color: '#333333', bold: true });
  }
}

// --- pixul pentru canvas (previzualizare) ---
export function canvasPen(ctx, scale) {
  return {
    poly(pts, s) {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * scale, pts[i][1] * scale);
      if (!s.open) ctx.closePath();
      if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = Math.max(0.6, (s.lw || 0.3) * scale);
        ctx.setLineDash(s.dash ? s.dash.map((d) => d * scale) : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    text(str, x, y, o = {}) {
      ctx.save();
      ctx.translate(x * scale, y * scale);
      if (o.angle) ctx.rotate((-o.angle * Math.PI) / 180);
      ctx.font = `${o.bold ? 'bold ' : ''}${Math.max(6, o.size * 0.353 * scale)}px Nunito, sans-serif`;
      ctx.fillStyle = o.color || '#333';
      ctx.textAlign = o.align === 'center' ? 'center' : 'left';
      ctx.textBaseline = o.align === 'center' ? 'middle' : 'alphabetic';
      ctx.fillText(str, 0, 0);
      ctx.restore();
    },
  };
}
