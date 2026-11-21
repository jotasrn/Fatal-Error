// Real-time environmental destruction & breakable props (Titans, Tanks, Convoys, Bombers, Explosions).
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../core/render.js';
import { rand, clamp } from '../core/util.js';

const _debrisMatDark = makeInkMaterial({ ink: INK.BLACK, fill: true });
const _debrisMatGreen = makeInkMaterial({ ink: INK.GREEN, fill: true });
const _debrisMatOrange = makeInkMaterial({ ink: INK.ORANGE, fill: true });

export function createDestruction(ctx, deps) {
  const { world, effects, audio, scene } = deps;
  const { net, game, spawnPickup } = deps;

  function breakProp(br, dir, local, quiet = false) {
    if (!br.alive) return;
    br.alive = false;
    world.removeBox(br.box);
    const g = br.group, pos = br.pos;
    const d = dir && dir.lengthSq() > 0.01 ? dir.clone().normalize() : new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)).normalize();
    if (quiet) { scene.remove(g); return; }
    g.updateMatrixWorld(true);
    for (const child of [...g.children]) {
      child.updateWorldMatrix(true, false);
      scene.attach(child);
      const v = d.clone().multiplyScalar(rand(2, 6));
      v.x += rand(-3, 3); v.z += rand(-3, 3); v.y += rand(2.5, 6.5);
      effects.debris(child, child.position, v, new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), { radius: 0.14, blood: false, life: rand(6, 9) });
    }
    scene.remove(g);
    const up = new THREE.Vector3(0, 1, 0);
    effects.strokeBurst(pos, br.ink, 12, 5, { life: 0.35, size: 0.04 });
    effects.smoke(pos, up, 3);
    audio.smash(pos, br.kind === 'barrel' || br.kind === 'crate');
    if (local && net.active) net.broadcast('brk', { id: br.id });
    if (game && game.mode === 'solo' && br.kind === 'crate' && Math.random() < 0.25 && spawnPickup) {
      spawnPickup('ammo', pos.clone());
    }
  }

  function destroyEnvironmentAt(c, rad, dir = null) {
    if (ctx.blastBreakables) ctx.blastBreakables(c, rad * 1.15);
    const now = performance.now();
    const level = ctx.level;
    if (level && level.cars) {
      for (const car of level.cars) {
        if (car.hidden) continue;
        const dx = car.x - c.x, dz = car.z - c.z;
        if (dx * dx + dz * dz < (rad + 1.8) * (rad + 1.8) && Math.abs((car.y || 0) - c.y) < 5.5) {
          car.hidden = true;
          car._wreckRespawnAt = now + 30000;
          if (car.group) car.group.visible = false;
          const cPos = new THREE.Vector3(car.x, (car.y || 0) + 0.8, car.z);
          effects.explosion(cPos, 4.2, INK.ORANGE);
          audio.explosion(cPos);
          for (let k = 0; k < 5; k++) {
            const piece = new THREE.Mesh(new THREE.BoxGeometry(rand(0.4, 1.1), rand(0.25, 0.6), rand(0.4, 1.2)), k % 2 ? _debrisMatOrange : _debrisMatDark);
            piece.position.copy(cPos);
            scene.add(piece);
            const v = new THREE.Vector3(dx + rand(-5, 5), rand(4, 10), dz + rand(-5, 5)).normalize().multiplyScalar(rand(7, 14));
            v.y = rand(5, 11);
            effects.debris(piece, piece.position, v, new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), { radius: 0.3, blood: false, life: rand(5, 8) });
          }
        }
      }
    }

    const qMin = new THREE.Vector3(c.x - rad, c.y - 1.5, c.z - rad);
    const qMax = new THREE.Vector3(c.x + rad, c.y + 12, c.z + rad);
    const candidates = world.query(qMin, qMax, []);
    for (let i = 0; i < candidates.length; i++) {
      const b = candidates[i];
      if (!b || b._removed || b.data.indestructible) continue;
      const bw = b.max.x - b.min.x, bh = b.max.y - b.min.y, bd = b.max.z - b.min.z;
      const gT = world.terrainAt ? world.terrainAt((b.min.x + b.max.x) * 0.5, (b.min.z + b.max.z) * 0.5) : NaN;
      if (bh <= 0.48 || bw > 11.5 || bd > 11.5 || bh > 20 || b.min.y < (gT === gT ? gT : 0) - 1.2) continue; // nada enterrado (relativo ao relevo)
      const bx = (b.min.x + b.max.x) * 0.5, by = (b.min.y + b.max.y) * 0.5, bz = (b.min.z + b.max.z) * 0.5;
      if (Math.hypot(bx - c.x, bz - c.z) > rad + Math.max(bw, bd) * 0.4) continue;
      world.removeBox(b);
      if (true) {
        const bPos = new THREE.Vector3(bx, by, bz);
        const isTreeLike = bw < 2.4 && bd < 2.4 && bh > 2.2;
        for (let k = 0; k < 3; k++) {
          const chunk = new THREE.Mesh(
            new THREE.BoxGeometry(clamp(bw * 0.45, 0.3, 1.4), clamp(bh * 0.3, 0.3, 1.4), clamp(bd * 0.45, 0.3, 1.4)),
            isTreeLike && k === 0 ? _debrisMatGreen : _debrisMatDark
          );
          chunk.position.set(bx + rand(-0.4, 0.4), by + rand(-0.4, 0.4), bz + rand(-0.4, 0.4));
          scene.add(chunk);
          const pushDir = dir && dir.lengthSq() > 0.01 ? dir.clone().normalize() : new THREE.Vector3(bx - c.x, 0.5, bz - c.z).normalize();
          const vel = pushDir.multiplyScalar(rand(6, 13));
          vel.x += rand(-4, 4); vel.z += rand(-4, 4); vel.y = rand(4, 9.5);
          effects.debris(chunk, chunk.position, vel, new THREE.Vector3(rand(-7, 7), rand(-7, 7), rand(-7, 7)), { radius: 0.25, blood: false, life: rand(4.5, 7.5) });
        }
        effects.smoke(bPos, new THREE.Vector3(0, 1, 0), 3);
        audio.smash(bPos, true);
      }
    }
  }

  return { breakProp, destroyEnvironmentAt };
}
