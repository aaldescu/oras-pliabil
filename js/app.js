import { projectLatLngs, buildingShape, roofOptions, DIFFICULTY, FLOOR_H } from './geometry.js';
import { WALL_COLORS, ROOF_COLORS, WINDOW_COLORS, WINDOW_STYLES } from './decor.js';
import { buildNet, packPieces, PAGE } from './net.js';
import { drawPiece, canvasPen } from './render.js';
import { generatePDF, computeScales, scaleLabel, SIZES } from './pdf.js';
import { initMap, searchPlace, escapeHtml } from './map.js';

const $ = (s) => document.querySelector(s);
const STORE = 'oras-pliabil-v1';

const CITIES = [
  ['București', 44.4355, 26.1025], ['Cluj-Napoca', 46.7695, 23.5898], ['Iași', 47.1653, 27.58],
  ['Timișoara', 45.754, 21.225], ['Brașov', 45.6425, 25.5887], ['Sibiu', 45.797, 24.152],
  ['Constanța', 44.173, 28.658], ['Oradea', 47.0545, 21.9285], ['Chișinău', 47.0245, 28.8325],
];
const LANDMARKS = [
  ['🎻 Ateneul Român', 44.4413, 26.0973], ['🏛️ Arcul de Triumf', 44.4672, 26.0781],
  ['🏰 Palatul Parlamentului', 44.4275, 26.0875], ['⛪ Biserica Neagră', 45.6409, 25.5878],
  ['👑 Castelul Peleș', 45.3599, 25.5427], ['🏯 Palatul Culturii', 47.1572, 27.5869],
  ['🕰️ Turnul cu Ceas', 46.2192, 24.7956], ['⛪ Catedrala din Timișoara', 45.7508, 21.2241],
  ['🌊 Cazinoul Constanța', 44.1717, 28.6627], ['⛪ Sf. Mihail, Cluj', 46.77, 23.5897],
];
const CHEERS = ['Super alegere! 🎉', 'Încă una pentru orașul tău! 🏗️', 'Wow, ce clădire! 😍', 'O pun în cutie! 🧺', 'Orașul tău crește! 🌆'];
const TIPS = {
  1: 'Mișcă harta, apropie-te și atinge clădirile care-ți plac. Le pun în cutie! 🧺',
  2: 'Alege culori, ferestre și acoperiș. Trage de bara albastră ca s-o vezi cum se pliază! ✋',
  3: 'Scrie-ți numele și apasă butonul verde. Apoi cere unui adult să tipărească! 🖨️',
};
const ROOFS = { flat: ['🟫', 'Plat'], gable: ['🏠', 'În două ape'], pyramid: ['🔺', 'Piramidă'] };
const CUSTOM_SHAPES = { rect: ['▭', 'Cutie'], L: ['⌐', 'L'], U: ['⊔', 'U'], cross: ['✚', 'Cruce'], tower: ['⯃', 'Turn'] };

const state = {
  basket: [],
  current: null,
  step: 1,
  print: { kidName: '', size: 'mediu', sameScale: true, coloring: false, base: true, plan: true },
};

try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved) {
    state.basket = saved.basket || [];
    Object.assign(state.print, saved.print || {});
    state.current = saved.current || state.basket[0]?.id || null;
  }
} catch { /* fără memorie locală, pornim de la zero */ }

function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ basket: state.basket, print: state.print, current: state.current })); } catch { /* ignorăm */ }
}

const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (arr, h) => arr[h % arr.length];
const isSelected = (id) => state.basket.some((b) => b.id === id);
const currentB = () => state.basket.find((b) => b.id === state.current);

// --- clădiri ---

