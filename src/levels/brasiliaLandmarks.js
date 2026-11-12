// Monumentos de Brasília modelados à mão. Cada um é desenhado nas suas coordenadas "de projeto" e
// deslocado (shifted) para a posição real, calculada a partir da planta do OpenStreetMap em
// brasiliaData.js. Assim as formas detalhadas continuam iguais, só que no lugar certo da cidade.
import * as THREE from 'three';
import { INK } from '../render.js';
import { rand, TAU } from '../util.js';

const { BLUE: BL, RED: RD, BLACK: BK, ORANGE: OR, GREEN: GN, PINK: PK } = INK;

// API do builder com tudo deslocado de (ox, oz)
export function shifted(B, ox, oz) {
  const { L } = B;
  const A = {
    L, scene: B.scene,
    box: (x, y, z, w, h, d, o) => B.box(x + ox, y, z + oz, w, h, d, o),
    slab: (x1, z1, x2, z2, y, t, o) => B.slab(x1 + ox, z1 + oz, x2 + ox, z2 + oz, y, t, o),
    stairs: (x, y, z, dir, n, w, o) => { const r = B.stairs(x + ox, y, z + oz, dir, n, w, o); return { x: r.x - ox, z: r.z - oz, y: r.y }; },
    rail: (x1, z1, x2, z2, y, o) => B.rail(x1 + ox, z1 + oz, x2 + ox, z2 + oz, y, o),
    cyl: (x, y, z, r, h, o) => B.cyl(x + ox, y, z + oz, r, h, o),
    sphere: (x, y, z, r, o) => B.sphere(x + ox, y, z + oz, r, o),
    ring: (x, y, z, a) => B.ring(x + ox, y, z + oz, a),
    spawn: (x, y, z) => B.spawn(x + ox, y, z + oz),
    sniper: (x, y, z) => B.sniper(x + ox, y, z + oz),
    pickup: (x, y, z) => B.pickup(x + ox, y, z + oz),
    collider: (x, y, z, w, h, d, o) => B.collider(x + ox, y, z + oz, w, h, d, o),
    deco: (g, ink) => { g.translate(ox, 0, oz); B.addGeo(g, ink); },
    arena: (x, y, z) => L.arenaSpawns.push(new THREE.Vector3(x + ox, y, z + oz)),
  };
  // fachada modernista: faixas por andar e montantes (desenho fino só de perto)
  A.facade = (cx, cz, w, d, h, floorH, ink = BK, mull = 3.2) => {
    for (let y = floorH; y < h - 0.3; y += floorH) B.box(cx + ox, y - 0.12, cz + oz, w + 0.35, 0.24, d + 0.35, { ink, noCollide: true });
    for (let x = cx - w / 2 + mull / 2; x < cx + w / 2; x += mull) for (const s of [-1, 1]) B.nearBox(x + ox, 0.4, cz + s * (d / 2 + 0.08) + oz, 0.14, h - 0.6, 0.16, { ink });
  };
  A.domeCollider = (x, y0, z, r, n = 6, o = {}) => {
    for (let i = 0; i < n; i++) { const yb = (i / n) * r, rr = Math.sqrt(Math.max(0, r * r - yb * yb)) * 0.86; B.collider(x + ox, y0 + yb, z + oz, rr * 2, r / n, rr * 2, o); }
  };
  return A;
}
// Versão espelhada em X: x -> c - x. Os blocos abaixo foram desenhados com o norte em -X; no mapa
// real (sem espelhar) o norte fica em +X, então eles são refletidos em torno do próprio centro.
function mirrored(B, c, oz) {
  const { L } = B; const mx = (x) => c - x;
  const flipGeo = (g) => {
    g.scale(-1, 1, 1);
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.index.needsUpdate = true; }
    else { for (const name of Object.keys(g.attributes)) { const at = g.attributes[name], n = at.itemSize, a = at.array; for (let i = 0; i < at.count; i += 3) for (let k = 0; k < n; k++) { const t = a[(i + 1) * n + k]; a[(i + 1) * n + k] = a[(i + 2) * n + k]; a[(i + 2) * n + k] = t; } at.needsUpdate = true; } }
    g.computeVertexNormals(); return g;
  };
  const A = {
    L, scene: B.scene,
    box: (x, y, z, w, h, d, o) => B.box(mx(x), y, z + oz, w, h, d, o),
    slab: (x1, z1, x2, z2, y, t, o) => B.slab(mx(x2), z1 + oz, mx(x1), z2 + oz, y, t, o),
    stairs: (x, y, z, dir, n, w, o) => { const nd = dir === '+x' ? '-x' : dir === '-x' ? '+x' : dir; const r = B.stairs(mx(x), y, z + oz, nd, n, w, o); return { x: mx(r.x), z: r.z - oz, y: r.y }; },
    rail: (x1, z1, x2, z2, y, o) => B.rail(mx(x1), z1 + oz, mx(x2), z2 + oz, y, o),
    cyl: (x, y, z, r, h, o) => B.cyl(mx(x), y, z + oz, r, h, o),
    sphere: (x, y, z, r, o) => B.sphere(mx(x), y, z + oz, r, o),
    ring: (x, y, z, a) => B.ring(mx(x), y, z + oz, a),
    spawn: (x, y, z) => B.spawn(mx(x), y, z + oz),
    sniper: (x, y, z) => B.sniper(mx(x), y, z + oz),
    pickup: (x, y, z) => B.pickup(mx(x), y, z + oz),
    collider: (x, y, z, w, h, d, o) => B.collider(mx(x), y, z + oz, w, h, d, o),
    deco: (g, ink) => { flipGeo(g); g.translate(c, 0, oz); B.addGeo(g, ink); },
    arena: (x, y, z) => L.arenaSpawns.push(new THREE.Vector3(mx(x), y, z + oz)),
  };
  A.facade = (cx, cz, w, d, h, floorH, ink = BK, mull = 3.2) => {
    for (let y = floorH; y < h - 0.3; y += floorH) B.box(mx(cx), y - 0.12, cz + oz, w + 0.35, 0.24, d + 0.35, { ink, noCollide: true });
    for (let x = cx - w / 2 + mull / 2; x < cx + w / 2; x += mull) for (const s of [-1, 1]) B.nearBox(mx(x), 0.4, cz + s * (d / 2 + 0.08) + oz, 0.14, h - 0.6, 0.16, { ink });
  };
  A.domeCollider = (x, y0, z, r, n = 6, o = {}) => {
    for (let i = 0; i < n; i++) { const yb = (i / n) * r, rr = Math.sqrt(Math.max(0, r * r - yb * yb)) * 0.86; B.collider(mx(x), y0 + yb, z + oz, rr * 2, r / n, rr * 2, o); }
  };
  return A;
}
// coloca um bloco desenhado em torno de (px, pz) na posição real (x, z), espelhado (norte em +X)
const at = (B, x, z, px, pz) => mirrored(B, x + px, z - pz);

