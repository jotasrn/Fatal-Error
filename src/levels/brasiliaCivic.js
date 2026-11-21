// Monumentos de Brasília modelados à mão. Cada um é desenhado nas suas coordenadas "de projeto" e
// deslocado (shifted) para a posição real, calculada a partir da planta do OpenStreetMap em
// brasiliaData.js. Assim as formas detalhadas continuam iguais, só que no lugar certo da cidade.
import * as THREE from 'three';
import { INK } from '../core/render.js';
import { rand, TAU } from '../core/util.js';
import { terrainHeight } from './data/brasiliaElev.js';

const { BLUE: BL, RED: RD, BLACK: BK, ORANGE: OR, GREEN: GN, PINK: PK } = INK;

// API do builder com tudo deslocado de (ox, oz)
import { shifted } from './brasiliaLandmarks.js';

// Teatro Nacional: tronco de pirâmide com as fachadas laterais de cubos em relevo (Athos Bulcão)
export function teatroNacional(B, x, z, W, D) {
  const A = shifted(B, x, z); const { box, collider, deco, ring, sniper, spawn, pickup } = A;
  const H = 17;
  const g = new THREE.CylinderGeometry(0.55, 1, 1, 4); g.rotateY(Math.PI / 4); g.scale(W / Math.SQRT2, H, D / Math.SQRT2); g.translate(0, H / 2, 0); deco(g, BL);
  // colisão em 16 degraus finos que ficam rentes à fachada inclinada (com 4 degraus sobravam beirais invisíveis de ~1,4)
  for (let i = 0; i < 16; i++) { const k = 1 - 0.45 * (i + 0.75) / 16; collider(0, i * H / 16, 0, W * k, H / 16, D * k, { noNav: i < 15 }); }
  let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 60; i++) { const f = 0.08 + rnd() * 0.78, y = f * H, k = 1 - 0.45 * f; const s = rnd() < 0.5 ? -1 : 1; B.nearBox(x + s * (W * k / 2 + 0.25), y, z + (rnd() - 0.5) * (D * k - 4), 1.3, 1.3, 1.3 + rnd() * 2.2, { ink: BK }); }
  box(W / 2 - 1, 0, 0, 2, 3.2, 14, { ink: BK });
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
  slab(-Dx / 2, -Lz / 2, Dx / 2, Lz / 2, FY, 0.5);
  // térreo envidraçado recuado sob o piso (antes era um pódio sólido sem desenho = parede invisível em volta)
  if (FY > 1.6) box(0, 0, 0, Dx - 4, FY - 0.5, Lz - 4, { ink: BL }); else collider(0, 0, 0, Dx, FY - 0.5, Lz);
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
  const { box, cyl, addGeo, collider } = B;
  const oy = terrainHeight((xMin + xMax) / 2, zEdge);   // orla acompanha o relevo da borda leste (caimento pro lago)
  const g = new THREE.PlaneGeometry(xMax - xMin + 900, 1300); g.rotateX(-Math.PI / 2); g.translate((xMin + xMax) / 2, -0.4 + oy, zEdge + 30 + 650); addGeo(g, BL);
  // orla com calçadão, gramado e mureta protetora sólida
  box((xMin + xMax) / 2, -0.85 + oy, zEdge + 15, xMax - xMin + 200, 0.85, 30, { ink: GN });
  box((xMin + xMax) / 2, oy, zEdge + 29.5, xMax - xMin + 200, 1.2, 0.8, { ink: BK });
  // Colisor plano de água para evitar queda no abismo do mapa
  collider((xMin + xMax) / 2, -1.2 + oy, zEdge + 30 + 650, xMax - xMin + 900, 0.8, 1300, { noNav: true, noGrapple: true });
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