function defaultStyle(tags, id) {
  const h = hash(id);
  const type = tags.building || 'yes';
  let levels = parseInt(tags['building:levels'], 10);
  if (!levels && tags.height) levels = Math.round(parseFloat(tags.height) / FLOOR_H);
  if (!levels) levels = { house: 2, detached: 2, apartments: 4, garage: 1, garages: 1, shed: 1, church: 4, cathedral: 6, kiosk: 1 }[type] || 3;
  levels = Math.max(1, Math.min(40, levels));
  const rs = tags['roof:shape'];
  let roof = 'flat';
  if (/gabled|hipped|half-hipped|gambrel|mansard|saltbox/.test(rs || '')) roof = 'gable';
  else if (/pyramidal|cone|dome|onion/.test(rs || '')) roof = 'pyramid';
  else if (!rs && /^(house|detached|semidetached_house|farm|cabin|bungalow|church|chapel)$/.test(type)) roof = 'gable';
  return {
    levels, roof, pitch: 0.8, difficulty: 'mediu',
    wallColor: pick(WALL_COLORS, h), roofColor: pick(ROOF_COLORS, h >> 3), windowColor: WINDOW_COLORS[0],
    windowStyle: /church|cathedral|chapel|palace|castle/.test(type) ? 'arcade' : /office|commercial|retail/.test(type) ? 'moderne' : 'clasic',
    flowers: type === 'house', door: true,
  };
}

function fromOSM(data) {
  const lat = data.latlngs.reduce((s, p) => s + p[0], 0) / data.latlngs.length;
  const lng = data.latlngs.reduce((s, p) => s + p[1], 0) / data.latlngs.length;
  const b = {
    id: data.id, name: data.name, origin: [lat, lng],
    footprint: projectLatLngs(data.latlngs, [lat, lng]).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]),
    tags: { building: data.tags.building, 'building:levels': data.tags['building:levels'] },
    style: defaultStyle(data.tags, data.id),
  };
  if (!roofOptions(b).pyramid && b.style.roof === 'pyramid') b.style.roof = 'flat';
  return b;
}

function customFootprint(kind, w, d) {
  const s = Math.min(w, d);
  switch (kind) {
    case 'L': return [[0, 0], [w, 0], [w, d * 0.45], [w * 0.45, d * 0.45], [w * 0.45, d], [0, d]];
    case 'U': return [[0, 0], [w, 0], [w, d], [w * 0.68, d], [w * 0.68, d * 0.4], [w * 0.32, d * 0.4], [w * 0.32, d], [0, d]];
    case 'cross': {
      const a = w / 3, c = d / 3;
      return [[a, 0], [2 * a, 0], [2 * a, c], [w, c], [w, 2 * c], [2 * a, 2 * c], [2 * a, d], [a, d], [a, 2 * c], [0, 2 * c], [0, c], [a, c]];
    }
    case 'tower': return Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2 + Math.PI / 8) * s / 2, Math.sin((i / 8) * Math.PI * 2 + Math.PI / 8) * s / 2]);
    default: return [[0, 0], [w, 0], [w, d], [0, d]];
  }
}

function addBuilding(b) {
  state.basket.push(b);
  state.current = b.id;
  save();
  renderTray();
  bumpBasket();
}

function removeBuilding(id) {
  state.basket = state.basket.filter((b) => b.id !== id);
  if (state.current === id) state.current = state.basket[0]?.id || null;
  save();
  mapApi?.refresh(id);
  renderTray();
  if (state.step === 2) renderStep2();
}

// --- mascota ---
let bubbleTimer;
function say(msg, ms = 5000) {
  const el = $('#bubble');
  el.textContent = '';
  void el.offsetWidth;
  el.textContent = msg;
  clearTimeout(bubbleTimer);
  if (ms) bubbleTimer = setTimeout(() => (el.textContent = ''), ms);
}
$('.fox').addEventListener('click', () => say(TIPS[state.step], 7000));