export function torreDeTV(B, x, z) {
  const A = at(B, x, z, 0, -316);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
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
    sniper(tx + 4, UY, tz + 4); pickup(tx - 4, UY, tz - 4); arena(tx + 4, UY, tz - 4);
    // antena no topo, listrada de vermelho e branco
    for (let i = 0; i < 9; i++) { const y = Y1 + i * 4, r = 0.55 - i * 0.035; const m = new THREE.CylinderGeometry(r - 0.035, r, 4, 6); m.translate(tx, y + 2, tz); deco(m, i % 2 ? BK : RD); }
    sphere(tx, Y1 + 37, tz, 0.5, { ink: RD, seg: 6 });
    // Argolas de gancho em 4 lados do Mirante para subir voando!
    ring(0, MY + 3.5, tz + 12, 'x'); ring(0, MY + 3.5, tz - 12, 'x');
    ring(-12, MY + 3.5, tz, 'z'); ring(12, MY + 3.5, tz, 'z');
    sniper(0, MY, tz + 9); sniper(-8, MY, tz - 8); sniper(8, MY, tz - 8);
    pickup(0, MY, tz - 5); pickup(-7, MY, tz + 6);
    spawn(0, MY, tz - 6); spawn(0, 0, tz + 18);
    arena(0, MY, tz - 6); arena(-8, MY, tz + 6); arena(0, 0, -338);

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

export function estadioNacional(B, x, z) {
  const A = at(B, x, z, -84, -462);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
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
    spawn(cx, 0.3, cz); spawn(cx + R + 7, 0, cz - 12); spawn(cx + R + 7, 0, cz + 12); spawn(cx - SX - 3, 2, cz);
    pickup(cx, 0.3, cz); pickup(cx + SX + 15, top, cz + 6); pickup(cx - R - 3, 0, cz);
    arena(cx, 0.3, cz); arena(cx + SX + 15, top, cz); arena(cx + R + 9, 0, cz);

}

export function nilsonNelson(B, x, z) {
  const A = at(B, x, z, -92, -396);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
    // Ginásio Nilson Nelson ao lado (Norte, Z = -396)
    const nx = -92, nz = -396, NR = 15, NH = 10;
    cyl(nx, 0, nz, NR, NH * 0.55, { ink: BK, seg: 18 });
    const saucer = new THREE.CylinderGeometry(4.5, NR + 2.5, NH * 0.55, 18); saucer.translate(nx, NH * 0.8, nz); deco(saucer, BL);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; box(nx + Math.cos(a) * (NR + 0.4), 0, nz + Math.sin(a) * (NR + 0.4), 0.5, NH * 0.55, 0.5, { ink: BL, noCollide: true }); }
    ring(nx, NH + 4, nz, 'y'); spawn(nx + NR + 6, 0, nz); pickup(nx + NR + 5, 0, nz + 8);
}

