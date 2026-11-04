// Map 6: Brasília — Eixo Monumental, da Rodoviária à Praça dos Três Poderes.
// Layout segue a planta real (oeste → leste, eixo Z; Norte = X negativo, Sul = X positivo):
// - Torre de TV no horizonte oeste e a Rodoviária do Plano Piloto (plataforma elevada sobre as pistas)
// - Setor Cultural: Teatro Nacional (pirâmide, lado Norte); Museu Nacional (cúpula), Biblioteca Nacional
//   e Catedral Metropolitana (16 colunas, campanário, evangelistas e espelho d'água) no lado Sul
// - Eixo Monumental com N1/S1 de 3 faixas cada, gramado central largo, postes, ipês e paradas de ônibus
// - 12 blocos dos Ministérios (6 por lado) com fachadas de vidro, faixas de piso, escadas de incêndio e anexos
// - Palácio do Itamaraty (arcos sobre espelho d'água, Norte) e Palácio da Justiça (cascatas, Sul)
// - Congresso Nacional: lâmina de base, rampa, cúpula da Câmara (Norte) e do Senado (Sul), torres gêmeas
// - Praça dos Três Poderes: Palácio do Planalto, STF com a estátua da Justiça, Os Candangos, Pombal e Mastro
// - Trânsito contínuo (carros, fuscas, táxis, viaturas e ônibus) que some nos túneis sob o Congresso
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, makeInkMaterial } from '../render.js';
import { rand, TAU } from '../util.js';