function bumpBasket() {
  const el = $('#basketBtn');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function flyToBasket(pt) {
  const mapRect = $('#map').getBoundingClientRect();
  const f = document.createElement('div');
  f.className = 'flyer';
  f.textContent = '🏠';
  f.style.left = mapRect.left + pt.x - 16 + 'px';
  f.style.top = mapRect.top + pt.y - 16 + 'px';
  document.body.appendChild(f);
  const t = $('#basketBtn').getBoundingClientRect();
  requestAnimationFrame(() => {
    f.style.left = t.left + 10 + 'px';
    f.style.top = t.top + 4 + 'px';
    f.style.transform = 'scale(0.5)';
    f.style.opacity = '0.4';
  });
  setTimeout(() => f.remove(), 750);
}

// --- pași ---
function goStep(n) {
  if (n > 1 && !state.basket.length) { say('Mai întâi alege măcar o clădire de pe hartă! 🗺️'); n = 1; }
  state.step = n;
  document.querySelectorAll('.step').forEach((s) => s.classList.toggle('active', +s.dataset.step === n));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view' + n));
  $('#mascot').style.bottom = n === 1 ? '96px' : '18px';
  $('#mascot').classList.toggle('left', n !== 1);
  if (n === 1) setTimeout(() => mapApi?.map.invalidateSize(), 50);
  if (n === 2) renderStep2();
  if (n === 3) renderStep3();
  say(TIPS[n], 6000);
}
document.querySelectorAll('.step').forEach((s) => s.addEventListener('click', () => goStep(+s.dataset.step)));
document.querySelectorAll('[data-goto]').forEach((s) => s.addEventListener('click', () => goStep(+s.dataset.goto)));
$('#toStep2').addEventListener('click', () => goStep(2));
$('#basketBtn').addEventListener('click', () => goStep(state.basket.length ? 2 : 1));

// --- pasul 1: harta ---
function renderTray() {
  $('#basketCount').textContent = state.basket.length;
  $('#toStep2').disabled = !state.basket.length;
  const list = $('#trayList');
  if (!state.basket.length) {
    list.innerHTML = '<span class="tray-empty">🧺 Cutia e goală — atinge o clădire de pe hartă!</span>';
    return;
  }
  list.innerHTML = state.basket.map((b) => `
    <span class="tray-item"><span class="dot" style="background:${b.style.wallColor}"></span>${escapeHtml(short(b.name))}
    <button data-rm="${b.id}" title="Scoate">✕</button></span>`).join('');
  list.querySelectorAll('[data-rm]').forEach((btn) => btn.addEventListener('click', () => removeBuilding(btn.dataset.rm)));
  list.scrollLeft = list.scrollWidth;
}
const short = (s, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

let mapApi = null;
try {
  mapApi = initMap($('#map'), {
    isSelected,
    onPick(data, pt) {
      if (isSelected(data.id)) {
        removeBuilding(data.id);
        say('Am scos-o din cutie. 👋', 2500);
        return;
      }
      addBuilding(fromOSM(data));
      flyToBasket(pt);
      say(pick(CHEERS, hash(data.id + state.basket.length)), 2500);
    },
    onStatus(s, n) {
      const el = $('#mapStatus');
      el.classList.toggle('retry', s === 'error');
      el.textContent = {
        zoom: '🔍 Apropie harta ca să vezi clădirile',
        loading: '⏳ Caut clădirile…',
        ok: '👆 Atinge o clădire ca s-o pui în cutie',
        error: '😕 Nu am găsit clădirile — atinge ca să reîncerc',
      }[s];
    },
  });
  $('#mapStatus').addEventListener('click', () => mapApi.retry());
} catch (e) {
  console.error(e);
  $('#mapStatus').textContent = '😕 Harta nu s-a putut încărca. Poți inventa o clădire!';
}

$('#cityChips').innerHTML = CITIES.map(([n], i) => `<button class="chip" data-city="${i}">${n}</button>`).join('');
$('#landmarkChips').innerHTML = LANDMARKS.map(([n], i) => `<button class="chip" data-lm="${i}">${n}</button>`).join('');
$('#cityChips').addEventListener('click', (e) => {
  const i = e.target.dataset.city;
  if (i != null) mapApi?.flyTo(CITIES[i][1], CITIES[i][2], 17);
});
$('#landmarkChips').addEventListener('click', (e) => {
  const i = e.target.dataset.lm;
  if (i == null) return;
  mapApi?.flyTo(LANDMARKS[i][1], LANDMARKS[i][2], 18);
  say(`Uite ${LANDMARKS[i][0].replace(/^\S+\s/, '')}! Atinge clădirea din mijloc. 👆`, 4500);
});

$('#searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#searchInput').value.trim();
  const ul = $('#searchResults');
  if (!q) return;
  ul.innerHTML = '<li>⏳ Caut…</li>';
  try {
    const res = await searchPlace(q);
    ul.innerHTML = res.length ? res.map((r, i) => `<li data-i="${i}">📍 ${escapeHtml(r.display_name)}</li>`).join('') : '<li>Nu am găsit nimic 🤔</li>';
    ul.querySelectorAll('[data-i]').forEach((li) => li.addEventListener('click', () => {
      const r = res[li.dataset.i];
      mapApi?.flyTo(+r.lat, +r.lon, 18);
      ul.innerHTML = '';
    }));
  } catch {
    ul.innerHTML = '<li>😕 Căutarea nu merge acum.</li>';
  }
});

