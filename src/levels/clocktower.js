// Map 4: Torre do Relógio (Clock Tower). A gothic courtyard around one tall climbable clock tower:
// stacked floors reached by switchback stairs, arched windows to shoot through, a giant clock face
// and a bell up top, buttresses and cover below, exposed sniper balconies on the walls.
import * as THREE from 'three';
import { INK } from '../render.js';

export function buildClockTower(B, arena = false) {
  const { L, box, slab, wallX, wallZ, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider } = B;
  const BK = INK.BLACK, BL = INK.BLUE, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK, RD = INK.RED;
  L.key = 'clocktower';
  const P = arena ? 60 : 50, T = 6, PH = 26;
  L.bounds.minX = -P; L.bounds.maxX = P; L.bounds.minZ = -P; L.bounds.maxZ = P;
  L.playerStart.set(0, 0, 38);

  // ground + perimeter walls with tall arched window gaps
  box(0, -1, 0, 2 * P + T, 1, 2 * P + T);
  for (const [cx, cz, ax] of [[0, -P, 1], [0, P, 1], [-P, 0, 0], [P, 0, 0]]) {
    if (ax) wallX(-P, P, cz, 0, PH, T, [[-34, -26, 3, 11], [-8, 8, 3, 13], [26, 34, 3, 11]]);
    else wallZ(-P, P, cx, 0, PH, T, [[-34, -26, 3, 11], [-8, 8, 3, 13], [26, 34, 3, 11]]);
  }
  // an invisible lid so nobody leaves through the sky; the hook will not bite it
  collider(0, PH + 14, 0, 2 * P + 40, 8, 2 * P + 40, { noNav: true, noGrapple: true });

  // ---------------- the central clock tower ----------------
  const W = 13, hw = W / 2, FH = 5;
  // corner pillars
  for (const [px, pz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) box(px, 0, pz, 1, FH * 4 + 2, 1, { ink: BK });
  // four interior floors, each a ring-walkway with a central hole, reached by switchback stairs
  for (let f = 1; f <= 4; f++) {
    const y = f * FH;
    slab(-hw, -hw, hw, -hw + 2.4, y, 0.4); slab(-hw, hw - 2.4, hw, hw, y, 0.4);
    slab(-hw, -hw, -hw + 2.4, hw, y, 0.4); slab(hw - 2.4, -hw, hw, hw, y, 0.4);
    rail(-hw + 2.4, -hw + 2.4, hw - 2.4, -hw + 2.4, y); rail(-hw + 2.4, hw - 2.4, hw - 2.4, hw - 2.4, y);
    rail(-hw + 2.4, -hw + 2.4, -hw + 2.4, hw - 2.4, y); rail(hw - 2.4, -hw + 2.4, hw - 2.4, hw - 2.4, y);
  }
  // switchback stairs climbing the inside of the tower, alternating walls each floor
  let y = 0;
  for (let f = 0; f < 4; f++) {
    const dir = f % 2 === 0 ? '+x' : '-x'; const sx = dir === '+x' ? -hw + 0.6 : hw - 0.6; const lane = (f % 2 === 0 ? -hw + 1.2 : hw - 1.2);
    stairs(sx, y, lane, dir, 14, 2.0, { rise: FH / 14, run: 0.5 }); y += FH;
  }
  // belfry roof with the bell and grapple rings
  slab(-hw, -hw, hw, hw, FH * 4 + 2, 0.5); rail(-hw, -hw, hw, -hw, FH * 4 + 2); rail(-hw, hw, hw, hw, FH * 4 + 2); rail(-hw, -hw, -hw, hw, FH * 4 + 2); rail(hw, -hw, hw, hw, FH * 4 + 2);
  addGeo(new THREE.ConeGeometry(hw + 1, 6, 4).rotateY(Math.PI / 4).translate(0, FH * 4 + 6, 0), BL);
  sphere(0, FH * 4 + 4.4, 0, 1.1, { ink: OR }); ring(0, FH * 4 + 3, 0, 'y'); ring(0, FH * 4 + 9.5, 0, 'y');

  // giant clock faces on the south and north walls of the tower (near the top)
  for (const sz of [-hw - 0.05, hw + 0.05]) {
    const cy = FH * 3 + 1.5;
    addGeo(new THREE.CylinderGeometry(2.6, 2.6, 0.2, 20).rotateX(Math.PI / 2).translate(0, cy, sz), PK);
    addGeo(new THREE.TorusGeometry(2.6, 0.18, 6, 24).translate(0, cy, sz), BK);
    box(0, cy, sz, 0.18, 2.1, 0.3, { noCollide: true, ink: BK });   // minute hand
    box(0, cy, sz, 1.4, 0.18, 0.3, { noCollide: true, ink: BK });   // hour hand
  }

  // ---------------- courtyard: buttresses, cover, low walls, a fountain ----------------
  for (const [x, z] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) { box(x, 0, z, 3, 9, 3, { ink: BK }); box(x, 9, z, 2, 2, 2, { ink: OR }); ring(x, 12.5, z, 'y'); }
  // arched buttress bridges from corners toward the tower (grappling/flanking routes)
  for (const [x, z] of [[-18, -18], [18, -18], [-18, 18], [18, 18]]) box(x, 5.5, z, 7, 0.4, 2.2, { ink: OR });
  // low cover scattered around
  for (const [x, z, w, h, d, ink] of [[-14, 0, 2.4, 1.2, 2.4, BL], [14, 0, 2.4, 1.2, 2.4, BL], [0, -16, 4, 1.1, 1.2, GN], [0, 16, 4, 1.1, 1.2, GN], [-22, 8, 1.4, 1.6, 3, BL], [22, -8, 1.4, 1.6, 3, BL], [-8, -22, 3, 1, 1.4, OR], [8, 22, 3, 1, 1.4, OR]]) box(x, 0, z, w, h, d, { ink });
  // perimeter sniper balconies
  for (const [x, z, w, d] of [[-P + 4, 0, 1.4, 10], [P - 4, 0, 1.4, 10], [0, -P + 4, 10, 1.4], [0, P - 4, 10, 1.4]]) { box(x, 11, z, w, 0.5, d); ring(x, 15, z, 'y'); sniper(x, 11, z); }

  // ---------------- where things are ----------------
  for (const [x, z] of [[0, 34], [0, -34], [-34, 0], [34, 0], [-34, -34], [34, 34], [-34, 34], [34, -34]]) spawn(x, 0, z);
  spawn(0, FH, 0); spawn(0, FH * 2, 0);
  for (const [x, y2, z] of [[-26, 9, -26], [26, 9, 26], [0, FH * 3 + 2, 0]]) sniper(x, y2, z);
  for (const [x, z] of [[0, 0], [-14, 14], [14, -14], [0, 24], [0, -24], [-24, 0], [24, 0]]) pickup(x, 0, z);
  pickup(0, FH * 2, 0);
  for (const [x, y2, z] of [[0, 34, 0], [0, 0, 34], [0, 0, -34], [-34, 0, 0], [34, 0, 0], [-26, 9, -26], [26, 9, 26], [-26, 9, 26], [26, 9, -26], [0, FH, 2], [0, FH * 3 + 2, 0], [-44, 0, 44], [44, 0, -44]]) L.arenaSpawns.push(new THREE.Vector3(x, y2, z));

  // ---------------- sky ----------------
  addGeo(new THREE.SphereGeometry(10, 12, 9).translate(-80, 95, -150), OR);
  for (const [cx, cy, cz] of [[70, 80, -160], [-110, 70, 60], [40, 90, 150]]) for (let i = 0; i < 5; i++) sphere(cx + (i - 2) * 6, cy + Math.sin(i) * 3, cz, 5, { seg: 8, ink: BL });
  planes(3, 34, 30, { rStep: 8, hStep: 6, scale: 1.5 });
  return B.finish();
}
