// Brasília traffic: typical cars (Gol, Gol rebaixado, Uno com escada, BYD, sedan, PMDF), buses in
// the operators' colours, BRT and the "zebrinha". Vehicles follow each other on straight lanes,
// stop at traffic lights where the W3 and the L2 cross the Eixo Monumental, and are drawn as one
// InstancedMesh per type and colour role. Buses carry grapple anchors (the hook sticks to them and
// drags the player along) and every vehicle exposes x/z/axis/w/d so the game can run things over.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, makeInkMaterial } from '../render.js';

const { BLUE: BL, RED: RD, BLACK: BK, ORANGE: OR, GREEN: GN, PINK: PK } = INK;
// a colour is [ink, filled]: unfilled slate reads as white paint, unfilled amber as yellow
const WHITE = [BK, 0], SILVER = [BK, 0], BLACKP = [BK, 1], RED = [RD, 1], BLUE = [BL, 1], GREEN = [GN, 1], PINKP = [PK, 0], YELLOW = [OR, 0], ORANGE = [OR, 1], TERRA = [RD, 0];

// Bus operators of the Distrito Federal: white body + the bacia colour on the skirt and rear.
// (easy to retune here if a colour is off)
export const BUS_OPERATORS = [
  { name: 'Piracicabana', band: BLUE },
  { name: 'Pioneira', band: YELLOW },
  { name: 'Urbi', band: RED },
  { name: 'Marechal', band: ORANGE },
  { name: 'São José', band: TERRA },
];

// [w, h, d, max speed factor]
const SPEC = {
  gol: [1.72, 1.45, 3.9], golbaixo: [1.72, 1.3, 3.9], uno: [1.62, 1.55, 3.7], byd: [1.78, 1.55, 4.1],
  sedan: [1.8, 1.45, 4.5], pmdf: [1.92, 1.8, 4.8], bus: [2.6, 3.1, 12], brt: [2.6, 3.1, 18.4], zebrinha: [2.4, 2.9, 8.6],
};
const BUSLIKE = { bus: true, brt: true, zebrinha: true };