export function museuNacional(B, x, z) {
  const A = at(B, x, z, 66, -160);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
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
}

export function catedral(B, x, z) {
  const A = at(B, x, z, 64, -114);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
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
    arena(cx, 0.3, cz + 3); arena(cx - R - 9, 0, cz - 6);
}

export function congresso(B, x, z) {
  const A = at(B, x, z, 0, 173);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
    const z1 = 160, z2 = 186, DY = 5;
    box(0, 0, (z1 + z2) / 2, 92, DY, z2 - z1, { ink: BK });
    facade(0, (z1 + z2) / 2, 92, z2 - z1, DY, 2.5, BL, 3);
    rail(-46, z1, -4, z1, DY); rail(4, z1, 46, z1, DY); rail(-46, z2, 46, z2, DY);
    stairs(0, 0, z1 - 18 * 1.05, '+z', 18, 6, { rise: DY / 18, run: 1.05 });
    for (const sx of [-1, 1]) box(sx * 3.2, 0, z1 - 9.5, 0.3, 1, 19, { ink: BK, noCollide: true });
    for (const sx of [-1, 1]) { box(sx * 12.5, 0, z1 - 9, 15, 0.3, 16, { ink: BL }); box(sx * 62, 0, z1 - 9, 34, 0.3, 14, { ink: BL }); }
    const cam = new THREE.CylinderGeometry(11, 5, 5, 26); cam.translate(22, DY + 2.5, (z1 + z2) / 2); deco(cam, BK);
    const rim = new THREE.TorusGeometry(10.8, 0.3, 4, 26); rim.rotateX(Math.PI / 2); rim.translate(22, DY + 5, (z1 + z2) / 2); deco(rim, BK);
    for (let i = 0; i < 5; i++) { const r = 5.5 + i * 1.3; collider(22, DY + i, (z1 + z2) / 2, r * 1.6, 1, r * 1.6); }
    const sen = new THREE.SphereGeometry(8, 22, 10, 0, TAU, 0, Math.PI / 2); sen.translate(-22, DY, (z1 + z2) / 2); deco(sen, BK);
    domeCollider(-22, DY, (z1 + z2) / 2, 8, 6);
    ring(22, DY + 9, (z1 + z2) / 2, 'y'); ring(-22, DY + 11, (z1 + z2) / 2, 'y');
    const tz = 195, TH = 50;
    box(0, 0, tz, 30, 0.3, 16, { ink: BL });
    for (const sx of [-1, 1]) { box(sx * 5.5, 0, tz, 7, TH, 6, { ink: BL }); facade(sx * 5.5, tz, 7, 6, TH, 1.8, BK, 1.75); rail(sx * 5.5 - 3.5, tz - 3, sx * 5.5 + 3.5, tz - 3, TH); rail(sx * 5.5 - 3.5, tz + 3, sx * 5.5 + 3.5, tz + 3, TH); ring(sx * 5.5, TH + 3, tz, 'y'); sniper(sx * 5.5, TH, tz); }
    box(0, 24, tz, 4.2, 5, 5, { ink: BK });
    pickup(0, DY, (z1 + z2) / 2); pickup(-36, DY, z1 + 4); pickup(36, DY, z1 + 4);
    spawn(0, DY, z2 - 4); spawn(-38, DY, (z1 + z2) / 2); spawn(38, DY, (z1 + z2) / 2);
    arena(-22, DY + 5, (z1 + z2) / 2); arena(22, DY + 8, (z1 + z2) / 2); arena(0, DY, z2 - 4);
}

