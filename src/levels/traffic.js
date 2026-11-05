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
      const car = { type, w, h, d, isBus: !!BUSLIKE[type], lane, axis: lane.axis, dir: lane.dir, s, v: vmax * 0.6, vmax, pal,
        x: 0, z: 0, laneX: 0, speed: 0, group: new THREE.Object3D(), vel: new THREE.Vector3(), hidden: false, anchors: [] };
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
    c.laneX = c.x; c.group.position.set(c.x, c.hidden ? -60 : 0, c.z);
    c.speed = c.v; c.vel.set(lane.axis === 'x' ? c.v * c.dir : 0, 0, lane.axis === 'z' ? c.v * c.dir : 0);
    for (const a of c.anchors) a.obj.position.set(c.x + (lane.axis === 'x' ? a.off * c.dir : 0), c.hidden ? -60 : c.h + 0.35, c.z + (lane.axis === 'z' ? a.off * c.dir : 0));
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