function vehicleGeometry(type) {
  const [w, h, d] = SPEC[type]; const roles = {};
  const add = (role, g, x, y, z) => { g.translate(x, y, z); (roles[role] || (roles[role] = [])).push(g); };
  const B = (role, bw, bh, bd, x, y, z) => add(role, new THREE.BoxGeometry(bw, bh, bd), x, y, z); // y = bottom
  const boxAt = (role, bw, bh, bd, x, y, z) => B(role, bw, bh, bd, x, y + bh / 2, z);
  const wheel = (r, x, z, rim) => { const c = new THREE.CylinderGeometry(r, r, 0.26, 12); c.rotateZ(Math.PI / 2); add('dark', c, x, r, z); if (rim) { const q = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.28, 10); q.rotateZ(Math.PI / 2); add('white', q, x, r, z); } };
  const wheels = (r, zf, zb, rim, inset = 0.02) => { for (const sx of [-1, 1]) for (const z of [zf, zb]) wheel(r, sx * (w / 2 - inset), z, rim); };
  const lamps = (y, front = true, back = true, sx = 0.33) => { for (const s of [-1, 1]) { if (front) boxAt('light', 0.34, 0.18, 0.08, s * w * sx, y, d / 2 + 0.03); if (back) boxAt('tail', 0.32, 0.18, 0.08, s * w * sx, y, -d / 2 - 0.03); } };

  if (type === 'gol' || type === 'golbaixo') {
    const low = type === 'golbaixo' ? -0.14 : 0;
    boxAt('body', w, 0.62, d, 0, 0.3 + low, 0);
    boxAt('body', w, 0.16, d * 0.36, 0, 0.92 + low, d * 0.3); // capô
    boxAt('glass', w * 0.9, 0.5, 2.05, 0, 0.92 + low, -0.4);
    boxAt('body', w * 0.88, 0.09, 1.85, 0, 1.42 + low, -0.45);
    boxAt('dark', w + 0.04, 0.2, 0.22, 0, 0.32 + low, d / 2); boxAt('dark', w + 0.04, 0.2, 0.22, 0, 0.32 + low, -d / 2);
    lamps(0.72 + low);
    if (type === 'golbaixo') {
      wheels(0.36, d * 0.31, -d * 0.31, true, -0.04);
      boxAt('body', w * 0.8, 0.07, 0.36, 0, 1.53 + low, -1.35); // aerofólio
      boxAt('neon', w * 0.92, 0.05, d * 0.86, 0, 0.12, 0); // neon embaixo do carro
      boxAt('dark', 0.16, 0.16, 0.3, w * 0.28, 0.22, -d / 2 - 0.12); // ponteira do escapamento
    } else wheels(0.33, d * 0.31, -d * 0.31, false);
  } else if (type === 'uno') {
    boxAt('body', w, 0.64, d, 0, 0.3, 0);
    boxAt('body', w, 0.1, d * 0.3, 0, 0.94, d * 0.33);
    boxAt('glass', w * 0.92, 0.6, 2.25, 0, 0.94, -0.3);
    boxAt('body', w * 0.92, 0.08, 2.2, 0, 1.54, -0.3);
    boxAt('dark', w + 0.04, 0.22, 0.2, 0, 0.3, d / 2); boxAt('dark', w + 0.04, 0.22, 0.2, 0, 0.3, -d / 2);
    lamps(0.74); wheels(0.31, d * 0.31, -d * 0.32, false);
    // bagageiro com a escada de alumínio que passa da frente e da traseira
    for (const z of [-1.1, 0.5]) boxAt('dark', w * 0.96, 0.06, 0.08, 0, 1.68, z);
    const L = 4.7; for (const sx of [-0.28, 0.28]) boxAt('white', 0.07, 0.07, L, sx, 1.76, -0.15);
    for (let i = 0; i < 12; i++) boxAt('white', 0.6, 0.05, 0.05, 0, 1.77, -0.15 - L / 2 + 0.2 + i * (L - 0.4) / 11);
  } else if (type === 'byd') {
    boxAt('body', w, 0.62, d, 0, 0.3, 0);
    const cab = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); cab.scale(w * 0.47, 0.62, d * 0.4); add('glass', cab, 0, 0.9, -0.15);
    const top = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2); top.scale(w * 0.42, 0.46, d * 0.31); add('body', top, 0, 1.08, -0.25);
    boxAt('tail', w * 0.86, 0.12, 0.08, 0, 0.82, -d / 2 - 0.03); // barra de luz traseira
    for (const s of [-1, 1]) boxAt('light', 0.42, 0.1, 0.08, s * w * 0.32, 0.78, d / 2 + 0.03);
    boxAt('dark', w + 0.02, 0.16, 0.18, 0, 0.3, d / 2); boxAt('dark', w + 0.02, 0.16, 0.18, 0, 0.3, -d / 2);
    wheels(0.34, d * 0.32, -d * 0.32, true);
  } else if (type === 'sedan') {
    boxAt('body', w, 0.66, d, 0, 0.3, 0);
    boxAt('glass', w * 0.9, 0.52, 2.1, 0, 0.96, -0.15);
    boxAt('body', w * 0.88, 0.08, 1.9, 0, 1.48, -0.15);
    boxAt('dark', w + 0.04, 0.2, 0.2, 0, 0.32, d / 2); boxAt('dark', w + 0.04, 0.2, 0.2, 0, 0.32, -d / 2);
    lamps(0.76); wheels(0.34, d * 0.31, -d * 0.31, false);
  } else if (type === 'pmdf') {
    boxAt('body', w, 0.86, d, 0, 0.38, 0);
    boxAt('glass', w * 0.92, 0.62, 2.6, 0, 1.24, -0.45);
    boxAt('body', w * 0.92, 0.09, 2.5, 0, 1.86, -0.45);
    boxAt('band', w + 0.04, 0.22, d * 0.8, 0, 0.82, -0.1); // faixa da viatura
    boxAt('siren1', 0.55, 0.22, 0.4, -0.32, 1.95, -0.3); boxAt('siren2', 0.55, 0.22, 0.4, 0.32, 1.95, -0.3);
    boxAt('dark', w + 0.04, 0.3, 0.24, 0, 0.36, d / 2 + 0.02); lamps(0.95, true, true, 0.36);
    wheels(0.42, d * 0.31, -d * 0.31, true);
  } else if (type === 'bus' || type === 'zebrinha') {
    const bot = 0.38, top = h;
    boxAt('body', w, top - bot, d, 0, bot, 0);
    boxAt('band', w + 0.03, 0.75, d + 0.03, 0, bot + 0.05, 0); // saia na cor da bacia
    for (const s of [-1, 1]) boxAt('glass', 0.05, 0.95, d * 0.74, s * (w / 2 + 0.01), 1.55, -d * 0.06); // janelas laterais
    boxAt('glass', w * 0.9, 1.25, 0.06, 0, 1.25, d / 2 + 0.02); // para-brisa
    boxAt('glass', w * 0.8, 0.7, 0.06, 0, 1.75, -d / 2 - 0.02);
    boxAt('light', w * 0.7, 0.32, 0.07, 0, top - 0.42, d / 2 + 0.05); // letreiro
    boxAt('white', w * 0.6, 0.32, d * 0.24, 0, top, -d * 0.12); // ar-condicionado
    boxAt('dark', 0.06, 1.9, 1.1, -w / 2 - 0.02, bot + 0.1, d * 0.36); boxAt('dark', 0.06, 1.9, 1.1, -w / 2 - 0.02, bot + 0.1, -d * 0.08); // portas
    if (type === 'bus') { boxAt('band', w + 0.04, 1.35, 1.6, 0, 1.45, -d / 2 + 0.75); boxAt('band', w + 0.04, 0.2, d * 0.5, 0, 2.5, -d * 0.2); }
    else for (let i = 0; i < 7; i++) { // listras da zebrinha
      for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.05, 2.1, 0.42); g.rotateX(0.42); add('band', g, s * (w / 2 + 0.035), 1.45, -d / 2 + 1.0 + i * 1.05); }
    }
    for (const s of [-1, 1]) { boxAt('light', 0.3, 0.22, 0.06, s * w * 0.38, 0.62, d / 2 + 0.03); boxAt('tail', 0.26, 0.34, 0.06, s * w * 0.4, 0.75, -d / 2 - 0.03); }
    wheels(0.52, d * 0.33, -d * 0.24, true, 0.06);
  } else if (type === 'brt') {
    const bot = 0.38, fl = 10.2, rl = 7.4, gap = 0.8; const zf = d / 2 - fl / 2, zr = -d / 2 + rl / 2;
    for (const [len, z] of [[fl, zf], [rl, zr]]) {
      boxAt('body', w, h - bot, len, 0, bot, z);
      for (const s of [-1, 1]) boxAt('glass', 0.05, 1.0, len * 0.8, s * (w / 2 + 0.01), 1.5, z);
      boxAt('band', w + 0.03, 0.4, len + 0.03, 0, bot + 0.05, z);
      boxAt('dark', 0.06, 2.0, 1.4, -w / 2 - 0.02, bot + 0.05, z); boxAt('dark', 0.06, 2.0, 1.4, w / 2 + 0.02, bot + 0.05, z); // portas dos dois lados (estação BRT)
      wheels(0.52, z + len * 0.3, z - len * 0.3, true, 0.06);
    }
    boxAt('dark', w * 0.92, h - bot - 0.3, gap + 0.2, 0, bot + 0.15, d / 2 - fl - gap / 2); // sanfona
    boxAt('glass', w * 0.9, 1.3, 0.06, 0, 1.25, d / 2 + 0.02); boxAt('light', w * 0.7, 0.32, 0.07, 0, h - 0.42, d / 2 + 0.05);
    boxAt('white', w * 0.6, 0.32, 3, 0, h, zf);
    for (const s of [-1, 1]) { boxAt('light', 0.3, 0.22, 0.06, s * w * 0.38, 0.62, d / 2 + 0.03); boxAt('tail', 0.26, 0.34, 0.06, s * w * 0.4, 0.75, -d / 2 - 0.03); }
  }
  const out = {};
  for (const r in roles) { const list = roles[r]; out[r] = list.length === 1 ? list[0] : mergeGeometries(list, false); if (list.length > 1) for (const g of list) g.dispose(); }
  return out;
}