export function pracaTresPoderesDetalhes(B, x, z) {
  const A = at(B, x, z, 0, 222);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
    { const jx = 54, jz = 205; box(jx, 0, jz, 2, 1.6, 2, { ink: BK }); cyl(jx, 1.6, jz, 0.55, 2.4, { ink: BK, seg: 6, noCollide: true }); sphere(jx, 4.4, jz, 0.5, { ink: BK, seg: 7 });
      box(jx, 4.45, jz - 0.4, 0.9, 0.18, 0.12, { ink: BK, noCollide: true }); box(jx, 2.6, jz - 0.7, 1.6, 0.18, 1.4, { ink: BK, noCollide: true }); }
    for (const dx of [-1.1, 1.1]) { cyl(12 + dx, 0, 216, 0.35, 7, { ink: BK, seg: 6 }); sphere(12 + dx, 7.6, 216, 0.6, { ink: BK, seg: 7 }); cyl(12 + dx * 1.4, 4.5, 216, 0.18, 2.6, { ink: BK, seg: 5, noCollide: true }); }
    box(12, 0, 216, 4, 0.4, 2.2, { ink: BK });
    box(-14, 0, 232, 1.3, 9, 1.3, { ink: BK }); box(-14, 9, 231, 1.3, 1.2, 4, { ink: BK, noCollide: true });
    box(10, 0, 234, 14, 4, 6, { ink: BK }); box(10, 4, 234, 18, 0.5, 4, { ink: BK, noCollide: true });
    cyl(-2, 0, 228, 0.28, 34, { ink: BK, seg: 6 });
    box(2.6, 27.5, 228, 9, 6, 0.12, { ink: GN, fill: true, noCollide: true });
    { const d = new THREE.BoxGeometry(4.2, 4.2, 0.16); d.rotateZ(Math.PI / 4); d.scale(1.35, 0.85, 1); d.translate(2.6, 30.5, 228); deco(d, OR); const c = new THREE.CylinderGeometry(1.5, 1.5, 0.22, 14); c.rotateX(Math.PI / 2); c.translate(2.6, 30.5, 228); deco(c, BL); }
}