$('#locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return say('Telefonul ăsta nu știe unde ești. 🤷');
  say('Te caut… 🛰️', 3000);
  navigator.geolocation.getCurrentPosition(
    (p) => { mapApi?.flyTo(p.coords.latitude, p.coords.longitude, 18); say('Aici ești! Poți alege chiar casa ta. 🏡'); },
    () => say('Nu te-am găsit. Cere voie unui adult să pornească locația. 📍'),
    { timeout: 10000 },
  );
});

// --- clădire inventată ---
let invShape = 'rect';
function renderInvShape() {
  $('#invShape').innerHTML = Object.entries(CUSTOM_SHAPES).map(([k, [ico, l]]) => `<button type="button" class="${k === invShape ? 'on' : ''}" data-s="${k}"><span class="ico">${ico}</span>${l}</button>`).join('');
}
$('#invShape').addEventListener('click', (e) => {
  const b = e.target.closest('[data-s]');
  if (b) { invShape = b.dataset.s; renderInvShape(); }
});
['W', 'D', 'L'].forEach((k) => $('#inv' + k).addEventListener('input', (e) => ($('#inv' + k + 'v').textContent = e.target.value)));
$('#inventBtn').addEventListener('click', () => { renderInvShape(); $('#inventDlg').showModal(); });
$('#inventDlg').addEventListener('close', () => {
  if ($('#inventDlg').returnValue !== 'ok') return;
  const id = 'c' + Date.now();
  const w = +$('#invW').value, d = +$('#invD').value;
  const style = defaultStyle({ building: invShape === 'rect' ? 'house' : 'yes' }, id);
  style.levels = +$('#invL').value;
  style.difficulty = 'expert';
  if (invShape === 'tower') style.roof = 'pyramid';
  else if (invShape !== 'rect') style.roof = 'flat';
  addBuilding({ id, name: $('#invName').value.trim() || 'Clădirea mea', origin: null, footprint: customFootprint(invShape, w, d), tags: {}, style });
  say('Ce idee grozavă! Hai s-o decorăm! 🎨');
  goStep(2);
});

// --- pasul 2: atelierul ---
let preview = null, previewFailed = false;
async function ensurePreview() {
  if (preview || previewFailed) return preview;
  try {
    const mod = await import('./preview3d.js');
    preview = mod.createPreview($('#viewer'));
  } catch (e) {
    console.warn('3D', e);
    previewFailed = true;
    $('#viewerMsg').textContent = 'Macheta 3D nu merge pe acest dispozitiv, dar foile de tipărit sunt gata! 📄';
  }
  return preview;
}

function renderCards() {
  $('#cardList').innerHTML = state.basket.map((b) => `
    <button class="bcard ${b.id === state.current ? 'active' : ''}" data-id="${b.id}">
      <span class="thumb" style="background:${b.style.wallColor}">${ROOFS[b.style.roof]?.[0] || '🏠'}</span>
      <span><span class="t">${escapeHtml(short(b.name, 30))}</span><br><span class="s">${b.style.levels} ${b.style.levels === 1 ? 'etaj' : 'etaje'}</span></span>
    </button>`).join('');
}
$('#cardList').addEventListener('click', (e) => {
  const c = e.target.closest('[data-id]');
  if (!c) return;
  state.current = c.dataset.id;
  save();
  renderStep2();
});

