// Macheta 3D: pereții pornesc ca o fâșie plată și se pliază în clădire, ca la hârtie.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { dist, turnAngle } from './geometry.js';
import { wallDecor, gableDecor, roofTiles, darken } from './decor.js';

function drawTexture(w, h, fill, decor, opts = {}) {
  const ppm = Math.max(8, Math.min(64, 768 / Math.max(w, h)));
  const cw = Math.max(4, Math.ceil(w * ppm)), ch = Math.max(4, Math.ceil(h * ppm));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, cw, ch);
  for (const d of decor) {
    ctx.beginPath();
    d.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * ppm, (h - y) * ppm) : ctx.moveTo(x * ppm, (h - y) * ppm)));
    if (!d.open) ctx.closePath();
    if (d.fill && !d.open) { ctx.fillStyle = d.fill; ctx.fill(); }
    if (d.stroke) { ctx.strokeStyle = d.stroke; ctx.lineWidth = Math.max(1, (d.lw || 0.3) * ppm * 0.12); ctx.stroke(); }
  }
  if (opts.outline) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, cw - 2, ch - 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function shapeGeom(local, w, h) {
  const s = new THREE.Shape(local.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(s);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w, pos.getY(i) / h);
  uv.needsUpdate = true;
  return g;
}

export function createPreview(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(30, 60, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: 0xa8e6a3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  let group = null, walls = [], roof = null, shape = null, fold = 1;

  function resize() {
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function clear() {
    if (!group) return;
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
    });
    scene.remove(group);
  }

  function setBuilding(sh, style) {
    clear();
    shape = sh;
    group = new THREE.Group();
    walls = [];
    const { pts, H, roof: rType, rise, levels } = sh;
    const n = pts.length;
    const widths = pts.map((p, i) => dist(p, pts[(i + 1) % n]));
    const doorWall = widths.indexOf(Math.max(...widths));
    for (let i = 0; i < n; i++) {
      const w = widths[i];
      const gable = rType === 'gable' && (i === 1 || i === 3);
      const h = gable ? H + rise : H;
      const local = gable ? [[0, 0], [w, 0], [w, H], [w / 2, H + rise], [0, H]] : [[0, 0], [w, 0], [w, H], [0, H]];
      let decor = wallDecor(w, H, levels, style, { door: style.door && i === doorWall });
      if (gable) decor = decor.concat(gableDecor(w, H, rise, style));
      const mat = new THREE.MeshStandardMaterial({ map: drawTexture(w, h, style.wallColor, decor, { outline: true }), side: THREE.DoubleSide, roughness: 0.9 });
      const mesh = new THREE.Mesh(shapeGeom(local, w, h), mat);
      mesh.castShadow = true;
      group.add(mesh);
      walls.push(mesh);
    }
    roof = new THREE.Group();
    const roofMat = new THREE.MeshStandardMaterial({ color: style.roofColor, side: THREE.DoubleSide, roughness: 0.8, transparent: true });
    const v3 = ([x, y], z = 0) => new THREE.Vector3(x, z, -y);
    if (rType === 'gable') {
      const [p0, p1, p2, p3] = pts;
      const r1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], r3 = [(p3[0] + p0[0]) / 2, (p3[1] + p0[1]) / 2];
      const L = widths[0], S = Math.hypot(widths[1] / 2, rise);
      const tiles = drawTexture(L, S, style.roofColor, roofTiles(L, S, darken(style.roofColor, 0.3)));
      const panel = (a, b, c, d) => {
        const g = new THREE.BufferGeometry();
        g.setFromPoints([v3(a, 0), v3(b, 0), v3(c, rise), v3(a, 0), v3(c, rise), v3(d, rise)]);
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, roofMat.clone());
        m.material.map = tiles;
        m.material.color.set(0xffffff);
        m.castShadow = true;
        roof.add(m);
      };
      panel(p0, p1, r1, r3);
      panel(p2, p3, r3, r1);
    } else if (rType === 'pyramid') {
      const apex = v3(sh.apex, rise);
      const verts = [];
      for (let i = 0; i < n; i++) verts.push(v3(pts[i]), v3(pts[(i + 1) % n]), apex);
      const g = new THREE.BufferGeometry().setFromPoints(verts);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, roofMat);
      m.castShadow = true;
      roof.add(m);
    } else {
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, roofMat);
      m.castShadow = true;
      roof.add(m);
    }
    group.add(roof);
    scene.add(group);

    const span = Math.max(...pts.flatMap((p) => [Math.abs(p[0]), Math.abs(p[1])]), H + rise, 4);
    ground.scale.setScalar(span * 3.2);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span * 3;
    sun.shadow.camera.right = sun.shadow.camera.top = span * 3;
    sun.shadow.camera.far = span * 20;
    sun.position.set(span * 1.5, span * 4, span * 2);
    sun.shadow.camera.updateProjectionMatrix();
    const perim = widths.reduce((a, b) => a + b, 0);
    const d = Math.max(span * 3, perim * 0.9 * (1 - fold) + span * 3 * fold, (H + rise) * 2.5);
    camera.position.set(d * 0.75, d * 0.6, d * 0.9);
    controls.target.set(0, (H + rise) * 0.4, 0);
    setFold(fold);
  }

  // t = 0: fâșie plată; t = 1: clădire închisă
  function setFold(t) {
    fold = t;
    if (!shape) return;
    const { pts, H } = shape;
    const n = pts.length;
    const dirs = pts.map((p, i) => {
      const q = pts[(i + 1) % n];
      return [q[0] - p[0], q[1] - p[1]];
    });
    let h = Math.atan2(dirs[0][1], dirs[0][0]);
    let p = pts[0].slice();
    const chain = [];
    for (let i = 0; i < n; i++) {
      const w = Math.hypot(dirs[i][0], dirs[i][1]);
      chain.push({ p: p.slice(), h });
      p = [p[0] + Math.cos(h) * w, p[1] + Math.sin(h) * w];
      if (i < n - 1) h += t * turnAngle(dirs[i], dirs[i + 1]);
    }
    const xs = chain.map((c) => c.p[0]).concat(p[0]), ys = chain.map((c) => c.p[1]).concat(p[1]);
    // la t = 1 forma e deja centrată, deci deplasarea se stinge treptat
    const ox = ((Math.min(...xs) + Math.max(...xs)) / 2) * (1 - t);
    const oy = ((Math.min(...ys) + Math.max(...ys)) / 2) * (1 - t);
    chain.forEach((c, i) => {
      walls[i].position.set(c.p[0] - ox, 0, -(c.p[1] - oy));
      walls[i].rotation.set(0, c.h, 0);
    });
    const s = Math.min(1, Math.max(0, (t - 0.82) / 0.18));
    roof.visible = s > 0;
    roof.position.y = H + (1 - s) * H * 0.9;
    roof.traverse((o) => { if (o.material) o.material.opacity = s; });
  }

  let raf;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();

  return {
    setBuilding,
    setFold,
    spin() { controls.autoRotate = true; },
    dispose() { cancelAnimationFrame(raf); clear(); renderer.dispose(); },
  };
}