export function igrejinha(B, X0, Z0) {
  const A = at(B, X0, Z0, 192, -302);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
    const x = 192, z = -302;
    box(x, 0, z, 8, 3.6, 8, { ink: BL }); // paredes de azulejos azuis e brancos
    for (let i = 0; i < 5; i++) box(x - 3.2 + i * 1.6, 0.6, z + 4.1, 0.8, 0.8, 0.1, { ink: BK, noCollide: true });
    const hat = new THREE.ConeGeometry(8.5, 7, 3, 1, true); hat.rotateY(Math.PI / 6); hat.translate(x, 3.6 + 3.5, z); deco(hat, BK);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI / 6; cyl(x + Math.cos(a) * 7.2, 0, z + Math.sin(a) * 7.2, 0.3, 3.6, { ink: BK, seg: 5 }); }
    collider(x, 3.6, z, 9, 3.2, 9); ring(x, 14, z, 'y'); pickup(x, 0, z + 8);
}

export function domBosco(B, X0, Z0) {
  const A = at(B, X0, Z0, 192, -412);
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, collider, deco, arena, facade, domeCollider } = A;
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

// ---------------------------------------------------------------- monumentos paramétricos (desenhados já em (0,0))
// Teatro Nacional: tronco de pirâmide com as fachadas laterais de cubos em relevo (Athos Bulcão)
export function teatroNacional(B, x, z, W, D) {
  const A = shifted(B, x, z); const { box, collider, deco, ring, sniper, spawn, pickup } = A;
  const H = 17;
  const g = new THREE.CylinderGeometry(0.55, 1, 1, 4); g.rotateY(Math.PI / 4); g.scale(W / Math.SQRT2, H, D / Math.SQRT2); g.translate(0, H / 2, 0); deco(g, BL);
  for (let i = 0; i < 4; i++) { const k = 1 - 0.45 * (i + 0.5) / 4; collider(0, i * H / 4, 0, W * k, H / 4, D * k); }
  let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 60; i++) { const f = 0.08 + rnd() * 0.78, y = f * H, k = 1 - 0.45 * f; const s = rnd() < 0.5 ? -1 : 1; B.nearBox(x + s * (W * k / 2 + 0.25), y, z + (rnd() - 0.5) * (D * k - 4), 1.3, 1.3, 1.3 + rnd() * 2.2, { ink: BK }); }
  box(W / 2 + 1, 0, 0, 3, 3.2, 14, { ink: BK });
  ring(0, H + 3, 0, 'y'); sniper(0, H, 0); spawn(W / 2 + 5, 0, 10); pickup(W / 2 + 5, 0, -10);
}

// Itamaraty (arcos sobre o espelho d'água, escultura "Meteoro") e Palácio da Justiça (cascatas entre os arcos)
export function palacioDeArcos(B, x, z, W, kind) {
  const A = shifted(B, x, z); const { box, slab, deco, ring, sniper, pickup, spawn, arena, facade, collider } = A;
  const H = 13;
  box(0, 0, 0, W + 12, 0.3, W + 12, { ink: BL });                       // espelho d'água
  box(0, 0.3, 0, W - 8, H - 1, W - 8, { ink: kind === 'itamaraty' ? BL : GN });
  facade(0, 0, W - 8, W - 8, H - 1, 3.2, BK, 2.2);
  slab(-W / 2, -W / 2, W / 2, W / 2, H, 0.8);
  const n = Math.max(6, Math.round(W / 4)), step = W / n;
  for (let i = 0; i <= n; i++) for (const [ax, az, rot] of [[-W / 2 + i * step, -W / 2, 0], [-W / 2 + i * step, W / 2, 0], [-W / 2, -W / 2 + i * step, 1], [W / 2, -W / 2 + i * step, 1]]) {
    box(ax, 0.3, az, 0.7, H - 3.2, 0.7, { ink: BK });
    if (i < n) { const a = new THREE.TorusGeometry(step / 2, 0.32, 4, 10, Math.PI); if (rot) a.rotateY(Math.PI / 2); a.translate(rot ? ax : ax + step / 2, H - 3.2, rot ? az + step / 2 : az); deco(a, BK); }
  }
  if (kind === 'justica') for (let i = 0; i < n; i++) box(-W / 2 - 0.6, 1, -W / 2 + (i + 0.5) * step, 0.4, H - 5, 1.4, { ink: BL, noCollide: true }); // cascatas
  else { const g = new THREE.TorusKnotGeometry(1.4, 0.3, 40, 6, 2, 3); g.translate(-W / 2 - 3, 1.6, 0); deco(g, BK); collider(-W / 2 - 3, 0, 0, 3, 3, 3); } // Meteoro
  ring(0, H + 4, 0, 'y'); sniper(0, H, 0); pickup(-(W / 2 + 4), 0, 0); spawn(-(W / 2 + 8), 0, 10);
  arena(0, H, 0); arena(-(W / 2 + 8), 0, -10);
}