function swatches(field, colors, value) {
  const custom = !colors.includes(value);
  return `<div class="swatches">${colors.map((c) => `<button class="swatch ${c === value ? 'on' : ''}" style="background:${c}" data-field="${field}" data-val="${c}" aria-label="${c}"></button>`).join('')}
    <label class="swatch custom ${custom ? 'on' : ''}" title="Altă culoare"><input type="color" data-field="${field}" value="${value}"></label></div>`;
}

function renderEditor() {
  const b = currentB();
  const el = $('#editor');
  if (!b) { el.innerHTML = '<p>Cutia e goală.</p>'; return; }
  const st = b.style;
  const ro = roofOptions(b);
  const wallsFor = (d) => buildingShape({ ...b, style: { ...st, difficulty: d } }).pts.length;
  const shape = buildingShape(b);
  el.innerHTML = `
    <h3>✏️ Numele clădirii</h3>
    <input class="name-input" data-field="name" value="${escapeHtml(b.name)}" maxlength="40">
    <h3>🏢 Câte etaje?</h3>
    <div class="stepper"><button data-act="lv-">−</button><span class="val">${st.levels}</span><button data-act="lv+">+</button></div>
    <h3>✂️ Cât de greu de construit?</h3>
    <div class="seg">${Object.entries(DIFFICULTY).map(([k, d]) => `<button class="${st.difficulty === k ? 'on' : ''}" data-field="difficulty" data-val="${k}" ${st.roof === 'gable' && k !== 'usor' ? 'disabled' : ''}><span class="ico">${k === 'usor' ? '📦' : k === 'mediu' ? '🏘️' : '🏰'}</span>${d.label}<small>${st.roof === 'gable' ? 4 : wallsFor(k)} pereți</small></button>`).join('')}</div>
    <h3>🏠 Acoperișul</h3>
    <div class="seg">${Object.entries(ROOFS).map(([k, [ico, l]]) => `<button class="${shape.roof === k ? 'on' : ''}" data-field="roof" data-val="${k}" ${ro[k] ? '' : 'disabled'}><span class="ico">${ico}</span>${l}</button>`).join('')}</div>
    ${shape.roof === 'gable' ? '<p class="hint">Acoperișul în două ape face clădirea dreptunghiulară.</p>' : ''}
    ${shape.roof !== 'flat' ? `<div class="range-row">ascuțit <input type="range" min="0.3" max="1.6" step="0.1" value="${st.pitch}" data-field="pitch"> foarte ascuțit</div>` : ''}
    <h3>🎨 Culoarea pereților</h3>${swatches('wallColor', WALL_COLORS, st.wallColor)}
    <h3>🧱 Culoarea acoperișului</h3>${swatches('roofColor', ROOF_COLORS, st.roofColor)}
    <h3>🪟 Ferestre</h3>
    <div class="seg">${Object.entries(WINDOW_STYLES).map(([k, l]) => `<button class="${st.windowStyle === k ? 'on' : ''}" data-field="windowStyle" data-val="${k}">${l}</button>`).join('')}</div>
    <div style="margin-top:8px">${swatches('windowColor', WINDOW_COLORS, st.windowColor)}</div>
    <label class="toggle"><input type="checkbox" data-field="flowers" ${st.flowers ? 'checked' : ''}><span></span> 🌸 Flori la ferestre</label>
    <label class="toggle"><input type="checkbox" data-field="door" ${st.door ? 'checked' : ''}><span></span> 🚪 Ușă</label>
    <div class="row">
      <button class="btn" data-act="surprise">🎲 Surpriză!</button>
      <button class="btn danger" data-act="remove">🗑️ Scoate</button>
    </div>`;
}