export function buildBrasilia(B, arena = false) {
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider, scene } = B;
  const BK = INK.BLACK, BL = INK.BLUE, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK, RD = INK.RED;
  L.key = 'brasilia';

  const P = arena ? 108 : 100, PZ = 240, T = 6, PH = 26;
  L.bounds.minX = -P; L.bounds.maxX = P; L.bounds.minZ = -PZ; L.bounds.maxZ = PZ;
  L.playerStart.set(0, 0, -178); // em frente à Rodoviária, olhando para o Congresso

  const matCache = new Map();
  const mat = (ink, fill = false) => { const k = ink + (fill ? 'f' : 'l'); if (!matCache.has(k)) matCache.set(k, makeInkMaterial({ ink, fill, side: fill ? THREE.DoubleSide : THREE.FrontSide })); return matCache.get(k); };
  const deco = (geo, ink) => addGeo(geo, ink);
  // stacked colliders that approximate a dome / bowl so nobody walks through Niemeyer's curves
  function domeCollider(x, y0, z, r, n = 6, o = {}) {
    for (let i = 0; i < n; i++) { const yb = (i / n) * r, rr = Math.sqrt(Math.max(0, r * r - yb * yb)) * 0.86; collider(x, y0 + yb, z, rr * 2, r / n, rr * 2, o); }
  }
  // floor bands and vertical mullions: what makes a slab read as a glass office block
  function facade(cx, cz, w, d, h, floorH, ink = BK, mull = 3) {
    for (let y = floorH; y < h - 0.3; y += floorH) box(cx, y - 0.12, cz, w + 0.35, 0.24, d + 0.35, { ink, noCollide: true });
    for (let x = cx - w / 2 + mull / 2; x < cx + w / 2; x += mull) for (const s of [-1, 1]) box(x, 0.4, cz + s * (d / 2 + 0.08), 0.14, h - 0.6, 0.16, { ink, noCollide: true });
  }

  // ---------------- Chão e limites ----------------
  box(0, -1, 0, 2 * P + T, 1, 2 * PZ + T, { ink: BK });
  box(0, 0, -PZ, 2 * P + T, PH, T, { ink: BK });
  box(0, 0, PZ, 2 * P + T, PH, T, { ink: BK });
  box(-P, 0, 0, T, PH, 2 * PZ + T, { ink: BK });
  box(P, 0, 0, T, PH, 2 * PZ + T, { ink: BK });
  collider(0, 70, 0, 2 * P + 40, 8, 2 * PZ + 40, { noNav: true, noGrapple: true });

  // ---------------- Eixo Monumental ----------------
  const ROAD_END = 150; // as pistas entram nos túneis sob o Congresso
  const lawnZ1 = -196, lawnZ2 = 142;
  box(0, 0, (lawnZ1 + lawnZ2) / 2, 44, 0.22, lawnZ2 - lawnZ1, { ink: GN }); // gramado central
  for (const s of [-1, 1]) {
    const rx = s * 30, rz1 = -PZ, rz2 = ROAD_END + 4;
    box(rx, 0, (rz1 + rz2) / 2, 16, 0.12, rz2 - rz1, { ink: BK, noNav: false }); // N1 / S1, 3 faixas
    for (let z = rz1 + 8; z < rz2 - 4; z += 11) for (const lx of [rx - 2.6, rx + 2.6]) box(lx, 0.13, z, 0.3, 0.04, 4.5, { ink: OR, noCollide: true });
    box(s * 22.3, 0, (rz1 + rz2) / 2, 0.5, 0.3, rz2 - rz1, { ink: BK }); // meio-fio interno
    box(s * 40, 0, 0, 4, 0.25, 2 * PZ - 4, { ink: GN }); // canteiro / calçada externa
    // túnel sob o Congresso
    box(s * 21.7, 0, ROAD_END + 2, 1.2, 6, 4, { ink: BK }); box(s * 38.3, 0, ROAD_END + 2, 1.2, 6, 4, { ink: BK });
    box(s * 30, 6, ROAD_END + 2, 18, 1.6, 4, { ink: BK });
    box(s * 30, 0.1, ROAD_END + 4, 16, 5.9, 0.4, { ink: BK });
  }
  // faixas de pedestre entre o gramado e os ministérios
  for (const z of [-140, -38, 18, 84]) for (const s of [-1, 1]) for (let i = 0; i < 7; i++) box(s * (23.5 + i * 2.1), 0.13, z, 1.1, 0.04, 4, { ink: OR, noCollide: true });

  // postes de iluminação ao longo do gramado
  for (let z = -180; z <= 130; z += 26) for (const s of [-1, 1]) {
    const x = s * 21.2; cyl(x, 0, z, 0.13, 9, { ink: BK, seg: 6 });
    box(x - s * 1.1, 8.8, z, 2.2, 0.16, 0.2, { ink: BK, noCollide: true }); box(x - s * 2.1, 8.4, z, 0.6, 0.4, 0.5, { ink: OR, noCollide: true });
  }
  // ipês (amarelo e roxo) e árvores do cerrado nos canteiros e no gramado
  function ipe(x, z, ink, h = 5) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + rand(-1, 1), h * 0.5, z + rand(-1, 1)), new THREE.Vector3(x + rand(-0.6, 0.6), h, z + rand(-0.6, 0.6)));
    deco(new THREE.TubeGeometry(c, 5, 0.22, 5, false), BK); collider(x, 0, z, 0.7, h, 0.7, { noNav: false });
    for (let i = 0; i < 4; i++) { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(rand(1.6, 2.3), rand(0.8, 1.1), rand(1.6, 2.3)); g.translate(x + rand(-1.4, 1.4), h + rand(-0.3, 0.8), z + rand(-1.4, 1.4)); deco(g, ink); }
  }
  const busyZ = (z, s) => [-80, -52, -24, 4, 32, 60, -104, -10, 74].some((b) => Math.abs(z - b) < 8) || (s > 0 && Math.abs(z + 154) < 6);
  for (let z = -186; z <= 136; z += 17) for (const s of [-1, 1]) if (!busyZ(z, s)) ipe(s * 40 + rand(-0.6, 0.6), z + rand(-3, 3), (Math.floor(z / 17) + (s > 0 ? 1 : 0)) % 3 === 0 ? PK : (Math.floor(z / 17) % 2 ? OR : GN), rand(4.5, 6));
  for (const [x, z, ink] of [[-12, -120, OR], [10, -96, PK], [-8, -64, GN], [14, -6, OR], [-15, 46, PK], [9, 98, GN], [-4, 112, OR]]) ipe(x, z, ink, rand(5, 6.5));
  // bancos e canteiros de concreto (cobertura no gramado)
  for (const [x, z] of [[-6, -150], [6, -130], [-10, -80], [12, -40], [-4, 0], [8, 30], [-12, 64], [4, 90]]) {
    box(x, 0.22, z, 4.2, 0.9, 1.6, { ink: BK }); box(x, 1.12, z, 3.6, 0.5, 1.0, { ink: GN, noCollide: true });
  }
  // paradas de ônibus nas calçadas
  for (const z of [-104, -10, 74]) for (const s of [-1, 1]) {
    const x = s * 41; box(x + s * 1.3, 0.25, z, 0.25, 2.7, 6, { ink: BL }); box(x, 2.95, z, 3.2, 0.2, 6.6, { ink: BK });
    box(x + s * 0.6, 0.25, z, 0.6, 0.5, 4.5, { ink: BK, noCollide: true }); cyl(x - s * 1.3, 0.25, z - 3.4, 0.08, 3.2, { ink: BK, seg: 5 });
  }
  // gradis de contenção da PMDF na frente do Congresso e no meio da Esplanada
  for (const zz of [124, 78]) for (let x = -19; x <= 19; x += 3.6) if (Math.abs(x) > 2.5) box(x, 0.22, zz + (Math.round(x) % 2 ? 0.4 : -0.4), 3.1, 1.15, 0.22, { ink: BK, noShoot: true });

  // ---------------- 0. Torre de TV (horizonte oeste, decorativa) ----------------
  {
    const tx = 0, tz = -315;
    const base = new THREE.CylinderGeometry(1.4, 9, 64, 3); base.translate(tx, 32, tz); deco(base, BK);
    const mast = new THREE.CylinderGeometry(0.5, 0.9, 58, 6); mast.translate(tx, 92, tz); deco(mast, BK);
    for (const [y, r] of [[26, 7], [56, 5.5], [76, 3.2]]) { const d = new THREE.CylinderGeometry(r, r, 2.2, 12); d.translate(tx, y, tz); deco(d, y === 76 ? OR : BL); }
  }

  // ---------------- 1. Rodoviária do Plano Piloto (plataforma sobre as pistas) ----------------
  {
    const z1 = -224, z2 = -202, DY = 7;
    slab(-64, z1, 64, z2, DY, 0.7);
    box(0, DY, (z1 + z2) / 2, 128.6, 0.35, 0.25 + (z2 - z1), { ink: BK, noCollide: true });
    for (const x of [-58, -46, -16, -5, 5, 16, 46, 58]) for (const z of [z1 + 3, z2 - 3]) box(x, 0, z, 1.1, DY - 0.7, 1.1, { ink: BK });
    // cobertura das plataformas de embarque no nível superior
    box(0, DY + 4.2, (z1 + z2) / 2 - 4, 54, 0.4, 9, { ink: OR });
    for (const x of [-24, -12, 0, 12, 24]) box(x, DY, (z1 + z2) / 2 - 4, 0.6, 4.2, 0.6, { ink: BK });
    // guarda-corpos (com vãos para as escadas)
    rail(-64, z1, 64, z1, DY); rail(-64, z1, -64, z2, DY); rail(64, z1, 64, z2, DY);
    rail(-64, z2, -12, z2, DY); rail(-8, z2, 8, z2, DY); rail(12, z2, 64, z2, DY);
    stairs(-10, 0, z2 + 13 * 0.55, '-z', 13, 3, { rise: DY / 13, run: 0.55 });
    stairs(10, 0, z2 + 13 * 0.55, '-z', 13, 3, { rise: DY / 13, run: 0.55 });
    // ônibus parados nas plataformas inferiores
    for (const x of [-12, 0, 12]) { box(x, 0.35, (z1 + z2) / 2, 2.8, 2.8, 9, { ink: BL }); box(x, 1.8, (z1 + z2) / 2, 2.9, 0.35, 9.1, { ink: OR, noCollide: true }); }
    // bancas e quiosques do mezanino
    for (const x of [-40, -30, 30, 40]) box(x, DY, z1 + 5, 4, 2.6, 3, { ink: PK });
    ring(0, DY + 7, (z1 + z2) / 2, 'y'); ring(-36, DY + 5, (z1 + z2) / 2, 'y'); ring(36, DY + 5, (z1 + z2) / 2, 'y');
    sniper(0, DY, z1 + 4); sniper(-50, DY, (z1 + z2) / 2); sniper(50, DY, (z1 + z2) / 2);
    spawn(-20, DY, (z1 + z2) / 2); spawn(20, DY, (z1 + z2) / 2); spawn(-50, 0, -195); spawn(50, 0, -195);
    pickup(0, DY, (z1 + z2) / 2 + 3); pickup(-44, 0, -200);
    L.arenaSpawns.push(new THREE.Vector3(0, DY, -213), new THREE.Vector3(-30, DY, -213), new THREE.Vector3(30, DY, -213), new THREE.Vector3(0, 0, -190));
  }

  // ---------------- 2. Teatro Nacional Cláudio Santoro (Norte) ----------------
  {
    const cx = -66, cz = -150, W = 30, D = 44, H = 16;
    const g = new THREE.CylinderGeometry(0.55, 1, 1, 4); g.rotateY(Math.PI / 4); g.scale(W / Math.SQRT2, H, D / Math.SQRT2); g.translate(cx, H / 2, cz); deco(g, BL);
    // degraus de colisão (escaláveis com grapple)
    for (let i = 0; i < 4; i++) { const k = 1 - 0.45 * (i + 0.5) / 4; collider(cx, i * H / 4, cz, W * k, H / 4, D * k); }
    // relevos de Athos Bulcão: cubos salientes nas fachadas inclinadas
    for (let i = 0; i < 26; i++) { const f = rand(0.1, 0.85), y = f * H, k = 1 - 0.45 * f; const s = Math.random() < 0.5 ? -1 : 1; box(cx + s * (W * k / 2 + 0.2), y, cz + rand(-D * k / 2 + 2, D * k / 2 - 2), 1.2, 1.2, rand(1.2, 3), { ink: BK, noCollide: true }); }
    box(cx + W / 2 + 1, 0, cz, 3, 3.2, 12, { ink: BK }); // marquise de entrada
    ring(cx, H + 3, cz, 'y'); sniper(cx, H, cz); spawn(cx + W / 2 + 4, 0, cz + 10); pickup(cx + W / 2 + 4, 0, cz - 10);
  }

  // ---------------- 3. Conjunto Cultural da República: Museu Nacional e Biblioteca (Sul) ----------------
  {
    const mx = 68, mz = -160, R = 14;
    const dome = new THREE.SphereGeometry(R, 22, 11, 0, TAU, 0, Math.PI / 2); dome.translate(mx, 0, mz); deco(dome, BK);
    domeCollider(mx, 0, mz, R, 7);
    // faixa (porta-janela) que corta a cúpula
    box(mx - 12.4, 4.6, mz, 0.9, 2.2, 10, { ink: BK, fill: true, noCollide: true });
    // rampa curva de Niemeyer até a porta suspensa
    stairs(41, 0, mz + 6, '+x', 14, 2.4, { rise: 0.5, run: 0.55 });
    slab(48.7, mz + 4, 54.5, mz + 8, 7, 0.4); rail(48.7, mz + 8, 54.5, mz + 8, 7);
    const rc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(41, 0.4, mz + 7.3), new THREE.Vector3(47, 4.5, mz + 10), new THREE.Vector3(54.5, 7.3, mz + 7.3));
    deco(new THREE.TubeGeometry(rc, 12, 0.35, 5, false), BK);
    box(mx - 4, 0, mz + 18, 26, 0.3, 6, { ink: BL }); // espelho d'água
    ring(mx, R + 4, mz, 'y'); sniper(51.5, 7, mz + 6);
    // Biblioteca Nacional: bloco branco com brises verticais
    const bx = 70, bz = -190, BW = 20, BD = 14, BH = 13;
    box(bx, 0, bz, BW, BH, BD, { ink: BK });
    for (let x = bx - BW / 2 + 1; x < bx + BW / 2; x += 1.6) for (const s of [-1, 1]) box(x, 0.5, bz + s * (BD / 2 + 0.5), 0.3, BH - 1, 1, { ink: BL, noCollide: true });
    rail(bx - BW / 2, bz - BD / 2, bx + BW / 2, bz - BD / 2, BH); rail(bx - BW / 2, bz + BD / 2, bx + BW / 2, bz + BD / 2, BH);
    let y = 0; for (let f = 0; f < 3; f++) { const dir = f % 2 === 0 ? '-z' : '+z'; const sz = dir === '-z' ? bz + 4.4 : bz - 4.4; const lane = f % 2 === 0 ? bx - BW / 2 - 1.2 : bx - BW / 2 - 3.2; stairs(lane, y, sz, dir, 15, 1.8, { rise: BH / 45, run: 0.55 }); y += BH / 3; const lz = dir === '-z' ? bz - 5.5 : bz + 5.5; slab(bx - BW / 2 - 4.3, lz - 1.1, bx - BW / 2, lz + 1.1, y, 0.35); }
    ring(bx, BH + 3, bz, 'y'); pickup(bx, BH, bz); spawn(bx - BW / 2 - 6, 0, bz + 12);
  }

  // ---------------- 4. Catedral Metropolitana (Sul) ----------------
  {
    const cx = 64, cz = -112, R = 10.5, H = 21;
    cyl(cx, 0, cz, R + 7, 0.3, { ink: BL, seg: 28, noCollide: true }); collider(cx, 0, cz, 2, 0.3, 2); // espelho d'água
    box(cx, 0.3, cz, 2 * R * 0.95, 0.1, 2 * R * 0.95, { ink: BK, noCollide: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, ca = Math.cos(a), sa = Math.sin(a);
      const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(cx + ca * R, 0, cz + sa * R), new THREE.Vector3(cx + ca * (R * 0.18), H * 0.52, cz + sa * (R * 0.18)), new THREE.Vector3(cx + ca * (R * 0.42), H, cz + sa * (R * 0.42)));
      deco(new THREE.TubeGeometry(c, 10, 0.55, 6, false), BK);
      collider(cx + ca * R * 0.96, 0, cz + sa * R * 0.96, 1.1, 3.5, 1.1);
    }
    // vitrais entre as colunas (anel azul) e a coroa
    const glass = new THREE.CylinderGeometry(R * 0.24, R * 0.9, H * 0.8, 16, 1, true); glass.translate(cx, H * 0.42, cz); deco(glass, BL);
    box(cx, H, cz, 0.35, 3.6, 0.35, { ink: OR, noCollide: true }); box(cx, H + 2.4, cz, 2.2, 0.35, 0.35, { ink: OR, noCollide: true });
    // os três anjos suspensos
    for (const [dx, dz, y] of [[-2, 0, 12], [1.5, 1.5, 10.5], [1, -2, 9]]) { const ag = new THREE.ConeGeometry(0.7, 2.4, 5); ag.translate(cx + dx, y, cz + dz); deco(ag, PK); }
    box(cx, 0.3, cz, 3, 1.1, 1.4, { ink: OR }); // altar
    // campanário (4 sinos)
    box(cx + 15, 0, cz - 15, 1.3, 20, 4, { ink: BK }); for (let i = 0; i < 4; i++) sphere(cx + 15, 15.5 - i * 0.2, cz - 16.5 + i, 0.6, { ink: OR, seg: 7 });
    // os Evangelistas na entrada
    for (let i = 0; i < 4; i++) { const ex = cx - R - 6, ez = cz - 4.5 + i * 3; cyl(ex, 0, ez, 0.35, 3.2, { ink: BK, seg: 6 }); sphere(ex, 3.6, ez, 0.45, { ink: BK, seg: 7 }); }
    ring(cx, H + 5, cz, 'y'); spawn(cx - R - 9, 0, cz + 6); pickup(cx, 0, cz + 4);
    L.arenaSpawns.push(new THREE.Vector3(cx, 0.3, cz + 3), new THREE.Vector3(cx - R - 9, 0, cz - 6));
  }

  // ---------------- 5. Os Ministérios (6 por lado) ----------------
  const zMinistries = [-80, -52, -24, 4, 32, 60];
  const MW = 34, MH = 20, MD = 12;
  for (const s of [-1, 1]) for (const mz of zMinistries) {
    const mx = s * 61, ink = s < 0 ? BL : GN;
    box(mx, 0, mz, MW, MH, MD, { ink });
    box(mx, MH, mz, MW + 0.6, 0.5, MD + 0.6, { ink: BK, noCollide: true });
    facade(mx, mz, MW, MD, MH, 2, BK, 2.6);
    box(mx, MH, mz, 6, 2.6, 5, { ink: BK }); // casa de máquinas
    box(mx - s * (MW / 2 + 0.2), MH - 3, mz, 0.4, 2, MD * 0.7, { ink: OR, noCollide: true }); // letreiro "Ministério" voltado ao Eixo
    box(mx - s * (MW / 2 + 2), 0, mz, 4, 3.4, 8, { ink: BK }); // marquise de entrada
    // escada de incêndio em zigue-zague até o teto (face -z)
    const zf = mz - MD / 2; let y = 0;
    for (let f = 0; f < 5; f++) {
      const dir = f % 2 === 0 ? '+x' : '-x'; const sx = dir === '+x' ? mx - 3.15 : mx + 3.15; const lane = f % 2 === 0 ? zf - 1.2 : zf - 3.2;
      stairs(sx, y, lane, dir, 14, 1.8); y += 4;
      const lx = dir === '+x' ? mx + 4.25 : mx - 4.25; slab(lx - 1.1, zf - 4.3, lx + 1.1, zf, y, 0.4); rail(lx - 1.1, zf - 4.3, lx + 1.1, zf - 4.3, y);
    }
    rail(mx - MW / 2, zf, mx + 3.1, zf, MH); rail(mx + 5.4, zf, mx + MW / 2, zf, MH);
    rail(mx - MW / 2, mz + MD / 2, mx + MW / 2, mz + MD / 2, MH);
    rail(mx - MW / 2, zf, mx - MW / 2, mz + MD / 2, MH); rail(mx + MW / 2, zf, mx + MW / 2, mz + MD / 2, MH);
    // anexo baixo atrás do ministério
    const ax = s * 89; box(ax, 0, mz + 2, 12, 7, 16, { ink: BK }); facade(ax, mz + 2, 12, 16, 7, 3.5, BL, 3);
    stairs(ax - 3.15, 0, mz + 11, '+x', 14, 1.6, { rise: 0.5, run: 0.45 }); pickup(ax, 7, mz + 2);
    ring(mx + s * 8, MH + 4, mz, 'y'); sniper(mx + s * 6, MH, mz + 2);
    spawn(mx - s * (MW / 2 + 5), 0, mz + 9); pickup(mx - s * (MW / 2 + 5), 0, mz - 9);
    L.arenaSpawns.push(new THREE.Vector3(mx, MH, mz), new THREE.Vector3(mx - s * (MW / 2 + 5), 0, mz + 9));
  }

  // ---------------- 6. Palácio do Itamaraty (Norte) e Palácio da Justiça (Sul) ----------------
  for (const s of [-1, 1]) {
    const cx = s * 64, cz = 104, W = 30, H = 13;
    box(cx, 0, cz, W + 12, 0.3, W + 12, { ink: BL }); // espelho d'água
    box(cx, 0.3, cz, W - 8, H - 1, W - 8, { ink: s < 0 ? BL : GN }); // corpo de vidro recuado
    facade(cx, cz, W - 8, W - 8, H - 1, 3.2, BK, 2.2);
    slab(cx - W / 2, cz - W / 2, cx + W / 2, cz + W / 2, H, 0.8); // laje de cobertura
    // arcos em toda a volta
    const n = 8, step = W / n;
    for (let i = 0; i <= n; i++) for (const [ax, az, rot] of [[cx - W / 2 + i * step, cz - W / 2, 0], [cx - W / 2 + i * step, cz + W / 2, 0], [cx - W / 2, cz - W / 2 + i * step, 1], [cx + W / 2, cz - W / 2 + i * step, 1]]) {
      box(ax, 0.3, az, 0.7, H - 3.2, 0.7, { ink: BK });
      if (i < n) { const a = new THREE.TorusGeometry(step / 2, 0.32, 4, 10, Math.PI); if (rot) a.rotateY(Math.PI / 2); a.translate(rot ? ax : ax + step / 2, H - 3.2, rot ? az + step / 2 : az); deco(a, BK); }
    }
    if (s > 0) for (let i = 0; i < n; i++) box(cx - s * (W / 2 + 0.6), 1, cz - W / 2 + (i + 0.5) * step, 0.4, H - 5, 1.4, { ink: BL, noCollide: true }); // cascatas da Justiça
    else for (let i = 0; i < 5; i++) { const g = new THREE.TorusKnotGeometry(0.9, 0.18, 24, 4); g.translate(cx + rand(-6, 6), 0.9, cz + W / 2 + 3 + rand(-1, 2)); deco(g, OR); } // esculturas no espelho do Itamaraty
    ring(cx, H + 4, cz, 'y'); sniper(cx, H, cz); pickup(cx - s * (W / 2 + 4), 0, cz); spawn(cx - s * (W / 2 + 8), 0, cz + 10);
    L.arenaSpawns.push(new THREE.Vector3(cx, H, cz), new THREE.Vector3(cx - s * (W / 2 + 8), 0, cz - 10));
  }

  // ---------------- 7. Congresso Nacional ----------------
  {
    const z1 = 160, z2 = 186, DY = 5;
    box(0, 0, (z1 + z2) / 2, 92, DY, z2 - z1, { ink: BK });
    facade(0, (z1 + z2) / 2, 92, z2 - z1, DY, 2.5, BL, 3);
    rail(-46, z1, -4, z1, DY); rail(4, z1, 46, z1, DY); rail(-46, z2, 46, z2, DY);
    // rampa monumental central
    stairs(0, 0, z1 - 18 * 1.05, '+z', 18, 6, { rise: DY / 18, run: 1.05 });
    for (const sx of [-1, 1]) box(sx * 3.2, 0, z1 - 9.5, 0.3, 1, 19, { ink: BK, noCollide: true });
    // espelhos d'água na frente
    for (const sx of [-1, 1]) { box(sx * 12.5, 0, z1 - 9, 15, 0.3, 16, { ink: BL }); box(sx * 62, 0, z1 - 9, 34, 0.3, 14, { ink: BL }); }
    // Câmara dos Deputados: cuia voltada para cima (Norte)
    const cam = new THREE.CylinderGeometry(11, 5, 5, 26); cam.translate(-22, DY + 2.5, (z1 + z2) / 2); deco(cam, BK);
    const rim = new THREE.TorusGeometry(10.8, 0.3, 4, 26); rim.rotateX(Math.PI / 2); rim.translate(-22, DY + 5, (z1 + z2) / 2); deco(rim, BK);
    for (let i = 0; i < 5; i++) { const r = 5.5 + i * 1.3; collider(-22, DY + i, (z1 + z2) / 2, r * 1.6, 1, r * 1.6); }
    // Senado Federal: cúpula (Sul)
    const sen = new THREE.SphereGeometry(8, 22, 10, 0, TAU, 0, Math.PI / 2); sen.translate(22, DY, (z1 + z2) / 2); deco(sen, BK);
    domeCollider(22, DY, (z1 + z2) / 2, 8, 6);
    ring(-22, DY + 9, (z1 + z2) / 2, 'y'); ring(22, DY + 11, (z1 + z2) / 2, 'y');
    // torres gêmeas (28 andares) unidas pela passarela, sobre o espelho d'água
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
    box(0, 0, 220, 2 * P - 8, 0.12, 34, { ink: BK, noCollide: true });
    // Palácio do Planalto (Norte) e Supremo Tribunal Federal (Sul): laje elevada, colunas de Niemeyer
    for (const s of [-1, 1]) {
      const cx = s * 52, cz = 220, W = s < 0 ? 44 : 30, D = 16, FY = s < 0 ? 3 : 1.2, RY = s < 0 ? 12 : 8;
      slab(cx - W / 2, cz - D / 2, cx + W / 2, cz + D / 2, FY, 0.5); collider(cx, 0, cz, W, FY - 0.5, D);
      box(cx, FY, cz, W - 6, RY - FY - 0.6, D - 5, { ink: BL }); facade(cx, cz, W - 6, D - 5, RY - FY - 0.6, 3, BK, 2);
      slab(cx - W / 2 - 1, cz - D / 2 - 1, cx + W / 2 + 1, cz + D / 2 + 1, RY, 0.6);
      for (let x = cx - W / 2 + 2; x <= cx + W / 2 - 2; x += 5.5) for (const zs of [-1, 1]) {
        const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0, cz + zs * (D / 2 + 1.4)), new THREE.Vector3(x, RY * 0.5, cz + zs * (D / 2 + 0.1)), new THREE.Vector3(x, RY, cz + zs * (D / 2 + 1)));
        deco(new THREE.TubeGeometry(c, 8, 0.32, 5, false), BK); collider(x, 0, cz + zs * (D / 2 + 1.3), 0.7, RY, 0.7, { noNav: true });
      }
      if (s < 0) { stairs(cx + W / 2 + 6 * 0.6, 0, cz - 4, '-x', 6, 4, { rise: FY / 6, run: 0.6 }); rail(cx + W / 2 + 0.2, cz - D / 2, cx + W / 2 + 0.2, cz - 6.3, FY); rail(cx + W / 2 + 0.2, cz - 1.7, cx + W / 2 + 0.2, cz + D / 2, FY); } // rampa do Planalto
      else stairs(cx - W / 2 - 1.5, 0, cz, '+x', 3, 5, { rise: FY / 3, run: 0.5 });
      ring(cx, RY + 4, cz, 'y'); sniper(cx, RY, cz); spawn(cx, 0, cz - D / 2 - 6);
    }
    // estátua "A Justiça" diante do STF
    { const jx = 52, jz = 203; box(jx, 0, jz, 2, 1.6, 2, { ink: BK }); cyl(jx, 1.6, jz, 0.55, 2.4, { ink: BK, seg: 6, noCollide: true }); sphere(jx, 4.4, jz, 0.5, { ink: BK, seg: 7 });
      box(jx, 4.45, jz - 0.4, 0.9, 0.18, 0.12, { ink: BK, noCollide: true }); box(jx, 2.6, jz - 0.7, 1.6, 0.18, 1.4, { ink: BK, noCollide: true }); }
    // Os Candangos (as duas figuras esguias)
    for (const dx of [-1.1, 1.1]) { cyl(12 + dx, 0, 214, 0.35, 7, { ink: BK, seg: 6 }); sphere(12 + dx, 7.6, 214, 0.6, { ink: BK, seg: 7 }); cyl(12 + dx * 1.4, 4.5, 214, 0.18, 2.6, { ink: BK, seg: 5, noCollide: true }); }
    box(12, 0, 214, 4, 0.4, 2.2, { ink: BK });
    // Pombal e Panteão da Pátria
    box(-14, 0, 230, 1.3, 9, 1.3, { ink: BK }); box(-14, 9, 229, 1.3, 1.2, 4, { ink: BK, noCollide: true });
    box(10, 0, 232, 14, 4, 6, { ink: BK }); box(10, 4, 232, 18, 0.5, 4, { ink: BK, noCollide: true });
    // Mastro da Bandeira com a bandeira do Brasil
    cyl(-2, 0, 226, 0.28, 34, { ink: BK, seg: 6 });
    box(2.6, 27.5, 226, 9, 6, 0.12, { ink: GN, fill: true, noCollide: true });
    { const d = new THREE.BoxGeometry(4.2, 4.2, 0.16); d.rotateZ(Math.PI / 4); d.scale(1.35, 0.85, 1); d.translate(2.6, 30.5, 226); deco(d, OR); const c = new THREE.CylinderGeometry(1.5, 1.5, 0.22, 14); c.rotateX(Math.PI / 2); c.translate(2.6, 30.5, 226); deco(c, BL); }
    pickup(0, 0, 214); pickup(-30, 0, 236);
    L.arenaSpawns.push(new THREE.Vector3(-52, 3, 220), new THREE.Vector3(52, 1.2, 220), new THREE.Vector3(0, 0, 218));
  }

  // ---------------- 9. Trânsito no Eixo Monumental ----------------
  const cars = [];
  // every car of a kind shares one set of merged geometries and is drawn through instancing:
  // 24 cars cost ~15 draw calls instead of 72, looking exactly the same
  const carGeos = new Map();
  function makeCar(type, ink) {
    const g = new THREE.Object3D(); const isBus = type === 'bus';
    const w = isBus ? 2.8 : 1.95, h = isBus ? 2.7 : 1.15, d = isBus ? 10 : type === 'beetle' ? 3.6 : 4.5;
    if (carGeos.has(type)) return { group: g, w, h, d, isBus, type, ink };
    const body = [], dark = [], light = [];
    const add = (arr, geo, x, y, z) => { geo.translate(x, y, z); arr.push(geo); };
    if (type === 'beetle') { const s = new THREE.SphereGeometry(1, 12, 8); s.scale(w / 2, h * 1.05, d / 2); add(body, s, 0, 0.5, 0); add(dark, new THREE.BoxGeometry(w * 0.7, 0.5, d * 0.35), 0, 1.25, -0.1); }
    else {
      add(body, new THREE.BoxGeometry(w, h, d), 0, h / 2 + 0.38, 0);
      if (isBus) { for (let i = -3; i <= 3; i++) add(dark, new THREE.BoxGeometry(w + 0.04, 0.8, 1.05), 0, h * 0.72 + 0.4, i * 1.3); add(light, new THREE.BoxGeometry(w + 0.06, 0.3, d + 0.06), 0, h * 0.42 + 0.38, 0); add(dark, new THREE.BoxGeometry(w * 0.9, 0.5, 0.05), 0, h + 0.1, d / 2 + 0.02); }
      else { add(dark, new THREE.BoxGeometry(w * 0.86, 0.75, d * 0.5), 0, h + 0.75, -0.2); add(dark, new THREE.BoxGeometry(w + 0.04, 0.22, 0.25), 0, 0.55, d / 2); add(dark, new THREE.BoxGeometry(w + 0.04, 0.22, 0.25), 0, 0.55, -d / 2); }
      if (type === 'taxi') add(light, new THREE.BoxGeometry(0.8, 0.3, 0.4), 0, h + 1.3, -0.2);
      if (type === 'police') { add(light, new THREE.BoxGeometry(0.5, 0.25, 0.35), -0.35, h + 1.25, -0.2); add(dark, new THREE.BoxGeometry(0.5, 0.25, 0.35), 0.35, h + 1.25, -0.2); add(light, new THREE.BoxGeometry(w + 0.05, 0.18, d * 0.6), 0, h * 0.55 + 0.38, 0); }
    }
    const rR = isBus ? 0.55 : 0.36, wZ = d * 0.32;
    for (const sx of [-w / 2 - 0.06, w / 2 + 0.06]) for (const sz of [-wZ, wZ]) { const c = new THREE.CylinderGeometry(rR, rR, 0.22, 10); c.rotateZ(Math.PI / 2); add(dark, c, sx, rR, sz); }
    for (const sx of [-w * 0.33, w * 0.33]) { add(light, new THREE.BoxGeometry(0.32, 0.2, 0.08), sx, 0.75, d / 2 + 0.04); add(dark, new THREE.BoxGeometry(0.3, 0.18, 0.08), sx, 0.75, -d / 2 - 0.04); }
    const parts = [];
    for (const [arr, part] of [[body, 'body'], [dark, 'dark'], [light, 'light']]) { if (!arr.length) continue; const merged = mergeGeometries(arr, false); for (const x of arr) x.dispose(); parts.push({ part, geo: merged }); }
    carGeos.set(type, parts);
    return { group: g, w, h, d, isBus, type, ink };
  }
  const kinds = ['sedan', 'bus', 'beetle', 'taxi', 'sedan', 'police', 'beetle', 'sedan'];
  const inks = [BL, GN, RD, OR, PK, BL];
  const routeA = -PZ - 12, routeB = ROAD_END + 10, routeLen = routeB - routeA;
  let k = 0;
  for (const s of [-1, 1]) for (const lane of [25, 30, 35]) for (let i = 0; i < 4; i++) {
    const type = kinds[k % kinds.length]; const ink = type === 'police' ? BK : type === 'taxi' ? BL : inks[k % inks.length]; k++;
    const c = makeCar(type, ink);
    c.laneX = s * lane; c.dir = s < 0 ? 1 : -1; c.z = routeA + ((i + (lane - 25) / 15) / 4) * routeLen + rand(-6, 6);
    c.speed = (type === 'bus' ? 12 : lane === 35 ? 15 : lane === 30 ? 19 : 23) + rand(-1.5, 1.5);
    c.group.rotation.y = c.dir > 0 ? 0 : Math.PI; c.group.position.set(c.laneX, 0, c.z);
    cars.push(c);
  }
  const carMat = makeInkMaterial({ ink: BK, fill: true, side: THREE.DoubleSide });
  const carPools = [];
  for (const [type, parts] of carGeos) {
    const list = cars.filter((c) => c.type === type);
    for (const { part, geo } of parts) {
      const im = new THREE.InstancedMesh(geo, carMat, list.length); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
      list.forEach((c, i) => im.instanceColor.setXYZ(i, part === 'body' ? c.ink : part === 'dark' ? BK : OR, 1, 0));
      im.frustumCulled = false; scene.add(im); L.meshes.push(im); carPools.push({ im, list });
    }
  }
  const syncCars = () => { for (const c of cars) c.group.updateMatrix(); for (const p of carPools) { p.list.forEach((c, i) => p.im.setMatrixAt(i, c.group.matrix)); p.im.instanceMatrix.needsUpdate = true; } };
  syncCars();
  L.animated.push({
    mesh: null,
    update: () => {
      const dt = 0.016;
      for (const car of cars) {
        car.z += car.speed * car.dir * dt;
        if (car.dir > 0 && car.z > routeB) car.z = routeA;
        if (car.dir < 0 && car.z < routeA) car.z = routeB;
        car.group.position.set(car.laneX, 0, car.z);
      }
      syncCars();
    }
  });
  L.cars = cars; // o main.js verifica atropelamentos e buzinas

  // ---------------- 10. Spawns no gramado ----------------
  for (let z = -170; z <= 130; z += 30) { spawn(rand(-12, 12), 0, z); pickup(rand(-8, 8), 0, z + 12); }
  for (const z of [-60, 20, 100]) L.arenaSpawns.push(new THREE.Vector3(0, 0.22, z));

  // ---------------- 11. Céu do cerrado ----------------
  addGeo(new THREE.SphereGeometry(16, 14, 9).translate(120, 140, -260), OR);
  for (const [cx, cy, cz] of [[-110, 95, -170], [80, 115, 120], [150, 90, 10], [-140, 105, 200], [20, 130, -60]]) {
    for (let i = 0; i < 6; i++) sphere(cx + (i - 2.5) * 8, cy + Math.sin(i * 1.5) * 3, cz, 7, { seg: 8, ink: BL });
  }
  planes(5, 60, 45, { rStep: 16, hStep: 7, scale: 2 });

  return B.finish();
}