// Palácio do Planalto (longo, paralelo ao Eixo) e STF: colunas "em lâmina" curvas, rampa do Planalto
export function palacioColunas(B, x, z, Lz, Dx, FY, RY, rampSide, stairSide = -1) {
  const A = shifted(B, x, z); const { box, slab, collider, deco, ring, sniper, spawn, stairs, rail, facade } = A;
  slab(-Dx / 2, -Lz / 2, Dx / 2, Lz / 2, FY, 0.5); collider(0, 0, 0, Dx, FY - 0.5, Lz);
  box(0, FY, 0, Dx - 5, RY - FY - 0.6, Lz - 6, { ink: BL }); facade(0, 0, Dx - 5, Lz - 6, RY - FY - 0.6, 3, BK, 2);
  slab(-Dx / 2 - 1, -Lz / 2 - 1, Dx / 2 + 1, Lz / 2 + 1, RY, 0.6);
  for (let zz = -Lz / 2 + 2; zz <= Lz / 2 - 2; zz += 5.5) for (const xs of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(xs * (Dx / 2 + 1.4), 0, zz), new THREE.Vector3(xs * (Dx / 2 + 0.1), RY * 0.5, zz), new THREE.Vector3(xs * (Dx / 2 + 1), RY, zz));
    deco(new THREE.TubeGeometry(c, 8, 0.32, 5, false), BK); collider(xs * (Dx / 2 + 1.3), 0, zz, 0.7, RY, 0.7, { noNav: true });
  }
  if (rampSide) { // rampa do Planalto saindo para a praça
    const sx = rampSide * (Dx / 2 + 0.2);
    stairs(sx + rampSide * 6 * 0.6, 0, -4, rampSide > 0 ? '-x' : '+x', 6, 4, { rise: FY / 6, run: 0.6 });
    rail(sx, -Lz / 2, sx, -6.3, FY); rail(sx, -1.7, sx, Lz / 2, FY);
  } else stairs(stairSide * (Dx / 2 + 1.5), 0, 0, stairSide < 0 ? '+x' : '-x', 3, 5, { rise: FY / 3, run: 0.5 });
  ring(0, RY + 4, 0, 'y'); sniper(0, RY, 0); spawn(0, 0, -Lz / 2 - 6);
}