function updateStyle(field, val) {
  const b = currentB();
  if (!b) return;
  if (field === 'name') { b.name = val; save(); renderCards(); renderTray(); return; }
  b.style[field] = val;
  if (field === 'roof' && val === 'gable') b.style.difficulty = 'usor';
  save();
  refreshBuilding(field !== 'pitch');
}

const editor = $('#editor');
editor.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const b = currentB();
  if (t.dataset.field && t.dataset.val != null) return updateStyle(t.dataset.field, t.dataset.val);
  if (t.dataset.act === 'lv-' || t.dataset.act === 'lv+') {
    b.style.levels = Math.max(1, Math.min(40, b.style.levels + (t.dataset.act === 'lv+' ? 1 : -1)));
    save();
    refreshBuilding(true);
  }
  if (t.dataset.act === 'surprise') {
    const r = (a) => a[Math.floor(Math.random() * a.length)];
    Object.assign(b.style, {
      wallColor: r(WALL_COLORS), roofColor: r(ROOF_COLORS), windowColor: r(WINDOW_COLORS),
      windowStyle: r(Object.keys(WINDOW_STYLES).filter((k) => k !== 'gol')), flowers: Math.random() < 0.5,
    });
    save();
    refreshBuilding(true);
    say(r(['Tadaaa! ✨', 'Ce zici de asta? 🎨', 'Abracadabra! 🪄']), 2000);
  }
  if (t.dataset.act === 'remove') removeBuilding(b.id);
});
editor.addEventListener('input', (e) => {
  const f = e.target.dataset.field;
  if (!f) return;
  if (e.target.type === 'checkbox') updateStyle(f, e.target.checked);
  else if (e.target.type === 'range') updateStyle(f, +e.target.value);
  else if (e.target.type === 'color') updateStyle(f, e.target.value);
  else if (f === 'name') updateStyle(f, e.target.value);
});

let refreshTimer;
function refreshBuilding(rerenderEditor) {
  if (rerenderEditor) renderEditor();
  renderCards();
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { update3D(); renderPaper(); }, 60);
}

async function update3D() {
  const b = currentB();
  const p = await ensurePreview();
  $('#viewerMsg').hidden = !!(b && p);
  if (b && p) p.setBuilding(buildingShape(b), b.style);
}

function renderPaper() {
  const b = currentB();
  const box = $('#paperPages');
  box.innerHTML = '';
  if (!b) return;
  const i = state.basket.indexOf(b);
  const k = computeScales(state.basket, state.print)[i];
  const pages = packPieces(buildNet(buildingShape(b), b.style, k, { base: state.print.base }));
  $('#paperInfo').textContent = `· ${pages.length} ${pages.length === 1 ? 'foaie' : 'foi'} A4 · scara ${scaleLabel(k)}`;
  const W = 170, s = W / PAGE.w;
  for (const items of pages) {
    const c = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr; c.height = PAGE.h * s * dpr;
    c.style.width = W + 'px'; c.style.height = PAGE.h * s + 'px';
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, PAGE.h * s);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(0, 0, W, (PAGE.margin + 8) * s);
    const pen = canvasPen(ctx, s);
    for (const it of items) drawPiece(pen, it, PAGE.margin + it.x, PAGE.margin + PAGE.header + it.y, { coloring: state.print.coloring });
    box.appendChild(c);
  }
}

function renderStep2() {
  if (!state.basket.length) { goStep(1); return; }
  if (!currentB()) state.current = state.basket[0].id;
  renderCards();
  renderEditor();
  update3D();
  renderPaper();
}

const foldRange = $('#foldRange');
foldRange.addEventListener('input', () => preview?.setFold(+foldRange.value / 100));
let playing = null;
$('#playFold').addEventListener('click', () => {
  if (!preview) return;
  cancelAnimationFrame(playing);
  const t0 = performance.now();
  const dur = 3200;
  const step = (now) => {
    const u = Math.min(1, (now - t0) / dur);
    // întâi se desface, apoi se pliază la loc
    const v = u < 0.3 ? 1 - u / 0.3 : (u - 0.3) / 0.7;
    const e = v * v * (3 - 2 * v);
    foldRange.value = Math.round(e * 100);
    preview.setFold(e);
    if (u < 1) playing = requestAnimationFrame(step);
    else preview.spin();
  };
  playing = requestAnimationFrame(step);
});

