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
import { INK, makeInkMaterial } from '../core/render.js';
import { TAU } from '../core/util.js';
import { BRASILIA as D } from './data/brasiliaData.js';
import { buildGraphTraffic } from './traffic.js';
import * as M from './brasiliaLandmarks.js';
import { terrainHeight as TH } from './data/brasiliaElev.js';

import { buildBrasiliaRoads } from './brasiliaRoads.js';
import * as P from './brasiliaProps.js';

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
  // Subdivisão alinhada a uma GRADE GLOBAL de 6 u: onde dois retângulos de chão se sobrepõem, os
  // triângulos ficam idênticos (mesma profundidade) — antes cada retângulo tinha a própria grade e as
  // camadas brigavam pela profundidade, gerando pontinhos e tracejados pretos espalhados pela grama.
  const GG = 6;
  const cuts = (a, b) => { const c = [a]; for (let v = Math.floor(a / GG) * GG + GG; v < b - 0.05; v += GG) if (v > a + 0.05) c.push(v); c.push(b); return c; };
  for (const [x1, z1, x2, z2] of D.ground) {
    const xs = cuts(x1, x2), zs = cuts(z1, z2);
    const hgt = zs.map((z) => xs.map((x) => TH(x, z) - 0.16));
    for (let iz = 0; iz < zs.length - 1; iz++) for (let ix = 0; ix < xs.length - 1; ix++) {
      const ax = xs[ix], bx = xs[ix + 1], az = zs[iz], bz = zs[iz + 1];
      quad(acc('u:' + GN, (ax + bx) / 2, (az + bz) / 2), [ax, hgt[iz][ix], az], [bx, hgt[iz][ix + 1], az], [bx, hgt[iz + 1][ix + 1], bz], [ax, hgt[iz + 1][ix], bz], UP);
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


  const { roads, allRoadSegs, inSegList, boxHitsRoad } = buildBrasiliaRoads(B, { acc, quad });

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
  // Colisão gerada do PRÓPRIO desenho: a planta (polígono) é varrida em faixas de 1 u no eixo mais curto e
  // cada faixa vira uma caixa com o intervalo exato no centro da faixa (prédio girado ou côncavo fica justo,
  // erro < 0,2 u). Faixas iguais seguidas se fundem (prédio alinhado = 1 caixa só).
  const solidFootprint = (poly, yBot, yTop, opts) => {
    if (yTop - yBot < 0.2) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const alongX = (x1 - x0) <= (z1 - z0);                 // fatiar ao longo do eixo mais curto = menos caixas
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1, n = Math.max(1, Math.round((a1 - a0) / 1.0)), st = (a1 - a0) / n;
    const P = alongX ? poly : poly.map(([x, z]) => [z, x]);
    let open = null;   // faixa em construção { s0, s1, iv }
    const flush = () => {
      if (!open) return;
      for (const [b0, b1] of open.iv) {
        const cA = (open.s0 + open.s1) / 2, cB = (b0 + b1) / 2, wA = open.s1 - open.s0, wB = b1 - b0;
        if (wB < 0.05) continue;
        if (alongX) collider(cA, yBot, cB, wA, yTop - yBot, wB, opts); else collider(cB, yBot, cA, wB, yTop - yBot, wA, opts);
      }
      open = null;
    };
    for (let i = 0; i < n; i++) {
      const s0 = a0 + i * st, s1 = s0 + st, sc = (s0 + s1) / 2, hits = [];
      for (let k = 0; k < P.length; k++) {
        const [px, pz] = P[k], [qx, qz] = P[(k + 1) % P.length];
        if ((px > sc) !== (qx > sc)) hits.push(pz + (sc - px) * (qz - pz) / (qx - px));
      }
      hits.sort((a, b) => a - b);
      const iv = []; for (let k = 0; k + 1 < hits.length; k += 2) iv.push([hits[k], hits[k + 1]]);
      const same = open && open.iv.length === iv.length && open.iv.every((v, k) => Math.abs(v[0] - iv[k][0]) < 0.06 && Math.abs(v[1] - iv[k][1]) < 0.06);
      if (same) open.s1 = s1; else { flush(); open = { s0, s1, iv }; }
    }
    flush();
  };
  const rectPoly = (cx, cz, Lg, Dp, ang) => { const ca = Math.cos(ang), sa = Math.sin(ang); return [[-Lg / 2, -Dp / 2], [Lg / 2, -Dp / 2], [Lg / 2, Dp / 2], [-Lg / 2, Dp / 2]].map(([u, v]) => [cx + ca * u - sa * v, cz + sa * u + ca * v]); };
  // base que encosta no ponto mais baixo do relevo sob a planta (sem prédio flutuando na ladeira)
  const baseUnder = (poly, cx, cz) => { let m = TH(cx, cz); for (const [x, z] of poly) m = Math.min(m, TH(x, z)); return m - 0.3; };
  let bi = 0;
  const roofs = [];
  const FACADE = 7 * 0.0625;   // etiqueta de material 7 = fachada de prédio
  for (const b of D.blds) {
    bi++;
    if (b[0] === 'r') {
      const [, st, cx, cz, Lg, Dp, ang, h, pil] = b;
      const ty = TH(cx, cz);                                         // base do prédio sobre o relevo real
      const S = STYLE[st] || STYLE.gen, body = S.body[bi % S.body.length], trim = S.trim[(bi * 7) % S.trim.length];
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const L2 = (u, v) => [cx + ca * u - sa * v, cz + sa * u + ca * v];
      const fp = rectPoly(cx, cz, Lg, Dp, ang), yb = baseUnder(fp, cx, cz);
      const by = pil > 0 ? pil + ty : yb;                            // sem pilotis: o corpo desce até o chão
      boxRot(cx, by, cz, Lg, h + ty - by, Dp, ang, body + FACADE);   // fachada: janelas/textura no shader
      solidFootprint(fp, by, h + ty);
      if (st === 'min') for (const u of [-Lg / 2, Lg / 2]) { const [px, pz] = L2(u, 0); solidFootprint(rectPoly(px, pz, 0.6, Dp + 0.3, ang), ty, h + ty + 0.3); }   // empenas das pontas
      if (pil > 0) { // pilotis: colunas (sólidas) e portaria de vidro (sólida)
        for (let u = -Lg / 2 + 1; u <= Lg / 2 - 1 + 0.01; u += Math.max(3, (Lg - 2) / 5)) for (const v of [-Dp / 2 + 0.8, Dp / 2 - 0.8]) { const [px, pz] = L2(u, v); box(px, yb, pz, 0.55, ty + pil - yb, 0.55, { ink: BK }); }
        boxRot(cx, yb, cz, Math.min(5, Lg * 0.25), ty + pil - yb, Dp * 0.6, ang, BL);
        solidFootprint(rectPoly(cx, cz, Math.min(5, Lg * 0.25), Dp * 0.6, ang), yb, ty + pil);
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
        if (bi % 2) { boxRot(cx, h + ty, cz, 6, 0.3, Math.min(6, Dp), ang, BK); boxRot(cx, h + 0.3 + ty, cz, 2.2, 0.05, 0.4, ang, OR, true); solidFootprint(rectPoly(cx, cz, 6, Math.min(6, Dp), ang), h + ty, h + ty + 0.3); }
      }
      if (st === 'cn') for (let u = -Lg / 2 + 2; u < Lg / 2 - 1; u += 3.6) for (let y = 3; y < h - 1; y += 2.6) { const [px, pz] = L2(u, Dp / 2 + 0.2); const g = new THREE.BoxGeometry(3.1, 2.1, 0.3); g.rotateY(-ang); g.translate(px, y + 1 + ty, pz); addGeoFill(g, [RD, OR, GN, BL, PK][Math.floor(u + y) % 5 >>> 0]); }
      if (st === 'res' && h > 8) { const [px, pz] = L2(Lg * 0.25, 0); boxRot(px, h + ty, pz, 3.2, 1.8, Math.min(3, Dp), ang, BK); solidFootprint(rectPoly(px, pz, 3.2, Math.min(3, Dp), ang), h + ty, h + ty + 1.8); } // caixa d'água
      if (st === 'house') { const g = new THREE.ConeGeometry(Math.hypot(Lg, Dp) / 2 * 1.02, 1.6, 4); g.rotateY(Math.PI / 4 - ang); g.scale(Lg / Math.hypot(Lg, Dp) * 1.42, 1, Dp / Math.hypot(Lg, Dp) * 1.42); g.translate(cx, h + 0.8 + ty, cz); addGeo(g, RD); }
      if (h > 12) roofs.push([cx, h + ty, cz]);
    } else {
      const [, st, h, ring2] = b;
      const S = STYLE[st] || STYLE.gen, body = S.body[bi % S.body.length], trim = S.trim[(bi * 7) % S.trim.length];
      const pts = []; for (let i = 0; i < ring2.length; i += 2) pts.push(new THREE.Vector2(ring2[i], ring2[i + 1]));
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      const n = pts.length; let cx = 0, cz = 0; for (const p of pts) { cx += p.x / n; cz += p.y / n; }
      const ty = TH(cx, cz);                                         // base do prédio sobre o relevo real
      const fp = pts.map((p) => [p.x, p.y]), yb = baseUnder(fp, cx, cz);
      const a = acc('u:' + (body + FACADE), cx, cz);
      for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; quad(a, [p.x, yb, p.y], [q.x, yb, q.y], [q.x, h + ty, q.y], [p.x, h + ty, p.y], [q.y - p.y, 0, -(q.x - p.x)]); }
      solidFootprint(fp, yb, h + ty);
      const tris = THREE.ShapeUtils.triangulateShape(pts, []);
      for (const [i0, i1, i2] of tris) { const base = a.pos.length / 3; for (const k of [i0, i2, i1]) a.pos.push(pts[k].x, h + ty, pts[k].y); a.idx.push(base, base + 1, base + 2); }
      if (h > 4) { const an = acc('u:' + trim + ':n', cx, cz); for (let y = FLOOR; y < h - 0.4; y += FLOOR) for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const ox = (q.y - p.y), oz = -(q.x - p.x), ol = Math.hypot(ox, oz) || 1; const ex = ox / ol * 0.12, ez = oz / ol * 0.12; quad(an, [p.x + ex, y - 0.1 + ty, p.y + ez], [q.x + ex, y - 0.1 + ty, q.y + ez], [q.x + ex, y + 0.1 + ty, q.y + ez], [p.x + ex, y + 0.1 + ty, p.y + ez], [ox, 0, oz]); } }
      if (h > 12) roofs.push([cx, h + ty, cz]);
    }
  }
  // (D.bcol, a colisão pré-calculada antiga, saiu: tinha caixas sem prédio, deslocadas na ladeira e
  //  descartava prédios inteiros encostados em via — agora a colisão vem do desenho, acima)
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
  // vegetação: espécies típicas do Plano (cerrado retorcido, mangueiras, ipês floridos, palmeiras-imperiais),
  // 2 variações cada, versão detalhada perto e leve longe; moitas e canteiros Burle Marx em volta.
  const hsh = (x, z, k = 0) => { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
  // grade das caixas sólidas (prédios, pilares…) para não plantar nada dentro deles
  const OCC = 8, occ = new Map();
  for (const bx of B.world.boxes) {
    if (bx.max.y - bx.min.y < 0.5) continue;
    for (let ix = Math.floor(bx.min.x / OCC); ix <= Math.floor(bx.max.x / OCC); ix++) for (let iz = Math.floor(bx.min.z / OCC); iz <= Math.floor(bx.max.z / OCC); iz++) {
      const k = ix * 65536 + iz; let a = occ.get(k); if (!a) occ.set(k, a = []); a.push(bx);
    }
  }
  const blocked = (x, z, r, y) => {
    for (let ix = Math.floor((x - r) / OCC); ix <= Math.floor((x + r) / OCC); ix++) for (let iz = Math.floor((z - r) / OCC); iz <= Math.floor((z + r) / OCC); iz++) {
      const a = occ.get(ix * 65536 + iz); if (!a) continue;
      for (const bx of a) if (bx.min.x < x + r && bx.max.x > x - r && bx.min.z < z + r && bx.max.z > z - r && bx.max.y > y + 0.2 && bx.min.y < y + 3) return true;
    }
    return false;
  };
  const onGround = (x, z) => { const t = B.world.terrainAt(x, z); return t === t; };
  const SPECIES = {
    cerrado: [P.treeCerrado(11)], manga: [P.treeMangueira(7)], ipe: [P.treeIpe(3)], palm: [P.treePalmeira(5)],
  };
  const IPE_INK = { 2: OR, 3: PK, 5: BK };   // ipê-amarelo, ipê-roxo, ipê-branco
  const shrubP = P.shrub(17), bedP = P.flowerBed(23);
  const BED_INK = [PK, OR, RD, BK, PK];
  for (const [x, z, t] of D.trees) {
    if (Math.abs(x) < 18 && z > -350 && z < 660) continue;
    const h = hsh(x, z), tty = TH(x, z), v = h < 0.5 ? 0 : 1;
    let sp, ink = GN, s;
    if (t === 2 || t === 3 || t === 5) { sp = 'ipe'; ink = IPE_INK[t]; s = 0.9 + hsh(x, z, 1) * 0.35; }
    else if (t === 1) { sp = 'manga'; s = 0.85 + hsh(x, z, 1) * 0.4; }
    else if (t === 4 && h < 0.4) { sp = 'palm'; s = 0.9 + hsh(x, z, 1) * 0.2; }
    else { sp = 'cerrado'; s = 0.9 + hsh(x, z, 1) * 0.45; }
    const protos = SPECIES[sp], pv = protos[Math.min(protos.length - 1, v)];
    addInstance('tree_' + sp + '_' + (protos.length > 1 ? v : 0), pv, x, tty, z, h * TAU * 7, s, s * (0.9 + hsh(x, z, 2) * 0.25), s, ink);
    if (!inSegList(allRoadSegs, x, z, 0.4)) collider(x, tty, z, sp === 'manga' ? 0.62 : 0.36, sp === 'palm' ? 8 : 3.4, sp === 'manga' ? 0.62 : 0.36, { noNav: false });   // tronco sólido
    // moita ou canteiro florido perto de algumas árvores
    const g = hsh(x, z, 3);
    if (g < 0.42) {
      const a = hsh(x, z, 4) * TAU, d = 3 + hsh(x, z, 5) * 3.5, sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
      const bed = g < 0.07;
      if (onGround(sx, sz) && !inSegList(allRoadSegs, sx, sz, bed ? 3.2 : 1.6)) {
        const sy = TH(sx, sz);
        if (!blocked(sx, sz, bed ? 2.6 : 1.4, sy)) {
          if (bed) addInstance('bed', bedP, sx, sy, sz, a, 1, 1, 1, BED_INK[Math.floor(hsh(x, z, 6) * 5)]);
          else addInstance('shrub', shrubP, sx, sy, sz, a, 0.8 + hsh(x, z, 7) * 0.6, 0.8 + hsh(x, z, 8) * 0.5, 0.8 + hsh(x, z, 7) * 0.6, GN);
        }
      }
    }
  }
  // postes com braço curvo; guardamos a posição de cada luminária para a luz noturna
  const lampP = P.lampPost();
  L.lampHeads = [];
  for (const [x, z, a] of D.lamps) {
    const ly = TH(x, z), th = a + Math.PI;
    addInstance('lamp', lampP, x, ly, z, th, 1, 1, 1);
    collider(x, ly, z, 0.3, 7.4, 0.3, { noNav: true });   // haste do poste é sólida
    L.lampHeads.push(new THREE.Vector3(x + P.LAMP_HEAD[2] * Math.sin(th), ly + P.LAMP_HEAD[1] - 0.6, z + P.LAMP_HEAD[2] * Math.cos(th)));
  }
  // semáforos: só nos cruzamentos da W3 e da L2 (o resto do Plano é tesourinha e balão, sem sinal)
  {
    const SIG = new Set(['W3 Sul', 'W3 Norte', 'W3 Central', 'L2 Norte', 'L2 Sul']);
    const deg = new Map(), kk = (x, z) => Math.round(x) + ',' + Math.round(z);
    for (const r of roads) { if (!(r.lanes > 0)) continue; const p = r.pts; for (const i of [0, p.length - 3]) { const k = kk(p[i], p[i + 2]); deg.set(k, (deg.get(k) || 0) + 1); } }
    const tlP = P.trafficLight(), placed = [];
    for (const r of roads) {
      if (!SIG.has(r.name) || r.pts.length < 6) continue;
      const p = r.pts, hw = r.width / 2;
      for (const end of [0, 1]) {
        const i = end ? p.length - 3 : 0, j = end ? p.length - 6 : 3;
        if ((deg.get(kk(p[i], p[i + 2])) || 0) < 3) continue;
        let ax = p[i] - p[j], az = p[i + 2] - p[j + 2]; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;   // sentido de quem chega
        if (end === 0 && r.oneway) continue;           // mão única: o início é saída, não chegada
        const jx = p[i], jz = p[i + 2];
        if (placed.some(([x, z]) => (x - jx) ** 2 + (z - jz) ** 2 < 14 * 14)) continue;
        const rx = -az, rz = ax;                        // lado direito de quem dirige
        let px = 0, pz = 0, ok = false;
        for (const off of [hw + 1.3, hw + 2.4, hw + 3.6]) {
          px = jx - ax * 7 + rx * off; pz = jz - az * 7 + rz * off;
          if (!inSegList(allRoadSegs, px, pz, 0.5) && onGround(px, pz) && !blocked(px, pz, 0.4, TH(px, pz))) { ok = true; break; }
        }
        if (!ok) continue;
        const Lx = -rx, Lz = -rz;                       // braço por cima da pista
        placed.push([jx, jz, px, pz, Math.atan2(-Lx, -Lz)]);
        addInstance('semaforo', tlP, px, TH(px, pz), pz, Math.atan2(-Lx, -Lz), 1, 1, 1);
        collider(px, TH(px, pz), pz, 0.4, 5.6, 0.4, { noNav: true });
      }
    }
    L.trafficLights = placed.map(([, , x, z, a]) => ({ x, z, a }));
  }
  const stopProto = P.busStop();
  L.busStops = [];
  for (const [x, z, nx, nz, dx, dz, edges] of D.stops) {
    const sty = TH(x, z);
    addInstance('stop', stopProto, x, sty, z, Math.atan2(nx, nz), 1, 1, 1);
    L.lampHeads.push(new THREE.Vector3(x, sty + 2.4, z));
    collider(x + nx * 0.95, sty, z + nz * 0.95, 1.6, 2.4, 1.6, { noNav: true });
    L.busStops.push({ x, z, y: sty, waitX: x + nx * 0.3, waitZ: z + nz * 0.3, faceYaw: Math.atan2(-nx, -nz), dx, dz, edges });
  }

  // ------------------------------------------------------------------ trânsito na rede real
  const tnet = { nodes: D.tnodes, edges: D.tedges, sources: D.tsources, sinks: D.tsinks, speed: D.speed,
    roads: roads.map((r) => ({ pts: r.pts, lanes: r.lanes, width: r.width, oneway: r.oneway, cls: r.cls, name: r.name })),
    stops: L.busStops.map((s) => ({ edges: s.edges })) };
  const traffic = buildGraphTraffic(B, tnet, { count: arena ? 160 : 280, targets: () => (L.targetsFn ? L.targetsFn() : []),
    density: () => { const g = typeof window !== 'undefined' && window.__game, e = g && g.ctx && g.ctx.env; return e ? 0.28 + 0.72 * e.rush : 1; } });
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