// default colour for each role (the body, band and neon come from the vehicle's own palette)
const ROLE_DEFAULT = { dark: BLACKP, glass: [BL, 1], light: [OR, 1], tail: RED, white: WHITE, siren1: RED, siren2: BLUE, neon: [GN, 1] };

const CAR_PALETTES = {
  gol: [WHITE, SILVER, BLACKP, RED, SILVER, WHITE, BLUE],
  golbaixo: [BLACKP, RED, BLACKP, BLUE, WHITE],
  uno: [WHITE, RED, WHITE, SILVER, GREEN, WHITE],
  byd: [WHITE, PINKP, BLUE, WHITE, SILVER, GREEN],
  sedan: [SILVER, BLACKP, WHITE, BLUE, SILVER],
  pmdf: [WHITE],
};
const NEON = [[GN, 1], [PK, 1], [BL, 1], [OR, 1]];

/**
 * lanes: [{ axis: 'x'|'z', c, dir: ±1, from, to, vmax, mix: [[type, weight]…], count, stops: [{ lo, hi, group }] }]
 * signals: { groupName: (t) => true while green }
 */
export function buildTraffic(B, lanes, signals = {}) {
  const { L, scene } = B; const cars = []; let opIdx = 0, palIdx = 0;
  const pick = (mix, k) => { let tot = 0; for (const [, wgt] of mix) tot += wgt; let r = ((k * 0.6180339887) % 1) * tot; for (const [t, wgt] of mix) { if ((r -= wgt) <= 0) return t; } return mix[0][0]; };
  let k = 1;
  for (const lane of lanes) {
    lane.cars = []; const len = lane.to - lane.from;
    for (let i = 0; i < lane.count; i++) {
      const type = pick(lane.mix, k++); const [w, h, d] = SPEC[type];
      const pal = { band: [BK, 1], neon: NEON[k % NEON.length] };
      if (type === 'bus') { const op = BUS_OPERATORS[opIdx++ % BUS_OPERATORS.length]; pal.body = WHITE; pal.band = op.band; pal.op = op.name; }
      else if (type === 'zebrinha') { pal.body = WHITE; pal.band = BLACKP; pal.op = 'Zebrinha'; }
      else if (type === 'brt') { pal.body = YELLOW; pal.band = [BK, 0]; pal.op = 'BRT'; }
      else if (type === 'pmdf') { pal.body = WHITE; pal.band = [BL, 1]; }
      else { const list = CAR_PALETTES[type]; pal.body = list[palIdx++ % list.length]; }
      const s = lane.from + ((i + 0.5) / lane.count) * len;
      const vmax = (BUSLIKE[type] ? lane.vmax * 0.68 : lane.vmax) * (0.9 + ((k * 0.37) % 0.2));
      const car = { type, w, h, d, isBus: !!BUSLIKE[type], lane, axis: lane.axis, dir: lane.dir, s, v: lane.parked ? 0 : vmax * 0.6, vmax: lane.parked ? 0 : vmax, pal,
        x: 0, y: 0, z: 0, laneX: 0, speed: 0, group: new THREE.Object3D(), vel: new THREE.Vector3(), hidden: false, anchors: [] };
      car.group.rotation.order = 'YXZ';
      lane.cars.push(car); cars.push(car);
      if (car.isBus) for (const f of type === 'zebrinha' ? [-0.25, 0.25] : [-0.32, 0, 0.32]) {
        const a = new THREE.Object3D(); car.anchors.push({ obj: a, off: f * d });
        L.grappleMovers.push({ mesh: a, radius: 2.0, vel: car.vel, drag: true, car });
      }
    }
  }
  // one InstancedMesh per (type, role)
  const mat = makeInkMaterial({ ink: BK, fill: true, side: THREE.DoubleSide });
  const pools = [];
  for (const type in SPEC) {
    const list = cars.filter((c) => c.type === type); if (!list.length) continue;
    const geos = vehicleGeometry(type);
    for (const role in geos) {
      const im = new THREE.InstancedMesh(geos[role], mat, list.length); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach((c, i) => { const col = c.pal[role] || ROLE_DEFAULT[role] || c.pal.body; im.instanceColor.setXYZ(i, col[0], col[1], 0); });
      im.frustumCulled = false; scene.add(im); L.meshes.push(im); pools.push({ im, list, role });
    }
  }
  const place = (c) => {
    const lane = c.lane;
    if (lane.axis === 'z') { c.x = lane.c; c.z = c.s; c.group.rotation.y = c.dir > 0 ? 0 : Math.PI; }
    else { c.x = c.s; c.z = lane.c; c.group.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
    c.y = lane.yAt ? lane.yAt(c.s) : 0;
    if (lane.yAt) { const dy = lane.yAt(c.s + c.dir * 0.8) - lane.yAt(c.s - c.dir * 0.8); c.group.rotation.x = -Math.atan2(dy, 1.6); }
    c.laneX = c.x; c.group.position.set(c.x, c.hidden ? -60 : c.y, c.z);
    c.speed = c.v; c.vel.set(lane.axis === 'x' ? c.v * c.dir : 0, 0, lane.axis === 'z' ? c.v * c.dir : 0);
    for (const a of c.anchors) a.obj.position.set(c.x + (lane.axis === 'x' ? a.off * c.dir : 0), c.hidden ? -60 : c.y + c.h + 0.35, c.z + (lane.axis === 'z' ? a.off * c.dir : 0));
  };
  const sync = () => {
    for (const c of cars) { place(c); c.group.updateMatrix(); }
    for (const p of pools) { p.list.forEach((c, i) => p.im.setMatrixAt(i, c.group.matrix)); p.im.instanceMatrix.needsUpdate = true; }
  };
  sync();

  // traffic-light heads (visual): each one switches between green / amber / red
  const heads = [];
  function lightPole(x, z, group, faceRot = 0) {
    B.cyl(x, 0, z, 0.12, 4.6, { ink: BK, seg: 6 });
    B.box(x, 4.0, z, 0.5, 1.5, 0.5, { ink: BK, noCollide: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.56), makeInkMaterial({ ink: GN, fill: true }));
    m.position.set(x, 4.85, z); m.rotation.y = faceRot; scene.add(m); L.meshes.push(m); heads.push({ m, group });
  }
  const stateOf = (group, t) => { const f = signals[group]; if (!f) return 'g'; return f(t); };

  let lastT = 0, headT = 0;
  function update(t) {
    const dt = lastT ? Math.min(0.05, Math.max(0, t - lastT)) : 0.016; lastT = t;
    for (const lane of lanes) {
      if (lane.parked) continue;
      const list = lane.cars, dir = lane.dir;
      list.sort((a, b) => (b.s - a.s) * dir); // front-most first
      let ahead = null;
      for (const c of list) {
        if (c.hidden) { // waiting at the lane start for a gap
          const tail = list.reduce((m, o) => (!o.hidden && o !== c && ((o.s - lane.start(c)) * dir) < m ? (o.s - lane.start(c)) * dir : m), Infinity);
          if (tail > c.d + 6) { c.hidden = false; c.s = lane.start(c); c.v = c.vmax * 0.7; }
          continue;
        }
        let limit = Infinity;
        if (ahead) limit = (ahead.s - c.s) * dir - (ahead.d + c.d) / 2 - 2.6;
        const front = c.s + dir * c.d / 2;
        if (lane.stops) for (const st of lane.stops) {
          const state = stateOf(st.group, t); if (state === 'g') continue;
          const line = dir > 0 ? st.lo : st.hi; const dist = (line - front) * dir;
          if (dist < -0.3 || dist > 60) continue;
          if (state === 'y' && dist < (c.v * c.v) / 16 + 1) continue; // too close to stop on amber
          limit = Math.min(limit, dist - 0.8);
        }
        // Ônibus em movimento param brevemente (~3.2s) nos pontos de ônibus da sua faixa para embarque/desembarque
        if (c.isBus && L.busStops && L.busStops.length) {
          if (c.stopWaitT > 0) {
            c.stopWaitT -= dt;
            limit = 0;
            if (c.stopWaitT <= 0) c.stopCd = 9.0;
          } else {
            if (c.stopCd > 0) c.stopCd -= dt;
            else {
              for (let si = 0; si < L.busStops.length; si++) {
                const bs = L.busStops[si];
                if (bs.axis && bs.axis !== lane.axis) continue;
                const latD = lane.axis === 'z' ? Math.abs(c.x - bs.x) : Math.abs(c.z - bs.z);
                if (latD > 11) continue;
                const alongS = lane.axis === 'z' ? bs.z : bs.x;
                const dist = (alongS - c.s) * dir;
                if (dist > -1.2 && dist < 14) {
                  limit = Math.min(limit, Math.max(0, dist));
                  if (dist < 1.8 && c.v < 2.2) { c.stopWaitT = 3.2; c.stoppedAt = bs; limit = 0; }
                  break;
                }
              }
            }
          }
        }
        const target = Math.max(0, Math.min(c.vmax, limit / 1.05));
        if (target > c.v) c.v = Math.min(target, c.v + 5.5 * dt); else c.v = Math.max(target, c.v - 16 * dt);
        if (limit < 0.2) c.v = 0;
        c.s += c.v * dir * dt;
        if ((c.s - lane.end) * dir > 0) { c.hidden = true; c.s = lane.start(c); c.v = 0; }
        ahead = c;
      }
    }
    sync();
    headT -= dt;
    if (headT <= 0) { headT = 0.2; for (const h of heads) { const s = stateOf(h.group, t); h.m.material.uniforms.uInk.value = s === 'g' ? GN : s === 'y' ? OR : RD; } }
  }
  for (const lane of lanes) {
    lane.start = (c) => (lane.dir > 0 ? Math.min(lane.from, lane.to) - c.d / 2 : Math.max(lane.from, lane.to) + c.d / 2);
    lane.end = lane.dir > 0 ? Math.max(lane.from, lane.to) + 4 : Math.min(lane.from, lane.to) - 4;
  }
  return { cars, update, lightPole };
}

// =====================================================================================================
// Trânsito em rede (Brasília real): os carros andam pelas vias do OpenStreetMap, faixa por faixa,
// escolhem o caminho em cada nó, respeitam quem está na frente (inclusive na próxima via) e só
// entram/saem do mapa pelos túneis da borda. Nada de carro surgindo do nada no meio da pista.
//   net = { nodes: [[x,z]], edges: [[a, b, road, fw]], roads: [{ pts:[x,y,z...], lanes, width, oneway, cls, name }],
//           sources: [node], sinks: [node], stops: [{ x, z, edges: [[edge, s]] }], speed: {cls: m/s} }
// =====================================================================================================
const _p = new THREE.Vector3();
export function buildGraphTraffic(B, net, opts = {}) {
  const { L, scene } = B; const LWg = opts.laneWidth ?? 2.7;
  const roads = net.roads;
  // ---------------- faixas: polilinha deslocada para a direita de quem dirige
  const edges = net.edges.map(([a, b, ri, fw], id) => {
    const r = roads[ri]; const P = [];
    for (let i = 0; i < r.pts.length; i += 3) P.push([r.pts[i], r.pts[i + 1], r.pts[i + 2]]);
    if (fw < 0) P.reverse();
    const nl = r.oneway ? r.lanes : Math.max(1, r.lanes / 2);
    const lanes = [];
    for (let li = 0; li < nl; li++) {
      const off = r.oneway ? -r.width / 2 + (li + 0.5) * LWg : (li + 0.5) * LWg;
      const pts = [], cum = [0];
      for (let i = 0; i < P.length; i++) {
        const pa = P[Math.max(0, i - 1)], pb = P[Math.min(P.length - 1, i + 1)];
        let tx = pb[0] - pa[0], tz = pb[2] - pa[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        // direita de quem anda em (tx, tz) no plano xz: (-tz, tx)
        pts.push(P[i][0] - tz * off, P[i][1], P[i][2] + tx * off);
        if (i) cum.push(cum[i - 1] + Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 2] - pts[i * 3 - 1]));
      }
      lanes.push({ pts, cum, len: cum[cum.length - 1], cars: [] });
    }
    return { id, a, b, road: ri, fw, cls: r.cls, name: r.name, lanes, len: lanes[0].len, vmax: (net.speed[r.cls] || 10), stops: [] };
  });
  const outE = net.nodes.map(() => []), inE = net.nodes.map(() => []);
  for (const e of edges) { outE[e.a].push(e); inE[e.b].push(e); }
  const isSink = new Set(net.sinks), sources = net.sources.slice();
  const lock = new Map(); // nó -> { car, t }
  for (const st of net.stops || []) for (const [ei, s] of st.edges) if (edges[ei]) edges[ei].stops.push({ s, st });

  // ---------------- frota
  const MIX = [['gol', 5], ['uno', 3], ['sedan', 3], ['byd', 2.4], ['golbaixo', 1.3], ['pmdf', 0.6], ['bus', 2.6], ['zebrinha', 0.6], ['brt', 0.4]];
  const target = opts.count ?? 150;
  const cars = []; let opIdx = 0, palIdx = 0, k = 1;
  const pick = () => { let tot = 0; for (const [, w] of MIX) tot += w; let r = Math.random() * tot; for (const [t, w] of MIX) { if ((r -= w) <= 0) return t; } return 'gol'; };
  function makeCar() {
    const type = pick(); const [w, h, d] = SPEC[type];
    const pal = { band: [BK, 1], neon: NEON[k++ % NEON.length] };
    if (type === 'bus') { const op = BUS_OPERATORS[opIdx++ % BUS_OPERATORS.length]; pal.body = WHITE; pal.band = op.band; pal.op = op.name; }
    else if (type === 'zebrinha') { pal.body = WHITE; pal.band = BLACKP; pal.op = 'Zebrinha'; }
    else if (type === 'brt') { pal.body = YELLOW; pal.band = [BK, 0]; pal.op = 'BRT'; }
    else if (type === 'pmdf') { pal.body = WHITE; pal.band = [BL, 1]; }
    else { const list = CAR_PALETTES[type]; pal.body = list[palIdx++ % list.length]; }
    const c = { type, w, h, d, isBus: !!BUSLIKE[type], pal, alive: true, hidden: true, edge: null, lane: 0, s: 0, v: 0, vf: 0.9 + Math.random() * 0.2,
      x: 0, y: -80, z: 0, yaw: 0, laneX: 0, speed: 0, axis: 'free', dir: 1, group: new THREE.Object3D(), vel: new THREE.Vector3(), anchors: [], seg: 0, rx: null, ry: 0, rz: 0, ryaw: 0, stopT: 0, stopCd: 0, lockNode: -1, wait: 0 };
    c.group.rotation.order = 'YXZ';
    if (c.isBus) for (const f of type === 'zebrinha' ? [-0.25, 0.25] : [-0.32, 0, 0.32]) {
      const a = new THREE.Object3D(); c.anchors.push({ obj: a, off: f * d });
      L.grappleMovers.push({ mesh: a, radius: 2.0, vel: c.vel, drag: true, car: c });
    }
    cars.push(c); return c;
  }
  for (let i = 0; i < target; i++) makeCar();
  const laneFor = (c, e) => { const n = e.lanes.length; return c.isBus ? n - 1 : Math.min(n - 1, Math.floor(Math.random() * n)); };
  function place(c, e, li, s) {
    c.edge = e; c.lane = li; c.s = s; c.seg = 0; c.hidden = false; c.v = Math.min(e.vmax, 8); c.rx = null; c.stopCd = 3;
    insertSorted(e.lanes[li].cars, c);
  }
  function insertSorted(arr, c) { let i = arr.length; while (i > 0 && arr[i - 1].s > c.s) i--; arr.splice(i, 0, c); }
  function removeFrom(c) { if (!c.edge) return; const arr = c.edge.lanes[c.lane].cars; const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); if (c.lockNode >= 0) { const lk = lock.get(c.lockNode); if (lk && lk.car === c) lock.delete(c.lockNode); c.lockNode = -1; } }
  // população inicial espalhada pela rede (o jogo começa com a cidade já em movimento)
  const allLanes = []; let totalLen = 0;
  for (const e of edges) for (let li = 0; li < e.lanes.length; li++) if (e.len > 12) { allLanes.push([e, li]); totalLen += e.len; }
  for (const c of cars) {
    for (let tries = 0; tries < 30; tries++) {
      let r = Math.random() * totalLen, pickL = allLanes[0];
      for (const al of allLanes) { if ((r -= al[0].len) <= 0) { pickL = al; break; } }
      const [e, li0] = pickL; const li = c.isBus ? e.lanes.length - 1 : li0; const s = 4 + Math.random() * (e.len - 8);
      if (e.lanes[li].cars.some((o) => Math.abs(o.s - s) < (o.d + c.d) / 2 + 6)) continue;
      place(c, e, li, s); break;
    }
  }
  // ---------------- posição sobre a polilinha
  function posAt(c) {
    const ln = c.edge.lanes[c.lane]; const cum = ln.cum, P = ln.pts;
    let i = Math.min(c.seg, cum.length - 2);
    while (i < cum.length - 2 && cum[i + 1] < c.s) i++;
    while (i > 0 && cum[i] > c.s) i--;
    c.seg = i;
    const segL = (cum[i + 1] - cum[i]) || 1, t = Math.max(0, Math.min(1, (c.s - cum[i]) / segL));
    const ax = P[i * 3], ay = P[i * 3 + 1], az = P[i * 3 + 2], bx = P[i * 3 + 3], by = P[i * 3 + 4], bz = P[i * 3 + 5];
    c.tx = bx - ax; c.tz = bz - az; const tl = Math.hypot(c.tx, c.tz) || 1;
    c.px = ax + (bx - ax) * t; c.py = ay + (by - ay) * t; c.pz = az + (bz - az) * t;
    c.pitch = Math.atan2(by - ay, tl); c.hd = Math.atan2(c.tx, c.tz); c.tx /= tl; c.tz /= tl;
  }
  function chooseNext(c) {
    const outs = outE[c.edge.b].filter((e) => e.road !== c.edge.road || e.fw === c.edge.fw);
    if (!outs.length) return null;
    let tot = 0; const ws = outs.map((e) => { let w = (e.name && e.name === c.edge.name) ? 4 : 1; if (c.isBus && /link/.test(e.cls)) w *= 0.3; if (/residential|living|unclassified/.test(e.cls)) w *= c.isBus ? 0.05 : 0.4; tot += w; return w; });
    let r = Math.random() * tot; for (let i = 0; i < outs.length; i++) if ((r -= ws[i]) <= 0) return outs[i];
    return outs[0];
  }
  function laneHeadroom(e, li) { const arr = e.lanes[li].cars; return arr.length ? arr[0].s - arr[0].d / 2 : 1e9; }
  const players = () => (opts.targets ? opts.targets() : []);
  function nearPlayer(x, z, r) { for (const p of players()) { if (!p || !p.body) continue; const dx = p.body.pos.x - x, dz = p.body.pos.z - z; if (dx * dx + dz * dz < r * r) return true; } return false; }

  // ---------------- desenho instanciado (um InstancedMesh por tipo e parte)
  const mat = makeInkMaterial({ ink: BK, fill: true, side: THREE.DoubleSide });
  const pools = [];
  for (const type in SPEC) {
    const list = cars.filter((c) => c.type === type); if (!list.length) continue;
    const geos = vehicleGeometry(type);
    for (const role in geos) {
      const im = new THREE.InstancedMesh(geos[role], mat, list.length); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach((c, i) => { const col = c.pal[role] || ROLE_DEFAULT[role] || c.pal.body; im.instanceColor.setXYZ(i, col[0], col[1], 0); });
      im.frustumCulled = false; scene.add(im); L.meshes.push(im); pools.push({ im, list });
    }
  }
  const heads = [];
  let lastT = 0, spawnT = 0;
  function update(t) {
    const dt = lastT ? Math.min(0.05, Math.max(0, t - lastT)) : 0.016; lastT = t;
    // nascem nos túneis da borda quando falta carro e ninguém está olhando de perto
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.35;
      const free = cars.find((c) => c.hidden);
      if (free && sources.length) {
        const n = sources[Math.floor(Math.random() * sources.length)]; const outs = outE[n];
        if (outs.length) { const e = outs[Math.floor(Math.random() * outs.length)]; const li = laneFor(free, e);
          if (laneHeadroom(e, li) > free.d + 5 && !nearPlayer(e.lanes[li].pts[0], e.lanes[li].pts[2], 35)) place(free, e, li, 0.5); }
      }
    }
    for (const c of cars) {
      if (c.hidden) continue;
      const e = c.edge, ln = e.lanes[c.lane], arr = ln.cars, idx = arr.indexOf(c);
      let limit = Infinity;
      const ahead = arr[idx + 1];
      if (ahead) limit = ahead.s - c.s - (ahead.d + c.d) / 2 - 2.4;
      const toEnd = ln.len - c.s - c.d / 2;
      // próxima via: escolhe cedo para olhar quem está lá e pedir passagem no cruzamento
      if (!c.next && toEnd < 28) c.next = isSink.has(e.b) ? 'sink' : chooseNext(c);
      if (c.next && c.next !== 'sink') {
        const nli = c.isBus ? c.next.lanes.length - 1 : Math.min(c.lane, c.next.lanes.length - 1); c.nextLane = nli;
        const room = laneHeadroom(c.next, nli) - c.d - 2.4; limit = Math.min(limit, toEnd + room);
        // cruzamento com mais de uma entrada: um carro por vez
        const node = e.b;
        if (inE[node].length > 1 && toEnd < 9) {
          const lk = lock.get(node);
          if (!lk || t - lk.t > 3.5) { lock.set(node, { car: c, t }); c.lockNode = node; }
          else if (lk.car !== c) limit = Math.min(limit, toEnd - 6);
        }
      } else if (!c.next && toEnd < 2) limit = Math.min(limit, toEnd); // sem saída: espera (não deveria acontecer)
      // ônibus param nos pontos da sua faixa
      if (c.isBus) {
        if (c.stopT > 0) { c.stopT -= dt; limit = 0; if (c.stopT <= 0) c.stopCd = 8; }
        else if (c.stopCd > 0) c.stopCd -= dt;
        else for (const sp of e.stops) { const dd = sp.s - c.s; if (dd > -1 && dd < 16) { limit = Math.min(limit, Math.max(0, dd)); if (dd < 1.6 && c.v < 2) { c.stopT = 3.2; c.stoppedAt = sp.st; } break; } }
      }
      const vmax = e.vmax * c.vf;
      const tgt = Math.max(0, Math.min(vmax, limit / 1.1));
      if (tgt > c.v) c.v = Math.min(tgt, c.v + 4.5 * dt); else c.v = Math.max(tgt, c.v - 14 * dt);
      if (limit < 0.15) c.v = 0;
      c.s += c.v * dt;
      if (c.s > ln.len) { // passou para a próxima via
        const over = c.s - ln.len; removeFrom(c);
        if (c.next === 'sink' || !c.next) { c.hidden = true; c.edge = null; c.next = null; c.y = -80; continue; }
        const ne = c.next, nli = c.nextLane ?? 0; c.next = null;
        c.edge = ne; c.lane = nli; c.s = over; c.seg = 0; insertSorted(ne.lanes[nli].cars, c);
        if (c.lockNode >= 0) { /* solta o cruzamento depois de alguns metros */ c.releaseAt = 7; }
      }
      if (c.releaseAt != null && c.s > c.releaseAt) { const lk = lock.get(c.lockNode); if (lk && lk.car === c) lock.delete(c.lockNode); c.lockNode = -1; c.releaseAt = null; }
    }
    // atualiza posição suavizada (troca de via sem "teleporte") e as instâncias
    for (const c of cars) {
      if (c.hidden) { c.group.position.set(0, -80, 0); c.group.updateMatrix(); c.x = 0; c.y = -80; c.z = 0; c.speed = 0; c.vel.set(0, 0, 0); for (const a of c.anchors) a.obj.position.set(0, -80, 0); continue; }
      posAt(c);
      if (c.rx === null) { c.rx = c.px; c.ry = c.py; c.rz = c.pz; c.ryaw = c.hd; }
      const k2 = 1 - Math.exp(-14 * dt);
      c.rx += (c.px - c.rx) * k2; c.ry += (c.py - c.ry) * k2; c.rz += (c.pz - c.rz) * k2;
      let dy = c.hd - c.ryaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.ryaw += dy * Math.min(1, 10 * dt);
      c.x = c.rx; c.y = c.ry; c.z = c.rz; c.yaw = c.ryaw; c.laneX = c.x; c.speed = c.v;
      c.vel.set(Math.sin(c.yaw) * c.v, 0, Math.cos(c.yaw) * c.v);
      c.group.position.set(c.x, c.y, c.z); c.group.rotation.set(-c.pitch, c.yaw, 0); c.group.updateMatrix();
      const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
      for (const a of c.anchors) a.obj.position.set(c.x + sy * a.off, c.y + c.h + 0.35, c.z + cy * a.off);
    }
    for (const p of pools) { p.list.forEach((c, i) => p.im.setMatrixAt(i, c.group.matrix)); p.im.instanceMatrix.needsUpdate = true; }
  }
  update(0.016);
  return { cars, update, edges, heads };
}
