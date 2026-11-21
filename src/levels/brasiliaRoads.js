import { INK } from '../core/render.js';
import { BRASILIA as D } from './data/brasiliaData.js';
import { terrainHeight as TH } from './data/brasiliaElev.js';

const { BLUE: BL, BLACK: BK, ORANGE: OR } = INK;
const UP = [0, 1, 0];
const DOWN = [0, -1, 0];

export function buildBrasiliaRoads(B, { acc, quad }) {
  const { box, cyl, collider } = B;
  const Bd = D.bounds;
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
  // Densifica as vias: trechos longos (até ~290 u sem nenhum ponto) ganham pontos intermediários a cada
  // ≤ 4 u, para o asfalto acompanhar o relevo real em vez de cortá-lo em linha reta — era isso que fazia
  // a grama aparecer por cima da pista no meio dos trechos (Esplanada, Eixo). Pontos colineares: o traçado
  // e o comprimento de arco (usado pelo trânsito e pelas paradas) não mudam.
  for (const r of D.roads) {
    const p = r[5]; if (p.length < 6) continue;
    const out = [p[0], p[1], p[2]];
    for (let i = 3; i < p.length; i += 3) {
      const ax = p[i - 3], ay = p[i - 2], az = p[i - 1], bx = p[i], by = p[i + 1], bz = p[i + 2];
      const k = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
      for (let s = 1; s < k; s++) { const t = s / k; out.push(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t); }
      out.push(bx, by, bz);
    }
    r[5] = out;
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
  // Índice espacial dos segmentos (grade de 16 u): as checagens via×chão, via×prédio e via×pilar só olham
  // os segmentos vizinhos em vez da lista inteira (dezenas de milhares depois da densificação).
  const SG = 16, segGrid = new Map(), segMark = new Int32Array(allRoadSegs.length); let segStamp = 0;
  const sgk = (ix, iz) => (ix + 2048) * 4096 + (iz + 2048);
  for (let i = 0; i < allRoadSegs.length; i++) {
    const s = allRoadSegs[i], m = s[4] + 2.5;
    const gx0 = Math.floor((Math.min(s[0], s[2]) - m) / SG), gx1 = Math.floor((Math.max(s[0], s[2]) + m) / SG);
    const gz0 = Math.floor((Math.min(s[1], s[3]) - m) / SG), gz1 = Math.floor((Math.max(s[1], s[3]) + m) / SG);
    for (let ix = gx0; ix <= gx1; ix++) for (let iz = gz0; iz <= gz1; iz++) { const k = sgk(ix, iz); let a = segGrid.get(k); if (!a) segGrid.set(k, a = []); a.push(i); }
  }
  const _cand = [];
  function nearSegs(minX, minZ, maxX, maxZ) {
    _cand.length = 0; segStamp++;
    const gx0 = Math.floor(minX / SG), gx1 = Math.floor(maxX / SG), gz0 = Math.floor(minZ / SG), gz1 = Math.floor(maxZ / SG);
    for (let ix = gx0; ix <= gx1; ix++) for (let iz = gz0; iz <= gz1; iz++) {
      const a = segGrid.get(sgk(ix, iz)); if (!a) continue;
      for (let j = 0; j < a.length; j++) { const i = a[j]; if (segMark[i] !== segStamp) { segMark[i] = segStamp; _cand.push(allRoadSegs[i]); } }
    }
    return _cand;
  }
  function inSegList(list0, x, z, pad = 0, endPad = 0.35) {
    const list = list0 === allRoadSegs ? nearSegs(x - pad, z - pad, x + pad, z + pad) : list0;
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
  // existe via (de qualquer tipo) passando em (x,z) com a superfície perto da altura y?
  function roadAtLevel(x, z, y, pad = 1.0, tol = 0.8) {
    const cand = nearSegs(x - pad - 12, z - pad - 12, x + pad + 12, z + pad + 12);
    for (let i = 0; i < cand.length; i++) {
      const sg = cand[i], ax = sg[0], az = sg[1], bx = sg[2], bz = sg[3], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const u = ((x - ax) * dx + (z - az) * dz) / len;
      if (u < -0.35 || u > len + 0.35) continue;
      if (Math.abs(-(x - ax) * dz + (z - az) * dx) / len > sg[4] + pad) continue;
      const t = Math.min(1, Math.max(0, u / len)), yy = sg[5] + (sg[6] - sg[5]) * t;
      if (Math.abs(yy - y) < tol) return true;
    }
    return false;
  }
  function obstructsLowerRoad(x, z, h, boxS = 1.24, slabH = 0.28, exA = null, exB = null) {
    const half = boxS * 0.5 + 0.48;
    const maxDiff = 2.12 + slabH;
    const cand = nearSegs(x - half, z - half, x + half, z + half);
    for (let i = 0; i < cand.length; i++) {
      const s = cand[i], ax = s[0], az = s[1], bx = s[2], bz = s[3];
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
  // Chão = RELEVO CONTÍNUO na física (heightfield), não caixas. Antes cada retângulo do chão (alguns com
  // mais de 1000 u) era um bloco plano numa altura só: o jogador ficava abaixo da grama nas partes altas,
  // flutuava nas baixas, passava por baixo das vias e, na emenda entre blocos de alturas diferentes, batia
  // numa parede invisível. Agora a física consulta a altura real do terreno em qualquer ponto; uma máscara
  // (1 u) diz onde existe chão — os retângulos do mapa, com as trincheiras e rampas que descem recortadas.
  // Elevação da pista/calçada sobre o relevo (grade 1 u): o chão físico sobe junto com o asfalto (+yo) e a
  // calçada (+meio-fio) — antes o pé afundava até 0,45 no meio-fio e tiros atravessavam a calçada.
  let liftAt = null;
  {
    const MR = 1.0, mX = Bd.minX - 2, mZ = Bd.minZ - 2;
    const mNX = Math.ceil((Bd.maxX - Bd.minX + 4) / MR), mNZ = Math.ceil((Bd.maxZ - Bd.minZ + 4) / MR);
    const mask = new Uint8Array(mNX * mNZ), lift = new Float32Array(mNX * mNZ);
    liftAt = (x, z, v) => {
      const ix = Math.floor((x - mX) / MR), iz = Math.floor((z - mZ) / MR);
      if (ix < 0 || iz < 0 || ix >= mNX || iz >= mNZ) return; const k = iz * mNX + ix; if (v > lift[k]) lift[k] = v;
    };
    for (const [x1, z1, x2, z2] of D.ground) {
      const ix0 = Math.max(0, Math.floor((x1 - mX) / MR)), ix1 = Math.min(mNX, Math.ceil((x2 - mX) / MR));
      const iz0 = Math.max(0, Math.floor((z1 - mZ) / MR)), iz1 = Math.min(mNZ, Math.ceil((z2 - mZ) / MR));
      for (let iz = iz0; iz < iz1; iz++) mask.fill(1, iz * mNX + ix0, iz * mNX + ix1);
    }
    // recorta o chão sobre vias rebaixadas (rampas/trincheiras): onde o piso tamparia uma pista mais baixa
    for (const sg of allRoadSegs) {
      const ra = sg[5] - TH(sg[0], sg[1]), rb = sg[6] - TH(sg[2], sg[3]);
      if (Math.min(ra, rb) > -0.12) continue;
      const m = sg[4] + 2;
      const ix0 = Math.max(0, Math.floor((Math.min(sg[0], sg[2]) - m - mX) / MR)), ix1 = Math.min(mNX - 1, Math.ceil((Math.max(sg[0], sg[2]) + m - mX) / MR));
      const iz0 = Math.max(0, Math.floor((Math.min(sg[1], sg[3]) - m - mZ) / MR)), iz1 = Math.min(mNZ - 1, Math.ceil((Math.max(sg[1], sg[3]) + m - mZ) / MR));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
        const k = iz * mNX + ix; if (!mask[k]) continue;
        const cx = mX + (ix + 0.5) * MR, cz = mZ + (iz + 0.5) * MR;
        if (obstructsLowerRoad(cx, cz, TH(cx, cz), 1.0, 0.85)) mask[k] = 0;
      }
    }
    B.world.setTerrain({
      minH: -35, maxH: 30,
      at(x, z) {
        const ix = Math.floor((x - mX) / MR), iz = Math.floor((z - mZ) / MR);
        if (ix < 0 || iz < 0 || ix >= mNX || iz >= mNZ || !mask[iz * mNX + ix]) return NaN;
        return TH(x, z) + lift[iz * mNX + ix] - 0.04;
      },
    });
  }
  function boxHitsRoad(x1, z1, x2, z2, pad = 0.35) {
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, hw = (x2 - x1) / 2, hd = (z2 - z1) / 2;
    const rad = Math.hypot(hw, hd);
    const cand = nearSegs(cx - rad, cz - rad, cx + rad, cz + rad);
    for (let i = 0; i < cand.length; i++) {
      const s = cand[i], ax = s[0], az = s[1], bx = s[2], bz = s[3], r = s[4] + pad;
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
    const yo = 0.05 + (RANK[cls] || 0) * 0.004;
    // meio-fio só onde existe de fato em Brasília: avenidas urbanas (W3, L2, comerciais, secundárias)
    // e as vias N1/S1 da Esplanada. Eixão/Eixo (trunk), alças e tesourinhas (*_link) e as ruas internas
    // das superquadras têm acostamento de grama, sem calçada.
    const hasCurb = drive && (cls === 'primary' || cls === 'secondary' || cls === 'tertiary' || (cls === 'trunk' && (name === 'N1' || name === 'S1')));
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
    let prevSlab = false;   // a linha de lajes na emenda entre trechos já foi posta pelo trecho anterior
    const CUM = [0]; for (let i = 1; i < n; i++) CUM.push(CUM[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][2] - P[i - 1][2]));
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
      // cada lado do meio-fio só existe se não invadir outra via (cruzamentos, entradas): nada de faixa
      // branca atravessando o asfalto vizinho
      const curbSideFree = (sgn) => {
        const mx = (a[0] + b[0]) / 2 + sgn * ((na[0] + nb[0]) / 2) * (hw + 0.8), mz = (a[2] + b[2]) / 2 + sgn * ((na[1] + nb[1]) / 2) * (hw + 0.8);
        const ex1x = a[0] + sgn * na[0] * (hw + 0.8), ex1z = a[2] + sgn * na[1] * (hw + 0.8), ex2x = b[0] + sgn * nb[0] * (hw + 0.8), ex2z = b[2] + sgn * nb[1] * (hw + 0.8);
        return !inSegList(allRoadSegs, mx, mz, 0.45) && !inSegList(allRoadSegs, ex1x, ex1z, 0.45) && !inSegList(allRoadSegs, ex2x, ex2z, 0.45);
      };
      const freeL = drive ? curbSideFree(1) : false, freeR = drive ? curbSideFree(-1) : false;   // lado livre = não encosta em outra via
      // para a pintura: só conta como cruzamento uma via que CRUZA (pistas paralelas da mesma avenida não)
      const crossAt = (x, z, pad) => {
        const dl = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1, ux = (b[0] - a[0]) / dl, uz = (b[2] - a[2]) / dl;
        const cand = nearSegs(x - pad, z - pad, x + pad, z + pad);
        for (let k = 0; k < cand.length; k++) {
          const sg = cand[k], sx = sg[2] - sg[0], sz = sg[3] - sg[1], sl = Math.hypot(sx, sz); if (sl < 1e-4) continue;
          if (Math.abs((sx * ux + sz * uz) / sl) > 0.82) continue;                  // paralela: ignora
          const r = sg[4] + pad, t = Math.max(0, Math.min(1, ((x - sg[0]) * sx + (z - sg[1]) * sz) / (sl * sl)));
          const qx = sg[0] + sx * t - x, qz = sg[1] + sz * t - z;
          if (qx * qx + qz * qz < r * r) return true;
        }
        return false;
      };
      const crossSide = (sgn) => crossAt((a[0] + b[0]) / 2 + sgn * ((na[0] + nb[0]) / 2) * (hw + 0.8), (a[2] + b[2]) / 2 + sgn * ((na[1] + nb[1]) / 2) * (hw + 0.8), 0.45);
      const paintL = drive && !crossSide(1), paintR = drive && !crossSide(-1);
      const curbL = hasCurb && !up && !down && !tunnel && freeL, curbR = hasCurb && !up && !down && !tunnel && freeR;
      if (curbL || curbR) {
        const SW = 1.6, LIFT = 0.16, cb = 0.8, inL = [-(na[0] + nb[0]), 0, -(na[1] + nb[1])], outL = [na[0] + nb[0], 0, na[1] + nb[1]];
        // esquerda
        if (curbL) {
        const Li = [La[0], La[1] + LIFT, La[2]], Lj = [Lb[0], Lb[1] + LIFT, Lb[2]];
        const LiO = [La[0] + na[0] * SW, La[1] + LIFT, La[2] + na[1] * SW], LjO = [Lb[0] + nb[0] * SW, Lb[1] + LIFT, Lb[2] + nb[1] * SW];
        quad(acc('u:' + BK, cxm, czm), Li, Lj, LjO, LiO, UP);                                   // topo do meio-fio
        quad(acc('u:' + BK, cxm, czm), La, Lb, Lj, Li, inL);                                     // face interna (asfalto→meio-fio)
        quad(acc('u:' + BK, cxm, czm), LiO, LjO, [LjO[0], LjO[1] - cb, LjO[2]], [LiO[0], LiO[1] - cb, LiO[2]], outL); // face externa (desce p/ grama)
        }
        // direita
        if (curbR) {
        const Ri = [Ra[0], Ra[1] + LIFT, Ra[2]], Rj = [Rb[0], Rb[1] + LIFT, Rb[2]];
        const RiO = [Ra[0] - na[0] * SW, Ra[1] + LIFT, Ra[2] - na[1] * SW], RjO = [Rb[0] - nb[0] * SW, Rb[1] + LIFT, Rb[2] - nb[1] * SW];
        quad(acc('u:' + BK, cxm, czm), Ri, RiO, RjO, Rj, UP);                                   // topo do meio-fio
        quad(acc('u:' + BK, cxm, czm), Ra, Ri, Rj, Rb, outL);                                    // face interna
        quad(acc('u:' + BK, cxm, czm), RiO, [RiO[0], RiO[1] - cb, RiO[2]], [RjO[0], RjO[1] - cb, RjO[2]], RjO, inL); // face externa
        }
      }
      if (!tunnel && !down && Math.max(hA, hB) <= 0.6 && Math.min(hA, hB) > -0.08) {
        const SWc = 1.6, LIFTc = 0.16, ext = hw + ((curbL || curbR) ? SWc : 0) + 0.5;
        const ddx = b[0] - a[0], ddz = b[2] - a[2], L2s = ddx * ddx + ddz * ddz;
        if (L2s > 1e-6) {
          const Ls = Math.sqrt(L2s), x0 = Math.min(a[0], b[0]) - ext, x1 = Math.max(a[0], b[0]) + ext, z0 = Math.min(a[2], b[2]) - ext, z1 = Math.max(a[2], b[2]) + ext;
          for (let zz = Math.floor(z0) + 0.5; zz < z1; zz += 1) for (let xx = Math.floor(x0) + 0.5; xx < x1; xx += 1) {
            const t = ((xx - a[0]) * ddx + (zz - a[2]) * ddz) / L2s; if (t < -0.02 || t > 1.02) continue;
            const side = (-(xx - a[0]) * ddz + (zz - a[2]) * ddx) / Ls;     // >0 = lado esquerdo (na)
            const dd = Math.abs(side), hh = hA + (hB - hA) * Math.min(1, Math.max(0, t));
            if (dd < hw) liftAt(xx, zz, Math.max(0, hh) + yo);
            else if (dd < hw + SWc && ((side > 0 && curbL) || (side < 0 && curbR))) liftAt(xx, zz, Math.max(0, hh) + yo + LIFTc);
          }
        }
      }
      if (up || (Math.max(hA, hB) > 0.04 && !tunnel && !down)) {
        // laterais (viaduto: viga de 0,9 m; aterro/rampa: muro até o chão) e guarda-corpo — também nas pontas
        // baixas das rampas (antes a pista ficava uma "folha" solta acima da grama, sem lateral)
        const bot = (h) => bridge ? h - 0.9 : 0;
        for (const [p0, p1, side] of [[La, Lb, 1], [Ra, Rb, -1]]) {
          const out = [side * (na[0] + nb[0]) / 2, 0, side * (na[1] + nb[1]) / 2];
          quad(acc('u:' + BK, cxm, czm), [p0[0], bot(hA) + ta, p0[2]], [p1[0], bot(hB) + tb, p1[2]], [p1[0], p1[1], p1[2]], [p0[0], p0[1], p0[2]], out);
          if (!nearJunction(cxm, czm) && Math.min(hA, hB) > 0.6) {   // guarda-corpo: as duas faces (antes só se via de fora)
            quad(acc('f:' + BK, cxm, czm), [p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [p1[0], p1[1] + 1.0, p1[2]], [p0[0], p0[1] + 1.0, p0[2]], out);
            quad(acc('f:' + BK, cxm, czm), [p0[0], p0[1], p0[2]], [p1[0], p1[1], p1[2]], [p1[0], p1[1] + 1.0, p1[2]], [p0[0], p0[1] + 1.0, p0[2]], [-out[0], 0, -out[2]]);
          }
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
      // A pintura segue o comprimento acumulado da via (CUM), então o tracejado continua certo mesmo com
      // os trechos densificados; linhas de bordo brancas contínuas em todas as vias de rodagem.
      const segLm = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (drive && segLm > 0.05) {
        const tx = (b[0] - a[0]) / segLm, tz = (b[2] - a[2]) / segLm, s0 = CUM[i];
        const yAt = (s) => a[1] + (b[1] - a[1]) * (s / segLm) + yo + 0.025 + ta + (tb - ta) * (s / segLm);
        const paint = (sA, sB, off, w2, ink) => {
          if (sB - sA < 0.05) return;
          const x0 = a[0] + tx * sA - tz * off, z0 = a[2] + tz * sA + tx * off, x1 = a[0] + tx * sB - tz * off, z1 = a[2] + tz * sB + tx * off, y0 = yAt(sA), y1 = yAt(sB);
          quad(acc('u:' + (ink + 3 * 0.0625) + ':n', x0, z0), [x0 + tz * w2, y0, z0 - tx * w2], [x1 + tz * w2, y1, z1 - tx * w2], [x1 - tz * w2, y1, z1 + tx * w2], [x0 - tz * w2, y0, z0 + tx * w2], UP);
        };
        // bordo (contínuo, branco)
        // a pintura para dentro dos cruzamentos: bordo só no lado livre; eixo/tracejado só fora do nó
        if (hw > 1.6) { if (paintL) paint(0, segLm, hw - 0.32, 0.07, BK); if (paintR) paint(0, segLm, -(hw - 0.32), 0.07, BK); }
        if (lanes > 1 && paintL && paintR) {
          const lines = [];
          if (oneway) for (let k = 1; k < lanes; k++) lines.push([-hw + k * 2.7, 'w']);
          else { lines.push([0, 'y']); for (let k = 1; k < lanes / 2; k++) { lines.push([k * 2.7, 'w']); lines.push([-k * 2.7, 'w']); } }
          const P9 = 9, D3 = 3.5;   // tracejado: 3,5 pintado / 5,5 vazio
          for (const [off, col] of lines) {
            if (col === 'y') { paint(0, segLm, off + 0.11, 0.06, OR); paint(0, segLm, off - 0.11, 0.06, OR); continue; } // dupla amarela
            for (let k = Math.floor(s0 / P9) - 1; k * P9 <= s0 + segLm; k++) {
              const dA = k * P9 - s0, dB = dA + D3;
              paint(Math.max(0, dA), Math.min(segLm, dB), off, 0.08, BK);
            }
          }
        }
      }
      // colisores: malha orientada de lajes finas (evita degraus altos nas rampas e libera viadutos/passagens inferiores)
      const segL = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const sMinX = Math.min(a[0], b[0]) - hw - 2, sMaxX = Math.max(a[0], b[0]) + hw + 2;
      const sMinZ = Math.min(a[2], b[2]) - hw - 2, sMaxZ = Math.max(a[2], b[2]) + hw + 2;
      const localCuts = (!up && !down) ? D.cutFloor.filter(([x1, z1, x2, z2]) => sMaxX >= x1 && sMinX <= x2 && sMaxZ >= z1 && sMinZ <= z2) : [];
      const hasCutBelow = localCuts.length > 0;
      const slabJ0 = prevSlab ? 1 : 0; prevSlab = (up || down || hasCutBelow) && segL > 0.05;
      if ((up || down || hasCutBelow) && segL > 0.05) {
        const tx = (b[0] - a[0]) / segL, tz = (b[2] - a[2]) / segL;
        const nx = -tz, nz = tx;
        const dh = Math.abs(hB - hA);
        const sloped = dh > 0.08;
        const steep = dh / segL > 0.22;
        const stepL = steep ? 0.45 : sloped ? 0.65 : 1.2;
        const kL = Math.max(1, Math.ceil(segL / stepL), Math.ceil(dh / 0.14));
        const boxS = steep ? 0.95 : sloped ? 1.24 : 1.7;
        // caixas alinhadas aos eixos numa via diagonal: recuo pela meia-diagonal projetada, para não saírem da borda
        const effHw = Math.max(0.15, up ? hw - (boxS / 2) * (Math.abs(tx) + Math.abs(tz)) + 0.08 : hw - 0.02);
        const stepW = steep ? 0.55 : 0.78;
        const kW = Math.max(1, Math.round((effHw * 2) / stepW));
        // laje da pista: viaduto = viga de 0,9 (como o desenho); aterro/rampa = MACIÇO até o chão (o desenho
        // é um muro do chão até a pista — antes era oco e dava para entrar/passar por baixo da via)
        const slabH = up && bridge ? 0.9 : 0.28, fillDown = up && !bridge;
        for (let j = slabJ0; j <= kL; j++) {
          const t = j / kL, cx = a[0] + (b[0] - a[0]) * t, cz = a[2] + (b[2] - a[2]) * t, h = a[1] + (b[1] - a[1]) * t, habs = h + ta + (tb - ta) * t;
          if (!down && !hasCutBelow && h <= 0.08) continue;
          if (hasCutBelow && !localCuts.some(([x1, z1, x2, z2]) => cx + hw + 2.5 >= x1 && cx - hw - 2.5 <= x2 && cz + hw + 2.5 >= z1 && cz - hw - 2.5 <= z2)) continue;
          for (let iw = 0; iw <= kW; iw++) {
            const u = -effHw + (iw / kW) * (effHw * 2);
            const px = cx + nx * u, pz = cz + nz * u;
            if (obstructsLowerRoad(px, pz, habs, boxS, slabH, aAbs, bAbs)) continue;
            if (fillDown) { const yb = Math.min(habs - slabH, TH(px, pz) - 0.3); collider(px, yb, pz, boxS, habs - yb, boxS, { noNav: false }); }
            else collider(px, habs - slabH, pz, boxS, slabH, boxS, { noNav: false });
          }
        }
        if (up && Math.min(hA, hB) > 0.6 && !nearJunction(cxm, czm)) {   // guarda-corpo (1,0) sólido nos dois lados
          const kP = Math.max(1, Math.ceil(segL / 0.9)), st = segL / kP;
          for (let j = 0; j < kP; j++) {
            const t = (j + 0.5) / kP, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, habs = a[1] + (b[1] - a[1]) * t + ta + (tb - ta) * t;
            const mx = na[0] + (nb[0] - na[0]) * t, mz = na[1] + (nb[1] - na[1]) * t;
            for (const sd of [1, -1]) collider(x + mx * hw * sd, habs, z + mz * hw * sd, Math.abs(tx) * st + 0.3, 1.0, Math.abs(tz) * st + 0.3, { noNav: true });
          }
        }
        if (tunnel) for (let j = 0; j <= Math.ceil(segL / 1.4); j++) { // paredes laterais do túnel
          const t = j / Math.ceil(segL / 1.4), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, h = a[1] + (b[1] - a[1]) * t, habs = h + ta + (tb - ta) * t;
          if (h > -2.2) continue;
          const mx = na[0] + (nb[0] - na[0]) * t, mz = na[1] + (nb[1] - na[1]) * t;
          for (const s of [1, -1]) {
            const wx = x + mx * (hw + 1.8) * s, wz = z + mz * (hw + 1.8) * s;
            if (!nearJunction(wx, wz) && !roadAtLevel(wx, wz, habs, 0, 1.2)) {   // só some se cair EM CIMA de outra pista no mesmo nível
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
      // via cruzando por cima no nível do chão: o muro para no chão (antes ficava um muro "fantasma" na pista)
      const cross = [0, 0.5, 1].some((f) => { const x = ax + (bx - ax) * f, z = az + (bz - az) * f; return roadAtLevel(x, z, TH(x, z), 0.6, 0.7); });
      const topA = cross ? taw - 0.02 : 1.0 + taw, topB = cross ? tbw - 0.02 : 1.0 + tbw;
      const wq = [[ax, Math.min(ah, bh) - 0.4 + taw, az], [bx, Math.min(ah, bh) - 0.4 + tbw, bz], [bx, topB, bz], [ax, topA, az]];
      const wn = [bz - az, 0, -(bx - ax)];
      quad(acc('u:' + BK, ax, az), ...wq, wn); quad(acc('u:' + BK, ax, az), ...wq, [-wn[0], 0, -wn[2]]);   // as duas faces (de dentro da trincheira o muro sumia)
      if (!cross) quad(acc('u:' + BK, ax, az), [ax, topA, az], [bx, topB, bz], [bx, topB, bz], [ax, topA, az], UP);
      // colisão contínua ao longo do muro (antes: só blocos nos vértices, com vãos entre eles)
      const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) continue;
      const k = Math.max(1, Math.ceil(L / 0.9)), st = L / k, ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let j = 0; j < k; j++) {
        const f = (j + 0.5) / k, x = ax + (bx - ax) * f, z = az + (bz - az) * f, tw = taw + (tbw - taw) * f;
        const bot = ah + (bh - ah) * f + tw, top = topA + (topB - topA) * f;
        if (top - bot > 0.1) collider(x, bot, z, Math.abs(ux) * st + 0.5, top - bot, Math.abs(uz) * st + 0.5, { noNav: true });
      }
    }
  }

  return { roads, allRoadSegs, inSegList, boxHitsRoad };
}
