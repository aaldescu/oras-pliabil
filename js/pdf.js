// Fișierul PDF A4: copertă cu instrucțiuni, foile fiecărei clădiri și planșa orașului.

import { buildingShape, bbox, projectLatLngs } from './geometry.js';
import { buildNet, packPieces, fitScale, PAGE, USABLE } from './net.js';
import { drawPiece, LINE } from './render.js';

export const SIZES = {
  mic: { label: 'Mică', mm: 70 },
  mediu: { label: 'Medie', mm: 110 },
  mare: { label: 'Mare', mm: 160 },
};

// Fonturile standard din PDF nu au ă, ș, ț — le înlocuim cu literele simple.
export function plain(s) {
  return String(s)
    .replace(/[ăâ]/g, 'a').replace(/[ĂÂ]/g, 'A')
    .replace(/î/g, 'i').replace(/Î/g, 'I')
    .replace(/[șş]/g, 's').replace(/[ȘŞ]/g, 'S')
    .replace(/[țţ]/g, 't').replace(/[ȚŢ]/g, 'T')
    .replace(/[„”“]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x00-\xff]/g, '');
}

function rgb(hex) {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function maxDim(shape) {
  const b = bbox(shape.pts);
  return Math.max(b.w, b.h, shape.H + shape.rise);
}

// Scara fiecărei clădiri, în mm pe metru.
export function computeScales(buildings, settings) {
  const target = SIZES[settings.size]?.mm ?? 110;
  const opts = { base: settings.base };
  const shapes = buildings.map((b) => buildingShape(b));
  const own = buildings.map((b, i) => fitScale(shapes[i], b.style, target / maxDim(shapes[i]), opts));
  if (!settings.sameScale || !buildings.length) return own;
  const biggest = Math.max(...shapes.map(maxDim));
  const common = Math.min(target / biggest, ...own);
  return buildings.map(() => common);
}

export function scaleLabel(k) {
  const d = 1000 / k;
  const r = d > 1000 ? Math.round(d / 50) * 50 : Math.round(d / 10) * 10;
  return `1:${r}`;
}

function pdfPen(doc) {
  return {
    poly(pts, s) {
      if (pts.length < 2) return;
      const d = [];
      for (let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      let style = null;
      if (s.fill && s.stroke) style = 'FD';
      else if (s.fill) style = 'F';
      else style = 'S';
      if (s.fill) doc.setFillColor(...rgb(s.fill));
      if (s.stroke) {
        doc.setDrawColor(...rgb(s.stroke));
        doc.setLineWidth(s.lw || 0.3);
      }
      doc.setLineDashPattern(s.dash || [], 0);
      doc.lines(d, pts[0][0], pts[0][1], [1, 1], style, !s.open);
      if (s.dash) doc.setLineDashPattern([], 0);
    },
    text(str, x, y, o = {}) {
      const t = plain(str);
      doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
      doc.setFontSize(o.size || 8);
      doc.setTextColor(...rgb(o.color || '#333333'));
      if (o.angle) {
        const w = doc.getTextWidth(t);
        const a = (o.angle * Math.PI) / 180;
        const h = (o.size || 8) * 0.353 * 0.35;
        doc.text(t, x - (Math.cos(a) * w) / 2 + Math.sin(a) * h, y + (Math.sin(a) * w) / 2 + Math.cos(a) * h, { angle: o.angle });
      } else {
        doc.text(t, x, y, { align: o.align === 'center' ? 'center' : 'left', baseline: o.align === 'center' ? 'middle' : 'alphabetic' });
      }
    },
  };
}

function header(doc, left, right, pw = PAGE.w) {
  doc.setFillColor(255, 209, 102);
  doc.rect(0, 0, pw, PAGE.margin + 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
  doc.text(plain(left), PAGE.margin, PAGE.margin + 3);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(plain(right), pw - PAGE.margin, PAGE.margin + 3, { align: 'right' });
}

function legend(doc, ph = PAGE.h) {
  const y = ph - PAGE.margin - 3;
  const pen = pdfPen(doc);
  let x = PAGE.margin;
  const item = (style, label) => {
    if (style === 'tab') pen.poly([[x, y - 2], [x + 8, y - 2], [x + 7, y + 1], [x + 1, y + 1]], { fill: LINE.tabFill, stroke: '#111111', lw: 0.3 });
    else pen.poly([[x, y], [x + 10, y]], { ...LINE[style], open: true });
    pen.text(label, x + 12, y + 1, { size: 7.5, color: '#333333' });
    x += 12 + doc.getTextWidth(plain(label)) + 7;
  };
  item('cut', 'taie');
  item('fold', 'indoaie');
  item('valley', 'indoaie invers');
  item('tab', 'urechiusa: pune lipici');
}

function coverCity(doc, x0, y0) {
  // un mic oraș colorat, desenat din forme simple
  const pen = pdfPen(doc);
  const houses = [
    [0, 30, 22, '#ffadad', '#c0392b', 'gable'], [24, 22, 46, '#a0c4ff', '#2c3e50', 'flat'],
    [48, 26, 30, '#caffbf', '#8e5b3c', 'pyr'], [76, 34, 24, '#fdffb6', '#e67e22', 'gable'],
    [112, 20, 52, '#ffc6ff', '#8e44ad', 'flat'], [134, 28, 28, '#9bf6ff', '#16a085', 'pyr'],
    [164, 26, 20, '#ffd6a5', '#c0392b', 'gable'],
  ];
  pen.poly([[x0 - 4, y0], [x0 + 194, y0]], { stroke: '#555555', lw: 0.6, open: true });
  for (const [x, w, h, wall, roof, type] of houses) {
    const X = x0 + x, Y = y0;
    pen.poly([[X, Y], [X + w, Y], [X + w, Y - h], [X, Y - h]], { fill: wall, stroke: '#333333', lw: 0.35 });
    if (type === 'gable') pen.poly([[X - 2, Y - h], [X + w + 2, Y - h], [X + w / 2, Y - h - w * 0.5]], { fill: roof, stroke: '#333333', lw: 0.35 });
    if (type === 'pyr') pen.poly([[X - 1, Y - h], [X + w + 1, Y - h], [X + w / 2, Y - h - w * 0.8]], { fill: roof, stroke: '#333333', lw: 0.35 });
    if (type === 'flat') pen.poly([[X - 1, Y - h], [X + w + 1, Y - h], [X + w + 1, Y - h - 2], [X - 1, Y - h - 2]], { fill: roof, stroke: '#333333', lw: 0.35 });
    const cols = Math.max(1, Math.floor(w / 8));
    const rows = Math.max(1, Math.floor((h - 8) / 9));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = X + (w / cols) * (c + 0.5);
        const cy = Y - 12 - r * 9;
        pen.poly([[cx - 2, cy], [cx + 2, cy], [cx + 2, cy - 4], [cx - 2, cy - 4]], { fill: '#7ec8e3', stroke: '#333333', lw: 0.25 });
      }
    }
    pen.poly([[X + w / 2 - 2.5, Y], [X + w / 2 + 2.5, Y], [X + w / 2 + 2.5, Y - 7], [X + w / 2 - 2.5, Y - 7]], { fill: '#8d5524', stroke: '#333333', lw: 0.25 });
  }
}

function coverPage(doc, buildings, scales, settings) {
  const M = PAGE.margin;
  const who = settings.kidName?.trim();
  doc.setFillColor(255, 248, 231);
  doc.rect(0, 0, PAGE.w, PAGE.h, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(230, 57, 70);
  doc.text(plain(who ? `Orasul lui ${who}` : 'Orasul meu pliabil'), PAGE.w / 2, 30, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(plain(`${buildings.length} ${buildings.length === 1 ? 'cladire' : 'cladiri'} de decupat, indoit si lipit`), PAGE.w / 2, 39, { align: 'center' });

  coverCity(doc, M + 4, 98);

  let y = 112;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('Cladirile mele', M, y);
  y += 7;
  doc.setFontSize(10);
  const shown = buildings.slice(0, 9);
  shown.forEach((b, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...rgb(b.style.wallColor));
    doc.setDrawColor(60, 60, 60);
    doc.circle(M + 3, y - 1.3, 3, 'FD');
    doc.setTextColor(30, 30, 30);
    doc.text(String(i + 1), M + 3, y - 1.2, { align: 'center', baseline: 'middle' });
    doc.text(plain(b.name), M + 9, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(90, 90, 90);
    doc.text(plain(`${b.style.levels} ${b.style.levels === 1 ? 'etaj' : 'etaje'} - scara ${scaleLabel(scales[i])}`), PAGE.w - M, y, { align: 'right' });
    y += 6.5;
  });
  if (buildings.length > shown.length) {
    doc.text(plain(`... si inca ${buildings.length - shown.length}`), M + 9, y);
  }

  y = 186;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text('Cum construiesti', M, y);
  const steps = [
    'Tipareste pe hartie groasa (160-250 g/m2) sau lipeste foile pe carton subtire.',
    settings.coloring ? 'Coloreaza peretii, ferestrele si acoperisul cum iti place!' : 'Daca vrei, adauga desene: flori, pisici, steaguri, graffiti...',
    'Decupeaza pe liniile continue. Cere ajutorul unui adult la foarfeca sau cutter.',
    'Trage cu rigla si un pix fara pasta pe liniile punctate, apoi indoaie-le.',
    'Pune lipici pe urechiusele gri si lipeste peretii unul de altul (numerele te ajuta).',
    'Lipeste acoperisul peste urechiusele de sus si baza peste cele de jos.',
    'Asaza cladirile pe planșa orasului si inventeaza povesti!',
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  steps.forEach((s, i) => {
    const yy = y + 9 + i * 8.5;
    doc.setFillColor(255, 209, 102);
    doc.circle(M + 3.5, yy - 1.3, 3.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(String(i + 1), M + 3.5, yy - 1.2, { align: 'center', baseline: 'middle' });
    doc.setFont('helvetica', 'normal');
    doc.text(plain(s), M + 10, yy);
  });
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(plain('Tiparire: A4, "Dimensiune reala" / 100%, fara "potrivire in pagina". Date harta (c) OpenStreetMap contributors.'), M, PAGE.h - M - 9);
  legend(doc);
}

function buildingPages(doc, b, idx, total, k, settings) {
  const shape = buildingShape(b);
  const pieces = buildNet(shape, b.style, k, { base: settings.base });
  const pages = packPieces(pieces);
  const pen = pdfPen(doc);
  pages.forEach((items, pi) => {
    doc.addPage('a4', 'portrait');
    header(doc, `${idx + 1}. ${b.name}`, `scara ${scaleLabel(k)}  -  foaia ${pi + 1}/${pages.length}  -  cladirea ${idx + 1} din ${total}`);
    const ox = PAGE.margin, oy = PAGE.margin + PAGE.header;
    for (const it of items) drawPiece(pen, it, ox + it.x, oy + it.y, { coloring: settings.coloring });
    legend(doc);
  });
}

// --- planșa orașului ---

function clipPoly(pts, x0, y0, x1, y1) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1, (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const inter = [
    (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1],
  ];
  let out = pts;
  for (let e = 0; e < 4 && out.length; e++) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i - 1 + inp.length) % inp.length], b = inp[i];
      const ina = edges[e](a), inb = edges[e](b);
      if (inb) {
        if (!ina) out.push(inter[e](a, b));
        out.push(b);
      } else if (ina) out.push(inter[e](a, b));
    }
  }
  return out;
}

function clipSeg(a, b, x0, y0, x1, y1) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy], q = [a[0] - x0, x1 - a[0], a[1] - y0, y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return null; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}