// Rodoviária do Plano Piloto: laje superior (plataforma) no nível dos Eixinhos, embarque dos ônibus
// embaixo, no nível do chão, com o Eixão passando por baixo de tudo em túnel (o Buraco do Tatu)
export function rodoviaria(B, x, z, W, D, DY) {
  const A = shifted(B, x, z); const { box, slab, stairs, rail, ring, sniper, spawn, pickup, arena } = A;
  const x1 = -W / 2, x2 = W / 2, z1 = -D / 2, z2 = D / 2;
  // vãos das escadas na laje (x1, x2, z1, z2)
  const holes = [[-9, -1, -9, -6], [-9, -1, 6, 9], [5, 13, -9, -6], [5, 13, 6, 9]];
  const zs = [...new Set([z1, z2, ...holes.flatMap((h) => [h[2], h[3]])])].sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i++) {
    const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2;
    const cut = holes.filter((h) => h[2] < zm && h[3] > zm).sort((a, b) => a[0] - b[0]);
    let xx = x1; for (const h of cut) { if (h[0] > xx) slab(xx, za, h[0], zb, DY, 0.8, { ink: BK }); xx = Math.max(xx, h[1]); }
    if (xx < x2) slab(xx, za, x2, zb, DY, 0.8, { ink: BK });
  }
  for (const [hx1, hx2, hz1, hz2] of holes) {
    const hz = (hz1 + hz2) / 2;
    stairs(hx2, 0, hz, '-x', 16, 2.6, { rise: DY / 16, run: 0.5 });
    rail(hx1, hz1, hx2, hz1, DY); rail(hx1, hz2, hx2, hz2, DY); rail(hx2, hz1, hx2, hz2, DY);
  }
  // pilares e plataformas de embarque no térreo, com ônibus parados nas baias
  for (let xx = x1 + 3; xx <= x2 - 3; xx += 8) for (const zz of [z1 + 3, -2, 2, z2 - 3]) box(xx, 0, zz, 1, DY - 0.8, 1, { ink: BK });
  for (const zz of [-14, 0, 14]) { box(0, 0, zz, W - 6, 0.3, 3.2, { ink: BK }); for (let xx = x1 + 6; xx < x2 - 4; xx += 9) B.nearBox(x + xx, 0.3, z + zz, 1.6, 2.2, 0.15, { ink: [OR, BL, GN, PK][Math.abs(Math.round(xx)) % 4] }); }
  for (const [xx, zz] of [[x1 + 6, -7], [x2 - 8, 7], [0, -7], [0, 7]]) { box(xx, 0.3, zz, 3, 2.4, 2.2, { ink: PK }); box(xx, 2.7, zz, 3.6, 0.3, 2.8, { ink: OR, noCollide: true }); } // pastel e caldo de cana
  // em cima: marquise, bancas e guarda-corpos (as escadas externas descem para as calçadas da N1 e da S1)
  box(2, DY + 4.2, 0, 18, 0.4, Math.min(30, D - 8), { ink: OR, noCollide: true });
  for (const xx of [-6, 10]) for (const zz of [-10, 0, 10]) box(xx, DY, zz, 0.6, 4.2, 0.6, { ink: BK });
  for (const [xx, zz] of [[-14, -3], [-14, 3], [18, -3], [18, 3]]) { box(xx, DY, zz, 3, 2.3, 2.2, { ink: PK }); box(xx, DY + 2.3, zz, 3.6, 0.3, 2.8, { ink: BL, noCollide: true }); }
  rail(x1, z1 + 4, x1, z2 - 4, DY); rail(x2, z1 + 4, x2, z2 - 4, DY);
  for (const sx of [-1, 1]) { const xe = sx < 0 ? x1 : x2; stairs(xe + sx * 13 * 0.55, 0, 0, sx < 0 ? '+x' : '-x', 13, 4, { rise: DY / 13, run: 0.55 }); }
  ring(0, DY + 9, 0, 'y'); ring(x1 + 4, DY + 5, 0, 'y'); ring(x2 - 4, DY + 5, 0, 'y');
  sniper(x1 + 4, DY, -8); sniper(x2 - 4, DY, 8);
  spawn(-4, DY, 0); spawn(8, DY, 0); spawn(x1 + 8, 0.3, 0); spawn(x2 - 8, 0.3, -14);
  pickup(2, DY, 4); pickup(x1 + 10, 0.3, 14);
  arena(0, DY, 0); arena(x1 + 6, DY, 8); arena(x2 - 6, DY, -8); arena(0, 0.3, 14);
}

