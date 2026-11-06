// Map 6: Brasília Expandida — Do Estádio Mané Garrincha & Torre de TV até a Praça dos Três Poderes.
// Layout fiel ao mapa real de Brasília (Oeste -Z → Leste +Z; Norte = -X, Sul = +X):
// - Extremo Oeste: Estádio Nacional Mané Garrincha & Ginásio Nilson Nelson (Norte) e Palácio/Praça do Buriti (Sul)
// - Eixo Monumental Oeste: Centro de Convenções Ulysses Guimarães, Feirinha, Torre de TV (com Mirante escalável) e Fonte Luminosa
// - Asa Norte / Eixo: Brasília Shopping, Setor Hoteleiro Norte (SHN), Conjunto Nacional (fachada colorida) e Setor Bancário Norte (SBN)
// - Asa Sul / Eixo: Pátio Brasil Shopping, Setor Hoteleiro Sul (SHS), Setor Comercial Sul (SCS) e Setor Bancário Sul (Banco Central)
// - Rodoviária do Plano Piloto (com escadas dos dois lados ligando Oeste e Leste sobre as pistas N1/S1)
// - Setor Cultural: Teatro Nacional (Norte), Museu Nacional, Biblioteca Nacional e Catedral Metropolitana (Sul)
// - Esplanada dos Ministérios (12 blocos + anexos), Itamaraty, Palácio da Justiça, Congresso Nacional e Praça dos Três Poderes
// - Trânsito contínuo em todo o Eixo Monumental (36 veículos instanciados)
import * as THREE from 'three';
import { INK, makeInkMaterial } from '../render.js';
import { rand, TAU } from '../util.js';
import { buildTraffic } from './traffic.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function buildBrasilia(B, arena = false) {
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider, scene } = B;
  const BK = INK.BLACK, BL = INK.BLUE, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK, RD = INK.RED;
  L.key = 'brasilia';

  const P = arena ? 138 : 134;
  const MIN_Z = -520, MAX_Z = 250;
  const CZ = (MIN_Z + MAX_Z) / 2, HZ = (MAX_Z - MIN_Z) / 2;
  const T = 6, PH = 28;
  L.bounds.minZ = MIN_Z; L.bounds.maxZ = MAX_Z;
  // Nasce no coração central entre Fonte da Torre de TV, Conjunto Nacional, Pátio Brasil e Rodoviária
  L.playerStart.set(0, 0, -252);

  const deco = (geo, ink) => addGeo(geo, ink);
  // Colisores empilhados para aproximar cúpulas de Niemeyer
  function domeCollider(x, y0, z, r, n = 6, o = {}) {
    for (let i = 0; i < n; i++) { const yb = (i / n) * r, rr = Math.sqrt(Math.max(0, r * r - yb * yb)) * 0.86; collider(x, y0 + yb, z, rr * 2, r / n, rr * 2, o); }
  }
  // Faixas horizontais e montantes verticais para fachadas modernistas de vidro
  function facade(cx, cz, w, d, h, floorH, ink = BK, mull = 3.2) {
    for (let y = floorH; y < h - 0.3; y += floorH) box(cx, y - 0.12, cz, w + 0.35, 0.24, d + 0.35, { ink, noCollide: true });
    for (let x = cx - w / 2 + mull / 2; x < cx + w / 2; x += mull) for (const s of [-1, 1]) box(x, 0.4, cz + s * (d / 2 + 0.08), 0.14, h - 0.6, 0.16, { ink, noCollide: true });
  }

  // ---------------- Chão e limites ----------------
  // O mapa tem forma de cruz: o Eixo Monumental (|x| <= P) de ponta a ponta e, entre a W3 e a L2,
  // as Asas Norte (-X) e Sul (+X) abertas até WING (superquadras, comércio da W3, 700s, Eixão).
  const WING = 250, WZ1 = -440, WZ2 = -50; // faixa das asas no eixo Z
  L.bounds.minX = -WING; L.bounds.maxX = WING;
  // Rodoviária / Eixão: o chão tem um buraco onde ficam as plataformas de ônibus (sob a laje) e a trincheira do Eixão
  const LOW = -6.5, RZ1 = -236, RZ2 = -190, EZ1 = -224, EZ2 = -202, DEEP = 70, TRENCH = 120;
  L.bounds.minY = -9; L.killY = -11;
  const gnd = (x1, x2, z1, z2) => box((x1 + x2) / 2, -0.85, (z1 + z2) / 2, x2 - x1, 0.85, z2 - z1, { ink: BK });
  const GX = P + T / 2;
  gnd(-GX, GX, MIN_Z - T / 2, RZ1); gnd(-GX, GX, RZ2, MAX_Z + T / 2);
  for (const s of [-1, 1]) {
    const [a, b] = s < 0 ? [-GX, -60] : [60, GX]; gnd(a, b, RZ1, EZ1); gnd(a, b, EZ2, RZ2);
    const [c, d] = s < 0 ? [-GX, -TRENCH] : [TRENCH, GX]; gnd(c, d, EZ1, EZ2);
  }
  // laje com vãos retangulares (holes: [x1, x2, z1, z2])
  function slabHoles(x1, z1, x2, z2, y, t, holes, ink) {
    const zs = [...new Set([z1, z2, ...holes.flatMap((h) => [h[2], h[3]])])].filter((z) => z >= z1 && z <= z2).sort((a, b) => a - b);
    for (let i = 0; i < zs.length - 1; i++) {
      const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2; if (zb - za < 0.01) continue;
      const cut = holes.filter((h) => h[2] < zm && h[3] > zm).sort((a, b) => a[0] - b[0]);
      let x = x1; for (const h of cut) { if (h[0] > x) slab(x, za, h[0], zb, y, t, { ink }); x = Math.max(x, h[1]); }
      if (x < x2) slab(x, za, x2, zb, y, t, { ink });
    }
  }
  for (const s of [-1, 1]) box(s * (P + WING) / 2, -0.85, (WZ1 + WZ2) / 2, WING - P + T, 0.85, WZ2 - WZ1 + T, { ink: BK });
  box(0, 0, MIN_Z, 2 * P + T, PH, T, { ink: BK });
  box(0, 0, MAX_Z, 2 * P + T, PH, T, { ink: BK });
  for (const s of [-1, 1]) {
    box(s * P, 0, (MIN_Z + WZ1) / 2, T, PH, WZ1 - MIN_Z + T, { ink: BK }); // Eixo, trecho oeste
    box(s * P, 0, (WZ2 + MAX_Z) / 2, T, PH, MAX_Z - WZ2 + T, { ink: BK }); // Eixo, trecho leste
    box(s * WING, 0, (WZ1 + WZ2) / 2, T, PH, WZ2 - WZ1 + T, { ink: BK }); // fundo da asa
    box(s * (P + WING) / 2, 0, WZ1, WING - P + T, PH, T, { ink: BK });
    box(s * (P + WING) / 2, 0, WZ2, WING - P + T, PH, T, { ink: BK });
  }
  collider(0, 82, CZ, 2 * WING + 40, 8, 2 * HZ + 40, { noNav: true, noGrapple: true });
  // vias que cruzam o Eixo (W3 e L2): centro em Z e meia-largura
  const W3Z = -363, L2Z = -91, XR = 7, EIXAO_Z = -213;
  const CROSS = [[W3Z - XR, W3Z + XR], [L2Z - XR, L2Z + XR]];
  const crossFree = (z, pad = 0) => !CROSS.some(([a, b]) => z > a - pad && z < b + pad);
  // segmentos de [z1, z2] fora dos cruzamentos
  const segs = (z1, z2, pad = 0) => { let out = [[z1, z2]]; for (const [a, b] of CROSS) { const n = []; for (const [p, q] of out) { if (b + pad <= p || a - pad >= q) { n.push([p, q]); continue; } if (a - pad > p) n.push([p, a - pad]); if (b + pad < q) n.push([b + pad, q]); } out = n; } return out; };

  // ---------------- Eixo Monumental Contínuo (Oeste -516 → Congresso +150) ----------------
  const ROAD_START = MIN_Z + 4, ROAD_END = 150;
  // Gramado central dividido em trechos limpos entre os monumentos do eixo
  for (const [z1, z2] of [[-510, -432], [-280, RZ1 - 1], ...segs(RZ2 + 1, 142)]) {
    box(0, 0, (z1 + z2) / 2, 44, 0.22, z2 - z1, { ink: GN });
  }
  for (const s of [-1, 1]) {
    const rx = s * 30, rz1 = ROAD_START, rz2 = ROAD_END + 4;
    box(rx, 0, (rz1 + rz2) / 2, 16, 0.12, rz2 - rz1, { ink: BK, noNav: false }); // Vias N1 / S1 (3 faixas cada)
    for (let z = rz1 + 10; z < rz2 - 4; z += 13) if (crossFree(z, 6)) for (const lx of [rx - 2.6, rx + 2.6]) box(lx, 0.13, z, 0.3, 0.04, 4.8, { ink: OR, noCollide: true });
    for (const [a, b] of segs(rz1, rz2)) box(s * 22.3, 0, (a + b) / 2, 0.5, 0.3, b - a, { ink: BK }); // meio-fio interno
    for (const [a, b] of segs(CZ - HZ + 4, CZ + HZ - 4)) box(s * 40, 0, (a + b) / 2, 4, 0.25, b - a, { ink: GN }); // calçada / canteiro externo
    // Túnel sob o Congresso
    box(s * 21.7, 0, ROAD_END + 2, 1.2, 6, 4, { ink: BK }); box(s * 38.3, 0, ROAD_END + 2, 1.2, 6, 4, { ink: BK });
    box(s * 30, 6, ROAD_END + 2, 18, 1.6, 4, { ink: BK });
    box(s * 30, 0.1, ROAD_END + 4, 16, 5.9, 0.4, { ink: BK });
  }
  // Faixas de pedestre ao longo de todo o Eixo
  for (const z of [-440, W3Z - XR - 3, W3Z + XR + 3, -274, -234, -140, L2Z - XR - 3, L2Z + XR + 3, -38, 18, 84]) for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) box(s * (23.5 + i * 2.1), 0.13, z, 1.1, 0.04, 4, { ink: OR, noCollide: true });
  }

  // Postes de iluminação ao longo do Eixo Monumental
  for (let z = -496; z <= 130; z += 30) for (const s of [-1, 1]) {
    if (z > -228 && z < -198) continue;
    if (!crossFree(z, 2)) continue;
    const x = s * 21.2; cyl(x, 0, z, 0.13, 9, { ink: BK, seg: 6 });
    box(x - s * 1.1, 8.8, z, 2.2, 0.16, 0.2, { ink: BK, noCollide: true }); box(x - s * 2.1, 8.4, z, 0.6, 0.4, 0.5, { ink: OR, noCollide: true });
  }

  // Ipês amarelos, roxos/rosa e árvores do cerrado
  function ipe(x, z, ink, h = 5) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + rand(-1, 1), h * 0.5, z + rand(-1, 1)), new THREE.Vector3(x + rand(-0.6, 0.6), h, z + rand(-0.6, 0.6)));
    deco(new THREE.TubeGeometry(c, 5, 0.22, 5, false), BK); collider(x, 0, z, 0.7, h, 0.7, { noNav: false });
    for (let i = 0; i < 4; i++) { const g = new THREE.SphereGeometry(1, 7, 5); g.scale(rand(1.6, 2.3), rand(0.8, 1.1), rand(1.6, 2.3)); g.translate(x + rand(-1.4, 1.4), h + rand(-0.3, 0.8), z + rand(-1.4, 1.4)); deco(g, ink); }
  }
  const busyZ = (z, s) => !crossFree(z, 6) || [-336, -322, -276, -242, -214, -150, -72, -44, -16, 12, 40, 68, -386, -260, -112, -10, 74].some((b) => Math.abs(z - b) < 9) || (s > 0 && Math.abs(z + 154) < 6);
  for (let z = -492; z <= 136; z += 22) for (const s of [-1, 1]) {
    if (!busyZ(z, s)) ipe(s * 40 + rand(-0.6, 0.6), z + rand(-3, 3), (Math.floor(z / 22) + (s > 0 ? 1 : 0)) % 3 === 0 ? PK : (Math.floor(z / 22) % 2 ? OR : GN), rand(4.5, 6));
  }
  for (const [x, z, ink] of [[-14, -470, OR], [14, -448, PK], [-12, -264, GN], [12, -244, OR], [-12, -120, OR], [10, -96, PK], [-8, -64, GN], [14, -6, OR], [-15, 46, PK], [9, 98, GN], [-4, 112, OR]]) {
    if (crossFree(z, 3)) ipe(x, z, ink, rand(5, 6.5));
  }

  // Bancos e muretas de cobertura ao longo dos gramados
  for (const [x, z] of [[-8, -482], [8, -452], [-10, -268], [10, -246], [-6, -150], [6, -130], [-10, -80], [12, -40], [-4, 0], [8, 30], [-12, 64], [4, 90]]) {
    box(x, 0.22, z, 4.2, 0.9, 1.6, { ink: BK }); box(x, 1.12, z, 3.6, 0.5, 1.0, { ink: GN, noCollide: true });
  }
  // Paradas de ônibus ao longo das vias N1 e S1
  for (const z of [-386, -260, -112, -10, 74]) for (const s of [-1, 1]) {
    const x = s * 41; box(x + s * 1.3, 0.25, z, 0.25, 2.7, 6, { ink: BL }); box(x, 2.95, z, 3.2, 0.2, 6.6, { ink: BK });
    box(x + s * 0.6, 0.25, z, 0.6, 0.5, 4.5, { ink: BK, noCollide: true }); cyl(x - s * 1.3, 0.25, z - 3.4, 0.08, 3.2, { ink: BK, seg: 5 });
  }
  // Gradis de contenção da PMDF em pontos estratégicos
  for (const zz of [-284, 78, 124]) for (let x = -19; x <= 19; x += 3.6) {
    if (Math.abs(x) > 2.5) box(x, 0.22, zz + (Math.round(x) % 2 ? 0.4 : -0.4), 3.1, 1.15, 0.22, { ink: BK, noShoot: true });
  }

  // =========================================================================
  // EXPANSÃO OESTE (-520 .. -202): MANÉ GARRINCHA, BURITI, ULYSSES, TORRE DE TV,
  // PÁTIO BRASIL, SHS, SCS, BRASÍLIA SHOPPING, SHN, CONJUNTO NACIONAL, SBS, SBN
  // =========================================================================

  // ---------------- A. Estádio Nacional Mané Garrincha & Ginásio Nilson Nelson (Norte, Extremo Oeste) ----------------
  // Anel de pilares esbeltos sustentando a cobertura circular com a abertura sobre o campo; dentro,
  // a arquibancada em "bacia" retangular (dois anéis) em volta do gramado, com acessos pelos cantos.
  {
    const cx = -84, cz = -462, R = 38, H = 21;
    cyl(cx, 0, cz, R + 5, 0.2, { ink: BK, seg: 40, noCollide: true }); // esplanada
    // gramado listrado, linhas e traves
    const hx = 11, hz = 17;
    box(cx, 0, cz, 2 * hx + 4, 0.24, 2 * hz + 4, { ink: GN, noCollide: true });
    for (let i = 0; i < 6; i++) box(cx, 0.25, cz - hz + 2.83 + i * 5.66, 2 * hx, 0.02, 2.83, { ink: GN, noCollide: true });
    const midLine = new THREE.TorusGeometry(4.5, 0.1, 4, 24); midLine.rotateX(Math.PI / 2); midLine.translate(cx, 0.3, cz); deco(midLine, BK);
    box(cx, 0.28, cz, 2 * hx, 0.04, 0.2, { ink: BK, noCollide: true });
    for (const s of [-1, 1]) {
      box(cx - hx, 0.28, cz, 0.2, 0.04, 2 * hz, { ink: BK, noCollide: true }); box(cx + hx, 0.28, cz, 0.2, 0.04, 2 * hz, { ink: BK, noCollide: true });
      box(cx, 0.28, cz + s * hz, 2 * hx, 0.04, 0.2, { ink: BK, noCollide: true });
      box(cx, 0.28, cz + s * (hz - 5), 13, 0.04, 0.2, { ink: BK, noCollide: true });
      const gz = cz + s * hz;
      box(cx - 3.2, 0.24, gz, 0.2, 2.4, 0.2, { ink: BK }); box(cx + 3.2, 0.24, gz, 0.2, 2.4, 0.2, { ink: BK });
      box(cx, 2.55, gz, 6.6, 0.2, 0.2, { ink: BK, noCollide: true });
    }
    // anel inferior: 4 setores em degraus (cantos abertos = acessos ao campo)
    const step = (x1, z1, x2, z2, y) => box((x1 + x2) / 2, 0, (z1 + z2) / 2, x2 - x1, y, z2 - z1, { ink: y > 5.4 ? BK : BL });
    const SX = hx + 2, SZ = hz + 2, RUN = 0.95, RISE = 0.55;
    for (let i = 0; i < 9; i++) {
      const y = (i + 1) * RISE;
      for (const s of [-1, 1]) {
        step(cx + s * (SX + i * RUN) - (s > 0 ? 0 : RUN), cz - SZ + 1, cx + s * (SX + i * RUN) + (s > 0 ? RUN : 0), cz + SZ - 1, y); // laterais (leste/oeste)
        step(cx - SX + 1, cz + s * (SZ + i * RUN) - (s > 0 ? 0 : RUN), cx + SX - 1, cz + s * (SZ + i * RUN) + (s > 0 ? RUN : 0), y); // atrás dos gols
      }
    }
    // anel superior só nas laterais, mais alto e recuado
    for (let i = 0; i < 7; i++) {
      const y = 9 * RISE + (i + 1) * 0.62, x0 = SX + 9 * RUN + 1.2 + i * RUN;
      for (const s of [-1, 1]) step(cx + s * x0 - (s > 0 ? 0 : RUN), cz - SZ - 2, cx + s * x0 + (s > 0 ? RUN : 0), cz + SZ + 2, y);
    }
    for (const s of [-1, 1]) { // bandeja/marquise entre os anéis + escadas de acesso por fora
      const xe = cx + s * (SX + 9 * RUN + 0.6); box(xe, 9 * RISE, cz, 1.2, 1.2, 2 * SZ + 4, { ink: OR });
      stairs(cx + s * (SX + 16 * RUN + 1.2 + 1.6), 0, cz + SZ + 4, '-z', 18, 3, { rise: (9 * RISE + 7 * 0.62) / 18, run: 0.5 });
      // telões nos fundos
      box(cx, 0, cz + s * (SZ + 9 * RUN + 1), 14, 13, 0.8, { ink: BK }); box(cx, 7.6, cz + s * (SZ + 9 * RUN + 0.55), 12.4, 4.8, 0.1, { ink: BL, noCollide: true });
    }
    // pilares externos: 56 colunas finas com capitel alargado no topo
    for (let i = 0; i < 56; i++) {
      const a = (i / 56) * TAU, px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
      cyl(px, 0, pz, 0.42, H - 1.2, { ink: BK, seg: 7, noCollide: i % 2 === 1 });
      const cap = new THREE.CylinderGeometry(0.95, 0.42, 1.2, 7); cap.translate(px, H - 0.6, pz); deco(cap, BK);
    }
    // cobertura: anel de compressão externo, membrana inclinada e anel de tração interno sobre o campo
    const roof = new THREE.CylinderGeometry(R + 2.5, R - 13, 3.2, 56, 1, true); roof.translate(cx, H + 1.4, cz); deco(roof, BK);
    const roofTop = new THREE.RingGeometry(R - 13, R + 2.5, 56, 1); roofTop.rotateX(-Math.PI / 2); roofTop.translate(cx, H + 3.0, cz); deco(roofTop, BK);
    const rimOut = new THREE.TorusGeometry(R + 2.4, 0.7, 6, 56); rimOut.rotateX(Math.PI / 2); rimOut.translate(cx, H + 0.2, cz); deco(rimOut, BK);
    const rimIn = new THREE.TorusGeometry(R - 13, 0.5, 6, 48); rimIn.rotateX(Math.PI / 2); rimIn.translate(cx, H + 3.0, cz); deco(rimIn, BL);
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; const c = new THREE.CylinderGeometry(0.08, 0.08, 15.5, 4); c.rotateZ(Math.PI / 2); c.rotateY(-a); c.translate(cx + Math.cos(a) * (R - 5.5), H + 2.3, cz + Math.sin(a) * (R - 5.5)); deco(c, BK); } // cabos radiais
    ring(cx, H + 6, cz, 'y'); ring(cx + R - 6, H + 5, cz, 'y'); ring(cx - R + 6, H + 5, cz, 'y'); ring(cx, H + 5, cz + R - 6, 'y');
    const top = 9 * RISE + 7 * 0.62;
    sniper(cx + SX + 15, top, cz); sniper(cx - SX - 15, top, cz); sniper(cx, 9 * RISE, cz + SZ + 7);
    spawn(cx, 0.3, cz); spawn(cx + R + 7, 0, cz - 12); spawn(cx + R + 7, 0, cz + 12); spawn(cx - hx - 1, 0.3, cz);
    pickup(cx, 0.3, cz); pickup(cx + SX + 15, top, cz + 6); pickup(cx - R - 3, 0, cz);
    L.arenaSpawns.push(new THREE.Vector3(cx, 0.3, cz), new THREE.Vector3(cx + SX + 15, top, cz), new THREE.Vector3(cx + R + 9, 0, cz));

    // Ginásio Nilson Nelson ao lado (Norte, Z = -396)
    const nx = -92, nz = -396, NR = 15, NH = 10;
    cyl(nx, 0, nz, NR, NH * 0.55, { ink: BK, seg: 18 });
    const saucer = new THREE.CylinderGeometry(4.5, NR + 2.5, NH * 0.55, 18); saucer.translate(nx, NH * 0.8, nz); deco(saucer, BL);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; box(nx + Math.cos(a) * (NR + 0.4), 0, nz + Math.sin(a) * (NR + 0.4), 0.5, NH * 0.55, 0.5, { ink: BL, noCollide: true }); }
    ring(nx, NH + 4, nz, 'y'); spawn(nx + NR + 6, 0, nz); pickup(nx + NR + 5, 0, nz + 8);
  }

  // ---------------- B. Palácio do Buriti & Praça do Buriti (Sul/Oeste, Sede do GDF) ----------------
  {
    const cx = 82, cz = -458, W = 40, D = 14, H = 11;
    // Espelho d'água e Praça do Buriti
    box(cx - 18, 0, cz, 14, 0.3, 30, { ink: BL });
    // Palmeira de Buriti icônica
    cyl(cx - 28, 0, cz - 8, 0.4, 11, { ink: BK, seg: 6 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; box(cx - 28 + Math.cos(a) * 1.8, 11, cz - 8 + Math.sin(a) * 1.8, 2.2, 0.35, 0.9, { ink: GN, noCollide: true }); }
    // Bloco horizontal modernista do Palácio do Buriti + Anexo alto
    box(cx, 0, cz, W, H, D, { ink: BK });
    facade(cx, cz, W, D, H, 2.7, BL, 2.5);
    slab(cx - W / 2 - 0.6, cz - D / 2 - 0.6, cx + W / 2 + 0.6, cz + D / 2 + 0.6, H + 0.4, 0.4);
    stairs(cx - W / 2 - 2, 0, cz + 10, '-z', 16, 2.4, { rise: (H + 0.4) / 16, run: 0.55 });
    rail(cx - W / 2, cz - D / 2, cx + W / 2, cz - D / 2, H + 0.4);
    rail(cx - W / 2, cz + D / 2, cx + W / 2, cz + D / 2, H + 0.4);
    // Anexo do Buriti atrás
    box(cx + 12, 0, cz + 22, 22, 22, 12, { ink: BL }); facade(cx + 12, cz + 22, 22, 12, 22, 3.1, BK, 2.8);
    ring(cx, H + 4, cz, 'y'); ring(cx + 12, 25, cz + 22, 'y');
    sniper(cx, H + 0.4, cz); spawn(cx - 26, 0, cz + 6); spawn(cx - 26, 0, cz - 14);
    pickup(cx, H + 0.4, cz); pickup(cx - 24, 0, cz);
    L.arenaSpawns.push(new THREE.Vector3(cx, H + 0.4, cz), new THREE.Vector3(cx - 26, 0, cz));
  }

  // ---------------- C. Centro de Convenções Ulysses Guimarães (Eixo Central, Z = -402) ----------------
  {
    const cx = 0, cz = -402, W = 34, D = 46, H = 9.5;
    // Espelhos d'água laterais
    for (const sx of [-1, 1]) box(sx * 19, 0, cz, 4, 0.3, D - 4, { ink: BL });
    // Corpo principal e colunata branca
    box(cx, 0, cz, W - 6, H - 0.6, D - 6, { ink: BL });
    facade(cx, cz, W - 6, D - 6, H - 0.6, 3.0, BK, 3.2);
    slab(cx - W / 2, cz - D / 2, cx + W / 2, cz + D / 2, H, 0.7);
    for (let z = cz - D / 2 + 2; z <= cz + D / 2 - 2; z += 5.2) for (const sx of [-1, 1]) {
      box(sx * (W / 2 - 0.6), 0, z, 0.7, H - 0.7, 0.7, { ink: BK });
    }
    // Abóbada / marquise curva característica no topo
    const vault = new THREE.CylinderGeometry(7, 7, D - 10, 14, 1, false, 0, Math.PI);
    vault.rotateZ(Math.PI / 2); vault.rotateY(Math.PI / 2); vault.scale(1.2, 0.45, 1); vault.translate(cx, H, cz); deco(vault, BK);
    // Escadarias largas nas duas extremidades (Oeste e Leste) para subir ao terraço
    stairs(cx, 0, cz - D / 2 - 14 * 0.6, '+z', 14, 7, { rise: H / 14, run: 0.6 });
    stairs(cx, 0, cz + D / 2 + 14 * 0.6, '-z', 14, 7, { rise: H / 14, run: 0.6 });
    rail(cx - W / 2, cz - D / 2, cx - 4, cz - D / 2, H); rail(cx + 4, cz - D / 2, cx + W / 2, cz - D / 2, H);
    rail(cx - W / 2, cz + D / 2, cx - 4, cz + D / 2, H); rail(cx + 4, cz + D / 2, cx + W / 2, cz + D / 2, H);
    ring(cx, H + 6, cz, 'y'); sniper(cx - 12, H, cz); sniper(cx + 12, H, cz);
    spawn(cx, 0, cz - D / 2 - 12); spawn(cx, 0, cz + D / 2 + 12); spawn(cx - 12, H, cz + 10);
    pickup(cx, H, cz - 14); pickup(cx, H, cz + 14);
    L.arenaSpawns.push(new THREE.Vector3(cx - 12, H, cz), new THREE.Vector3(cx, 0, cz + D / 2 + 11));
  }

  // ---------------- D. Feirinha da Torre, Torre de TV (Mirante Jogável!) e Fonte Luminosa ----------------
  {
    // 1. Feirinha da Torre (boxes de artesanato e culinária sob a torre: Z = -354 .. -334)
    const stallColors = [OR, PK, BL, GN, RD, OR];
    let si = 0;
    for (const sx of [-12, -4, 4, 12]) for (const sz of [-352, -342]) {
      const c = stallColors[si++ % stallColors.length];
      box(sx, 0, sz, 5.2, 2.6, 4.4, { ink: BK });
      box(sx, 2.6, sz, 6.0, 0.45, 5.2, { ink: c });
    }
    pickup(0, 0, -347); spawn(-16, 0, -347); spawn(16, 0, -347);

    // 2. Torre de TV de Brasília (Z = -316) — Base piramidal + Mirante de Vidro JOGÁVEL em Y = 20!
    const tx = 0, tz = -316, MY = 20;
    // Três pilares estruturais inclinados de concreto armado até o Mirante
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU - Math.PI / 2;
      const bx = tx + Math.cos(a) * 12, bz = tz + Math.sin(a) * 12;
      const mx = tx + Math.cos(a) * 4.5, mz = tz + Math.sin(a) * 4.5;
      const leg = new THREE.QuadraticBezierCurve3(new THREE.Vector3(bx, 0, bz), new THREE.Vector3((bx + mx) / 2, MY * 0.5, (bz + mz) / 2), new THREE.Vector3(mx, MY, mz));
      deco(new THREE.TubeGeometry(leg, 8, 1.15, 6, false), BK);
      collider(bx * 0.85, 0, tz + (bz - tz) * 0.85, 2.4, 5, 2.4);
    }
    // Escadaria panorâmica externa (livre de teto!) com patamar intermediário (Y = 10) até o Mirante (Y = 20)
    stairs(-12.2, 0, tz + 10, '-z', 20, 3.2, { rise: 0.5, run: 0.55 });
    slab(-17.0, tz - 4.8, -10.4, tz - 0.8, 10, 0.5);
    rail(-17.0, tz - 4.8, -10.4, tz - 4.8, 10); rail(-17.0, tz - 4.8, -17.0, tz - 0.8, 10);
    stairs(-15.2, 10, tz - 1.0, '+z', 20, 3.2, { rise: 0.5, run: 0.55 });
    slab(-17.0, tz + 9.8, -10.4, tz + 13.6, MY, 0.6);
    rail(-17.0, tz + 13.6, -10.5, tz + 13.6, MY, { ink: BL }); rail(-17.0, tz + 9.8, -17.0, tz + 13.6, MY, { ink: BL });
    // Plataforma do Mirante de Vidro (Y = 20)
    slab(-10.5, tz - 10.5, 10.5, tz + 13.8, MY, 0.8);
    // Guarda-corpo de vidro azul do Mirante (com abertura na passarela oeste z = tz+9.8..tz+13.6)
    box(0, MY, tz + 1.5, 21.4, 1.1, 24.6, { ink: BL, noCollide: true });
    rail(-10.5, tz - 10.5, 10.5, tz - 10.5, MY, { ink: BL });
    rail(-10.5, tz - 10.5, -10.5, tz + 9.6, MY, { ink: BL });
    rail(10.5, tz - 10.5, 10.5, tz + 13.8, MY, { ink: BL });
    rail(-10.5, tz + 13.8, 10.5, tz + 13.8, MY, { ink: BL });
    // Cobertura do Mirante (Y = 24.5) e a grande torre metálica treliçada até Y = 98
    slab(-8.5, tz - 8.5, 8.5, tz + 8.5, MY + 4.5, 0.6, { ink: BK });
    box(tx, MY, tz, 2.8, 4.5, 2.8, { ink: BK }); // núcleo do elevador
    // Torre metálica treliçada de seção triangular (3 banzos convergentes, travessas e diagonais em X)
    const strut = (p, q, r, ink) => { const d = new THREE.Vector3().subVectors(q, p); const len = d.length(); const g = new THREE.CylinderGeometry(r, r, len, 4); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2); deco(g, ink); };
    const Y0 = MY + 4.5, Y1 = 106, R0 = 5.4, R1 = 1.2, NLV = 13;
    const lv = [];
    for (let j = 0; j <= NLV; j++) {
      const f = j / NLV, y = Y0 + (Y1 - Y0) * f, r = R0 + (R1 - R0) * f;
      lv.push([0, 1, 2].map((k) => { const a = -Math.PI / 2 + k * TAU / 3; return new THREE.Vector3(tx + Math.cos(a) * r, y, tz + Math.sin(a) * r); }));
    }
    for (let j = 0; j <= NLV; j++) for (let k = 0; k < 3; k++) {
      const A = lv[j][k], Bn = lv[j][(k + 1) % 3];
      strut(A, Bn, 0.13, BK);
      if (j < NLV) { strut(A, lv[j + 1][k], 0.26, BK); strut(A, lv[j + 1][(k + 1) % 3], 0.09, BK); strut(Bn, lv[j + 1][k], 0.09, BK); }
    }
    // Mirante alto (Y = 58): plataforma de observação em volta da treliça, alcançável com o gancho
    const UY = MY + 38;
    const deck = new THREE.CylinderGeometry(7.6, 7.6, 0.7, 20); deck.translate(tx, UY - 0.35, tz); deco(deck, BK);
    slab(tx - 6.2, tz - 6.2, tx + 6.2, tz + 6.2, UY, 0.7, { ink: BK, noCollide: false });
    const glassU = new THREE.CylinderGeometry(7.4, 7.4, 1.1, 20, 1, true); glassU.translate(tx, UY + 0.55, tz); deco(glassU, BL);
    rail(tx - 6.2, tz - 6.2, tx + 6.2, tz - 6.2, UY, { ink: BL }); rail(tx - 6.2, tz + 6.2, tx + 6.2, tz + 6.2, UY, { ink: BL });
    rail(tx - 6.2, tz - 6.2, tx - 6.2, tz + 6.2, UY, { ink: BL }); rail(tx + 6.2, tz - 6.2, tx + 6.2, tz + 6.2, UY, { ink: BL });
    const canopy = new THREE.CylinderGeometry(4.2, 8.2, 1.2, 20); canopy.translate(tx, UY + 4, tz); deco(canopy, OR);
    for (const [dx, dz] of [[9.5, 0], [-9.5, 0], [0, 9.5], [0, -9.5]]) ring(tx + dx, UY + 2.5, tz + dz, dx ? 'z' : 'x');
    sniper(tx + 4, UY, tz + 4); pickup(tx - 4, UY, tz - 4); L.arenaSpawns.push(new THREE.Vector3(tx + 4, UY, tz - 4));
    // antena no topo, listrada de vermelho e branco
    for (let i = 0; i < 9; i++) { const y = Y1 + i * 4, r = 0.55 - i * 0.035; const m = new THREE.CylinderGeometry(r - 0.035, r, 4, 6); m.translate(tx, y + 2, tz); deco(m, i % 2 ? BK : RD); }
    sphere(tx, Y1 + 37, tz, 0.5, { ink: RD, seg: 6 });
    // Argolas de gancho em 4 lados do Mirante para subir voando!
    ring(0, MY + 3.5, tz + 12, 'x'); ring(0, MY + 3.5, tz - 12, 'x');
    ring(-12, MY + 3.5, tz, 'z'); ring(12, MY + 3.5, tz, 'z');
    sniper(0, MY, tz + 9); sniper(-8, MY, tz - 8); sniper(8, MY, tz - 8);
    pickup(0, MY, tz - 5); pickup(-7, MY, tz + 6);
    spawn(0, MY, tz - 6); spawn(0, 0, tz + 18);
    L.arenaSpawns.push(new THREE.Vector3(0, MY, tz - 6), new THREE.Vector3(-8, MY, tz + 6), new THREE.Vector3(0, 0, -338));

    // 3. Fonte Luminosa da Torre de TV (Z = -290)
    const fz = -290;
    cyl(0, 0, fz, 13, 0.45, { ink: BL, seg: 24, noCollide: true }); collider(0, 0, fz, 4, 0.5, 4);
    const fRim = new THREE.TorusGeometry(13, 0.45, 5, 24); fRim.rotateX(Math.PI / 2); fRim.translate(0, 0.45, fz); deco(fRim, BK);
    // Jatos d'água verticais coloridos
    cyl(0, 0.4, fz, 0.55, 12, { ink: BL, seg: 8, noCollide: true });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      cyl(Math.cos(a) * 6.5, 0.4, fz + Math.sin(a) * 6.5, 0.32, 6.5, { ink: i % 2 ? PK : OR, seg: 6, noCollide: true });
    }
  }

  // ---------------- E. Brasília Shopping & Setor Hoteleiro Norte (SHN, Lado Norte -X) ----------------
  {
    // Brasília Shopping (cx = -78, cz = -340): fachada curva azul + torres laranja/azul + terraço
    const bx = -78, bz = -340, BW = 36, BD = 32, BH = 9;
    box(bx, 0, bz, BW, BH, BD, { ink: BL });
    facade(bx, bz, BW, BD, BH, 3.0, BK, 3.0);
    box(bx + BW / 2 + 0.4, BH - 2.4, bz, 0.6, 2.0, BD * 0.75, { ink: OR, noCollide: true });
    // Duas torres cilíndricas/modernistas sobre o shopping
    for (const dz of [-8, 8]) {
      cyl(bx - 6, BH, bz + dz, 6.5, 19, { ink: dz < 0 ? OR : BL, seg: 14 });
      ring(bx - 6, BH + 22, bz + dz, 'y');
    }
    stairs(bx + BW / 2 + 2, 0, bz + 12, '-z', 15, 2.6, { rise: BH / 15, run: 0.55 });
    rail(bx - BW / 2, bz - BD / 2, bx + BW / 2, bz - BD / 2, BH);
    rail(bx - BW / 2, bz + BD / 2, bx + BW / 2, bz + BD / 2, BH);
    sniper(bx + 10, BH, bz); pickup(bx + 8, BH, bz - 8); spawn(bx + BW / 2 + 7, 0, bz);
    L.arenaSpawns.push(new THREE.Vector3(bx + 10, BH, bz));

    // Torres do Setor Hoteleiro Norte (SHN: Kubitschek Plaza / Manhattan / Cullinan, Z = -296 .. -260)
    for (const [hx, hz, w, d, h, ink] of [[-74, -300, 24, 14, 26, BK], [-108, -296, 18, 18, 32, BL], [-76, -280, 28, 13, 22, GN], [-112, -276, 16, 16, 28, OR]]) {
      box(hx, 0, hz, w, h, d, { ink });
      facade(hx, hz, w, d, h, 2.8, BK, 2.8);
      box(hx, h, hz, 5, 2.2, 5, { ink: BK });
      ring(hx, h + 4, hz, 'y');
    }
    sniper(-68, 22, -280); spawn(-52, 0, -284); pickup(-54, 0, -300);
  }

  // ---------------- F. Pátio Brasil Shopping, Setor Hoteleiro Sul (SHS) & Setor Comercial Sul (SCS, Lado Sul +X) ----------------
  {
    // 1. Pátio Brasil Shopping (cx = 80, cz = -328): corpo escalonado verde/azul + pirâmide central de vidro!
    const px = 80, pz = -328, PW = 40, PD = 44, PH_MALL = 10;
    box(px, 0, pz, PW, PH_MALL, PD, { ink: GN });
    facade(px, pz, PW, PD, PH_MALL, 3.3, BK, 3.2);
    // Marquise laranja icônica voltada para o Eixo / W3 Sul
    box(px - PW / 2 - 2.2, 3.8, pz, 4.4, 1.4, 24, { ink: OR });
    for (const dz of [-9, 0, 9]) box(px - PW / 2 - 3.6, 0, pz + dz, 0.7, 3.8, 0.7, { ink: BK });
    // Claraboia piramidal de vidro no teto do Pátio Brasil + torre comercial anexa
    const sky = new THREE.ConeGeometry(9.5, 6.5, 4); sky.rotateY(Math.PI / 4); sky.translate(px + 2, PH_MALL + 3.25, pz); deco(sky, BL);
    collider(px + 2, PH_MALL, pz, 11, 5.5, 11);
    box(px + 12, PH_MALL, pz - 14, 12, 18, 12, { ink: BL }); facade(px + 12, pz - 14, 12, 12, 28, 3.0, BK, 3);
    // Escadaria externa até o terraço do Pátio Brasil
    stairs(px - PW / 2 - 2, 0, pz + 18, '-z', 16, 2.8, { rise: PH_MALL / 16, run: 0.55 });
    rail(px - PW / 2, pz - PD / 2, px + PW / 2, pz - PD / 2, PH_MALL);
    rail(px - PW / 2, pz + PD / 2, px + PW / 2, pz + PD / 2, PH_MALL);
    ring(px + 2, PH_MALL + 9, pz, 'y'); ring(px - PW / 2 - 2, PH_MALL + 4, pz, 'y');
    sniper(px - 12, PH_MALL, pz); spawn(px - PW / 2 - 8, 0, pz - 10); spawn(px - PW / 2 - 8, 0, pz + 12);
    pickup(px - 10, PH_MALL, pz + 10); pickup(px - PW / 2 - 6, 0, pz);
    L.arenaSpawns.push(new THREE.Vector3(px - 12, PH_MALL, pz), new THREE.Vector3(px - PW / 2 - 8, 0, pz));

    // 2. Setor Hoteleiro Sul (SHS: Hotel Nacional + Complexo Brasil 21, Z = -280)
    box(74, 0, -280, 28, 18, 12, { ink: BL }); facade(74, -280, 28, 12, 18, 3.0, BK, 2.8);
    // Torres Brasil 21 unidas por passarela aérea
    box(106, 0, -290, 14, 30, 14, { ink: BK }); facade(106, -290, 14, 14, 30, 3.0, OR, 2.8);
    box(106, 0, -268, 14, 26, 14, { ink: BL }); facade(106, -268, 14, 14, 26, 3.0, BK, 2.8);
    box(106, 18, -279, 5, 3.2, 8, { ink: OR });
    ring(74, 22, -280, 'y'); ring(106, 33, -290, 'y');
    sniper(74, 18, -280);

    // 3. Setor Comercial Sul (SCS): galerias com letreiros, logo ao sul do Conic
    for (const [bx2, bz2, bw, bd, bh, c1, c2] of [[66, -258, 20, 12, 11, BL, OR], [88, -258, 18, 12, 15, BK, PK]]) {
      box(bx2, 0, bz2, bw, bh, bd, { ink: c1 });
      facade(bx2, bz2, bw, bd, bh, 3.0, BK, 2.6);
      box(bx2 - bw / 2 - 0.3, 3.4, bz2, 0.5, 1.5, bd * 0.8, { ink: c2, noCollide: true });
      box(bx2, 3.4, bz2 - bd / 2 - 0.3, bw * 0.8, 1.5, 0.5, { ink: c2, noCollide: true });
    }
    stairs(54, 0, -266, '+z', 15, 2.4, { rise: 11 / 15, run: 0.55 }); slab(52.8, -257.8, 56, -252, 11, 0.4);
    ring(66, 15, -258, 'y'); sniper(66, 11, -258); spawn(77, 0, -268); pickup(77, 0, -268);
    L.arenaSpawns.push(new THREE.Vector3(66, 11, -258));
  }

  // ---------------- G. Conjunto Nacional (SDN, Lado Norte colado à Rodoviária, Z = -214) ----------------
  {
    const cx = -84, cz = -248, W = 44, D = 26, H = 9.5;
    box(cx, 0, cz, W, H, D, { ink: BK });
    // Famosa fachada luminosa de painéis coloridos (Vermelho, Amarelo/Laranja, Verde, Azul, Rosa) voltada para a Rodoviária e o Eixo!
    const panelInks = [RD, OR, GN, BL, PK];
    let pi = 0;
    for (let x = cx - W / 2 + 2.2; x <= cx + W / 2 - 2.2; x += 4.2) {
      for (let y = 3.2; y < H - 0.8; y += 2.8) {
        const col = panelInks[(pi++) % panelInks.length];
        box(x, y, cz + D / 2 + 0.25, 3.6, 2.3, 0.35, { ink: col, fill: true, noCollide: true });
      }
    }
    for (let z = cz - D / 2 + 2.5; z <= cz + D / 2 - 2.5; z += 4.2) {
      for (let y = 3.2; y < H - 0.8; y += 2.8) {
        const col = panelInks[(pi++) % panelInks.length];
        box(cx + W / 2 + 0.25, y, z, 0.35, 2.3, 3.6, { ink: col, fill: true, noCollide: true });
      }
    }
    // Torre empresarial do Conjunto Nacional sobre a laje
    box(cx - 10, H, cz - 4, 16, 14, 14, { ink: BL }); facade(cx - 10, cz - 4, 16, 14, 23.5, 3.0, BK, 2.6);
    // Rampa / escadaria de acesso ao estacionamento superior do Conjunto Nacional (Y = 9.5)
    stairs(cx + W / 2 + 2.2, 0, cz - 12, '+z', 16, 3.2, { rise: H / 16, run: 0.6 });
    rail(cx - W / 2, cz - D / 2, cx + W / 2, cz - D / 2, H);
    rail(cx - W / 2, cz + D / 2, cx + W / 2, cz + D / 2, H);
    rail(cx - W / 2, cz - D / 2, cx - W / 2, cz + D / 2, H);
    ring(cx - 10, H + 17, cz - 4, 'y'); ring(cx + 12, H + 4, cz, 'y');
    sniper(cx + 12, H, cz + 8); spawn(cx + W / 2 + 7, 0, cz + 10); spawn(cx + 8, H, cz - 6);
    pickup(cx + 10, H, cz + 4); pickup(cx + W / 2 + 6, 0, cz - 14);
    L.arenaSpawns.push(new THREE.Vector3(cx + 10, H, cz + 4), new THREE.Vector3(cx + W / 2 + 7, 0, cz + 12));
  }

  // ---------------- H. Setor Bancário Sul (Edifício-Sede do Banco Central + Torres) & Setor Bancário Norte ----------------
  {
    // Edifício-Sede do Banco Central do Brasil (SBS, X = 106, Z = -156): icônica torre cruciforme preta e dourada!
    const bx = 106, bz = -156, BH = 46;
    box(bx, 0, bz, 22, BH, 10, { ink: BK }); // lâmina leste-oeste
    box(bx, 0, bz, 10, BH, 22, { ink: BK }); // lâmina norte-sul (formato em cruz / H)
    for (let y = 4; y < BH - 1; y += 4.2) {
      box(bx, y, bz, 22.5, 0.35, 10.5, { ink: OR, noCollide: true });
      box(bx, y, bz, 10.5, 0.35, 22.5, { ink: OR, noCollide: true });
    }
    slab(bx - 12, bz - 12, bx + 12, bz + 12, BH + 0.8, 0.8, { ink: OR }); // coroamento monumental do BC
    ring(bx, BH + 4, bz, 'y'); sniper(bx - 8, BH + 0.8, bz);
    // Torres vizinhas do SBS (Banco do Brasil / Caixa)
    box(104, 0, -190, 18, 28, 14, { ink: BL }); facade(104, -190, 18, 14, 28, 3.1, BK, 3);
    box(104, 0, -124, 18, 25, 14, { ink: GN }); facade(104, -124, 18, 14, 25, 3.1, BK, 3);
    spawn(88, 0, -156); pickup(90, 0, -168);

    // Setor Bancário Norte (SBN, atrás do Teatro Nacional: X = -104, Z = -176 e -132)
    for (const [nx, nz, nh, ink] of [[-104, -176, 34, BL], [-104, -144, 28, BK], [-104, -114, 24, OR]]) {
      box(nx, 0, nz, 18, nh, 15, { ink });
      facade(nx, nz, 18, 15, nh, 3.0, BK, 2.8);
      ring(nx, nh + 4, nz, 'y');
    }
    spawn(-86, 0, -150); pickup(-86, 0, -166);
  }

  // =========================================================================
  // EIXO CENTRAL & ESPLANADA LESTE (-224 .. +250): RODOVIÁRIA, SETOR CULTURAL,
  // CATEDRAL, 12 MINISTÉRIOS, ITAMARATY, JUSTIÇA, CONGRESSO E TRÊS PODERES
  // =========================================================================

  // ---------------- 1. Rodoviária do Plano Piloto: plataforma superior no nível do Eixo Monumental, ----------------
  // plataformas de ônibus embaixo e o Eixão passando por baixo de tudo ("Buraco do Tatu").
  {
    const zc = (RZ1 + RZ2) / 2;
    // piso inferior, muros de arrimo e laje da plataforma superior (com os vãos das escadas)
    box(0, LOW - 0.8, zc, 120, 0.8, RZ2 - RZ1, { ink: BK });
    for (const z of [RZ1 - 0.5, RZ2 + 0.5]) box(0, LOW - 0.8, z, 122, -LOW + 0.8, 1, { ink: BK });
    for (const s of [-1, 1]) for (const [a, b] of [[RZ1, EZ1], [EZ2, RZ2]]) box(s * 60.5, LOW - 0.8, (a + b) / 2, 1, -LOW + 0.8, b - a, { ink: BK });
    const BAYW = (RZ1 + EZ1) / 2 - 3.2, BAYE = (EZ2 + RZ2) / 2 + 3.2; // ilhas de embarque coladas aos muros
    const holes = [];
    for (const hz of [RZ1 + 2.6, RZ2 - 2.6]) for (const [x1, x2] of [[-50, -42], [-4, 4], [42, 50]]) holes.push([x1, x2, hz - 1.7, hz + 1.7]);
    slabHoles(-60, RZ1, 60, RZ2, 0, 0.8, holes, BK);
    // pilares que sustentam a laje
    for (const x of [-52, -36, -20, -6, 6, 20, 36, 52]) for (const z of [EZ1 - 0.4, EZ2 + 0.4]) box(x, LOW, z, 1, -LOW - 0.8, 1, { ink: BK });
    // nível inferior: pista do Eixão no meio, baias de ônibus dos dois lados
    box(0, LOW, -213, 120, 0.1, EZ2 - EZ1, { ink: BK });
    for (let x = -56; x < 57; x += 9) for (const dz of [-7.4, -3.8, 3.8, 7.4]) box(x, LOW + 0.11, -213 + dz, 4.2, 0.04, 0.25, { ink: OR, noCollide: true });
    for (const z of [EZ1 - 0.4, EZ2 + 0.4]) for (const [a, b] of [[-58, -38], [-34, -24], [-18, -8], [8, 18], [24, 34], [38, 58]]) box((a + b) / 2, LOW, z, b - a, 1.0, 0.45, { ink: OR, noShoot: true }); // defensas
    for (const [z1, z2] of [[RZ1, RZ1 + 4.6], [RZ2 - 4.6, RZ2]]) {
      box(0, LOW, (z1 + z2) / 2, 118, 0.3, z2 - z1, { ink: BK }); // calçada de embarque
      for (const x of [-30, -12, 12, 30]) { box(x, LOW + 0.3, (z1 + z2) / 2, 3.2, 2.4, 2.2, { ink: PK }); box(x, LOW + 2.7, (z1 + z2) / 2, 3.8, 0.3, 2.8, { ink: OR, noCollide: true }); } // pastel e caldo de cana
      for (let x = -54; x <= 54; x += 12) box(x, LOW + 3.6, (z1 + z2) / 2 + (z1 < -213 ? 2.25 : -2.25), 3.2, 0.9, 0.12, { ink: [BL, GN, OR, RD][Math.abs(x / 12) % 4 | 0], noCollide: true }); // placas das plataformas
    }
    // escadas da plataforma superior até o embarque (descendo para o lado de dentro de cada vão)
    for (const [x1, x2, hz1, hz2] of holes) {
      const hz = (hz1 + hz2) / 2, top = x1 + (x1 < 0 ? 0 : 0);
      stairs(x2, LOW + 0.3, hz, '-x', 16, 3, { rise: (-LOW - 0.3) / 16, run: 0.5 });
      rail(x1, hz1, x2, hz1, 0); rail(x1, hz2, x2, hz2, 0); rail(x2, hz1, x2, hz2, 0); void top;
    }
    // parapeito na borda aberta da plataforma superior (olhando para o Eixão)
    for (const s of [-1, 1]) rail(s * 60, EZ1, s * 60, EZ2, 0);
    // plataforma superior: grande marquise, bancas e a ligação a pé entre Conjunto Nacional e Conic
    box(0, 4.6, zc, 40, 0.5, 24, { ink: OR, noCollide: true });
    for (const x of [-18, -6, 6, 18]) for (const z of [zc - 10, zc + 10]) box(x, 0, z, 0.7, 4.6, 0.7, { ink: BK });
    for (const [x, z] of [[-12, zc - 4], [12, zc - 4], [-12, zc + 5], [12, zc + 5]]) { box(x, 0, z, 3.4, 2.4, 2.4, { ink: PK }); box(x, 2.4, z, 4, 0.3, 3, { ink: BL, noCollide: true }); }
    // ônibus parados nas baias (vêm do sistema de trânsito, ver `parked` mais abaixo)
    ring(0, 9, zc, 'y'); ring(-48, 6, zc, 'y'); ring(48, 6, zc, 'y');
    sniper(-50, 0, zc); sniper(50, 0, zc);
    spawn(-20, 0, zc); spawn(20, 0, zc); spawn(-22, LOW + 0.3, RZ1 + 2.2); spawn(22, LOW + 0.3, RZ2 - 2.2); spawn(-48, 0, -184); spawn(48, 0, -184);
    pickup(0, 0, zc + 3); pickup(-44, 0, -184); pickup(-20, LOW + 0.3, RZ1 + 2.2); pickup(-6, LOW + 0.3, RZ2 - 2.2);
    L.arenaSpawns.push(new THREE.Vector3(0, 0, zc), new THREE.Vector3(-30, 0, zc), new THREE.Vector3(30, 0, zc), new THREE.Vector3(18, LOW + 0.3, RZ1 + 2.2), new THREE.Vector3(-18, LOW + 0.3, RZ2 - 2.2));
    void BAYW; void BAYE;
  }
  // ---------------- Eixão em trincheira: sai de baixo da Rodoviária e sobe em rampa até o nível das Asas ----------------
  for (const s of [-1, 1]) {
    box(s * 65, LOW - 0.8, -213, 10.2, 0.8, EZ2 - EZ1, { ink: BK });
    const len = TRENCH - DEEP, ang = Math.atan2(-LOW, len), hyp = Math.hypot(len, -LOW);
    const g = new THREE.BoxGeometry(hyp, 0.5, EZ2 - EZ1); g.rotateZ(s * ang); g.translate(s * (DEEP + TRENCH) / 2, LOW / 2 - 0.22, -213); deco(g, BK);
    for (let i = 0; i < len; i++) { const top = LOW + ((i + 1) / len) * -LOW; collider(s * (DEEP + i + 0.5), LOW - 0.8, -213, 1.02, top - LOW + 0.8, EZ2 - EZ1); }
    for (const z of [EZ1 - 0.5, EZ2 + 0.5]) box(s * (60 + TRENCH) / 2, LOW - 0.8, z, TRENCH - 60, -LOW + 1.8, 1, { ink: BK }); // muros + mureta
    for (let x = 64; x < TRENCH - 4; x += 9) for (const dz of [-7.4, -3.8, 3.8, 7.4]) { const y = x < DEEP ? LOW : LOW + (x - DEEP) / len * -LOW; box(s * x, y + 0.05, -213 + dz, 4.2, 0.04, 0.25, { ink: OR, noCollide: true }); }
  }

  // ---------------- 2. Teatro Nacional Cláudio Santoro (Norte) ----------------
  {
    const cx = -64, cz = -150, W = 30, D = 44, H = 16;
    const g = new THREE.CylinderGeometry(0.55, 1, 1, 4); g.rotateY(Math.PI / 4); g.scale(W / Math.SQRT2, H, D / Math.SQRT2); g.translate(cx, H / 2, cz); deco(g, BL);
    for (let i = 0; i < 4; i++) { const k = 1 - 0.45 * (i + 0.5) / 4; collider(cx, i * H / 4, cz, W * k, H / 4, D * k); }
    for (let i = 0; i < 26; i++) { const f = rand(0.1, 0.85), y = f * H, k = 1 - 0.45 * f; const s = Math.random() < 0.5 ? -1 : 1; box(cx + s * (W * k / 2 + 0.2), y, cz + rand(-D * k / 2 + 2, D * k / 2 - 2), 1.2, 1.2, rand(1.2, 3), { ink: BK, noCollide: true }); }
    box(cx + W / 2 + 1, 0, cz, 3, 3.2, 12, { ink: BK });
    ring(cx, H + 3, cz, 'y'); sniper(cx, H, cz); spawn(cx + W / 2 + 4, 0, cz + 10); pickup(cx + W / 2 + 4, 0, cz - 10);
  }

  // ---------------- 3. Conjunto Cultural da República: Museu Nacional e Biblioteca (Sul) ----------------
  {
    const mx = 66, mz = -160, R = 14;
    const dome = new THREE.SphereGeometry(R, 22, 11, 0, TAU, 0, Math.PI / 2); dome.translate(mx, 0, mz); deco(dome, BK);
    domeCollider(mx, 0, mz, R, 7);
    box(mx - 12.4, 4.6, mz, 0.9, 2.2, 10, { ink: BK, fill: true, noCollide: true });
    stairs(41, 0, mz + 6, '+x', 14, 2.4, { rise: 0.5, run: 0.55 });
    slab(48.7, mz + 4, 54.5, mz + 8, 7, 0.4); rail(48.7, mz + 8, 54.5, mz + 8, 7);
    const rc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(41, 0.4, mz + 7.3), new THREE.Vector3(47, 4.5, mz + 10), new THREE.Vector3(54.5, 7.3, mz + 7.3));
    deco(new THREE.TubeGeometry(rc, 12, 0.35, 5, false), BK);
    box(mx - 4, 0, mz + 18, 26, 0.3, 6, { ink: BL });
    ring(mx, R + 4, mz, 'y'); sniper(51.5, 7, mz + 6);
    const bx = 68, bz = -190, BW = 20, BD = 14, BH = 13;
    box(bx, 0, bz, BW, BH, BD, { ink: BK });
    for (let x = bx - BW / 2 + 1; x < bx + BW / 2; x += 1.6) for (const s of [-1, 1]) box(x, 0.5, bz + s * (BD / 2 + 0.5), 0.3, BH - 1, 1, { ink: BL, noCollide: true });
    rail(bx - BW / 2, bz - BD / 2, bx + BW / 2, bz - BD / 2, BH); rail(bx - BW / 2, bz + BD / 2, bx + BW / 2, bz + BD / 2, BH);
    let y = 0; for (let f = 0; f < 3; f++) { const dir = f % 2 === 0 ? '-z' : '+z'; const sz = dir === '-z' ? bz + 4.4 : bz - 4.4; const lane = f % 2 === 0 ? bx - BW / 2 - 1.2 : bx - BW / 2 - 3.2; stairs(lane, y, sz, dir, 15, 1.8, { rise: BH / 45, run: 0.55 }); y += BH / 3; const lz = dir === '-z' ? bz - 5.5 : bz + 5.5; slab(bx - BW / 2 - 4.3, lz - 1.1, bx - BW / 2, lz + 1.1, y, 0.35); }
    ring(bx, BH + 3, bz, 'y'); pickup(bx, BH, bz); spawn(bx - BW / 2 - 6, 0, bz + 12);
  }

  // ---------------- 4. Catedral Metropolitana (Sul) ----------------
  {
    const cx = 64, cz = -114, R = 10.5, H = 21;
    cyl(cx, 0, cz, R + 4, 0.3, { ink: BL, seg: 28, noCollide: true }); collider(cx, 0, cz, 2, 0.3, 2);
    box(cx, 0.3, cz, 2 * R * 0.95, 0.1, 2 * R * 0.95, { ink: BK, noCollide: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(cx + ca * R, 0, cz + sa * R), new THREE.Vector3(cx + ca * (R * 0.18), H * 0.52, cz + sa * (R * 0.18)), new THREE.Vector3(cx + ca * (R * 0.42), H, cz + sa * (R * 0.42)));
      deco(new THREE.TubeGeometry(c, 10, 0.55, 6, false), BK);
      collider(cx + ca * R * 0.96, 0, cz + sa * R * 0.96, 1.1, 3.5, 1.1);
    }
    const glass = new THREE.CylinderGeometry(R * 0.24, R * 0.9, H * 0.8, 16, 1, true); glass.translate(cx, H * 0.42, cz); deco(glass, BL);
    box(cx, H, cz, 0.35, 3.6, 0.35, { ink: OR, noCollide: true }); box(cx, H + 2.4, cz, 2.2, 0.35, 0.35, { ink: OR, noCollide: true });
    for (const [dx, dz, y] of [[-2, 0, 12], [1.5, 1.5, 10.5], [1, -2, 9]]) { const ag = new THREE.ConeGeometry(0.7, 2.4, 5); ag.translate(cx + dx, y, cz + dz); deco(ag, PK); }
    box(cx, 0.3, cz, 3, 1.1, 1.4, { ink: OR });
    box(cx + 15, 0, cz - 15, 1.3, 20, 4, { ink: BK }); for (let i = 0; i < 4; i++) sphere(cx + 15, 15.5 - i * 0.2, cz - 16.5 + i, 0.6, { ink: OR, seg: 7 });
    for (let i = 0; i < 4; i++) { const ex = cx - R - 6, ez = cz - 4.5 + i * 3; cyl(ex, 0, ez, 0.35, 3.2, { ink: BK, seg: 6 }); sphere(ex, 3.6, ez, 0.45, { ink: BK, seg: 7 }); }
    ring(cx, H + 5, cz, 'y'); spawn(cx - R - 9, 0, cz + 6); pickup(cx, 0, cz + 4);
    L.arenaSpawns.push(new THREE.Vector3(cx, 0.3, cz + 3), new THREE.Vector3(cx - R - 9, 0, cz - 6));
  }

  // ---------------- 5. Os Ministérios (6 por lado + Anexos e Edifícios Complementares) ----------------
  const zMinistries = [-72, -44, -16, 12, 40, 68];
  const MW = 34, MH = 20, MD = 12;
  for (const s of [-1, 1]) for (let idx = 0; idx < zMinistries.length; idx++) {
    const mz = zMinistries[idx];
    const mx = s * 61, ink = s < 0 ? BL : GN;
    box(mx, 0, mz, MW, MH, MD, { ink });
    box(mx, MH, mz, MW + 0.6, 0.5, MD + 0.6, { ink: BK, noCollide: true });
    facade(mx, mz, MW, MD, MH, 2.2, BK, 2.8);
    box(mx, MH, mz, 6, 2.6, 5, { ink: BK });
    box(mx - s * (MW / 2 + 0.2), MH - 3, mz, 0.4, 2, MD * 0.7, { ink: OR, noCollide: true });
    box(mx - s * (MW / 2 + 2), 0, mz, 4, 3.4, 8, { ink: BK });
    const zf = mz - MD / 2; let y = 0;
    for (let f = 0; f < 5; f++) {
      const dir = f % 2 === 0 ? '+x' : '-x'; const sx = dir === '+x' ? mx - 3.15 : mx + 3.15; const lane = f % 2 === 0 ? zf - 1.2 : zf - 3.2;
      stairs(sx, y, lane, dir, 14, 1.8); y += 4;
      const lx = dir === '+x' ? mx + 4.25 : mx - 4.25; slab(lx - 1.1, zf - 4.3, lx + 1.1, zf, y, 0.4); rail(lx - 1.1, zf - 4.3, lx + 1.1, zf - 4.3, y);
    }
    rail(mx - MW / 2, zf, mx + 3.1, zf, MH); rail(mx + 5.4, zf, mx + MW / 2, zf, MH);
    rail(mx - MW / 2, mz + MD / 2, mx + MW / 2, mz + MD / 2, MH);
    rail(mx - MW / 2, zf, mx - MW / 2, mz + MD / 2, MH); rail(mx + MW / 2, zf, mx + MW / 2, mz + MD / 2, MH);
    // Anexo atrás do ministério + blocos altos de autarquias na Via N2/S2
    const ax = s * 92; box(ax, 0, mz + 2, 14, 8, 16, { ink: BK }); facade(ax, mz + 2, 14, 16, 8, 4, BL, 3.5);
    stairs(ax - 3.15, 0, mz + 11, '+x', 16, 1.6, { rise: 0.5, run: 0.45 }); pickup(ax, 8, mz + 2);
    if (idx % 2 === 0) {
      const tx2 = s * 116; box(tx2, 0, mz, 16, 24, 16, { ink: idx === 2 ? OR : BL });
      facade(tx2, mz, 16, 16, 24, 3.2, BK, 3.2);
    }
    ring(mx + s * 8, MH + 4, mz, 'y'); sniper(mx + s * 6, MH, mz + 2);
    spawn(mx - s * (MW / 2 + 5), 0, mz + 9); pickup(mx - s * (MW / 2 + 5), 0, mz - 9);
    L.arenaSpawns.push(new THREE.Vector3(mx + s * 10, MH, mz), new THREE.Vector3(mx - s * (MW / 2 + 5), 0, mz + 9));
  }

  // ---------------- 6. Palácio do Itamaraty (Norte) e Palácio da Justiça (Sul) ----------------
  for (const s of [-1, 1]) {
    const cx = s * 64, cz = 104, W = 30, H = 13;
    box(cx, 0, cz, W + 12, 0.3, W + 12, { ink: BL });
    box(cx, 0.3, cz, W - 8, H - 1, W - 8, { ink: s < 0 ? BL : GN });
    facade(cx, cz, W - 8, W - 8, H - 1, 3.2, BK, 2.2);
    slab(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2, H, 0.8);
    const n = 8, step = W / n;
    for (let i = 0; i <= n; i++) for (const [ax, az, rot] of [[cx - W / 2 + i * step, cz - W / 2, 0], [cx - W / 2 + i * step, cz + W / 2, 0], [cx - W / 2, cz - W / 2 + i * step, 1], [cx + W / 2, cz - W / 2 + i * step, 1]]) {
      box(ax, 0.3, az, 0.7, H - 3.2, 0.7, { ink: BK });
      if (i < n) { const a = new THREE.TorusGeometry(step / 2, 0.32, 4, 10, Math.PI); if (rot) a.rotateY(Math.PI / 2); a.translate(rot ? ax : ax + step / 2, H - 3.2, rot ? az + step / 2 : az); deco(a, BK); }
    }
    if (s > 0) for (let i = 0; i < n; i++) box(cx - s * (W / 2 + 0.6), 1, cz - W / 2 + (i + 0.5) * step, 0.4, H - 5, 1.4, { ink: BL, noCollide: true });
    else for (let i = 0; i < 5; i++) { const g = new THREE.TorusKnotGeometry(0.9, 0.18, 24, 4); g.translate(cx + rand(-6, 6), 0.9, cz + W / 2 + 3 + rand(-1, 2)); deco(g, OR); }
    ring(cx, H + 4, cz, 'y'); sniper(cx, H, cz); pickup(cx - s * (W / 2 + 4), 0, cz); spawn(cx - s * (W / 2 + 8), 0, cz + 10);
    L.arenaSpawns.push(new THREE.Vector3(cx, H, cz), new THREE.Vector3(cx - s * (W / 2 + 8), 0, cz - 10));
  }

  // ---------------- 7. Congresso Nacional ----------------
  {
    const z1 = 160, z2 = 186, DY = 5;
    box(0, 0, (z1 + z2) / 2, 92, DY, z2 - z1, { ink: BK });
    facade(0, (z1 + z2) / 2, 92, z2 - z1, DY, 2.5, BL, 3);
    rail(-46, z1, -4, z1, DY); rail(4, z1, 46, z1, DY); rail(-46, z2, 46, z2, DY);
    stairs(0, 0, z1 - 18 * 1.05, '+z', 18, 6, { rise: DY / 18, run: 1.05 });
    for (const sx of [-1, 1]) box(sx * 3.2, 0, z1 - 9.5, 0.3, 1, 19, { ink: BK, noCollide: true });
    for (const sx of [-1, 1]) { box(sx * 12.5, 0, z1 - 9, 15, 0.3, 16, { ink: BL }); box(sx * 62, 0, z1 - 9, 34, 0.3, 14, { ink: BL }); }
    const cam = new THREE.CylinderGeometry(11, 5, 5, 26); cam.translate(-22, DY + 2.5, (z1 + z2) / 2); deco(cam, BK);
    const rim = new THREE.TorusGeometry(10.8, 0.3, 4, 26); rim.rotateX(Math.PI / 2); rim.translate(-22, DY + 5, (z1 + z2) / 2); deco(rim, BK);
    for (let i = 0; i < 5; i++) { const r = 5.5 + i * 1.3; collider(-22, DY + i, (z1 + z2) / 2, r * 1.6, 1, r * 1.6); }
    const sen = new THREE.SphereGeometry(8, 22, 10, 0, TAU, 0, Math.PI / 2); sen.translate(22, DY, (z1 + z2) / 2); deco(sen, BK);
    domeCollider(22, DY, (z1 + z2) / 2, 8, 6);
    ring(-22, DY + 9, (z1 + z2) / 2, 'y'); ring(22, DY + 11, (z1 + z2) / 2, 'y');
    const tz = 195, TH = 50;
    box(0, 0, tz, 30, 0.3, 16, { ink: BL });
    for (const sx of [-1, 1]) { box(sx * 5.5, 0, tz, 7, TH, 6, { ink: BL }); facade(sx * 5.5, tz, 7, 6, TH, 1.8, BK, 1.75); rail(sx * 5.5 - 3.5, tz - 3, sx * 5.5 + 3.5, tz - 3, TH); rail(sx * 5.5 - 3.5, tz + 3, sx * 5.5 + 3.5, tz + 3, TH); ring(sx * 5.5, TH + 3, tz, 'y'); sniper(sx * 5.5, TH, tz); }
    box(0, 24, tz, 4.2, 5, 5, { ink: BK });
    pickup(0, DY, (z1 + z2) / 2); pickup(-36, DY, z1 + 4); pickup(36, DY, z1 + 4);
    spawn(0, DY, z2 - 4); spawn(-38, DY, (z1 + z2) / 2); spawn(38, DY, (z1 + z2) / 2);
    L.arenaSpawns.push(new THREE.Vector3(-22, DY + 5, (z1 + z2) / 2), new THREE.Vector3(22, DY + 8, (z1 + z2) / 2), new THREE.Vector3(0, DY, z2 - 4));
  }

  // ---------------- 8. Praça dos Três Poderes ----------------
  {
    box(0, 0, 222, 2 * P - 12, 0.12, 36, { ink: BK, noCollide: true });
    for (const s of [-1, 1]) {
      const cx = s * 54, cz = 222, W = s < 0 ? 44 : 30, D = 16, FY = s < 0 ? 3 : 1.2, RY = s < 0 ? 12 : 8;
      slab(cx - W / 2, cz - D / 2, cx + W / 2, cz + D / 2, FY, 0.5); collider(cx, 0, cz, W, FY - 0.5, D);
      box(cx, FY, cz, W - 6, RY - FY - 0.6, D - 5, { ink: BL }); facade(cx, cz, W - 6, D - 5, RY - FY - 0.6, 3, BK, 2);
      slab(cx - W / 2 - 1, cz - D / 2 - 1, cx + W / 2 + 1, cz + D / 2 + 1, RY, 0.6);
      for (let x = cx - W / 2 + 2; x <= cx + W / 2 - 2; x += 5.5) for (const zs of [-1, 1]) {
        const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0, cz + zs * (D / 2 + 1.4)), new THREE.Vector3(x, RY * 0.5, cz + zs * (D / 2 + 0.1)), new THREE.Vector3(x, RY, cz + zs * (D / 2 + 1)));
        deco(new THREE.TubeGeometry(c, 8, 0.32, 5, false), BK); collider(x, 0, cz + zs * (D / 2 + 1.3), 0.7, RY, 0.7, { noNav: true });
      }
      if (s < 0) { stairs(cx + W / 2 + 6 * 0.6, 0, cz - 4, '-x', 6, 4, { rise: FY / 6, run: 0.6 }); rail(cx + W / 2 + 0.2, cz - D / 2, cx + W / 2 + 0.2, cz - 6.3, FY); rail(cx + W / 2 + 0.2, cz - 1.7, cx + W / 2 + 0.2, cz + D / 2, FY); }
      else stairs(cx - W / 2 - 1.5, 0, cz, '+x', 3, 5, { rise: FY / 3, run: 0.5 });
      ring(cx, RY + 4, cz, 'y'); sniper(cx, RY, cz); spawn(cx, 0, cz - D / 2 - 6);
    }
    { const jx = 54, jz = 205; box(jx, 0, jz, 2, 1.6, 2, { ink: BK }); cyl(jx, 1.6, jz, 0.55, 2.4, { ink: BK, seg: 6, noCollide: true }); sphere(jx, 4.4, jz, 0.5, { ink: BK, seg: 7 });
      box(jx, 4.45, jz - 0.4, 0.9, 0.18, 0.12, { ink: BK, noCollide: true }); box(jx, 2.6, jz - 0.7, 1.6, 0.18, 1.4, { ink: BK, noCollide: true }); }
    for (const dx of [-1.1, 1.1]) { cyl(12 + dx, 0, 216, 0.35, 7, { ink: BK, seg: 6 }); sphere(12 + dx, 7.6, 216, 0.6, { ink: BK, seg: 7 }); cyl(12 + dx * 1.4, 4.5, 216, 0.18, 2.6, { ink: BK, seg: 5, noCollide: true }); }
    box(12, 0, 216, 4, 0.4, 2.2, { ink: BK });
    box(-14, 0, 232, 1.3, 9, 1.3, { ink: BK }); box(-14, 9, 231, 1.3, 1.2, 4, { ink: BK, noCollide: true });
    box(10, 0, 234, 14, 4, 6, { ink: BK }); box(10, 4, 234, 18, 0.5, 4, { ink: BK, noCollide: true });
    cyl(-2, 0, 228, 0.28, 34, { ink: BK, seg: 6 });
    box(2.6, 27.5, 228, 9, 6, 0.12, { ink: GN, fill: true, noCollide: true });
    { const d = new THREE.BoxGeometry(4.2, 4.2, 0.16); d.rotateZ(Math.PI / 4); d.scale(1.35, 0.85, 1); d.translate(2.6, 30.5, 228); deco(d, OR); const c = new THREE.CylinderGeometry(1.5, 1.5, 0.22, 14); c.rotateX(Math.PI / 2); c.translate(2.6, 30.5, 228); deco(c, BL); }
    pickup(0, 0, 216); pickup(-30, 0, 238);
    L.arenaSpawns.push(new THREE.Vector3(-54, 12, 222), new THREE.Vector3(54, 8, 222), new THREE.Vector3(0, 0, 218));
  }

  // =========================================================================
  // ASAS NORTE (-X) E SUL (+X): W3, L2, EIXÃO, SUPERQUADRAS, COMÉRCIO E 700s
  // Ordem real de oeste para leste: 700s | W3 | 500s | 300s | comércio local | 100s | EIXÃO |
  // 200s | comércio local | 400s | L2 | 600s (Setor de Grandes Áreas)
  // =========================================================================
  const darkMat = makeInkMaterial({ ink: BK, fill: true });
  const darkBox = (x, y, z, w, h, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkMat); m.position.set(x, y + h / 2, z); m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); L.meshes.push(m); };
  // boca de túnel com o fundo escuro (onde os carros entram/saem)
  function tunnelMouth(x, zc, width, inward) {
    const t = 1.2, hgt = 6.2;
    box(x, 0, zc - width / 2 - t / 2, 10, hgt, t, { ink: BK }); box(x, 0, zc + width / 2 + t / 2, 10, hgt, t, { ink: BK });
    slab(x - 5, zc - width / 2 - t, x + 5, zc + width / 2 + t, hgt + 1.2, 1.2, { ink: BK });
    box(x + inward * 4.6, hgt - 0.6, zc, 0.6, 0.8, width + 2.4, { ink: OR, noCollide: true }); // faixa de concreto pintada
    darkBox(x - inward * 4.2, 0.1, zc, 1.4, hgt - 0.2, width);
    collider(x - inward * 4.2, 0, zc, 1.4, hgt, width, { noNav: true });
  }
  // via de duas pistas paralela ao eixo X (W3, L2): segmentos fora das pistas do Eixo
  function crossRoad(zc, name) {
    for (const [a, b] of [[-WING + 3, -38], [-22, 22], [38, WING - 3]]) {
      box((a + b) / 2, 0, zc, b - a, 0.12, 2 * XR, { ink: BK });
      if (Math.abs(a) > 30 || Math.abs(b) > 30) {
        const [m1, m2] = a < 0 ? [a, Math.min(b, -42)] : [Math.max(a, 42), b];
        if (m2 > m1) { box((m1 + m2) / 2, 0, zc, m2 - m1, 0.25, 0.7, { ink: BK }); for (const s of [-1, 1]) box((m1 + m2) / 2, 0, zc + s * (XR + 0.3), m2 - m1, 0.3, 0.6, { ink: BK }); }
      }
      for (let x = a + 4; x < b - 3; x += 9) for (const dz of [-3.8, 3.8]) box(x, 0.13, zc + dz, 4.2, 0.04, 0.25, { ink: OR, noCollide: true });
    }
    for (const xs of [-41, -19, 19, 41]) for (let i = 0; i < 6; i++) box(xs, 0.13, zc - XR + 1.2 + i * 2.3, 3.2, 0.04, 1.1, { ink: OR, noCollide: true }); // faixas de pedestre
    for (const s of [-1, 1]) tunnelMouth(s * (WING - 5), zc, 2 * XR, -s); // a via continua além do limite do mapa
    // placas verdes de via
    for (const s of [-1, 1]) {
      const px = s * 48; cyl(px, 0, zc - s * (XR + 1.6), 0.15, 5.4, { ink: BK, seg: 6 });
      box(px, 5.0, zc - s * (XR + 1.6), 5.6, 1.6, 0.18, { ink: GN, noCollide: true });
      box(px, 5.35, zc - s * (XR + 1.6) - 0.1, 4.2, 0.35, 0.05, { ink: BK, noCollide: true });
    }
    void name;
  }
  crossRoad(W3Z, 'W3'); crossRoad(L2Z, 'L2');

  // bloco residencial de superquadra: pilotis, 6 andares, brises e caixa d'água
  function slabBlock(x, z, along, ink, trim, opts = {}) {
    const Lg = opts.len ?? 28, Dp = 10, PIL = 3.2, H = opts.h ?? 16.8;
    const w = along ? Lg : Dp, d = along ? Dp : Lg;
    for (let i = 0; i <= 4; i++) for (const sd of [-1, 1]) {
      const u = -Lg / 2 + 1 + i * (Lg - 2) / 4, v = sd * (Dp / 2 - 1);
      box(x + (along ? u : v), 0, z + (along ? v : u), 0.6, PIL, 0.6, { ink: BK });
    }
    box(x, 0, z, along ? 4 : 3, PIL, along ? 3 : 4, { ink: BL }); // portaria de vidro
    box(x, PIL, z, w, H, d, { ink });
    for (let y = PIL + 2.8; y < PIL + H - 0.5; y += 2.8) box(x, y - 0.1, z, w + 0.3, 0.2, d + 0.3, { ink: trim, noCollide: true });
    for (let u = -Lg / 2 + 1.5; u < Lg / 2; u += 3) for (const sd of [-1, 1]) {
      const px = x + (along ? u : sd * (Dp / 2 + 0.12)), pz = z + (along ? sd * (Dp / 2 + 0.12) : u);
      box(px, PIL + 0.3, pz, along ? 0.18 : 0.22, H - 0.6, along ? 0.22 : 0.18, { ink: trim === BK ? BL : BK, noCollide: true });
    }
    box(x, PIL + H, z, along ? 6 : 4, 2.4, along ? 4 : 6, { ink: BK }); // caixa d'água
    return PIL + H;
  }
  // comércio da W3 (500s): lojas de 2 andares com marquise voltada para a via
  function shopBlock(x, z, ink, sign, faceZ) {
    const Lg = 24, Dp = 12, H = 7.5;
    box(x, 0, z, Lg, H, Dp, { ink });
    for (let y = 3.6; y < H; y += 3.6) box(x, y - 0.1, z, Lg + 0.3, 0.2, Dp + 0.3, { ink: BK, noCollide: true });
    const fz = z + faceZ * (Dp / 2);
    box(x, 3.3, fz + faceZ * 1.3, Lg, 0.35, 2.6, { ink: BK, noCollide: true }); // marquise
    for (const dx of [-10, 0, 10]) box(x + dx, 0, fz + faceZ * 2.4, 0.35, 3.3, 0.35, { ink: BK });
    for (let i = 0; i < 4; i++) box(x - 9 + i * 6, 4.6, fz + faceZ * 0.15, 4.6, 1.2, 0.25, { ink: [sign, OR, PK, BL][i % 4], noCollide: true }); // letreiros
    return H;
  }
  // casa geminada das 700s com telhado de duas águas
  function house(x, z, ink, roof) {
    box(x, 0, z, 7, 4.2, 7, { ink });
    const r = new THREE.CylinderGeometry(4.6, 4.6, 7.4, 3, 1); r.rotateZ(Math.PI / 2); r.scale(1, 0.55, 1.1); r.translate(x, 4.2 + 1.2, z); deco(r, roof);
    collider(x, 4.2, z, 7, 1.6, 7, { noNav: true });
    box(x, 0, z + 3.6, 1.2, 2.3, 0.15, { ink: BK, noCollide: true }); // porta
  }
  // comércio local (CLS/CLN): barzinhos, padaria e bancas
  function localShops(x, z, ink) {
    box(x, 0, z, 26, 4.4, 10, { ink });
    for (const sd of [-1, 1]) box(x, 2.9, z + sd * 6.2, 26, 0.3, 2.4, { ink: [OR, PK, GN][(Math.abs(Math.round(x)) / 34 | 0) % 3], noCollide: true });
    for (const dx of [-9, -3, 3, 9]) { cyl(x + dx, 0, z + 9, 0.5, 0.9, { ink: BK, seg: 8 }); }
    slab(x - 13, z - 5, x + 13, z + 5, 4.6, 0.2, { ink: BK });
  }

  const SQ_COLORS = [[BK, OR], [BK, BL], [OR, BK], [BK, GN], [PK, BK], [BK, RD], [BL, BK], [GN, BK]];
  let sqi = 0;
  for (const s of [-1, 1]) {
    const X = (v) => s * v; // distância a partir do centro do Eixo
    const asa = s < 0 ? 'Norte' : 'Sul'; void asa;
    // gramado das superquadras
    for (const [z1, z2] of [[-334, -290], [-266, -226], [-200, -160], [-142, -100]]) box(X(193), 0, (z1 + z2) / 2, 112, 0.12, z2 - z1, { ink: GN });
    // --- 300s, 100s, 200s e 400s ---
    for (const [zc, label] of [[-312, 300], [-246, 100], [-180, 200], [-122, 400]]) {
      for (const [row, dz] of [[0, -10], [1, 10]]) for (const [ci, cx] of [[0, 152], [1, 186], [2, 220]]) {
        const x = X(cx + (row ? 6 : 0)), z = zc + dz;
        if (s > 0 && label === 300 && row === 1 && ci === 1) continue; // lugar da Igrejinha (307 Sul)
        const [ink, trim] = SQ_COLORS[sqi++ % SQ_COLORS.length];
        const top = slabBlock(x, z, true, ink, trim);
        if ((ci + row) % 2 === 0) { ring(x, top + 5, z, 'y'); sniper(x + 6, top, z); }
        if (row === 0) { spawn(x, 0, z + 10); pickup(X(cx + 11), 0, zc); }
      }
      // ipês entre os blocos
      for (const cx of [135, 169, 203, 238]) ipe(X(cx), zc, [OR, PK, GN][(cx + zc) & 1 ? 0 : 1], 5.5);
      L.arenaSpawns.push(new THREE.Vector3(X(177), 0, zc));
    }
    // --- comércio local entre as quadras ---
    for (const [zc] of [[-277], [-151]]) for (const cx of [152, 186, 220]) localShops(X(cx), zc, [BL, GN, PK][(cx / 34 | 0) % 3]);
    // --- 500s: comércio da W3 (lado leste da via) ---
    for (const [i, cx] of [150, 178, 206, 234].entries()) shopBlock(X(cx), W3Z + XR + 9, [BL, GN, OR, PK][(i + (s > 0 ? 1 : 0)) % 4], RD, -1);
    // --- 700s: casas geminadas (lado oeste da W3) ---
    for (const [zr, dir] of [[W3Z - XR - 12, 1], [W3Z - XR - 29, -1]]) for (let cx = 141; cx < 246; cx += 9.5) {
      if (s > 0 && zr < W3Z - 20 && cx > 168 && cx < 216) continue; // Santuário Dom Bosco
      house(X(cx), zr, [BK, OR, PK, GN, BL][Math.round(cx) % 5], [RD, OR, RD, BL][Math.round(cx) % 4]); void dir;
    }
    // --- paradas de ônibus da W3 e da L2 ---
    for (const zc of [W3Z, L2Z]) for (const cx of [160, 214]) for (const sd of [-1, 1]) {
      const z = zc + sd * (XR + 1.8), x = X(cx);
      box(x, 0.25, z + sd * 1.2, 6, 2.7, 0.25, { ink: BL }); box(x, 2.95, z, 6.6, 0.2, 3.2, { ink: BK });
      box(x, 0.25, z + sd * 0.5, 4.5, 0.5, 0.6, { ink: BK, noCollide: true });
    }
    // --- Eixão (Eixo Rodoviário): 3 faixas por sentido, desce em trincheira e passa sob a Rodoviária ---
    {
      const a = TRENCH, b = WING - 3, zc = EIXAO_Z, half = 11;
      box(X((a + b) / 2), 0, zc, b - a, 0.12, 2 * half, { ink: BK });
      box(X((a + b) / 2), 0, zc, b - a, 0.3, 0.8, { ink: BK });
      for (let x = a + 12; x < b - 10; x += 9) for (const dz of [-7.4, -3.8, 3.8, 7.4]) box(X(x), 0.13, zc + dz, 4.2, 0.04, 0.25, { ink: OR, noCollide: true });
      tunnelMouth(X(WING - 5), zc, 2 * half, -s);
      // passarela de pedestres sobre o Eixão
      const px = X(192), e = s; // escadas descem para o lado de fora (longe do Eixo)
      slab(px - 2, zc - half - 4, px + 2, zc + half + 4, 6.5, 0.5);
      rail(px - e * 2, zc - half - 4, px - e * 2, zc + half + 4, 6.5); rail(px + e * 2, zc - half + 0.4, px + e * 2, zc + half - 0.4, 6.5);
      for (const zz of [zc - half - 2.2, zc + half + 2.2]) stairs(px + e * (2 + 13 * 0.55), 0, zz, e > 0 ? '-x' : '+x', 13, 3.4, { rise: 6.5 / 13, run: 0.55 });
      ring(px, 11, zc, 'y');
    }
  }
  // --- Igrejinha Nossa Senhora de Fátima (307 Sul): o "chapéu de freira" de Niemeyer ---
  {
    const x = 192, z = -302;
    box(x, 0, z, 8, 3.6, 8, { ink: BL }); // paredes de azulejos azuis e brancos
    for (let i = 0; i < 5; i++) box(x - 3.2 + i * 1.6, 0.6, z + 4.1, 0.8, 0.8, 0.1, { ink: BK, noCollide: true });
    const hat = new THREE.ConeGeometry(8.5, 7, 3, 1, true); hat.rotateY(Math.PI / 6); hat.translate(x, 3.6 + 3.5, z); deco(hat, BK);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI / 6; cyl(x + Math.cos(a) * 7.2, 0, z + Math.sin(a) * 7.2, 0.3, 3.6, { ink: BK, seg: 5 }); }
    collider(x, 3.6, z, 9, 3.2, 9); ring(x, 14, z, 'y'); pickup(x, 0, z + 8);
  }
  // --- Santuário Dom Bosco (702 Sul): caixa de arcos góticos com vitrais azuis ---
  {
    const x = 192, z = -412, W = 24, H = 15;
    box(x, 0, z, W - 3, H - 1, W - 3, { ink: BL });
    const n = 6, st = W / n;
    for (const sd of [-1, 1]) for (let i = 0; i <= n; i++) {
      for (const [px, pz] of [[x - W / 2 + i * st, z + sd * W / 2], [x + sd * W / 2, z - W / 2 + i * st]]) box(px, 0, pz, 0.7, H, 0.7, { ink: BK });
      if (i < n) for (const along of [true, false]) {
        const arch = new THREE.ConeGeometry(st / 2, 3.2, 4, 1, true); arch.rotateY(Math.PI / 4); arch.scale(along ? 1 : 0.12, 1, along ? 0.12 : 1);
        arch.translate(along ? x - W / 2 + (i + 0.5) * st : x + sd * W / 2, H - 3.6, along ? z + sd * W / 2 : z - W / 2 + (i + 0.5) * st); deco(arch, BK);
      }
    }
    slab(x - W / 2 - 0.5, z - W / 2 - 0.5, x + W / 2 + 0.5, z + W / 2 + 0.5, H + 0.6, 0.6, { ink: BK });
    box(x, H + 0.6, z, 0.4, 4, 0.4, { ink: OR, noCollide: true }); box(x, H + 3.4, z, 2, 0.4, 0.4, { ink: OR, noCollide: true });
    ring(x, H + 7, z, 'y'); sniper(x, H + 0.6, z); spawn(x - W / 2 - 5, 0, z); pickup(x + W / 2 + 4, 0, z);
  }
  // --- 600s (L2, Setor de Grandes Áreas): Templo da Boa Vontade (Sul) e Hospital Universitário (Norte) ---
  {
    const x = 200, z = -67;
    box(x, 0, z, 30, 0.3, 26, { ink: BK });
    const pyr = new THREE.ConeGeometry(12, 15, 7); pyr.translate(x, 0.3 + 7.5, z); deco(pyr, BK);
    for (let i = 0; i < 5; i++) { const r = 10.5 * (1 - i / 5); collider(x, 0.3 + i * 3, z, r * 1.5, 3, r * 1.5); }
    sphere(x, 16.2, z, 1.2, { ink: BL, seg: 8 }); ring(x, 20, z, 'y');
    for (const sx of [150, 236]) { box(sx, 0, z, 24, 7, 14, { ink: BK }); facade(sx, z, 24, 14, 7, 3.5, OR, 3); } // escolas-classe
    spawn(170, 0, z); pickup(226, 0, z - 10);
  }
  {
    const x = -190, z = -68;
    box(x, 0, z, 48, 8, 20, { ink: BK }); facade(x, z, 48, 20, 8, 4, BL, 3);
    box(x + 10, 8, z, 18, 18, 14, { ink: BK }); facade(x + 10, z, 18, 14, 26, 3.2, BL, 2.6);
    box(x + 10, 20, z + 7.2, 4.5, 1.4, 0.3, { ink: RD, noCollide: true }); box(x + 10, 18.95, z + 7.2, 1.4, 3.5, 0.3, { ink: RD, noCollide: true }); // cruz do hospital
    slab(x - 24, z - 10, x - 2, z + 10, 8.4, 0.4); stairs(x - 26, 0, z - 8 - 14 * 0.55 + 8, '+z', 14, 2.6, { rise: 8 / 14, run: 0.55 });
    ring(x + 10, 31, z, 'y'); sniper(x - 12, 8, z); spawn(x - 30, 0, z + 6); pickup(x, 0, z + 14);
    for (const sx of [-148, -236]) { box(sx, 0, z, 22, 6, 14, { ink: GN }); facade(sx, z, 22, 14, 6, 3, BK, 3); }
  }
  // --- Conic (Setor de Diversões Sul), em frente ao Conjunto Nacional, do outro lado do Eixo ---
  {
    box(81, 0, -237, 38, 4, 18, { ink: BK });
    for (const [x, z, w, h, d, ink] of [[69, -237, 13, 17, 15, PK], [83, -234, 10, 27, 11, OR], [95, -239, 11, 13, 14, BL]]) {
      box(x, 4, z, w, h, d, { ink }); facade(x, z, w, d, h + 4, 3, BK, 2.4); ring(x, h + 8, z, 'y');
    }
    slab(62, -246, 100, -228, 4.2, 0.2, { ink: BK }); stairs(72, 0, -246 - 8 * 0.55, '+z', 8, 2.4, { rise: 4.2 / 8, run: 0.55 });
    sniper(95, 17, -239); spawn(95, 4.2, -230);
  }

  // ---------------- Vidraças e gradis quebráveis da Praça dos Três Poderes (alvos do evento 8 de Janeiro) ----------------
  {
    const glassMat = makeInkMaterial({ ink: BL }), barMat = makeInkMaterial({ ink: BK });
    const breakable = (kind, x, y, z, w, h, d) => {
      const g = new THREE.Group();
      if (kind === 'glass') {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), glassMat));
        g.add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.16, d + 0.08).translate(0, h, 0), barMat));
      } else {
        const parts = [new THREE.BoxGeometry(w, 0.1, 0.1).translate(0, h, 0), new THREE.BoxGeometry(w, 0.1, 0.1).translate(0, 0.15, 0)];
        for (let i = 0; i <= 6; i++) parts.push(new THREE.BoxGeometry(0.06, h, 0.06).translate(-w / 2 + (i / 6) * w, h / 2, 0));
        for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.1, 0.1, 0.9).translate(sx * w * 0.45, 0.05, 0));
        g.add(new THREE.Mesh(mergeGeometries(parts, false), barMat)); for (const p of parts) p.dispose();
      }
      g.position.set(x, y, z); scene.add(g); L.meshes.push(g);
      const br = { id: L.breakables.length, kind, group: g, hp: kind === 'glass' ? 35 : 55, pos: new THREE.Vector3(x, y + h / 2, z), alive: true, ink: kind === 'glass' ? BL : BK, box: null, civic: true };
      br.box = collider(x, y, z, w, h, d, { noNav: true }); br.box.data.breakable = br; L.breakables.push(br); return br;
    };
    for (let x = -71; x <= -37; x += 4.25) breakable('glass', x, 3, 216.2, 4, 7, 0.3);   // Palácio do Planalto
    for (let x = 44; x <= 64; x += 4) breakable('glass', x, 1.2, 216.2, 3.8, 5.6, 0.3); // STF
    for (const sx of [-1, 1]) for (let i = 1; i <= 7; i++) breakable('glass', sx * i * 6, 0.2, 159.75, 5.6, 3.8, 0.3); // Congresso
    for (let x = -17; x <= 17; x += 3.8) if (Math.abs(x) > 2) breakable('fence', x, 0.22, 140, 3.2, 1.15, 0.22); // gradis
  }

  // ---------------- 9. Trânsito: Eixo Monumental, W3, L2 e Eixão, com semáforos nos cruzamentos ----------------
  const cyc = (t, off) => ((t + off) % 30 + 30) % 30;
  const eixoSig = (off) => (t) => { const c = cyc(t, off); return c < 14 ? 'g' : c < 16.5 ? 'y' : 'r'; };
  const crossSig = (off) => (t) => { const c = cyc(t, off); return c >= 17 && c < 27 ? 'g' : c >= 27 && c < 29.5 ? 'y' : 'r'; };
  const signals = { eW3: eixoSig(0), w3: crossSig(0), eL2: eixoSig(11), l2: crossSig(11) };
  const MIX_FAST = [['gol', 4], ['byd', 2], ['sedan', 2], ['golbaixo', 1.2], ['uno', 1.5], ['pmdf', 0.5]];
  const MIX_MID = [['gol', 3], ['uno', 2], ['sedan', 2], ['byd', 1.5], ['bus', 1.5], ['golbaixo', 1]];
  const MIX_BUS = [['bus', 4], ['brt', 1.2], ['gol', 1.5], ['uno', 1]];
  const MIX_W3 = [['bus', 3], ['zebrinha', 2], ['gol', 1.5], ['uno', 1]];
  const lanes = [];
  const eixoStops = [{ lo: W3Z - XR, hi: W3Z + XR, group: 'eW3' }, { lo: L2Z - XR, hi: L2Z + XR, group: 'eL2' }];
  for (const s of [-1, 1]) for (const [lx, mix, vmax] of [[25, MIX_FAST, 22], [30, MIX_MID, 19], [35, MIX_BUS, 17]]) {
    lanes.push({ axis: 'z', c: s * lx, dir: s < 0 ? 1 : -1, from: ROAD_START - 6, to: ROAD_END + 8, vmax, mix, count: 6, stops: eixoStops });
  }
  for (const [zc, group] of [[W3Z, 'w3'], [L2Z, 'l2']]) for (const dir of [1, -1]) for (const [off, mix, vmax] of [[2.2, MIX_MID, 16], [5.4, zc === W3Z ? MIX_W3 : MIX_BUS, 14]]) {
    lanes.push({ axis: 'x', c: zc + dir * off, dir, from: -WING + 6, to: WING - 6, vmax, mix, count: 6, stops: [{ lo: -38, hi: 38, group }] });
  }
  const eixaoY = (x) => { const ax = Math.abs(x); return ax < DEEP ? LOW : ax < TRENCH ? LOW + (ax - DEEP) / (TRENCH - DEEP) * -LOW : 0; };
  for (const dir of [1, -1]) for (const [off, mix] of [[2.0, MIX_FAST], [5.6, MIX_FAST], [9.2, MIX_MID]]) {
    lanes.push({ axis: 'x', c: EIXAO_Z + dir * off, dir, from: -WING + 6, to: WING - 6, vmax: 25, mix, count: 5, yAt: eixaoY });
  }
  // ônibus parados nas plataformas de embarque, embaixo da laje
  for (const [zz, dir] of [[RZ1 + 7.6, 1], [RZ2 - 7.6, -1]]) lanes.push({ axis: 'x', c: zz, dir, from: -50, to: 50, vmax: 0, mix: [['bus', 5], ['zebrinha', 1]], count: 5, parked: true, yAt: () => LOW });
  const traffic = buildTraffic(B, lanes, signals);
  for (const [zc, g, eg] of [[W3Z, 'w3', 'eW3'], [L2Z, 'l2', 'eL2']]) {
    traffic.lightPole(-21.2, zc - XR - 1.4, eg); traffic.lightPole(21.2, zc + XR + 1.4, eg);
    traffic.lightPole(-40.5, zc + XR + 1.4, g); traffic.lightPole(40.5, zc - XR - 1.4, g);
  }
  L.animated.push({ mesh: null, update: (t) => traffic.update(t) });
  L.cars = traffic.cars;

  // ---------------- 10. Spawns e Pickups distribuídos por todo o Eixo Monumental ----------------
  for (let z = -485; z <= 130; z += 36) {
    if (z > -428 && z < -376) continue;
    if (z > -328 && z < -285) continue;
    if (z > RZ1 - 3 && z < RZ2 + 3) continue;
    if (crossFree(z, 2)) spawn(rand(-12, 12), 0.25, z);
    if (crossFree(z + 14, 2)) pickup(rand(-9, 9), 0.25, z + 14);
  }
  for (const z of [-450, -365, -260, -60, 20, 100]) L.arenaSpawns.push(new THREE.Vector3(0, 0.25, z));

  // ---------------- 11. Céu aberto de Brasília ----------------
  addGeo(new THREE.SphereGeometry(18, 14, 9).translate(140, 155, -380), OR);
  for (const [cx, cy, cz] of [[-120, 105, -420], [95, 115, -290], [-110, 98, -170], [80, 115, 120], [150, 92, 10], [-140, 108, 200]]) {
    for (let i = 0; i < 6; i++) sphere(cx + (i - 2.5) * 8, cy + Math.sin(i * 1.5) * 3, cz, 7, { seg: 8, ink: BL });
  }
  planes(6, 75, 48, { rStep: 20, hStep: 7, scale: 2.1 });

  return B.finish();
}