const ROAD_WIDTH = { motorway: 14, trunk: 12, primary: 11, secondary: 10, tertiary: 8, residential: 6, unclassified: 6, living_street: 5, pedestrian: 5, service: 3.5, footway: 2, path: 1.6, cycleway: 2 };

function planPages(doc, buildings, scales, roads, settings) {
  const placed = buildings.map((b, i) => ({ b, i })).filter(({ b }) => b.origin);
  if (!placed.length) return;
  const lat0 = placed.reduce((s, { b }) => s + b.origin[0], 0) / placed.length;
  const lng0 = placed.reduce((s, { b }) => s + b.origin[1], 0) / placed.length;
  const O = [lat0, lng0];
  const shapes = placed.map(({ b }) => {
    const sh = buildingShape(b);
    const [ox, oy] = projectLatLngs([b.origin], O)[0];
    return { pts: sh.pts.map(([x, y]) => [x + ox + sh.center[0], y + oy + sh.center[1]]), c: [ox + sh.center[0], oy + sh.center[1]] };
  });
  const all = shapes.flatMap((s) => s.pts);
  const bb0 = bbox(all);
  const pad = Math.max(12, Math.max(bb0.w, bb0.h) * 0.12);
  const W = { minX: bb0.minX - pad, maxX: bb0.maxX + pad, minY: bb0.minY - pad, maxY: bb0.maxY + pad };
  const ww = W.maxX - W.minX, wh = W.maxY - W.minY;

  const areas = {
    portrait: { w: USABLE.w, h: USABLE.h, pw: PAGE.w, ph: PAGE.h },
    landscape: { w: PAGE.h - 2 * PAGE.margin, h: PAGE.w - 2 * PAGE.margin - PAGE.header - PAGE.footer, pw: PAGE.h, ph: PAGE.w },
  };
  const same = settings.sameScale && scales.every((s) => Math.abs(s - scales[0]) < 1e-9);
  let choice = null;
  for (const [orient, a] of Object.entries(areas)) {
    if (same) {
      const k = scales[0];
      const nx = Math.ceil((ww * k) / a.w), ny = Math.ceil((wh * k) / a.h);
      if (nx * ny <= 9 && (!choice || nx * ny < choice.nx * choice.ny)) choice = { orient, a, k, nx, ny, real: true };
    }
  }
  if (!choice) {
    for (const [orient, a] of Object.entries(areas)) {
      const k = Math.min(a.w / ww, a.h / wh);
      if (!choice || k > choice.k) choice = { orient, a, k, nx: 1, ny: 1, real: same && Math.abs(k - scales[0]) < 1e-9 };
    }
  }
  const { orient, a, k, nx, ny, real } = choice;
  const projRoads = roads
    .map((r) => ({ w: ROAD_WIDTH[r.type] ?? 4, pts: projectLatLngs(r.latlngs, O) }))
    .filter((r) => r.pts.some(([x, y]) => x > W.minX - 50 && x < W.maxX + 50 && y > W.minY - 50 && y < W.maxY + 50));
  projRoads.sort((p, q) => p.w - q.w);

  const pen = pdfPen(doc);
  const totalW = ww * k, totalH = wh * k;
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      doc.addPage('a4', orient);
      const sub = nx * ny > 1 ? `  -  bucata ${ty * nx + tx + 1} din ${nx * ny} (rand ${ty + 1}, coloana ${tx + 1})` : '';
      header(doc, 'Plansa orasului', `${real ? 'aceeasi scara ca si cladirile' : 'plan micsorat'} ${scaleLabel(k)}${sub}`, a.pw);
      const ox = PAGE.margin, oy = PAGE.margin + PAGE.header;
      // ce bucată din oraș intră pe foaia asta (în mm pe planșa mare)
      const cx0 = tx * a.w, cy0 = ty * a.h;
      const cw = Math.min(a.w, totalW - cx0), ch = Math.min(a.h, totalH - cy0);
      const toMM = ([x, y]) => [(x - W.minX) * k, (W.maxY - y) * k];
      const toPage = ([x, y]) => [ox + x - cx0, oy + y - cy0];
      doc.setFillColor(220, 240, 205);
      doc.rect(ox, oy, cw, ch, 'F');
      doc.setLineCap('round');
      doc.setLineJoin('round');
      for (const r of projRoads) {
        const mm = r.pts.map(toMM);
        for (let i = 1; i < mm.length; i++) {
          const s = clipSeg(mm[i - 1], mm[i], cx0, cy0, cx0 + cw, cy0 + ch);
          if (s) pen.poly(s.map(toPage), { stroke: '#bdbdbd', lw: Math.max(0.6, r.w * k), open: true });
        }
      }
      doc.setLineCap('butt');
      shapes.forEach((s, j) => {
        const poly = clipPoly(s.pts.map(toMM), cx0, cy0, cx0 + cw, cy0 + ch);
        if (poly.length >= 3) pen.poly(poly.map(toPage), { fill: settings.coloring ? '#ffffff' : placed[j].b.style.wallColor, stroke: '#222222', lw: 0.4 });
        const c = toMM(s.c);
        if (c[0] >= cx0 && c[0] <= cx0 + cw && c[1] >= cy0 && c[1] <= cy0 + ch) {
          const [px, py] = toPage(c);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(34, 34, 34);
          doc.setLineWidth(0.3);
          doc.circle(px, py, 2.6, 'FD');
          pen.text(String(placed[j].i + 1), px, py, { size: 7.5, bold: true, align: 'center', color: '#222222' });
        }
      });
      doc.setDrawColor(120, 120, 120);
      doc.setLineDashPattern([1, 1], 0);
      doc.setLineWidth(0.2);
      doc.rect(ox, oy, cw, ch, 'S');
      doc.setLineDashPattern([], 0);
      const note = real
        ? (nx * ny > 1 ? 'Decupeaza marginile punctate si lipeste bucatile una langa alta. Pune fiecare cladire pe conturul ei!' : 'Pune fiecare cladire exact pe conturul ei!')
        : 'Planul e mai mic decat cladirile: numerele arata unde sta fiecare.';
      pen.text(note, ox, a.ph - PAGE.margin - 3, { size: 8, color: '#555555' });
    }
  }
}

export function generatePDF(buildings, settings, roads = []) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: plain(settings.kidName ? `Orasul lui ${settings.kidName}` : 'Orasul meu pliabil'), creator: 'Orasul Pliabil' });
  const scales = computeScales(buildings, settings);
  coverPage(doc, buildings, scales, settings);
  buildings.forEach((b, i) => buildingPages(doc, b, i, buildings.length, scales[i], settings));
  if (settings.plan) planPages(doc, buildings, scales, roads, settings);
  return doc;
}