// Memorial JK: museu baixo e o pilar com a "foice" onde fica a estátua de JK
export function memorialJK(B, x, z, W, D) {
  const A = shifted(B, x, z); const { box, cyl, deco, slab, stairs, ring, spawn, pickup, collider } = A;
  box(0, 0, 0, W + 10, 0.3, D + 10, { ink: BK });
  const mus = new THREE.CylinderGeometry(W * 0.32, W * 0.42, 4, 24, 1); mus.scale(1, 1, D / W); mus.translate(0, 0.3 + 2, 0); deco(mus, BK); collider(0, 0.3, 0, W * 0.6, 4, D * 0.6);
  box(-W * 0.18, 0.3, 0, 3, 28, 3, { ink: BK });
  const foice = new THREE.TorusGeometry(4.2, 0.9, 6, 18, Math.PI * 1.15); foice.rotateZ(Math.PI * 0.95); foice.translate(-W * 0.18, 29.5, 0); deco(foice, BK);
  cyl(-W * 0.18, 26.5, 0, 0.5, 3, { ink: OR, seg: 6, noCollide: true }); A.sphere(-W * 0.18, 30, 0, 0.55, { ink: OR, seg: 7 });
  box(W * 0.25, 0.3, 0, 8, 1.2, 8, { ink: BL }); // espelho d'água
  ring(-W * 0.18, 34, 0, 'y'); spawn(W * 0.4, 0.3, 6); pickup(W * 0.4, 0.3, -6);
}

// Panteão da Pátria: o "pombo" deitado de concreto branco perto do mastro
export function panteao(B, x, z) {
  const A = shifted(B, x, z); const { box, deco } = A;
  box(0, 0, 0, 7, 3.2, 10, { ink: BK });
  const g = new THREE.CylinderGeometry(7, 7, 10, 18, 1, true, -0.6, 1.2); g.rotateX(Math.PI / 2); g.scale(1, 0.35, 1); g.translate(0, 2.4, 0); deco(g, BK);
}

// Lago Paranoá ao fundo (leste), Palácio da Alvorada e Ponte JK como paisagem (sem malha de bots)
export function lagoParanoa(B, zEdge, xMin, xMax) {
  const { box, cyl, addGeo } = B;
  const g = new THREE.PlaneGeometry(xMax - xMin + 900, 1300); g.rotateX(-Math.PI / 2); g.translate((xMin + xMax) / 2, -0.4, zEdge + 30 + 650); addGeo(g, BL);
  // orla com gramado
  box((xMin + xMax) / 2, -0.85, zEdge + 15, xMax - xMin + 200, 0.85, 30, { ink: GN, noCollide: true });
  // Palácio da Alvorada (colunas em "vela" sobre o espelho) à esquerda, na outra margem
  const ax = 420, az = zEdge + 420; // margem norte
  box(ax, 0, az, 30, 6, 10, { ink: BK, noCollide: true });
  for (let i = -6; i <= 6; i++) { const c = new THREE.ConeGeometry(1.4, 7, 4); c.scale(1, 1, 0.3); c.rotateX(Math.PI); c.translate(ax + i * 2.4, 3.5, az - 5.6); addGeo(c, BK); }
  box(ax, 6, az, 34, 0.5, 13, { ink: BK, noCollide: true });
  // Ponte JK: três arcos cruzados com os estais, ao sul
  const px = -520, pz = zEdge + 560, len = 300;
  box(px, 2, pz, len, 1.2, 12, { ink: BK, noCollide: true });
  for (let i = 0; i < 3; i++) {
    const cx = px - len / 3 + i * (len / 3);
    const arc = new THREE.TorusGeometry(len / 7, 0.9, 6, 24, Math.PI); arc.rotateY(Math.PI / 2 + 0.55); arc.rotateZ(0.0); arc.translate(cx, 2, pz); addGeo(arc, BK);
    const arc2 = new THREE.TorusGeometry(len / 7, 0.9, 6, 24, Math.PI); arc2.rotateY(Math.PI / 2 - 0.55); arc2.translate(cx, 2, pz); addGeo(arc2, BK);
  }
  for (let i = -6; i <= 6; i++) cyl(px + i * 22, -6, pz, 1.2, 8, { ink: BK, noCollide: true });
}
