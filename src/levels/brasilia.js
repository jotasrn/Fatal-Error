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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, makeInkMaterial } from '../render.js';
import { rand, TAU } from '../util.js';

export function buildBrasilia(B, arena = false) {
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider, scene } = B;
  const BK = INK.BLACK, BL = INK.BLUE, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK, RD = INK.RED;
  L.key = 'brasilia';

  const P = arena ? 138 : 134;
  const MIN_Z = -520, MAX_Z = 250;
  const CZ = (MIN_Z + MAX_Z) / 2, HZ = (MAX_Z - MIN_Z) / 2;
  const T = 6, PH = 28;
  L.bounds.minX = -P; L.bounds.maxX = P; L.bounds.minZ = MIN_Z; L.bounds.maxZ = MAX_Z;
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
  box(0, -1, CZ, 2 * P + T, 1, 2 * HZ + T, { ink: BK });
  box(0, 0, MIN_Z, 2 * P + T, PH, T, { ink: BK });
  box(0, 0, MAX_Z, 2 * P + T, PH, T, { ink: BK });
  box(-P, 0, CZ, T, PH, 2 * HZ + T, { ink: BK });
  box(P, 0, CZ, T, PH, 2 * HZ + T, { ink: BK });
  collider(0, 82, CZ, 2 * P + 40, 8, 2 * HZ + 40, { noNav: true, noGrapple: true });

  // ---------------- Eixo Monumental Contínuo (Oeste -516 → Congresso +150) ----------------
  const ROAD_START = MIN_Z + 4, ROAD_END = 150;
  // Gramado central dividido em trechos limpos entre os monumentos do eixo
  for (const [z1, z2] of [[-510, -432], [-372, -360], [-280, -228], [-198, 142]]) {
    box(0, 0, (z1 + z2) / 2, 44, 0.22, z2 - z1, { ink: GN });
  }
  for (const s of [-1, 1]) {
    const rx = s * 30, rz1 = ROAD_START, rz2 = ROAD_END + 4;
    box(rx, 0, (rz1 + rz2) / 2, 16, 0.12, rz2 - rz1, { ink: BK, noNav: false }); // Vias N1 / S1 (3 faixas cada)
    for (let z = rz1 + 10; z < rz2 - 4; z += 13) for (const lx of [rx - 2.6, rx + 2.6]) box(lx, 0.13, z, 0.3, 0.04, 4.8, { ink: OR, noCollide: true });
    box(s * 22.3, 0, (rz1 + rz2) / 2, 0.5, 0.3, rz2 - rz1, { ink: BK }); // meio-fio interno
    box(s * 40, 0, CZ, 4, 0.25, 2 * HZ - 8, { ink: GN }); // calçada / canteiro externo
    // Túnel sob o Congresso
    box(s * 21.7, 0, ROAD_END + 2, 1.2, 6, 4, { ink: BK }); box(s * 38.3, 0, ROAD_END + 2, 1.2, 6, 4, { ink: BK });
    box(s * 30, 6, ROAD_END + 2, 18, 1.6, 4, { ink: BK });
    box(s * 30, 0.1, ROAD_END + 4, 16, 5.9, 0.4, { ink: BK });
  }
  // Faixas de pedestre ao longo de todo o Eixo
  for (const z of [-440, -366, -274, -234, -140, -38, 18, 84]) for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) box(s * (23.5 + i * 2.1), 0.13, z, 1.1, 0.04, 4, { ink: OR, noCollide: true });
  }

  // Postes de iluminação ao longo do Eixo Monumental
  for (let z = -496; z <= 130; z += 30) for (const s of [-1, 1]) {
    if (z > -228 && z < -198) continue;
    const x = s * 21.2; cyl(x, 0, z, 0.13, 9, { ink: BK, seg: 6 });
    box(x - s * 1.1, 8.8, z, 2.2, 0.16, 0.2, { ink: BK, noCollide: true }); box(x - s * 2.1, 8.4, z, 0.6, 0.4, 0.5, { ink: OR, noCollide: true });
  }

  // Ipês amarelos, roxos/rosa e árvores do cerrado
  function ipe(x, z, ink, h = 5) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + rand(-1, 1), h * 0.5, z + rand(-1, 1)), new THREE.Vector3(x + rand(-0.6, 0.6), h, z + rand(-0.6, 0.6)));
    deco(new THREE.TubeGeometry(c, 5, 0.22, 5, false), BK); collider(x, 0, z, 0.7, h, 0.7, { noNav: false });
    for (let i = 0; i < 4; i++) { const g = new THREE.SphereGeometry(1, 7, 5); g.scale(rand(1.6, 2.3), rand(0.8, 1.1), rand(1.6, 2.3)); g.translate(x + rand(-1.4, 1.4), h + rand(-0.3, 0.8), z + rand(-1.4, 1.4)); deco(g, ink); }
  }
  const busyZ = (z, s) => [-336, -322, -276, -242, -214, -150, -80, -52, -24, 4, 32, 60, -370, -260, -104, -10, 74].some((b) => Math.abs(z - b) < 9) || (s > 0 && Math.abs(z + 154) < 6);
  for (let z = -492; z <= 136; z += 22) for (const s of [-1, 1]) {
    if (!busyZ(z, s)) ipe(s * 40 + rand(-0.6, 0.6), z + rand(-3, 3), (Math.floor(z / 22) + (s > 0 ? 1 : 0)) % 3 === 0 ? PK : (Math.floor(z / 22) % 2 ? OR : GN), rand(4.5, 6));
  }
  for (const [x, z, ink] of [[-14, -470, OR], [14, -448, PK], [-12, -264, GN], [12, -244, OR], [-12, -120, OR], [10, -96, PK], [-8, -64, GN], [14, -6, OR], [-15, 46, PK], [9, 98, GN], [-4, 112, OR]]) {
    ipe(x, z, ink, rand(5, 6.5));
  }

  // Bancos e muretas de cobertura ao longo dos gramados
  for (const [x, z] of [[-8, -482], [8, -452], [-10, -268], [10, -246], [-6, -150], [6, -130], [-10, -80], [12, -40], [-4, 0], [8, 30], [-12, 64], [4, 90]]) {
    box(x, 0.22, z, 4.2, 0.9, 1.6, { ink: BK }); box(x, 1.12, z, 3.6, 0.5, 1.0, { ink: GN, noCollide: true });
  }
  // Paradas de ônibus ao longo das vias N1 e S1
  for (const z of [-370, -260, -104, -10, 74]) for (const s of [-1, 1]) {
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
  {
    const cx = -84, cz = -462, R = 34, H = 20;
    // Esplanada externa e gramado oficial do campo (acessível pelos vãos da colunata!)
    cyl(cx, 0, cz, R + 5, 0.2, { ink: BK, seg: 28, noCollide: true });
    cyl(cx, 0, cz, R - 7, 0.26, { ink: GN, seg: 24, noCollide: true });
    // Linhas do gramado e traves de futebol
    const midLine = new THREE.TorusGeometry(5.5, 0.12, 4, 20); midLine.rotateX(Math.PI / 2); midLine.translate(cx, 0.3, cz); deco(midLine, OR);
    box(cx, 0.28, cz, 34, 0.05, 0.22, { ink: OR, noCollide: true });
    for (const sz of [-1, 1]) {
      const gz = cz + sz * 18;
      box(cx - 3.2, 0.26, gz, 0.2, 2.4, 0.2, { ink: BK }); box(cx + 3.2, 0.26, gz, 0.2, 2.4, 0.2, { ink: BK });
      box(cx, 2.55, gz, 6.6, 0.2, 0.2, { ink: BK });
      box(cx, 0.28, gz - sz * 2.5, 12, 0.05, 0.2, { ink: OR, noCollide: true });
    }
    // Arquibancadas internas escalonadas (Leste/Oeste/Norte/Sul com passagens abertas)
    for (const [ax, az, w, d] of [[cx, cz - 24, 22, 6], [cx, cz + 24, 22, 6], [cx - 24, cz, 6, 22]]) {
      box(ax, 0, az, w, 3.2, d, { ink: RD }); box(ax, 3.2, az, w * 0.85, 2.8, d * 0.85, { ink: OR });
    }
    // Colunata monumental de 24 pilares esbeltos + cobertura circular suspensa
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
      cyl(px, 0, pz, 0.62, H, { ink: BK, seg: 8 });
    }
    const roof = new THREE.CylinderGeometry(R + 3, R - 11, 2.4, 24, 1, true); roof.translate(cx, H + 0.8, cz); deco(roof, BK);
    const rimOut = new THREE.TorusGeometry(R + 2.6, 0.65, 6, 24); rimOut.rotateX(Math.PI / 2); rimOut.translate(cx, H + 0.6, cz); deco(rimOut, OR);
    const rimIn = new THREE.TorusGeometry(R - 11, 0.45, 6, 24); rimIn.rotateX(Math.PI / 2); rimIn.translate(cx, H + 1.8, cz); deco(rimIn, BL);
    // Passarela superior jogável na fachada Leste do estádio + escadaria monumental
    const px = cx + R + 2;
    slab(px - 4, cz - 14, px + 4, cz + 14, 8, 0.6);
    stairs(px + 2, 0, cz + 14 + 14 * 0.55, '-z', 14, 3.6, { rise: 8 / 14, run: 0.55 });
    rail(px + 4, cz - 14, px + 4, cz + 14, 8);
    ring(cx, H + 4, cz, 'y'); ring(cx + R, H + 3, cz, 'y'); ring(cx - R, H + 3, cz, 'y');
    sniper(px, 8, cz); sniper(cx, 6, cz - 24);
    spawn(cx, 0.3, cz); spawn(cx + R + 8, 0, cz - 12); spawn(cx + R + 8, 0, cz + 12);
    pickup(cx, 0.3, cz); pickup(px, 8, cz - 6);
    L.arenaSpawns.push(new THREE.Vector3(cx, 0.3, cz), new THREE.Vector3(px, 8, cz), new THREE.Vector3(cx + R + 10, 0, cz));

    // Ginásio Nilson Nelson ao lado (Norte, Z = -396)
    const nx = -92, nz = -396, NR = 15, NH = 10;
    cyl(nx, 0, nz, NR, NH * 0.55, { ink: BK, seg: 18 });
    const saucer = new THREE.CylinderGeometry(4.5, NR + 2.5, NH * 0.55, 18); saucer.translate(nx, NH * 0.8, nz); deco(saucer, BL);
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
    const lattice = new THREE.CylinderGeometry(1.3, 5.8, 48, 4); lattice.translate(tx, MY + 4.5 + 24, tz); deco(lattice, BK);
    const mast = new THREE.CylinderGeometry(0.45, 1.1, 30, 6); mast.translate(tx, MY + 52.5 + 15, tz); deco(mast, BK);
    for (const [y, r, c] of [[MY + 28, 4.8, BL], [MY + 48, 3.2, OR], [MY + 68, 1.5, RD]]) {
      const d = new THREE.CylinderGeometry(r, r, 2.0, 12); d.translate(tx, y, tz); deco(d, c);
    }
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
    for (const [hx, hz, w, d, h, ink] of [[-74, -294, 24, 14, 26, BK], [-106, -288, 18, 18, 32, BL], [-76, -260, 28, 13, 22, GN], [-108, -254, 16, 20, 28, OR]]) {
      box(hx, 0, hz, w, h, d, { ink });
      facade(hx, hz, w, d, h, 2.8, BK, 2.8);
      box(hx, h, hz, 5, 2.2, 5, { ink: BK });
      ring(hx, h + 4, hz, 'y');
    }
    sniper(-76, 22, -260); spawn(-52, 0, -278); pickup(-54, 0, -294);
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

    // 3. Setor Comercial Sul (SCS: Quadras de galerias comerciais, letreiros e becos, Z = -250 .. -226)
    const scsBlocks = [
      [68, -250, 20, 12, 11, BL, OR],
      [94, -250, 20, 12, 15, BK, PK],
      [68, -230, 20, 12, 9, OR, BL],
      [94, -230, 20, 12, 13, GN, OR],
    ];
    for (const [bx2, bz2, bw, bd, bh, c1, c2] of scsBlocks) {
      box(bx2, 0, bz2, bw, bh, bd, { ink: c1 });
      facade(bx2, bz2, bw, bd, bh, 3.0, BK, 2.6);
      box(bx2 - bw / 2 - 0.3, 3.4, bz2, 0.5, 1.5, bd * 0.8, { ink: c2, noCollide: true }); // letreiros das lojas do SCS
    }
    // Passarela e escada conectando os tetos das galerias do SCS
    stairs(56, 0, -235, '+z', 15, 2.4, { rise: 9 / 15, run: 0.55 });
    slab(64, -244, 72, -236, 9, 0.45);
    ring(68, 14, -250, 'y'); sniper(68, 9, -230);
    spawn(52, 0, -240); spawn(81, 0, -240); pickup(81, 0, -240); pickup(68, 9, -230);
    L.arenaSpawns.push(new THREE.Vector3(68, 9, -230), new THREE.Vector3(81, 0, -240));
  }

  // ---------------- G. Conjunto Nacional (SDN, Lado Norte colado à Rodoviária, Z = -214) ----------------
  {
    const cx = -84, cz = -214, W = 44, D = 30, H = 9.5;
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

  // ---------------- 1. Rodoviária do Plano Piloto (plataforma elevada sobre N1/S1, escadas Oeste e Leste) ----------------
  {
    const z1 = -224, z2 = -202, DY = 7;
    slab(-60, z1, 60, z2, DY, 0.7);
    box(0, DY, (z1 + z2) / 2, 120.6, 0.35, 0.25 + (z2 - z1), { ink: BK, noCollide: true });
    for (const x of [-54, -44, -16, -5, 5, 16, 44, 54]) for (const z of [z1 + 3, z2 - 3]) box(x, 0, z, 1.1, DY - 0.7, 1.1, { ink: BK });
    // Cobertura das plataformas superiores
    box(0, DY + 4.2, (z1 + z2) / 2, 54, 0.4, 9, { ink: OR });
    for (const x of [-24, -12, 0, 12, 24]) box(x, DY, (z1 + z2) / 2, 0.6, 4.2, 0.6, { ink: BK });
    // Guarda-corpos com vãos nas escadas Oeste (-Z) e Leste (+Z)
    rail(-60, z1, -12, z1, DY); rail(-8, z1, 8, z1, DY); rail(12, z1, 60, z1, DY);
    rail(-60, z2, -12, z2, DY); rail(-8, z2, 8, z2, DY); rail(12, z2, 60, z2, DY);
    rail(-60, z1, -60, z2, DY); rail(60, z1, 60, z2, DY);
    // Escadas Leste (voltadas para a Esplanada) e Oeste (voltadas para Torre de TV / Conjunto Nacional / Pátio Brasil)
    stairs(-10, 0, z2 + 13 * 0.55, '-z', 13, 3, { rise: DY / 13, run: 0.55 });
    stairs(10, 0, z2 + 13 * 0.55, '-z', 13, 3, { rise: DY / 13, run: 0.55 });
    stairs(-10, 0, z1 - 13 * 0.55, '+z', 13, 3, { rise: DY / 13, run: 0.55 });
    stairs(10, 0, z1 - 13 * 0.55, '+z', 13, 3, { rise: DY / 13, run: 0.55 });
    // Ônibus estacionados nas baias centrais inferiores
    for (const x of [-12, 0, 12]) { box(x, 0.35, (z1 + z2) / 2, 2.8, 2.8, 9, { ink: BL }); box(x, 1.8, (z1 + z2) / 2, 2.9, 0.35, 9.1, { ink: OR, noCollide: true }); }
    // Bancas e lanchonetes do mezanino (pastel com caldo de cana!)
    for (const x of [-40, -30, 30, 40]) box(x, DY, z1 + 5, 4, 2.6, 3, { ink: PK });
    ring(0, DY + 7, (z1 + z2) / 2, 'y'); ring(-36, DY + 5, (z1 + z2) / 2, 'y'); ring(36, DY + 5, (z1 + z2) / 2, 'y');
    sniper(0, DY, z1 + 4); sniper(-48, DY, (z1 + z2) / 2); sniper(48, DY, (z1 + z2) / 2);
    spawn(-20, DY, (z1 + z2) / 2); spawn(20, DY, (z1 + z2) / 2); spawn(-48, 0, -195); spawn(48, 0, -195);
    pickup(0, DY, (z1 + z2) / 2 + 3); pickup(-44, 0, -200);
    L.arenaSpawns.push(new THREE.Vector3(0, DY, -213), new THREE.Vector3(-30, DY, -213), new THREE.Vector3(30, DY, -213), new THREE.Vector3(0, 0, -190));
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
    const cx = 64, cz = -112, R = 10.5, H = 21;
    cyl(cx, 0, cz, R + 7, 0.3, { ink: BL, seg: 28, noCollide: true }); collider(cx, 0, cz, 2, 0.3, 2);
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
  const zMinistries = [-80, -52, -24, 4, 32, 60];
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
    L.arenaSpawns.push(new THREE.Vector3(mx, MH, mz), new THREE.Vector3(mx - s * (MW / 2 + 5), 0, mz + 9));
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
    L.arenaSpawns.push(new THREE.Vector3(-54, 3, 222), new THREE.Vector3(54, 1.2, 222), new THREE.Vector3(0, 0, 218));
  }

  // ---------------- 9. Trânsito Contínuo no Eixo Monumental (36 veículos instanciados) ----------------
  const cars = [];
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
  const kinds = ['sedan', 'bus', 'beetle', 'taxi', 'sedan', 'police', 'beetle', 'sedan', 'bus'];
  const inks = [BL, GN, RD, OR, PK, BL];
  const routeA = ROAD_START - 10, routeB = ROAD_END + 10, routeLen = routeB - routeA;
  let k = 0;
  for (const s of [-1, 1]) for (const lane of [25, 30, 35]) for (let i = 0; i < 6; i++) {
    const type = kinds[k % kinds.length]; const ink = type === 'police' ? BK : type === 'taxi' ? BL : inks[k % inks.length]; k++;
    const c = makeCar(type, ink);
    c.laneX = s * lane; c.dir = s < 0 ? 1 : -1; c.z = routeA + ((i + (lane - 25) / 15) / 6) * routeLen + rand(-8, 8);
    c.speed = (type === 'bus' ? 12 : lane === 35 ? 16 : lane === 30 ? 20 : 24) + rand(-1.5, 1.5);
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
  let lastCarT = 0;
  L.animated.push({
    mesh: null,
    update: (t) => {
      const dt = lastCarT ? Math.min(0.05, Math.max(0, t - lastCarT)) : 0.016;
      lastCarT = t;
      for (const car of cars) {
        car.z += car.speed * car.dir * dt;
        if (car.dir > 0 && car.z > routeB) car.z = routeA;
        if (car.dir < 0 && car.z < routeA) car.z = routeB;
        car.group.position.set(car.laneX, 0, car.z);
      }
      syncCars();
    }
  });
  L.cars = cars;

  // ---------------- 10. Spawns e Pickups distribuídos por todo o Eixo Monumental ----------------
  for (let z = -485; z <= 130; z += 36) {
    if (z > -428 && z < -376) continue;
    if (z > -328 && z < -285) continue;
    if (z > -226 && z < -200) continue;
    spawn(rand(-12, 12), 0.25, z);
    pickup(rand(-9, 9), 0.25, z + 14);
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
