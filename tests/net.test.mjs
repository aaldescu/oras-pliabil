// Teste pentru geometrie și desfășurare: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildingShape, signedArea, dist } from '../js/geometry.js';
import { buildNet, netFits, packPieces, fitScale, USABLE } from '../js/net.js';
import { classifyEdges } from '../js/render.js';

const style = (o = {}) => ({ levels: 3, roof: 'flat', pitch: 0.8, difficulty: 'mediu', wallColor: '#ffd6a5', roofColor: '#c0392b', windowColor: '#7ec8e3', windowStyle: 'clasic', flowers: true, door: true, ...o });
const L = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 18], [0, 18]];
const rectRot = [[0, 0], [17.3, 10], [12.3, 18.66], [-5, 8.66]];

test('forma e CCW și centrată', () => {
  const s = buildingShape({ footprint: L.slice().reverse(), style: style() });
  assert.ok(signedArea(s.pts) > 0);
  assert.equal(s.pts.length, 6);
});

test('acoperișul în două ape face dreptunghi cu latura lungă prima', () => {
  const s = buildingShape({ footprint: rectRot, style: style({ roof: 'gable' }) });
  assert.equal(s.roof, 'gable');
  assert.equal(s.pts.length, 4);
  assert.ok(dist(s.pts[0], s.pts[1]) >= dist(s.pts[1], s.pts[2]));
  assert.ok(s.rise > 0);
});

test('piramida pe L cade pe acoperiș plat', () => {
  const s = buildingShape({ footprint: L, style: style({ roof: 'pyramid' }) });
  assert.equal(s.roof, 'flat');
});

for (const roof of ['flat', 'gable', 'pyramid']) {
  test(`desfășurare validă: ${roof}`, () => {
    const fp = roof === 'pyramid' ? Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * 6, Math.sin(i * Math.PI / 4) * 6]) : roof === 'gable' ? rectRot : L;
    const sh = buildingShape({ footprint: fp, style: style({ roof }) });
    const k = fitScale(sh, style({ roof }), 8, {});
    const pieces = buildNet(sh, style({ roof }), k);
    assert.ok(netFits(pieces));
    for (const p of pieces) {
      for (const f of p.faces) for (const pt of f.pts) assert.ok(Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      const { cuts, folds } = classifyEdges(p);
      assert.ok(cuts.length > 0);
      if (p.kind === 'walls') assert.ok(folds.length >= p.faces.length);
    }
    // perimetrul pereților = perimetrul formei
    const wallW = pieces.filter((p) => p.kind === 'walls').flatMap((p) => p.faces).reduce((s, f) => s + dist(f.pts[0], f.pts[1]), 0);
    const per = sh.pts.reduce((s, p, i) => s + dist(p, sh.pts[(i + 1) % sh.pts.length]), 0) * k;
    assert.ok(Math.abs(wallW - per) < 1e-6);
    const pages = packPieces(pieces);
    for (const pg of pages) for (const it of pg) {
      assert.ok(it.x + it.w <= USABLE.w + 1e-6, 'lățime');
      assert.ok(it.y + it.h <= USABLE.h + 1e-6, 'înălțime');
    }
  });
}

test('pereții lungi se împart în mai multe fâșii', () => {
  const sh = buildingShape({ footprint: [[0, 0], [60, 0], [60, 12], [0, 12]], style: style({ difficulty: 'usor' }) });
  const pieces = buildNet(sh, style(), 2.5);
  assert.ok(pieces.filter((p) => p.kind === 'walls').length >= 2);
  assert.ok(pieces.every((p) => p.faces.length));
});