// --- pasul 3: tipărire ---
function renderStep3() {
  const p = state.print;
  $('#kidName').value = p.kidName;
  $('#sizeSeg').innerHTML = Object.entries(SIZES).map(([k, s]) => `<button type="button" class="${p.size === k ? 'on' : ''}" data-size="${k}"><span class="ico">${k === 'mic' ? '🐭' : k === 'mediu' ? '🐱' : '🐘'}</span>${s.label}<small>~${s.mm / 10} cm</small></button>`).join('');
  $('#optSame').checked = p.sameScale;
  $('#optColor').checked = p.coloring;
  $('#optBase').checked = p.base;
  $('#optPlan').checked = p.plan;
  $('#optPlan').closest('label').hidden = !state.basket.some((b) => b.origin);
  updateSummary();
}

function updateSummary() {
  const scales = computeScales(state.basket, state.print);
  let pages = 1;
  state.basket.forEach((b, i) => { pages += packPieces(buildNet(buildingShape(b), b.style, scales[i], { base: state.print.base })).length; });
  const plan = state.print.plan && state.basket.some((b) => b.origin);
  $('#printSummary').textContent = `🏘️ ${state.basket.length} ${state.basket.length === 1 ? 'clădire' : 'clădiri'} · 📄 ${pages}${plan ? '+' : ''} foi A4 (copertă${plan ? ', planșă' : ''} și foile clădirilor)`;
}

$('#kidName').addEventListener('input', (e) => { state.print.kidName = e.target.value; save(); });
$('#sizeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-size]');
  if (!b) return;
  state.print.size = b.dataset.size;
  save();
  renderStep3();
});
[['#optSame', 'sameScale'], ['#optColor', 'coloring'], ['#optBase', 'base'], ['#optPlan', 'plan']].forEach(([sel, key]) =>
  $(sel).addEventListener('change', (e) => { state.print[key] = e.target.checked; save(); updateSummary(); }));

let lastUrl = null;
$('#makePdf').addEventListener('click', () => {
  const btn = $('#makePdf');
  if (!window.jspdf) { say('Nu am putut încărca unealta de PDF. Verifică internetul. 📶'); return; }
  btn.disabled = true;
  btn.textContent = '⏳ Desenez foile…';
  setTimeout(() => {
    try {
      const doc = generatePDF(state.basket, state.print, mapApi ? mapApi.roads() : []);
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(doc.output('blob'));
      const name = (state.print.kidName || 'meu').trim().toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-');
      $('#pdfFrame').src = lastUrl;
      $('#pdfFrame').hidden = false;
      $('#pdfEmpty').hidden = true;
      const a = $('#pdfDownload');
      a.href = lastUrl;
      a.download = `orasul-${name}-pliabil.pdf`;
      a.hidden = false;
      confetti();
      say(`Gata! ${doc.getNumberOfPages()} foi pentru orașul tău. Spor la construit! 🎉`, 8000);
    } catch (e) {
      console.error(e);
      say('Ups, ceva n-a mers. Mai încearcă o dată! 🙈');
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Fă-mi PDF-ul!';
    }
  }, 30);
});

// --- confetti ---
function confetti() {
  const c = $('#confetti');
  const ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = ['#ff006e', '#ffd166', '#06d6a0', '#3a86ff', '#ff9f1c', '#8338ec'];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4, r: Math.random() * Math.PI,
    s: 6 + Math.random() * 8, c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const t0 = performance.now();
  const frame = (now) => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.r += 0.15;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (now - t0 < 3500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, c.width, c.height);
  };
  requestAnimationFrame(frame);
}

renderTray();
say(TIPS[1], 8000);
