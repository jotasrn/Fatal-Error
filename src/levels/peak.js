// Map 5: Pico (Peak). A cluster of tiered buildings climbing a hill, inspired by Free Fire's Peak:
// a tall central block with stacked floors and a rooftop, shorter buildings around it at different
// heights, ramps and plank bridges linking the roofs, open plaza cover below and exposed roof
// sniper nests. Lots of verticality and long sightlines.
import * as THREE from 'three';
import { INK } from '../render.js';

export function buildPeak(B, arena = false) {
  const { L, box, slab, wallX, wallZ, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider } = B;
  const BK = INK.BLACK, BL = INK.BLUE, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK;
  L.key = 'peak';
  const P = arena ? 64 : 54, T = 6, PH = 20;
  L.bounds.minX = -P; L.bounds.maxX = P; L.bounds.minZ = -P; L.bounds.maxZ = P;
  L.playerStart.set(0, 0, 42);

  box(0, -1, 0, 2 * P + T, 1, 2 * P + T);
  box(0, 0, -P, 2 * P + T, PH, T); box(0, 0, P, 2 * P + T, PH, T); box(-P, 0, 0, T, PH, 2 * P + T); box(P, 0, 0, T, PH, 2 * P + T);
  collider(0, PH + 16, 0, 2 * P + 40, 8, 2 * P + 40, { noNav: true, noGrapple: true });

  // a building: solid block, flat roof with a parapet + a rooftop hut, a door gap, and a switchback
  // stair up the back face to the roof. Returns the roof height.
  const building = (x, z, w, d, h, ink) => {
    box(x, 0, z, w, h, d, { ink });
    box(x, h, z, w + 0.5, 0.35, d + 0.5, { ink: BK });             // roof lip
    rail(x - w / 2, z - d / 2, x + w / 2, z - d / 2, h + 0.35); rail(x - w / 2, z + d / 2, x + w / 2, z + d / 2, h + 0.35);
    rail(x - w / 2, z - d / 2, x - w / 2, z + d / 2, h + 0.35); rail(x + w / 2, z - d / 2, x + w / 2, z + d / 2, h + 0.35);
    box(x, h + 0.35, z, 3, 2.2, 2.6, { ink: OR });                 // rooftop hut
    box(x + w / 2 + 0.01, 0, z, 0.2, 3, 1.6, { noCollide: true, ink: BK }); // door
    const n = Math.round(h / 0.32);
    stairs(x - w / 2 - 0.3, 0, z + d / 2 + 1.0, '+x', n, 1.8, { rise: h / n, run: 0.44 });
    ring(x, h + 3.2, z, 'y');
    return h;
  };

  // central tall block with multiple interior floors
  {
    const x = 0, z = 0, w = 16, d = 16, FH = 4.5, floors = 4;
    for (const [px, pz] of [[-w / 2 + 0.6, -d / 2 + 0.6], [w / 2 - 0.6, -d / 2 + 0.6], [-w / 2 + 0.6, d / 2 - 0.6], [w / 2 - 0.6, d / 2 - 0.6]]) box(x + px, 0, z + pz, 1.1, FH * floors + 1, 1.1, { ink: BK });
    for (let f = 1; f <= floors; f++) slab(x - w / 2, z - d / 2, x + w / 2, z + d / 2, f * FH, 0.4);
    // perimeter walls per floor with window gaps, open ground floor (pillars only)
    for (let f = 1; f < floors; f++) {
      const y0 = f * FH;
      wallX(x - w / 2, x + w / 2, z - d / 2, y0, FH - 0.4, 0.3, [[-5, 5, 1, 3]]);
      wallX(x - w / 2, x + w / 2, z + d / 2, y0, FH - 0.4, 0.3, [[-5, 5, 1, 3]]);
      wallZ(z - d / 2, z + d / 2, x - w / 2, y0, FH - 0.4, 0.3, [[-5, 5, 1, 3]]);
      wallZ(z - d / 2, z + d / 2, x + w / 2, y0, FH - 0.4, 0.3, [[-5, 5, 1, 3]]);
    }
    // interior switchback stairs to the top
    let y = 0;
    for (let f = 0; f < floors; f++) { const dir = f % 2 === 0 ? '+x' : '-x'; const sx = dir === '+x' ? x - w / 2 + 0.8 : x + w / 2 - 0.8; const lane = f % 2 === 0 ? z - d / 2 + 1.4 : z + d / 2 - 1.4; stairs(sx, y, lane, dir, 13, 2, { rise: FH / 13, run: 0.5 }); y += FH; }
    // rooftop: parapet, antenna, grapple rings
    for (const [a, b, c, e] of [[-w / 2, -d / 2, w / 2, -d / 2], [-w / 2, d / 2, w / 2, d / 2], [-w / 2, -d / 2, -w / 2, d / 2], [w / 2, -d / 2, w / 2, d / 2]]) rail(a, b, c, e, FH * floors);
    box(x + 4, FH * floors, z + 4, 0.2, 5, 0.2, { noCollide: true, ink: BK }); ring(x + 4, FH * floors + 5, z + 4, 'y'); ring(x, FH * floors + 3, z, 'y');
    sniper(x, FH * floors, z); spawn(x, FH, 0); spawn(x, FH * 2, 0); pickup(x, FH * 3, 0);
    L.arenaSpawns.push(new THREE.Vector3(x, FH * floors, z), new THREE.Vector3(x, FH, 2), new THREE.Vector3(x, FH * 2, -2));
  }

  // surrounding buildings at varied heights, roofs linked by plank bridges toward the center
  const rings = [];
  for (const [x, z, w, d, h, ink] of [[-34, -30, 16, 14, 9, BL], [34, -30, 14, 14, 12, GN], [-34, 30, 15, 14, 7, OR], [34, 30, 16, 14, 10, BL], [-42, 0, 12, 18, 14, PK], [42, 0, 12, 18, 8, GN]]) {
    const rh = building(x, z, w, d, h, ink); rings.push([x, z, rh]);
    sniper(x, rh, z); spawn(x, 0, z + d / 2 + 2); pickup(x, rh, z - 2);
    L.arenaSpawns.push(new THREE.Vector3(x, rh, z), new THREE.Vector3(x, 0, z + d / 2 + 2));
  }
  // plank bridges from a couple of the taller roofs toward the center tower's mid floors
  box(-20, 9, -15, 14, 0.4, 2.2, { ink: OR }); rail(-27, -15, -13, -15, 9, { ink: OR });
  box(20, 10, -15, 14, 0.4, 2.2, { ink: OR }); rail(13, -15, 27, -15, 10, { ink: OR });
  box(0, 8, 24, 2.2, 0.4, 16, { ink: OR });   // walkway to the north pair

  // plaza cover between buildings
  for (const [x, z, w, h, d, ink] of [[-14, -14, 2.4, 1.4, 2.4, BK], [14, -14, 2.4, 1.4, 2.4, BK], [-14, 14, 3, 1, 1.6, GN], [14, 14, 3, 1, 1.6, GN], [0, -28, 4, 1.2, 1.4, BL], [0, 28, 4, 1.2, 1.4, BL], [-24, 0, 1.4, 1.6, 3, OR], [24, 0, 1.4, 1.6, 3, OR]]) box(x, 0, z, w, h, d, { ink });

  // ground spawns + pickups around the plaza
  for (const [x, z] of [[0, 40], [0, -40], [-40, -40], [40, -40], [-40, 40], [40, 40], [-48, 0], [48, 0]]) spawn(x, 0, z);
  for (const [x, z] of [[0, 0], [-16, -16], [16, 16], [0, 30], [0, -30], [-30, 0], [30, 0], [-16, 16], [16, -16]]) pickup(x, 0, z);
  for (const [x, z] of [[0, 44], [0, -44], [-48, 0], [48, 0], [-48, 48], [48, -48]]) L.arenaSpawns.push(new THREE.Vector3(x, 0, z));

  // sky
  addGeo(new THREE.SphereGeometry(12, 12, 9).translate(80, 100, -150), OR);
  for (const [cx, cy, cz] of [[-90, 80, -140], [60, 95, 160], [130, 70, 50]]) for (let i = 0; i < 6; i++) sphere(cx + (i - 2.5) * 6, cy + Math.sin(i * 1.4) * 3, cz, 5, { seg: 8, ink: BL });
  planes(4, 34, 28, { rStep: 9, hStep: 6, scale: 1.6 });
  return B.finish();
}
