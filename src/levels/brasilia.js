// Mapa: Brasília — Plano Piloto montado a partir da planta real (OpenStreetMap, ver scripts/build_brasilia.py).
// Escala: 1 m do jogo = 3 m da cidade; altura dos prédios a 0,6. Eixo Monumental ao longo de +Z (Torre de TV
// a oeste, Congresso a leste), Asa Norte para +X e Asa Sul para -X (sem espelhar: norte à esquerda de quem olha o Congresso).
//  - Vias com o traçado real: Eixão curvo, Eixinhos W/L, W3, L2, L4, N1/S1, N2/S2, tesourinhas e alças.
//  - Níveis reais: Eixão em túnel sob a Rodoviária (Buraco do Tatu), Eixinhos sobre a plataforma da
//    Rodoviária, passagens inferiores das tesourinhas, viadutos e rampas com trincheira aberta.
//  - Prédios com a planta do OSM (superquadras sobre pilotis, Esplanada, setores centrais) e os
//    monumentos de Niemeyer modelados à mão no lugar exato.
//  - Detalhe fino (faixas, montantes, brises, cobogós) só é desenhado de perto; árvores, postes e
//    paradas são instanciados; a malha dos bots cobre o núcleo jogável (Torre de TV → Praça dos Três Poderes).
import * as THREE from 'three';
import { INK, makeInkMaterial } from '../render.js';
import { TAU } from '../util.js';
import { BRASILIA as D } from './brasiliaData.js';
import { buildGraphTraffic } from './traffic.js';
import * as M from './brasiliaLandmarks.js';
import { terrainHeight as TH } from './brasiliaElev.js';

const { BLUE: BL, RED: RD, BLACK: BK, ORANGE: OR, GREEN: GN, PINK: PK } = INK;

