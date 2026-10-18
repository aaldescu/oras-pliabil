// Decorațiuni desenate pe pereți și acoperiș: ferestre, uși, flori, țigle.
// Coordonate locale în metri, originea în colțul stânga-jos al peretelui, y în sus.

export const WALL_COLORS = ['#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#ffc6ff', '#ffadad', '#f1e3c8', '#ffffff', '#d9d9d9'];
export const ROOF_COLORS = ['#c0392b', '#e67e22', '#8e5b3c', '#2c3e50', '#16a085', '#7f8c8d', '#8e44ad', '#f4d03f'];
export const WINDOW_COLORS = ['#7ec8e3', '#ffe066', '#ffffff', '#b8f2e6', '#3d5a80'];

export const WINDOW_STYLES = {
  clasic: 'Clasice',
  arcade: 'Cu arcadă',
  rotunde: 'Rotunde',
  moderne: 'Moderne',
  gol: 'Le desenez eu',
};

const FLOWER_COLORS = ['#ff595e', '#ffca3a', '#ff7eb9', '#ffffff'];

function rect(x, y, w, h, fill, stroke = '#333333', lw = 0.35) {
  return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], fill, stroke, lw };
}

function circle(cx, cy, r, fill, stroke = '#333333', n = 14, lw = 0.3) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return { pts, fill, stroke, lw };
}

function arched(x, y, w, h, fill) {
  const r = w / 2;
  const pts = [[x, y], [x + w, y], [x + w, y + h - r]];
  for (let i = 1; i < 10; i++) {
    const a = (i / 10) * Math.PI;
    pts.push([x + r + Math.cos(a) * r, y + h - r + Math.sin(a) * r]);
  }
  pts.push([x, y + h - r]);
  return { pts, fill, stroke: '#333333', lw: 0.35 };
}

function line(a, b, stroke = '#333333', lw = 0.3) {
  return { pts: [a, b], open: true, stroke, lw };
}

// Ferestrele unui perete de lățime w și înălțime H cu `levels` etaje.
export function wallDecor(w, H, levels, style, opts = {}) {
  const out = [];
  if (style.windowStyle === 'gol') return out;
  const floorH = H / levels;
  const cols = Math.max(0, Math.floor(w / 3.2));
  if (w < 1.6) return out;
  const n = Math.max(1, cols);
  const cell = w / n;
  const win = style.windowColor;
  const doorCol = opts.door ? Math.floor((n - 1) / 2) : -1;

  for (let lv = 0; lv < levels; lv++) {
    const y0 = lv * floorH;
    if (style.windowStyle === 'moderne') {
      if (lv === 0 && opts.door) {
        const dw = Math.min(1.8, w * 0.35);
        out.push(rect(w / 2 - dw / 2, 0, dw, Math.min(2.5, floorH * 0.8), '#5d4037'));
        out.push(line([w / 2, 0], [w / 2, Math.min(2.5, floorH * 0.8)]));
        continue;
      }
      const bh = floorH * 0.45;
      out.push(rect(w * 0.06, y0 + floorH * 0.3, w * 0.88, bh, win));
      for (let c = 1; c < n; c++) out.push(line([c * cell, y0 + floorH * 0.3], [c * cell, y0 + floorH * 0.3 + bh]));
      continue;
    }
    for (let c = 0; c < n; c++) {
      const cx = c * cell + cell / 2;
      if (lv === 0 && c === doorCol) {
        const dw = Math.min(1.4, cell * 0.6);
        const dh = Math.min(2.4, floorH * 0.82);
        out.push(style.windowStyle === 'arcade' ? { ...arched(cx - dw / 2, 0, dw, dh, '#8d5524') } : rect(cx - dw / 2, 0, dw, dh, '#8d5524'));
        out.push(circle(cx + dw * 0.28, dh * 0.45, Math.max(0.06, dw * 0.06), '#ffd166', '#333333', 8));
        continue;
      }
      const ww = Math.min(1.3, cell * 0.5);
      const wh = Math.min(1.6, floorH * 0.48);
      const wx = cx - ww / 2;
      const wy = y0 + floorH * 0.32;
      if (style.windowStyle === 'rotunde') {
        const r = Math.min(ww, wh) / 2;
        out.push(circle(cx, wy + wh / 2, r, win));
        out.push(line([cx - r, wy + wh / 2], [cx + r, wy + wh / 2]));
        out.push(line([cx, wy + wh / 2 - r], [cx, wy + wh / 2 + r]));
      } else if (style.windowStyle === 'arcade') {
        out.push(arched(wx, wy, ww, wh * 1.15, win));
        out.push(line([cx, wy], [cx, wy + wh * 1.15]));
      } else {
        out.push(rect(wx, wy, ww, wh, win));
        out.push(line([cx, wy], [cx, wy + wh]));
        out.push(line([wx, wy + wh * 0.55], [wx + ww, wy + wh * 0.55]));
      }
      if (style.flowers && style.windowStyle !== 'rotunde') {
        out.push(rect(wx - ww * 0.08, wy - 0.28, ww * 1.16, 0.28, '#a0522d'));
        const k = 3;
        for (let f = 0; f < k; f++) {
          const fx = wx + (ww * (f + 0.5)) / k;
          out.push(circle(fx, wy + 0.02, Math.min(0.16, ww * 0.13), FLOWER_COLORS[(f + c + lv) % FLOWER_COLORS.length], '#333333', 8, 0.2));
        }
      }
    }
  }
  return out;
}

// O ferestruică rotundă în pod, pe frontonul triunghiular.
export function gableDecor(w, H, rise, style) {
  if (style.windowStyle === 'gol' || rise < 1.2) return [];
  const r = Math.min(0.5, rise * 0.18);
  return [circle(w / 2, H + rise * 0.38, r, style.windowColor)];
}

// Linii de țiglă pe un panou de acoperiș de lățime w și adâncime d.
export function roofTiles(w, d, color) {
  const out = [];
  const step = 0.9;
  for (let y = step; y < d - 0.2; y += step) out.push(line([0, y], [w, y], color, 0.25));
  return out;
}

export function darken(hex, f = 0.25) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(v * (1 - f)).toString(16).padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}
