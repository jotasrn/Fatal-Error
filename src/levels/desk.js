// Map 3: The Study Desk. You are two inches tall on a school desk — book-stack towers, a pencil
// cup in the middle, ruler bridges between the stacks, erasers for ground cover and sharpeners.
import * as THREE from 'three';
import { INK } from '../render.js';

export function buildDesk(B, arena = false) {
  const { L, box, slab, wallX, wallZ, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider } = B;
  L.key = 'desk';
  const P = arena ? 64 : 52, T = 6, PH = 24;
  L.bounds.minX = -P; L.bounds.maxX = P; L.bounds.minZ = -P; L.bounds.maxZ = P;
  L.playerStart.set(0, 0, 36);

  const BK = INK.BLACK, BL = INK.BLUE, RD = INK.RED, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK;

  // Chão da Mesa de Estudos
  box(0, -1, 0, 2 * P + T, 1, 2 * P + T, { ink: BL });
  // Paredes perimetrais
  box(0, 0, -P, 2 * P + T, PH, T, { ink: BL });
  box(0, 0, P, 2 * P + T, PH, T, { ink: BL });
  box(-P, 0, 0, T, PH, 2 * P + T, { ink: BL });
  box(P, 0, 0, T, PH, 2 * P + T, { ink: BL });

  // Pilhas de livros (Book Stacks)
  const bookStack = (x, z, count, w = 12, d = 9) => {
    let y = 0;
    const colors = [BL, RD, GN, OR, PK];
    for (let i = 0; i < count; i++) {
      const bh = 0.95;
      box(x + (i % 2 === 0 ? 0.2 : -0.2), y, z + (i % 3 === 0 ? 0.2 : -0.2), w - i * 0.4, bh, d - i * 0.35, { ink: colors[i % colors.length] });
      y += bh;
    }
    return y;
  };

  // 4 Grandes Torres de Livros nos quadrantes
  const h1 = bookStack(-25, -25, 7, 13, 10);
  const h2 = bookStack(25, -25, 8, 13, 10);
  const h3 = bookStack(-25, 25, 6, 13, 10);
  const h4 = bookStack(25, 25, 7, 13, 10);

  // Pontes de Régua de Madeira entre os livros
  const rulerBridge = (x1, z1, x2, z2, y) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const ax = Math.abs(x2 - x1) > Math.abs(z2 - z1);
    box(cx, y, cz, ax ? len : 2.4, 0.25, ax ? 2.4 : len, { ink: OR });
  };
  rulerBridge(-25, -25, 25, -25, 6.2);
  rulerBridge(-25, 25, 25, 25, 5.4);
  rulerBridge(-25, -25, -25, 25, 5.4);
  rulerBridge(25, -25, 25, 25, 6.2);

  // Copo de Lápis Central
  cyl(0, 0, 0, 6, 4.5, { ink: BL });
  // Lápis gigantes
  cyl(-2, 0, -1, 0.45, 14, { ink: RD });
  cyl(2, 0, 1.5, 0.5, 16, { ink: GN });
  cyl(-1.5, 0, 2, 0.45, 15, { ink: OR });
  cyl(1.8, 0, -2, 0.5, 13, { ink: BL });

  // Anéis de gancho no alto
  ring(0, 8.5, 0);
  ring(-2, 14, -1);
  ring(2, 16, 1.5);
  ring(-1.5, 15, 2);

  // Borrachas escolares para cobertura no solo
  const eraser = (x, z) => { box(x, 0, z, 3.6, 1.2, 1.9, { ink: PK }); };
  eraser(-11, -11); eraser(11, -11); eraser(-11, 11); eraser(11, 11);
  eraser(-38, 0); eraser(38, 0); eraser(0, -38); eraser(0, 38);

  // Apontadores de lápis
  const sharpener = (x, z) => {
    box(x, 0, z, 4.2, 2.2, 3.2, { ink: BL });
    cyl(x, 0.8, z + 1.6, 0.7, 0.4, { ink: BK });
  };
  sharpener(-16, -34); sharpener(16, -34);
  sharpener(-16, 34); sharpener(16, 34);

  // Anéis adicionais
  for (const [x, z, h] of [[-25, 0, 6], [25, 0, 6], [0, -20, 5], [0, 20, 5]]) ring(x, h, z);

  // Spawns de snipers nas pilhas de livros
  for (const [x, y, z] of [[-25, h1, -25], [25, h2, -25], [-25, h3, 25], [25, h4, 25]]) sniper(x, y, z);

  // Spawns terrestres
  for (const [x, y, z] of [
    [-36, 0, -36], [36, 0, -36], [-36, 0, 36], [36, 0, 36],
    [-20, 0, 0], [20, 0, 0], [0, 0, -28], [0, 0, 28]
  ]) spawn(x, y, z);

  // Pickups
  for (const [x, z] of [[-25, -25], [25, -25], [-25, 25], [25, 25], [0, 0], [-12, -12], [12, 12]]) pickup(x, 0, z);

  // Aviões de papel voando
  planes(3, 22, 26, { rStep: 8, hStep: 5, scale: 1.3 });

  B.finish();
  return L;
}