export function buildBrasilia(B, arena = false) {
  const { L, box, slab, cyl, sphere, ring, spawn, sniper, pickup, collider, addGeo, addGeoFill, addNearGeo, addInstance, scene } = B;
  L.key = 'brasilia';
  L.bounds = { ...D.bounds, minY: -45 };
  L.navBounds = { ...D.nav, minY: -45 };
  L.killY = -45;
  const LM = D.landmarks;
  const lmPos = (k, y = 0) => new THREE.Vector3(LM[k].x, y + TH(LM[k].x, LM[k].z), LM[k].z);

  // ------------------------------------------------------------------ acumuladores de malha por bloco (culling)
  const TILE = 110, accs = new Map();
  function acc(kind, x, z) {
    const key = kind + '|' + Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
    let a = accs.get(key); if (!a) accs.set(key, a = { kind, pos: [], idx: [] }); return a;
  }
  // quadrilátero com a normal virada para "want" (x,y,z)
  function quad(a, p0, p1, p2, p3, want) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = want && (nx * want[0] + ny * want[1] + nz * want[2]) < 0;
    const base = a.pos.length / 3;
    for (const p of flip ? [p0, p3, p2, p1] : [p0, p1, p2, p3]) a.pos.push(p[0], p[1], p[2]);
    a.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  function flushAccs() {
    for (const a of accs.values()) {
      if (!a.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(a.pos.length / 3 * 2), 2));
      g.setIndex(a.idx); g.computeVertexNormals();
      const [fill, ink, near] = a.kind.split(':');
      if (near === 'n') addNearGeo(g, Number(ink));
      else if (fill === 'f') addGeoFill(g, Number(ink)); else addGeo(g, Number(ink));
    }
  }
  const UP = [0, 1, 0], DOWN = [0, -1, 0];

  // ------------------------------------------------------------------ chão, limites e paisagem
  // Base contínua de segurança abaixo do nível dos túneis para impedir queda no vazio absoluto
  const Bd = D.bounds;
  box((Bd.minX + Bd.maxX) / 2, -44, (Bd.minZ + Bd.maxZ) / 2, Bd.maxX - Bd.minX + 40, 0.4, Bd.maxZ - Bd.minZ + 40, { ink: GN, noNav: true });
  // relevo real (DEM): superfície verde CONTÍNUA e suave — cada célula usa a altura real nos 4 cantos,
  // então células vizinhas se encaixam sem degrau (sem facetamento). O acabamento das vias (meio-fio
  // elevado) é que garante a borda limpa onde o asfalto encontra a grama.
  for (const [x1, z1, x2, z2] of D.ground) {
    const w = x2 - x1, d = z2 - z1;
    const nxc = Math.max(1, Math.min(64, Math.ceil(w / 11))), nzc = Math.max(1, Math.min(64, Math.ceil(d / 11)));
    const cxg = (x1 + x2) / 2, czg = (z1 + z2) / 2;
    for (let iz = 0; iz < nzc; iz++) for (let ix = 0; ix < nxc; ix++) {
      const ax = x1 + w * ix / nxc, bx = x1 + w * (ix + 1) / nxc;
      const az = z1 + d * iz / nzc, bz = z1 + d * (iz + 1) / nzc;
      quad(acc('u:' + GN, cxg, czg), [ax, TH(ax, az) - 0.06, az], [bx, TH(bx, az) - 0.06, az], [bx, TH(bx, bz) - 0.06, bz], [ax, TH(ax, bz) - 0.06, bz], UP);
    }
  }
  // Barreiras perimetrais sólidas e visíveis (muralha de contenção urbana de 4.5m intransponível)
  const T = 6, PH = 70, WALL_H = 4.5;
  for (const [x, z, w, d] of [
    [(Bd.minX + Bd.maxX) / 2, Bd.minZ - T / 2, Bd.maxX - Bd.minX + 2 * T, T],
    [(Bd.minX + Bd.maxX) / 2, Bd.maxZ + T / 2, Bd.maxX - Bd.minX + 2 * T, T],
    [Bd.minX - T / 2, (Bd.minZ + Bd.maxZ) / 2, T, Bd.maxZ - Bd.minZ],
    [Bd.maxX + T / 2, (Bd.minZ + Bd.maxZ) / 2, T, Bd.maxZ - Bd.minZ]
  ]) {
    const tw = TH(x, z);
    collider(x, -35, z, w, PH + 35, d, { noGrapple: true, noNav: true });
    box(x, tw - 32, z, w, 32 + 2.2, d, { ink: BK, noCollide: true });
    box(x, tw + 2.2, z, w, WALL_H - 2.2, Math.max(0.6, d * 0.35), { ink: OR, noCollide: true });
  }
  collider((Bd.minX + Bd.maxX) / 2, 90, (Bd.minZ + Bd.maxZ) / 2, Bd.maxX - Bd.minX + 40, 8, Bd.maxZ - Bd.minZ + 40, { noNav: true, noGrapple: true });
  M.lagoParanoa(B, Bd.maxZ + T, Bd.minX, Bd.maxX);
  // espelhos d'água reais
  for (const w of D.water) {
    const shape = new THREE.Shape(); for (let i = 0; i < w.length; i += 2) { if (i === 0) shape.moveTo(w[i], -w[i + 1]); else shape.lineTo(w[i], -w[i + 1]); }
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, 0.07 + TH(w[0], -w[1]), 0); addGeo(g, BL);
  }
  // praças pavimentadas em volta dos monumentos
  const pave = (k, w, d, dx = 0, dz = 0) => box(LM[k].x + dx, TH(LM[k].x + dx, LM[k].z + dz), LM[k].z + dz, w, 0.06, d, { ink: BK, noCollide: true });
  pave('praca3p', 110, 70, 0, -5); pave('torre', 46, 70, 0, 8); pave('rodoviaria', 70, 64); pave('catedral', 44, 44); pave('memorialjk', 50, 50);

  // ------------------------------------------------------------------ vias
  const CLS = D.cls, roads = [];
  // Nivelamento do cruzamento N1/S1 com L2 na Esplanada (evita parede vertical de 6.5m em 3.5m no meio da N1/S1)
  for (const r of D.roads) {
    const p = r[5];
    let flattened = false;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(p[i]) < 55 && p[i + 2] > 220 && p[i + 2] < 280 && p[i + 1] > 0.1) {
        p[i + 1] = 0;
        flattened = true;
      } else if (Math.abs(p[i]) < 15 && p[i + 1] > 0.1 && p[i + 1] < 1.2) {
        p[i + 1] = 0;
      }
    }
    if (flattened) r[2] &= ~2;
  }
  if (D.traffic && D.traffic.nodes) {
    for (const nd of D.traffic.nodes) {
      if (Math.abs(nd[0]) < 55 && nd[2] > 220 && nd[2] < 280 && nd[1] > 0.1) nd[1] = 0;
    }
  }
  const nodeDeg = new Map(); const nk = (x, z) => x.toFixed(1) + ',' + z.toFixed(1);
  for (const r of D.roads) { const p = r[5]; for (const i of [0, p.length - 3]) { const k = nk(p[i], p[i + 2]); nodeDeg.set(k, (nodeDeg.get(k) || 0) + 1); } }
  const nearJunction = (x, z) => { for (const [k, n] of nodeDeg) { if (n < 3) continue; const [jx, jz] = k.split(',').map(Number); if ((jx - x) ** 2 + (jz - z) ** 2 < 64) return true; } return false; };
  const RANK = { trunk: 6, trunk_link: 5, primary: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 2 };
  // Pré-indexação das vias para evitar que rampas, muros de trincheira ou quinas AABB de prédios invadam pistas vizinhas
  const flatSegs = [], shallowDownSegs = [], allDriveSegs = [], allRoadSegs = [];
  for (const r of D.roads) {
    const lanes = r[3], width = r[4], pts = r[5], hw = width / 2;
    const n = pts.length / 3;
    for (let i = 0; i < n - 1; i++) {
      const ax = pts[i * 3], ay = pts[i * 3 + 1], az = pts[i * 3 + 2];
      const bx = pts[(i + 1) * 3], by = pts[(i + 1) * 3 + 1], bz = pts[(i + 1) * 3 + 2];
      const seg = [ax, az, bx, bz, hw, ay + TH(ax, az), by + TH(bx, bz)];
      allRoadSegs.push(seg);
      if (lanes > 0) allDriveSegs.push(seg);
      if (Math.abs(ay) <= 0.15 && Math.abs(by) <= 0.15) flatSegs.push(seg);
      if (Math.min(ay, by) < -0.12 && Math.max(ay, by) > -2.6) shallowDownSegs.push(seg);
    }
  }
  function inSegList(list, x, z, pad = 0, endPad = 0.35) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i], ax = s[0], az = s[1], bx = s[2], bz = s[3], r = s[4] + pad;
      if (x < Math.min(ax, bx) - r || x > Math.max(ax, bx) + r || z < Math.min(az, bz) - r || z > Math.max(az, bz) + r) continue;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const uL = ((x - ax) * dx + (z - az) * dz) / len;
      if (uL < -endPad || uL > len + endPad) continue;
      const uW = Math.abs(-(x - ax) * dz + (z - az) * dx) / len;
      if (uW < r) return true;
    }
    return false;
  }
  function obstructsLowerRoad(x, z, h, boxS = 1.24, slabH = 0.28, exA = null, exB = null) {
    const half = boxS * 0.5 + 0.48;
    const maxDiff = 2.12 + slabH;
    for (let i = 0; i < allRoadSegs.length; i++) {
      const s = allRoadSegs[i], ax = s[0], az = s[1], bx = s[2], bz = s[3];
      if (x < Math.min(ax, bx) - half || x > Math.max(ax, bx) + half || z < Math.min(az, bz) - half || z > Math.max(az, bz) + half) continue;
      if (Math.min(s[5], s[6]) >= h - 0.12 || Math.max(s[5], s[6]) <= h - maxDiff - 0.1) continue;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t;
      if (Math.abs(x - qx) >= half || Math.abs(z - qz) >= half) continue;
      const ho = s[5] + (s[6] - s[5]) * t;
      const diff = h - ho;
      if (exA && exB && Math.hypot(ax - exA[0], az - exA[2]) < 0.1 && Math.hypot(bx - exB[0], bz - exB[2]) < 0.1) continue;
      const sharedNode = (exA && Math.hypot(qx - exA[0], qz - exA[2]) < 0.55 && Math.abs(ho - exA[1]) < 0.25) ||
                         (exB && Math.hypot(qx - exB[0], qz - exB[2]) < 0.55 && Math.abs(ho - exB[1]) < 0.25);
      const minDiff = sharedNode ? 0.53 : 0.14;
      if (diff > minDiff && diff < maxDiff) return true;
    }
    return false;
  }
  for (const [ox1, oz1, ox2, oz2] of D.ground) {
    let x1 = ox1, x2 = ox2, z1 = oz1, z2 = oz2;
    if (z2 - z1 <= 14) {
      const cz = (z1 + z2) / 2, d = z2 - z1;
      while (x2 - x1 > 1.2 && obstructsLowerRoad(x1 + 0.4, cz, TH(x1 + 0.4, cz), Math.max(1.2, d), 0.85)) x1 += 1.0;
      while (x2 - x1 > 1.2 && obstructsLowerRoad(x2 - 0.4, cz, TH(x2 - 0.4, cz), Math.max(1.2, d), 0.85)) x2 -= 1.0;
    }
    if (x2 - x1 <= 14) {
      const cx = (x1 + x2) / 2, w = x2 - x1;
      while (z2 - z1 > 1.2 && obstructsLowerRoad(cx, z1 + 0.4, TH(cx, z1 + 0.4), Math.max(1.2, w), 0.85)) z1 += 1.0;
      while (z2 - z1 > 1.2 && obstructsLowerRoad(cx, z2 - 0.4, TH(cx, z2 - 0.4), Math.max(1.2, w), 0.85)) z2 -= 1.0;
    }
    const gcx = (x1 + x2) / 2, gcz = (z1 + z2) / 2, gty = TH(gcx, gcz);
    if (x2 - x1 <= 8 && z2 - z1 <= 8 && obstructsLowerRoad(gcx, gcz, gty, Math.max(x2 - x1, z2 - z1), 0.85)) continue;
    if (x2 > x1 + 0.2 && z2 > z1 + 0.2) collider(gcx, gty - 0.85, gcz, x2 - x1, 0.85, z2 - z1);
  }
  function boxHitsRoad(x1, z1, x2, z2, pad = 0.35) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, hw = (x2 - x1) / 2, hd = (z2 - z1) / 2;
    const rad = Math.hypot(hw, hd);
    for (let i = 0; i < allRoadSegs.length; i++) {
      const s = allRoadSegs[i], ax = s[0], az = s[1], bx = s[2], bz = s[3], r = s[4] + pad;
      if (cx + rad < Math.min(ax, bx) - r || cx - rad > Math.max(ax, bx) + r || cz + rad < Math.min(az, bz) - r || cz - rad > Math.max(az, bz) + r) continue;
      for (const [px, pz] of [[cx, cz], [x1, z1], [x2, z1], [x1, z2], [x2, z2], [(x1 + cx) / 2, (z1 + cz) / 2], [(x2 + cx) / 2, (z2 + cz) / 2]]) {
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
        const h = s[5] + (s[6] - s[5]) * t;
        if (h < -1.5) continue;
        const qx = ax + dx * t - px, qz = az + dz * t - pz;
        if (qx * qx + qz * qz < r * r) return true;
      }
    }
    return false;
  }
  for (const r of D.roads) {
    const cls = CLS[r[0]], name = r[1] >= 0 ? D.names[r[1]] : '', flags = r[2], lanes = r[3], width = r[4], pts = r[5];
    const oneway = !!(flags & 1), bridge = !!(flags & 2), tunnel = !!(flags & 4);
    roads.push({ cls, name, oneway, lanes, width, pts });
    const n = pts.length / 3; if (n < 2) continue;
    const drive = lanes > 0, ped = !drive;
    const yo = 0.03 + (RANK[cls] || 0) * 0.004;
    // pontos com normais (miter) para as bordas
    const P = [], N = [];
    for (let i = 0; i < n; i++) P.push([pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]);
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let mx = -tz, mz = tx;
      if (i > 0 && i < n - 1) { // miter
        const u = [P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]], ul = Math.hypot(u[0], u[1]) || 1;
        const cosh = Math.abs((-u[1] / ul) * mx + (u[0] / ul) * mz); const sc = 1 / Math.max(0.55, cosh); mx *= sc; mz *= sc;
      }
      N.push([mx, mz]);
    }
    const hw = width / 2;
    for (let i = 0; i < n - 1; i++) {
      const a = P[i], b = P[i + 1], na = N[i], nb = N[i + 1];
      const cxm = (a[0] + b[0]) / 2, czm = (a[2] + b[2]) / 2;
      const ta = TH(a[0], a[2]), tb = TH(b[0], b[2]);                 // terreno (DEM) nos extremos do segmento
      const aAbs = [a[0], a[1] + ta, a[2]], bAbs = [b[0], b[1] + tb, b[2]];
      const La = [a[0] + na[0] * hw, a[1] + yo + ta, a[2] + na[1] * hw], Ra = [a[0] - na[0] * hw, a[1] + yo + ta, a[2] - na[1] * hw];
      const Lb = [b[0] + nb[0] * hw, b[1] + yo + tb, b[2] + nb[1] * hw], Rb = [b[0] - nb[0] * hw, b[1] + yo + tb, b[2] - nb[1] * hw];
      // superfície: asfalto escuro (via) ou piso claro (calçadão/serviço)
      quad(acc(drive ? 'f:' + BK : 'u:' + BK, cxm, czm), La, Lb, Rb, Ra, UP);
      const hA = a[1], hB = b[1], up = Math.min(hA, hB) > 0.25 || Math.max(hA, hB) > 0.25, down = Math.min(hA, hB) < -0.25;
      // meio-fio elevado (concreto) nas duas bordas das vias de superfície: faixa fina, levemente
      // acima do asfalto, com face externa que desce abaixo da grama — borda reta e limpa, acabamento
      // urbano de Brasília, sem pesar o visual.
      if (!up && !down && !tunnel) {
        const SW = 1.6, LIFT = 0.16, cb = 0.8, inL = [-(na[0] + nb[0]), 0, -(na[1] + nb[1])], outL = [na[0] + nb[0], 0, na[1] + nb[1]];
        // esquerda
        const Li = [La[0], La[1] + LIFT, La[2]], Lj = [Lb[0], Lb[1] + LIFT, Lb[2]];
        const LiO = [La[0] + na[0] * SW, La[1] + LIFT, La[2] + na[1] * SW], LjO = [Lb[0] + nb[0] * SW, Lb[1] + LIFT, Lb[2] + nb[1] * SW];
        quad(acc('u:' + BK, cxm, czm), Li, Lj, LjO, LiO, UP);                                   // topo do meio-fio
        quad(acc('u:' + BK, cxm, czm), La, Lb, Lj, Li, inL);                                     // face interna (asfalto→meio-fio)
        quad(acc('u:' + BK, cxm, czm), LiO, LjO, [LjO[0], LjO[1] - cb, LjO[2]], [LiO[0], LiO[1] - cb, LiO[2]], outL); // face externa (desce p/ grama)
        // direita
        const Ri = [Ra[0], Ra[1] + LIFT, Ra[2]], Rj = [Rb[0], Rb[1] + LIFT, Rb[2]];
        const RiO = [Ra[0] - na[0] * SW, Ra[1] + LIFT, Ra[2] - na[1] * SW], RjO = [Rb[0] - nb[0] * SW, Rb[1] + LIFT, Rb[2] - nb[1] * SW];
        quad(acc('u:' + BK, cxm, czm), Ri, RiO, RjO, Rj, UP);                                   // topo do meio-fio
        quad(acc('u:' + BK, cxm, czm), Ra, Ri, Rj, Rb, outL);                                    // face interna
        quad(acc('u:' + BK, cxm, czm), RiO, [RiO[0], RiO[1] - cb, RiO[2]], [RjO[0], RjO[1] - cb, RjO[2]], RjO, inL); // face externa
      }
      if (up) {
        // laterais (viaduto: viga de 0,9 m; aterro/rampa: muro até o chão) e guarda-corpo
        const bot = (h) => bridge ? h - 0.9 : 0;
        for (const [p0, p1, side] of [[La, Lb, 1], [Ra, Rb, -1]]) {
          const out = [side * (na[0] + nb[0]) / 2, 0, side * (na[1] + nb[1]) / 2];
          quad(acc('u:' + BK, cxm, czm), [p0[0], bot(hA) + ta, p0[2]], [p1[0], bot(hB) + tb, p1[2]], [p1[0], p1[1], p1[2]], [p0[0], p0[1], p0[2]], out);
          if (!nearJunction(cxm, czm) && Math.min(hA, hB) > 0.6) quad(acc('f:' + BK, cxm, czm), [p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [p1[0], p1[1] + 1.0, p1[2]], [p0[0], p0[1] + 1.0, p0[2]], out);
        }
        if (bridge) quad(acc('u:' + BK, cxm, czm), [La[0], hA - 0.9 + ta, La[2]], [Lb[0], hB - 0.9 + tb, Lb[2]], [Rb[0], hB - 0.9 + tb, Rb[2]], [Ra[0], hA - 0.9 + ta, Ra[2]], DOWN);
      }
      if (tunnel) {
        // paredes e teto do túnel (o teto é a laje do chão; aqui só o acabamento claro por dentro)
        const off = hw + 1.2;
        for (const side of [1, -1]) {
          const pa = [a[0] + na[0] * off * side, 0, a[2] + na[1] * off * side], pb = [b[0] + nb[0] * off * side, 0, b[2] + nb[1] * off * side];
          quad(acc('u:' + BK, cxm, czm), [pa[0], hA + ta, pa[2]], [pb[0], hB + tb, pb[2]], [pb[0], -0.9 + tb, pb[2]], [pa[0], -0.9 + ta, pa[2]], [-side * na[0], 0, -side * na[1]]);
        }
        const Lc = [a[0] + na[0] * off, -0.9 + ta, a[2] + na[1] * off], Rc = [a[0] - na[0] * off, -0.9 + ta, a[2] - na[1] * off];
        const Ld = [b[0] + nb[0] * off, -0.9 + tb, b[2] + nb[1] * off], Rd = [b[0] - nb[0] * off, -0.9 + tb, b[2] - nb[1] * off];
        if (Math.max(hA, hB) < -4.5) quad(acc('u:' + BK, cxm, czm), Lc.map((v, i) => i === 1 ? ta - 0.88 : v), Ld.map((v, i) => i === 1 ? tb - 0.88 : v), Rd.map((v, i) => i === 1 ? tb - 0.88 : v), Rc.map((v, i) => i === 1 ? ta - 0.88 : v), DOWN); // teto
        quad(acc('f:' + OR, cxm, czm), [(Lc[0] + Rc[0]) / 2 + na[0] * 0.3, ta - 0.92, (Lc[2] + Rc[2]) / 2 + na[1] * 0.3], [(Ld[0] + Rd[0]) / 2 + nb[0] * 0.3, tb - 0.92, (Ld[2] + Rd[2]) / 2 + nb[1] * 0.3], [(Ld[0] + Rd[0]) / 2 - nb[0] * 0.3, tb - 0.92, (Ld[2] + Rd[2]) / 2 - nb[1] * 0.3], [(Lc[0] + Rc[0]) / 2 - na[0] * 0.3, ta - 0.92, (Lc[2] + Rc[2]) / 2 - na[1] * 0.3], DOWN); // luminárias
      }
      // faixas pintadas (só desenhadas de perto)
      if (drive && lanes > 1 && Math.hypot(b[0] - a[0], b[2] - a[2]) > 0.6) {
        const segL = Math.hypot(b[0] - a[0], b[2] - a[2]); const tx = (b[0] - a[0]) / (segL || 1), tz = (b[2] - a[2]) / (segL || 1);
        const lines = [];
        if (oneway) for (let k = 1; k < lanes; k++) lines.push([-hw + k * 2.7, 'w']);
        else { lines.push([0, 'y']); for (let k = 1; k < lanes / 2; k++) { lines.push([k * 2.7, 'w']); lines.push([-k * 2.7, 'w']); } }
        for (const [off, col] of lines) {
          const step = col === 'y' ? segL : 7, dash = col === 'y' ? segL : 3;
          for (let s = col === 'y' ? 0 : 1; s + dash <= segL + 0.01; s += step) {
            const x0 = a[0] + tx * s - tz * off, z0 = a[2] + tz * s + tx * off, y0 = a[1] + (b[1] - a[1]) * (s / segL) + yo + 0.02 + ta + (tb - ta) * (s / segL);
            const x1 = x0 + tx * dash, z1 = z0 + tz * dash, y1 = a[1] + (b[1] - a[1]) * ((s + dash) / segL) + yo + 0.02 + ta + (tb - ta) * ((s + dash) / segL);
            const w2 = col === 'y' ? 0.12 : 0.09;
            quad(acc('u:' + (col === 'y' ? OR : BK) + ':n', x0, z0), [x0 + tz * w2, y0, z0 - tx * w2], [x1 + tz * w2, y1, z1 - tx * w2], [x1 - tz * w2, y1, z1 + tx * w2], [x0 - tz * w2, y0, z0 + tx * w2], UP);
          }
        }
      }
      // colisores: malha orientada de lajes finas (evita degraus altos nas rampas e libera viadutos/passagens inferiores)
      const segL = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const sMinX = Math.min(a[0], b[0]) - hw - 2, sMaxX = Math.max(a[0], b[0]) + hw + 2;
      const sMinZ = Math.min(a[2], b[2]) - hw - 2, sMaxZ = Math.max(a[2], b[2]) + hw + 2;
      const localCuts = (!up && !down) ? D.cutFloor.filter(([x1, z1, x2, z2]) => sMaxX >= x1 && sMinX <= x2 && sMaxZ >= z1 && sMinZ <= z2) : [];
      const hasCutBelow = localCuts.length > 0;
      if ((up || down || hasCutBelow) && segL > 0.05) {
        const tx = (b[0] - a[0]) / segL, tz = (b[2] - a[2]) / segL;
        const nx = -tz, nz = tx;
        const dh = Math.abs(hB - hA);
        const sloped = dh > 0.08;
        const steep = dh / segL > 0.22;
        const stepL = steep ? 0.45 : sloped ? 0.65 : 1.2;
        const kL = Math.max(1, Math.ceil(segL / stepL), Math.ceil(dh / 0.14));
        const boxS = steep ? 0.95 : sloped ? 1.24 : 1.7;
        const effHw = Math.max(0.15, hw - (up ? boxS * 0.35 : 0.02));
        const stepW = steep ? 0.55 : 0.78;
        const kW = Math.max(1, Math.round((effHw * 2) / stepW));
        const slabH = 0.28;
        for (let j = 0; j <= kL; j++) {
          const t = j / kL, cx = a[0] + (b[0] - a[0]) * t, cz = a[2] + (b[2] - a[2]) * t, h = a[1] + (b[1] - a[1]) * t, habs = h + ta + (tb - ta) * t;
          if (!down && !hasCutBelow && h <= 0.08) continue;
          if (hasCutBelow && !localCuts.some(([x1, z1, x2, z2]) => cx + hw + 2.5 >= x1 && cx - hw - 2.5 <= x2 && cz + hw + 2.5 >= z1 && cz - hw - 2.5 <= z2)) continue;
          for (let iw = 0; iw <= kW; iw++) {
            const u = -effHw + (iw / kW) * (effHw * 2);
            const px = cx + nx * u, pz = cz + nz * u;
            if (obstructsLowerRoad(px, pz, habs, boxS, slabH, aAbs, bAbs)) continue;
            collider(px, habs - slabH, pz, boxS, slabH, boxS, { noNav: false });
          }
        }
        if (tunnel) for (let j = 0; j <= Math.ceil(segL / 1.4); j++) { // paredes laterais do túnel
          const t = j / Math.ceil(segL / 1.4), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, h = a[1] + (b[1] - a[1]) * t, habs = h + ta + (tb - ta) * t;
          if (h > -2.2) continue;
          const mx = na[0] + (nb[0] - na[0]) * t, mz = na[1] + (nb[1] - na[1]) * t;
          for (const s of [1, -1]) {
            const wx = x + mx * (hw + 1.8) * s, wz = z + mz * (hw + 1.8) * s;
            if (!nearJunction(wx, wz) && !inSegList(allRoadSegs, wx, wz, 1.45, 1.45)) {
              collider(wx, habs, wz, 1.1, Math.max(0.5, -0.85 - h), 1.1, { noNav: true });
            }
          }
        }
      }
    }
    // pilares dos viadutos
    if (bridge) {
      let acc2 = 0;
      for (let i = 0; i < n - 1; i++) {
        const a = P[i], b = P[i + 1], segL = Math.hypot(b[0] - a[0], b[2] - a[2]);
        for (let s = 14 - acc2; s < segL; s += 14) {
          const t = s / segL, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, h = a[1] + (b[1] - a[1]) * t - 0.9;
          if (h > 2 && !onRoadBelow(x, z, h)) cyl(x, TH(x, z), z, 0.8, h, { ink: BK, seg: 8 });
        }
        acc2 = (acc2 + segL) % 14;
      }
    }
  }
  // pista no chão embaixo deste ponto? (pilar não pode nascer no meio de outra via)
  function onRoadBelow(x, z, _h) {
    return inSegList(allRoadSegs, x, z, 1.6, 1.6);
  }
  // trincheiras: piso visual + colisor levemente rebaixado para não criar degraus sobre as rampas suaves
  for (const [x1, z1, x2, z2, h] of D.cutFloor) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, w = x2 - x1, d = z2 - z1, tc = TH(cx, cz);
    box(cx, h - 0.9 + tc, cz, w, 0.9, d, { ink: BK, noCollide: true });
    if (!obstructsLowerRoad(cx, cz, h - 0.25 + tc, Math.max(w, d), 0.9)) {
      collider(cx, h - 1.15 + tc, cz, w, 0.9, d);
    }
  }
  for (const w of D.cutWalls) {
    for (let i = 0; i + 5 < w.length; i += 3) {
      const ax = w[i], az = w[i + 1], ah = w[i + 2], bx = w[i + 3], bz = w[i + 4], bh = w[i + 5];
      const taw = TH(ax, az), tbw = TH(bx, bz);
      quad(acc('u:' + BK, ax, az), [ax, Math.min(ah, bh) - 0.4 + taw, az], [bx, Math.min(ah, bh) - 0.4 + tbw, bz], [bx, 1.0 + tbw, bz], [ax, 1.0 + taw, az], null);
      quad(acc('u:' + BK, ax, az), [ax, 1.0 + taw, az], [bx, 1.0 + tbw, bz], [bx, 1.0 + tbw, bz], [ax, 1.0 + taw, az], UP);
    }
    for (let i = 0; i < w.length; i += 3) {
      if (!inSegList(allRoadSegs, w[i], w[i + 1], 1.45, 1.45)) {
        const twc = TH(w[i], w[i + 1]);
        collider(w[i], w[i + 2] + twc, w[i + 1], 1.1, 1.0 - w[i + 2], 1.1, { noNav: true });
      }
    }
  }

  // ------------------------------------------------------------------ prédios (planta do OSM)
  const FLOOR = 1.9;
  const STYLE = {
    res: { body: [BK, BK, BK, PK, OR, BL], trim: [BL, OR, GN, PK, BK, BK] },
    min: { body: [GN], trim: [BK] },
    gen: { body: [BK, BK, BL, BK, BL, BK], trim: [BL, BK, BK, OR, BK, GN] },
    civ: { body: [BK], trim: [OR] },
    cn: { body: [BK], trim: [RD] },
    conic: { body: [PK, OR, BL], trim: [BK] },
    bc: { body: [BL], trim: [OR] },
    house: { body: [BK, PK, OR, GN], trim: [RD] },
  };
  const boxRot = (cx, y, cz, w, h, d, ang, ink, near = false) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(-ang); g.translate(cx, y + h / 2, cz); if (near) addNearGeo(g, ink); else addGeo(g, ink); };
  let bi = 0;
  const roofs = [];
  for (const b of D.blds) {
    bi++;
    if (b[0] === 'r') {
      const [, st, cx, cz, Lg, Dp, ang, h, pil] = b;
      const ty = TH(cx, cz);                                         // base do prédio sobre o relevo real
      const S = STYLE[st] || STYLE.gen, body = S.body[bi % S.body.length], trim = S.trim[(bi * 7) % S.trim.length];
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const L2 = (u, v) => [cx + ca * u - sa * v, cz + sa * u + ca * v];
      boxRot(cx, pil + ty, cz, Lg, h - pil, Dp, ang, body);
      if (pil > 0) { // pilotis: colunas e portaria de vidro
        for (let u = -Lg / 2 + 1; u <= Lg / 2 - 1 + 0.01; u += Math.max(3, (Lg - 2) / 5)) for (const v of [-Dp / 2 + 0.8, Dp / 2 - 0.8]) { const [px, pz] = L2(u, v); box(px, ty, pz, 0.55, pil, 0.55, { ink: BK, noCollide: true }); }
        boxRot(cx, ty, cz, Math.min(5, Lg * 0.25), pil, Dp * 0.6, ang, BL);
      }
      // faixas dos andares / brises (só de perto)
      if (h > 4) for (let y = pil + FLOOR; y < h - 0.4; y += FLOOR) boxRot(cx, y - 0.1 + ty, cz, Lg + 0.25, 0.2, Dp + 0.25, ang, trim, true);
      if (st === 'res' || st === 'min' || (st === 'gen' && h > 9)) {
        const stepU = st === 'min' ? 2.2 : 2.6;
        for (let u = -Lg / 2 + stepU / 2; u < Lg / 2; u += stepU) for (const v of [-Dp / 2 - 0.1, Dp / 2 + 0.1]) {
          const [px, pz] = L2(u, v); boxRot(px, pil + 0.3 + ty, pz, 0.16, h - pil - 0.6, 0.22, ang, st === 'res' ? (bi % 3 ? BK : trim) : BK, true);
        }
      }
      if (st === 'min') { // empenas cegas brancas nas pontas e heliponto
        for (const u of [-Lg / 2, Lg / 2]) { const [px, pz] = L2(u, 0); boxRot(px, ty, pz, 0.6, h + 0.3, Dp + 0.3, ang, BK); }
        if (bi % 2) { boxRot(cx, h + ty, cz, 6, 0.3, Math.min(6, Dp), ang, BK); boxRot(cx, h + 0.3 + ty, cz, 2.2, 0.05, 0.4, ang, OR, true); }
      }
      if (st === 'cn') for (let u = -Lg / 2 + 2; u < Lg / 2 - 1; u += 3.6) for (let y = 3; y < h - 1; y += 2.6) { const [px, pz] = L2(u, Dp / 2 + 0.2); const g = new THREE.BoxGeometry(3.1, 2.1, 0.3); g.rotateY(-ang); g.translate(px, y + 1 + ty, pz); addGeoFill(g, [RD, OR, GN, BL, PK][Math.floor(u + y) % 5 >>> 0]); }
      if (st === 'res' && h > 8) { const [px, pz] = L2(Lg * 0.25, 0); boxRot(px, h + ty, pz, 3.2, 1.8, Math.min(3, Dp), ang, BK); } // caixa d'água
      if (st === 'house') { const g = new THREE.ConeGeometry(Math.hypot(Lg, Dp) / 2 * 1.02, 1.6, 4); g.rotateY(Math.PI / 4 - ang); g.scale(Lg / Math.hypot(Lg, Dp) * 1.42, 1, Dp / Math.hypot(Lg, Dp) * 1.42); g.translate(cx, h + 0.8 + ty, cz); addGeo(g, RD); }
      if (h > 12) roofs.push([cx, h + ty, cz]);
    } else {
      const [, st, h, ring2] = b;
      const S = STYLE[st] || STYLE.gen, body = S.body[bi % S.body.length], trim = S.trim[(bi * 7) % S.trim.length];
      const pts = []; for (let i = 0; i < ring2.length; i += 2) pts.push(new THREE.Vector2(ring2[i], ring2[i + 1]));
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      const n = pts.length; let cx = 0, cz = 0; for (const p of pts) { cx += p.x / n; cz += p.y / n; }
      const ty = TH(cx, cz);                                         // base do prédio sobre o relevo real
      const a = acc('u:' + body, cx, cz);
      for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; quad(a, [p.x, ty, p.y], [q.x, ty, q.y], [q.x, h + ty, q.y], [p.x, h + ty, p.y], [q.y - p.y, 0, -(q.x - p.x)]); }
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const [i0, i1, i2] of tris) { const base = a.pos.length / 3; for (const k of [i0, i2, i1]) a.pos.push(pts[k].x, h + ty, pts[k].y); a.idx.push(base, base + 1, base + 2); }
      if (h > 4) { const an = acc('u:' + trim + ':n', cx, cz); for (let y = FLOOR; y < h - 0.4; y += FLOOR) for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const ox = (q.y - p.y), oz = -(q.x - p.x), ol = Math.hypot(ox, oz) || 1; const ex = ox / ol * 0.12, ez = oz / ol * 0.12; quad(an, [p.x + ex, y - 0.1 + ty, p.y + ez], [q.x + ex, y - 0.1 + ty, q.y + ez], [q.x + ex, y + 0.1 + ty, q.y + ez], [p.x + ex, y + 0.1 + ty, p.y + ez], [ox, 0, oz]); } }
      if (h > 12) roofs.push([cx, h + ty, cz]);
    }
  }
  for (const [x1, z1, x2, z2, y0, h] of D.bcol) {
    if (y0 < 2.2 && boxHitsRoad(x1, z1, x2, z2, 0.35)) continue;
    const bty = TH((x1 + x2) / 2, (z1 + z2) / 2);
    collider((x1 + x2) / 2, y0 + bty, (z1 + z2) / 2, x2 - x1, h - y0, z2 - z1);
  }
  const inNav = (x, z, pad = 0) => x > D.nav.minX + pad && x < D.nav.maxX - pad && z > D.nav.minZ + pad && z < D.nav.maxZ - pad;
  let ri = 0; for (const [x, h, z] of roofs) if (inNav(x, z, 10)) { if (ri % 3 === 0) ring(x, h + 6, z, 'y'); if (ri % 4 === 0) sniper(x, h, z); ri++; }

  // ------------------------------------------------------------------ monumentos no lugar real
  M.torreDeTV(B, LM.torre.x, LM.torre.z);
  M.estadioNacional(B, LM.mane.x, LM.mane.z);
  M.nilsonNelson(B, LM.nilson.x, LM.nilson.z);
  M.museuNacional(B, LM.museu.x, LM.museu.z);
  M.catedral(B, LM.catedral.x, LM.catedral.z);
  M.teatroNacional(B, LM.teatro.x, LM.teatro.z, Math.max(30, LM.teatro.w - 4), Math.max(30, LM.teatro.d - 4));
  M.palacioDeArcos(B, LM.itamaraty.x, LM.itamaraty.z, Math.max(24, Math.min(LM.itamaraty.w, LM.itamaraty.d) - 2), 'itamaraty');
  M.palacioDeArcos(B, LM.justica.x, LM.justica.z, Math.max(22, Math.min(LM.justica.w, LM.justica.d) - 4), 'justica');
  M.congresso(B, LM.congresso.x, LM.congresso.z);
  M.palacioColunas(B, LM.planalto.x, LM.planalto.z, Math.max(30, LM.planalto.d - 2), Math.max(14, LM.planalto.w - 4), 3, 12, Math.sign(LM.praca3p.x - LM.planalto.x) || -1);
  M.palacioColunas(B, LM.stf.x, LM.stf.z, Math.max(16, LM.stf.d - 2), Math.max(16, LM.stf.w - 6), 1.2, 8, 0, Math.sign(LM.praca3p.x - LM.stf.x) || 1);
  M.pracaTresPoderesDetalhes(B, LM.praca3p.x, LM.praca3p.z - 4);
  M.panteao(B, LM.panteao.x, LM.panteao.z);
  M.rodoviaria(B, LM.rodoviaria.x, LM.rodoviaria.z, LM.rodoviaria.w, LM.rodoviaria.d, 6.5);
  M.memorialJK(B, LM.memorialjk.x, LM.memorialjk.z, LM.memorialjk.w, LM.memorialjk.d);
  M.domBosco(B, LM.dombosco.x, LM.dombosco.z);
  M.igrejinha(B, LM.igrejinha.x, LM.igrejinha.z);

  // vidraças e gradis quebráveis (evento 8 de Janeiro): Planalto, STF e Congresso
  {
    const glassMat = makeInkMaterial({ ink: BL }), barMat = makeInkMaterial({ ink: BK });
    const breakable = (kind, x, y, z, w, h, d) => {
      y += TH(x, z);
      const g = new THREE.Group();
      if (kind === 'glass') { g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), glassMat)); g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.16, d + 0.08).translate(0, h, 0), barMat)); }
      else { g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12).translate(0, h / 2, 0), barMat)); }
      g.position.set(x, y, z); scene.add(g); L.meshes.push(g);
      const br = { id: L.breakables.length, kind, group: g, hp: kind === 'glass' ? 35 : 55, pos: new THREE.Vector3(x, y + h / 2, z), alive: true, ink: kind === 'glass' ? BL : BK, box: null, civic: true };
      br.box = collider(x, y, z, w, h, d, { noNav: true }); br.box.data.breakable = br; L.breakables.push(br); return br;
    };
    const pl = LM.planalto, sf = LM.stf, cg = LM.congresso;
    const plDx = Math.max(14, pl.w - 4), plL = Math.max(30, pl.d - 2);
    const sP = Math.sign(LM.praca3p.x - pl.x) || -1, sS = Math.sign(LM.praca3p.x - sf.x) || 1;
    for (let zz = -plL / 2 + 6; zz <= plL / 2 - 6; zz += 4.4) breakable('glass', pl.x + sP * ((plDx - 5) / 2 + 0.3), 3, pl.z + zz, 0.3, 7, 4);
    const sfDx = Math.max(16, sf.w - 6), sfL = Math.max(16, sf.d - 2);
    for (let zz = -sfL / 2 + 4; zz <= sfL / 2 - 4; zz += 4) breakable('glass', sf.x + sS * ((sfDx - 5) / 2 + 0.3), 1.2, sf.z + zz, 0.3, 5.5, 3.8);
    for (const sx of [-1, 1]) for (let i = 1; i <= 4; i++) breakable('glass', cg.x + sx * i * 6, 0.2, cg.z - 13.25, 5.6, 3.8, 0.3);
    for (let x = -17; x <= 17; x += 3.8) if (Math.abs(x) > 2) breakable('fence', cg.x + x, 0.22, cg.z - 34, 3.2, 1.15, 0.22);
  }

  // ------------------------------------------------------------------ árvores, postes e paradas (instanciados)
  const treeProto = () => {
    const trunk = new THREE.CylinderGeometry(0.16, 0.24, 3.2, 6); trunk.translate(0, 1.6, 0);
    const c1 = new THREE.SphereGeometry(1, 8, 6); c1.scale(2.3, 1.15, 2.3); c1.translate(0, 3.7, 0);
    return [{ geo: trunk, ink: BK, fill: true }, { geo: c1, ink: GN, allowOverride: true }];
  };
  const TREE_INK = [GN, GN, OR, PK, PK, BK];
  for (const [x, z, t] of D.trees) {
    if (Math.abs(x) < 18 && z > -350 && z < 660) continue;
    const s = t < 2 ? 1.25 + ((x * 7 + z * 3) % 1 + 1) % 1 * 0.5 : 0.95;
    const tty = TH(x, z);
    addInstance('tree', treeProto, x, tty, z, (x + z) % TAU, s, s * (t < 2 ? 1.15 : 1), s, TREE_INK[t]);
    if (inNav(x, z) && !inSegList(allRoadSegs, x, z, 0.85)) collider(x, tty, z, 0.6, 3, 0.6, { noNav: false });
  }
  const lampProto = () => {
    const pole = new THREE.CylinderGeometry(0.1, 0.14, 8, 6); pole.translate(0, 4, 0);
    const arm = new THREE.BoxGeometry(0.14, 0.14, 2.2); arm.translate(0, 7.9, -1.0);
    const lamp = new THREE.BoxGeometry(0.5, 0.25, 0.7); lamp.translate(0, 7.75, -2.0);
    return [{ geo: pole, ink: BK, fill: true }, { geo: arm, ink: BK, fill: true }, { geo: lamp, ink: OR, fill: true }];
  };
  for (const [x, z, a] of D.lamps) addInstance('lamp', lampProto, x, TH(x, z), z, a + Math.PI, 1, 1, 1);
  const stopProto = () => {
    const roof = new THREE.BoxGeometry(3.8, 0.16, 1.9); roof.translate(0, 2.7, 0.15);
    const back = new THREE.BoxGeometry(3.8, 2.4, 0.08); back.translate(0, 1.3, 0.95);
    const bench = new THREE.BoxGeometry(3.0, 0.12, 0.45); bench.translate(0, 0.5, 0.6);
    const sign = new THREE.BoxGeometry(0.1, 3.1, 0.1); sign.translate(2.2, 1.55, -0.4);
    const plate = new THREE.BoxGeometry(0.06, 0.55, 0.7); plate.translate(2.2, 3.0, -0.4);
    return [{ geo: roof, ink: BK }, { geo: back, ink: BL }, { geo: bench, ink: BK, fill: true }, { geo: sign, ink: BK, fill: true }, { geo: plate, ink: BL, fill: true }];
  };
  L.busStops = [];
  for (const [x, z, nx, nz, dx, dz, edges] of D.stops) {
    const sty = TH(x, z);
    addInstance('stop', stopProto, x, sty, z, Math.atan2(nx, nz), 1, 1, 1);
    collider(x + nx * 0.95, sty, z + nz * 0.95, 1.6, 2.4, 1.6, { noNav: true });
    L.busStops.push({ x, z, y: sty, waitX: x + nx * 0.3, waitZ: z + nz * 0.3, faceYaw: Math.atan2(-nx, -nz), dx, dz, edges });
  }

  // ------------------------------------------------------------------ trânsito na rede real
  const tnet = { nodes: D.tnodes, edges: D.tedges, sources: D.tsources, sinks: D.tsinks, speed: D.speed,
    roads: roads.map((r) => ({ pts: r.pts, lanes: r.lanes, width: r.width, oneway: r.oneway, cls: r.cls, name: r.name })),
    stops: L.busStops.map((s) => ({ edges: s.edges })) };
  const traffic = buildGraphTraffic(B, tnet, { count: arena ? 160 : 280, targets: () => (L.targetsFn ? L.targetsFn() : []) });
  L.animated.push({ mesh: null, update: (t) => traffic.update(t) });
  L.cars = traffic.cars;
  L.allBusStops = L.busStops; L.busStops = L.busStops.filter((s) => inNav(s.x, s.z, 6)); // passageiros só usam as paradas da área jogável
  // Portais de túnel sólidos com colisão onde as vias saem do mapa
  const darkMat = makeInkMaterial({ ink: BK, fill: true });
  for (const n of [...new Set([...D.tsources, ...D.tsinks])]) {
    const [x, z] = D.tnodes[n];
    const ex = Math.min(x - Bd.minX, Bd.maxX - x), ez = Math.min(z - Bd.minZ, Bd.maxZ - z);
    const isX = ex < ez;
    const px = isX ? (x < 0 ? Bd.minX - 0.2 : Bd.maxX + 0.2) : x;
    const pz = isX ? z : (z < 0 ? Bd.minZ - 0.2 : Bd.maxZ + 0.2);
    const pw = isX ? 2.5 : 18, pd = isX ? 18 : 2.5, pty = TH(px, pz);
    collider(px, -2 + pty, pz, pw, 10, pd, { noGrapple: true, noNav: true });
    const m = new THREE.Mesh(new THREE.BoxGeometry(isX ? 1.2 : 18, 7, isX ? 18 : 1.2), darkMat);
    m.position.set(px, 3.5 + pty, pz);
    m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); L.meshes.push(m);
  }

  // ------------------------------------------------------------------ jogo: spawns, itens, início, pontos de referência
  for (const [x, z] of D.spawns) spawn(x, TH(x, z), z);
  for (const [x, z] of D.pickups) pickup(x, 0.2 + TH(x, z), z);
  for (let i = 0; i < D.spawns.length; i += 5) L.arenaSpawns.push(new THREE.Vector3(D.spawns[i][0], TH(D.spawns[i][0], D.spawns[i][1]), D.spawns[i][1]));
  { const psx = LM.torre.x + 2, psz = (LM.torre.z + LM.rodoviaria.z) / 2; L.playerStart.set(psx, TH(psx, psz) + 0.5, psz); }
  L.landmarks = {
    rodoviaria: { pos: lmPos('rodoviaria', 6.5), r: 22, name: 'Plataforma da Rodoviária' },
    rodoviariaChao: { pos: lmPos('rodoviaria', 0.3), r: 18, name: 'Embarque da Rodoviária' },
    torre: { pos: lmPos('torre', 0), r: 22, name: 'Base da Torre de TV' },
    torreMirante: { pos: lmPos('torre', 20.2), r: 10, name: 'Mirante da Torre de TV' },
    torreAlto: { pos: lmPos('torre', 58.2), r: 7, name: 'Mirante alto da Torre de TV' },
    praca3p: { pos: lmPos('praca3p', 0), r: 26, name: 'Praça dos Três Poderes' },
    congresso: { pos: new THREE.Vector3(LM.congresso.x, 5.2 + TH(LM.congresso.x, LM.congresso.z), LM.congresso.z), r: 14, name: 'Laje do Congresso Nacional' },
    catedral: { pos: lmPos('catedral', 0.4), r: 12, name: 'Catedral' },
    museu: { pos: lmPos('museu', 0.3), r: 12, name: 'Museu Nacional' },
    esplanada: { pos: lmPos('esplanada', 0.3), r: 24, name: 'Esplanada dos Ministérios' },
    itamaraty: { pos: lmPos('itamaraty', 13.2), r: 12, name: 'Terraço do Itamaraty' },
    justica: { pos: lmPos('justica', 13.2), r: 12, name: 'Terraço do Palácio da Justiça' },
    teatro: { pos: lmPos('teatro', 17.2), r: 10, name: 'Topo do Teatro Nacional' },
    asaNorte: { pos: new THREE.Vector3(300, 0.2, 40), r: 20, name: 'Asa Norte' },
    asaSul: { pos: new THREE.Vector3(-300, 0.2, 40), r: 20, name: 'Asa Sul' },
  };
  // pontos das asas encaixados no spawn de rua mais próximo (nunca dentro de prédio)
  const nearSpawn = (x, z) => { let best = null, bd = 1e18; for (const [sx, sz] of D.spawns) { const d = (sx - x) ** 2 + (sz - z) ** 2; if (d < bd) { bd = d; best = [sx, sz]; } } return best; };
  for (const k of ['asaNorte', 'asaSul']) { const p = L.landmarks[k].pos, q = nearSpawn(p.x, p.z); if (q) p.set(q[0], 0.2 + TH(q[0], q[1]), q[1]); }
  const ministerios = D.blds.filter((b) => b[0] === 'r' && b[1] === 'min' && inNav(b[2], b[3], 20));
  L.landmarks.ministerios = ministerios.slice(0, 8).map((b) => ({ pos: new THREE.Vector3(b[2], b[7] + 0.2 + TH(b[2], b[3]), b[3]), r: 9, name: 'Teto de Ministério (use o gancho)' }));
  // pontos de civis espalhados densamente pelos lugares movimentados da capital
  L.civSpots = [
    // Feirinha e base da Torre de TV
    ['vendor', LM.torre.x + 4, 0, LM.torre.z - 30], ['vendor', LM.torre.x - 4, 0, LM.torre.z - 26],
    ['vendor', LM.torre.x + 8, 0, LM.torre.z - 15], ['civilian', LM.torre.x - 8, 0, LM.torre.z - 12],
    ['civilian', LM.torre.x + 12, 0, LM.torre.z + 10], ['civilian', LM.torre.x, 20.2, LM.torre.z],
    // Rodoviária do Plano Piloto (piso superior e calçadões)
    ['civilian', LM.rodoviaria.x, 6.5, LM.rodoviaria.z], ['civilian', LM.rodoviaria.x + 10, 6.5, LM.rodoviaria.z + 8],
    ['civilian', LM.rodoviaria.x - 12, 6.5, LM.rodoviaria.z - 8], ['vendor', LM.rodoviaria.x + 16, 6.5, LM.rodoviaria.z - 4],
    ['civilian', LM.rodoviaria.x - 18, 6.5, LM.rodoviaria.z + 6], ['civilian', LM.rodoviaria.x, 6.5, LM.rodoviaria.z - 16],
    // Rodoviária do Plano Piloto (embarque inferior - caldo de cana e pastel)
    ['civilian', LM.rodoviaria.x - 8, 0.3, LM.rodoviaria.z + 10], ['vendor', LM.rodoviaria.x + 8, 0.3, LM.rodoviaria.z - 10],
    ['civilian', LM.rodoviaria.x - 15, 0.3, LM.rodoviaria.z - 6], ['civilian', LM.rodoviaria.x + 14, 0.3, LM.rodoviaria.z + 12],
    ['vendor', LM.rodoviaria.x, 0.3, LM.rodoviaria.z + 18], ['civilian', LM.rodoviaria.x + 4, 0.3, LM.rodoviaria.z - 18],
    // Catedral e Museu Nacional
    ['civilian', LM.catedral.x - 16, 0, LM.catedral.z], ['civilian', LM.catedral.x + 14, 0, LM.catedral.z + 8],
    ['civilian', LM.museu.x - 18, 0, LM.museu.z], ['civilian', LM.museu.x + 12, 0, LM.museu.z - 10],
    ['civilian', LM.teatro.x - 10, 0, LM.teatro.z + 12], ['civilian', LM.teatro.x + 8, 0, LM.teatro.z - 8],
    // Esplanada dos Ministérios
    ['politician', LM.esplanada.x - 30, 0, LM.esplanada.z], ['politician', LM.esplanada.x + 30, 0, LM.esplanada.z + 20],
    ['civilian', LM.esplanada.x - 15, 0, LM.esplanada.z - 40], ['civilian', LM.esplanada.x + 15, 0, LM.esplanada.z + 50],
    ['civilian', LM.esplanada.x, 0, LM.esplanada.z - 80], ['civilian', LM.esplanada.x, 0, LM.esplanada.z + 90],
    // Praça dos Três Poderes, Planalto, STF e Congresso
    ['politician', LM.congresso.x, 5.2, LM.congresso.z], ['politician', LM.congresso.x - 14, 5.2, LM.congresso.z - 6],
    ['politician', LM.praca3p.x - 10, 0, LM.praca3p.z], ['politician', LM.praca3p.x + 12, 0, LM.praca3p.z + 8],
    ['civilian', LM.praca3p.x, 0, LM.praca3p.z - 16], ['civilian', LM.panteao.x + 6, 0, LM.panteao.z - 4],
    ['civilian', LM.planalto.x + 8, 0, LM.planalto.z + 10], ['civilian', LM.stf.x - 8, 0, LM.stf.z - 10],
    // Setor Comercial e Shoppings
    ['civilian', LM.rodoviaria.x - 45, 0, LM.rodoviaria.z - 50], ['civilian', LM.rodoviaria.x + 45, 0, LM.rodoviaria.z - 50],
    ['vendor', LM.rodoviaria.x - 55, 0, LM.rodoviaria.z - 35], ['civilian', LM.rodoviaria.x + 55, 0, LM.rodoviaria.z - 35],
    // Paradas de ônibus de toda a área jogável
    ...L.busStops.filter((s) => inNav(s.x, s.z)).slice(0, 32).map((s, idx) => [idx % 5 === 0 ? 'vendor' : 'civilian', s.waitX + s.dx * 1.5, 0, s.waitZ + s.dz * 1.5]),
  ];
  // civis assentam no relevo real (DEM)
  L.civSpots = L.civSpots.map(([kind, x, y, z]) => [kind, x, y + TH(x, z), z]);
  // mapinha: desenha as vias de verdade
  L.drawMinimap = (g, b, k) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [pass, col] of [[0, '#8c94a0'], [1, '#4b5260']]) for (const r of roads) {
      if (r.lanes === 0 && pass === 1) continue;
      g.strokeStyle = r.lanes === 0 ? '#c9c3b6' : col; g.lineWidth = Math.max(1, (r.width + (pass ? 0 : 1.4)) * k);
      g.beginPath(); for (let i = 0; i < r.pts.length; i += 3) { const x = (r.pts[i] - b.minX) * k, z = (r.pts[i + 2] - b.minZ) * k; if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.stroke();
    }
    g.fillStyle = '#7fb6e6'; for (const w of D.water) { g.beginPath(); for (let i = 0; i < w.length; i += 2) { const x = (w[i] - b.minX) * k, z = (w[i + 1] - b.minZ) * k; if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.fill(); }
  };

  flushAccs();
  B.planes(5, 120, 60, { rStep: 30, hStep: 8, scale: 2.1 });
  return B.finish();
}
