// Brasília traffic: typical cars (Gol, Gol rebaixado, Uno com escada, BYD, sedan, PMDF), buses in
// the operators' colours, BRT and the "zebrinha". Vehicles follow each other on straight lanes,
// stop at traffic lights where the W3 and the L2 cross the Eixo Monumental, and are drawn as one
// InstancedMesh per type and colour role. Buses carry grapple anchors (the hook sticks to them and
// drags the player along) and every vehicle exposes x/z/axis/w/d so the game can run things over.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, makeInkMaterial } from '../core/render.js';
import { terrainHeight as TH } from './data/brasiliaElev.js';

const { BLUE: BL, RED: RD, BLACK: BK, ORANGE: OR, GREEN: GN, PINK: PK } = INK;
// a colour is [ink, filled]: unfilled slate reads as white paint, unfilled amber as yellow
const WHITE = [BK, 0], SILVER = [BK, 0], BLACKP = [BK, 1], RED = [RD, 1], BLUE = [BL, 1], GREEN = [GN, 1], PINKP = [PK, 0], YELLOW = [OR, 0], ORANGE = [OR, 1], TERRA = [RD, 0];

// Bus operators of the Distrito Federal: white body + the bacia colour on the skirt and rear.
import {
  BUS_OPERATORS, SPEC, BUSLIKE, vehicleGeometry, ROLE_DEFAULT, CAR_PALETTES, NEON,
} from './trafficModels.js';
export { BUS_OPERATORS };

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
        { const lx = P[i][0] - tz * off, lz = P[i][2] + tx * off; pts.push(lx, P[i][1] + TH(lx, lz), lz); }
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
    // nascem dinamicamente perto do jogador e nos túneis da borda para manter trânsito contínuo e vivo
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnT = 0.22;
      // densidade conforme a hora (horário de pico enche as vias; madrugada esvazia)
      let shown = 0; for (const c of cars) if (!c.hidden) shown++;
      const dens = opts.density ? opts.density() : 1;
      const free = shown < cars.length * dens ? cars.find((c) => c.hidden) : null;
      if (free) {
        let placed = false;
        const pl = players().find((p) => p && p.body);
        if (pl && Math.random() < 0.8) {
          const px = pl.body.pos.x, pz = pl.body.pos.z;
          const nearbyEdges = edges.filter((e) => {
            if (e.len < 25) return false;
            const p0 = e.lanes[0].pts;
            const d = Math.hypot(p0[0] - px, p0[2] - pz);
            return d > 45 && d < 180;
          });
          if (nearbyEdges.length) {
            const e = nearbyEdges[Math.floor(Math.random() * nearbyEdges.length)];
            const li = laneFor(free, e);
            if (laneHeadroom(e, li) > free.d + 5) {
              place(free, e, li, 2);
              placed = true;
            }
          }
        }
        if (!placed && sources.length) {
          const n = sources[Math.floor(Math.random() * sources.length)]; const outs = outE[n];
          if (outs.length) { const e = outs[Math.floor(Math.random() * outs.length)]; const li = laneFor(free, e);
            if (laneHeadroom(e, li) > free.d + 5 && !nearPlayer(e.lanes[li].pts[0], e.lanes[li].pts[2], 35)) place(free, e, li, 0.5); }
        }
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
      } else if (!c.next && toEnd < 2) {
        c.deadEndT = (c.deadEndT || 0) + dt;
        if (c.deadEndT > 1.8) {
          removeFrom(c);
          c.hidden = true;
          c.edge = null;
          c.y = -80;
          c.deadEndT = 0;
          continue;
        }
        limit = Math.min(limit, toEnd);
      }
      // desobstrução automática de engarrafamentos e travamentos em cruzamentos
      if (c.v < 0.25 && c.stopT <= 0) {
        c.stuckT = (c.stuckT || 0) + dt;
        if (c.stuckT > 5.0) {
          if (c.lockNode >= 0) {
            const lk = lock.get(c.lockNode);
            if (lk && lk.car === c) lock.delete(c.lockNode);
            c.lockNode = -1;
          }
          if (c.stuckT > 7.5) {
            removeFrom(c);
            c.hidden = true;
            c.edge = null;
            c.y = -80;
            c.stuckT = 0;
            continue;
          }
        }
      } else {
        c.stuckT = 0;
      }
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
