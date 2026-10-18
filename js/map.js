// Harta: OpenStreetMap + clădirile reale încărcate prin Overpass.

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const MIN_ZOOM = 17;
const CELL = 0.005;

const STYLE = {
  idle: { color: '#3a86ff', weight: 1, fillColor: '#3a86ff', fillOpacity: 0.18 },
  hover: { color: '#3a86ff', weight: 2.5, fillColor: '#3a86ff', fillOpacity: 0.45 },
  selected: { color: '#ff006e', weight: 2.5, fillColor: '#ffbe0b', fillOpacity: 0.75 },
};

const ROAD_TYPES = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|pedestrian|service|footway|path|cycleway)(_link)?$/;

const TYPE_NAMES = {
  house: 'Casă', detached: 'Casă', semidetached_house: 'Casă', residential: 'Clădire', apartments: 'Bloc',
  church: 'Biserică', cathedral: 'Catedrală', chapel: 'Capelă', school: 'Școală', kindergarten: 'Grădiniță',
  university: 'Universitate', hospital: 'Spital', commercial: 'Clădire de birouri', office: 'Birouri',
  retail: 'Magazin', supermarket: 'Supermarket', industrial: 'Fabrică', warehouse: 'Depozit',
  garage: 'Garaj', garages: 'Garaje', shed: 'Șopron', hotel: 'Hotel', train_station: 'Gară',
  civic: 'Clădire publică', public: 'Clădire publică', government: 'Clădire publică', castle: 'Castel',
  tower: 'Turn', stadium: 'Stadion', mosque: 'Moschee', synagogue: 'Sinagogă', palace: 'Palat',
};

export function buildingTitle(tags) {
  if (tags.name) return tags.name;
  const base = TYPE_NAMES[tags.building] || (tags.amenity === 'place_of_worship' ? 'Biserică' : 'Clădire');
  if (tags['addr:street']) return `${base}, ${tags['addr:street']}${tags['addr:housenumber'] ? ' ' + tags['addr:housenumber'] : ''}`;
  return base;
}

function outerRing(el) {
  if (el.type === 'way' && el.geometry) return el.geometry.map((g) => [g.lat, g.lon]);
  if (el.type === 'relation' && el.members) {
    let best = null;
    for (const m of el.members) {
      if (m.role !== 'outer' || !m.geometry || m.geometry.length < 4) continue;
      const g = m.geometry;
      if (g[0].lat !== g[g.length - 1].lat || g[0].lon !== g[g.length - 1].lon) continue;
      if (!best || g.length > best.length) best = g;
    }
    return best ? best.map((g) => [g.lat, g.lon]) : null;
  }
  return null;
}

async function overpass(query) {
  let lastErr;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function initMap(el, { onPick, isSelected, onStatus }) {
  const map = L.map(el, { preferCanvas: true, zoomControl: true, minZoom: 3, maxZoom: 19 }).setView([44.4413, 26.0973], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const layer = L.layerGroup().addTo(map);
  const buildings = new Map();
  const roads = new Map();
  const loaded = new Set();
  let busy = false, pending = false, timer = null;

  function styleFor(id) {
    return isSelected(id) ? STYLE.selected : STYLE.idle;
  }

  function addBuilding(el) {
    const id = el.type[0] + el.id;
    if (buildings.has(id)) return;
    const latlngs = outerRing(el);
    if (!latlngs || latlngs.length < 4) return;
    const data = { id, tags: el.tags || {}, latlngs, name: buildingTitle(el.tags || {}) };
    const poly = L.polygon(latlngs, styleFor(id));
    poly.bindTooltip(() => `<b>${escapeHtml(data.name)}</b>${data.tags['building:levels'] ? `<br>${data.tags['building:levels']} etaje` : ''}<br><i>${isSelected(id) ? 'Atinge ca s-o scoți' : 'Atinge ca s-o alegi!'}</i>`, { sticky: true, direction: 'top' });
    poly.on('mouseover', () => { if (!isSelected(id)) poly.setStyle(STYLE.hover); });
    poly.on('mouseout', () => poly.setStyle(styleFor(id)));
    poly.on('click', (e) => { L.DomEvent.stop(e); onPick(data, e.containerPoint); poly.setStyle(styleFor(id)); });
    poly.addTo(layer);
    buildings.set(id, { data, poly });
  }

  async function load() {
    if (map.getZoom() < MIN_ZOOM) { onStatus('zoom'); return; }
    if (busy) { pending = true; return; }
    const b = map.getBounds();
    const cells = [];
    for (let la = Math.floor(b.getSouth() / CELL); la <= Math.floor(b.getNorth() / CELL); la++) {
      for (let lo = Math.floor(b.getWest() / CELL); lo <= Math.floor(b.getEast() / CELL); lo++) {
        if (!loaded.has(la + ':' + lo)) cells.push([la, lo]);
      }
    }
    if (!cells.length) { onStatus('ok', buildings.size); return; }
    const s = Math.min(...cells.map((c) => c[0])) * CELL, w = Math.min(...cells.map((c) => c[1])) * CELL;
    const n = (Math.max(...cells.map((c) => c[0])) + 1) * CELL, e = (Math.max(...cells.map((c) => c[1])) + 1) * CELL;
    const bb = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
    const q = `[out:json][timeout:25];(way["building"](${bb});relation["building"]["type"="multipolygon"](${bb});way["highway"](${bb}););out geom;`;
    busy = true;
    onStatus('loading');
    try {
      const json = await overpass(q);
      for (const el of json.elements) {
        if (el.tags?.highway) {
          if (el.type === 'way' && ROAD_TYPES.test(el.tags.highway) && el.geometry && !roads.has(el.id)) {
            roads.set(el.id, { type: el.tags.highway.replace('_link', ''), latlngs: el.geometry.map((g) => [g.lat, g.lon]) });
          }
        } else addBuilding(el);
      }
      cells.forEach(([la, lo]) => loaded.add(la + ':' + lo));
      onStatus('ok', buildings.size);
    } catch (err) {
      console.warn('Overpass', err);
      onStatus('error');
    } finally {
      busy = false;
      if (pending) { pending = false; load(); }
    }
  }

  map.on('moveend', () => {
    clearTimeout(timer);
    timer = setTimeout(load, 450);
  });
  setTimeout(load, 300);

  return {
    map,
    refresh(id) {
      const b = buildings.get(id);
      if (b) b.poly.setStyle(styleFor(id));
    },
    refreshAll() { for (const [id, b] of buildings) b.poly.setStyle(styleFor(id)); },
    flyTo(lat, lng, z = 18) { map.flyTo([lat, lng], z, { duration: 1.6 }); },
    roads() { return [...roads.values()]; },
    retry() { load(); },
  };
}

export async function searchPlace(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=ro&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
