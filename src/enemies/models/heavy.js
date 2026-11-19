import * as THREE from 'three';
import { makeInkMaterial, INK } from '../../core/render.js';
import { TAU } from '../../core/util.js';
import {
  bx, sph, blob, noodle, mitten, shoe, doodleFace, buildHat, dressHumanoid,
} from './kits.js';

export function buildTitan(mat, solid, T) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const isArmored = T.model === 'titan_armored';
  const build = T.build || {};
  const bodyW = build.bodyW ?? 1.45, headS = build.headS ?? 0.96, limbR = build.limbR ?? 0.056;
  const armorMat = makeInkMaterial({ ink: isArmored ? INK.ORANGE : INK.BLACK, shadeScale: 0, shadeBias: 1 });
  const glowMat = makeInkMaterial({ ink: isArmored ? INK.ORANGE : INK.GREEN, fill: true });
  const fleshMat = makeInkMaterial({ ink: INK.RED, fill: true });

  const hips = new THREE.Group(); hips.position.y = 0.88; root.add(hips);
  parts.hips = new THREE.Object3D(); hips.add(parts.hips);
  const torso = new THREE.Group(); torso.position.y = 0.04; hips.add(torso);
  // Colossal muscular chest & exposed muscle fibers
  blob(0.32 * bodyW, 0.33, 0.21 * bodyW, 0, 0.28, 0, mat, torso);
  parts.torso = new THREE.Object3D(); parts.torso.position.y = 0.28; torso.add(parts.torso);
  if (isArmored) {
    // Overlapping Armored Titan chest, abdominal & shoulder plates
    bx(0.52 * bodyW, 0.24, 0.32 * bodyW, 0, 0.38, 0.04, armorMat, torso);
    bx(0.38 * bodyW, 0.22, 0.28 * bodyW, 0, 0.14, 0.03, armorMat, torso);
    for (const sx of [-1, 1]) {
      bx(0.22 * bodyW, 0.18, 0.28 * bodyW, sx * 0.28 * bodyW, 0.48, 0, armorMat, torso);
      bx(0.18 * bodyW, 0.05, 0.3 * bodyW, sx * 0.14 * bodyW, 0.26, 0.05, fleshMat, torso);
    }
  } else {
    // Eren Attack Titan defined pecs, abs & ribs
    for (const sx of [-1, 1]) {
      blob(0.14 * bodyW, 0.11, 0.12 * bodyW, sx * 0.13 * bodyW, 0.38, 0.09, fleshMat, torso);
      for (let r = 0; r < 3; r++) bx(0.1 * bodyW, 0.045, 0.08, sx * 0.08 * bodyW, 0.24 - r * 0.07, 0.14, solid, torso);
    }
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.15, 7), mat); neck.position.y = 0.58; torso.add(neck);
  const headG = new THREE.Group(); headG.position.y = 0.64; torso.add(headG);
  blob(0.28 * headS, 0.31 * headS, 0.26 * headS, 0, 0.26, 0, isArmored ? armorMat : mat, headG);
  parts.head = new THREE.Object3D(); parts.head.position.y = 0.26; headG.add(parts.head);

  const faceG = new THREE.Group(); faceG.position.y = 0.26; faceG.scale.setScalar(headS); headG.add(faceG);
  const fc = doodleFace(faceG, glowMat, { ez: 0.26, er: 0.052, smile: true });
  // Titan roaring jaw & teeth
  bx(0.24, 0.08, 0.18, 0, -0.17, 0.14, solid, faceG);
  bx(0.2, 0.035, 0.06, 0, -0.14, 0.23, armorMat, faceG);
  if (isArmored) {
    // Armored faceplate & white hair crest
    bx(0.32, 0.14, 0.12, 0, 0.08, 0.2, armorMat, faceG);
    bx(0.36, 0.16, 0.32, 0, 0.24, -0.02, armorMat, faceG);
  } else {
    // Eren's long dark hair & pointed ears
    const mane = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 7, 0, TAU, 0, Math.PI * 0.65), solid);
    mane.position.set(0, 0.04, -0.03); headG.add(mane);
    for (const sx of [-1, 1]) {
      bx(0.07, 0.36, 0.16, sx * 0.24, 0.14, 0.05, solid, headG);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 4), mat);
      ear.position.set(sx * 0.29, 0.26, 0); ear.rotation.z = -sx * 1.1; headG.add(ear);
    }
  }

  const shY = 0.48, shX = 0.28 * bodyW;
  const armL = noodle(0.34, limbR, mat, torso, -shX, shY, 0), armR = noodle(0.34, limbR, mat, torso, shX, shY, 0);
  const foreL = noodle(0.32, limbR * 0.96, isArmored ? armorMat : mat, armL, 0, -0.34, 0);
  const foreR = noodle(0.32, limbR * 0.96, isArmored ? armorMat : mat, armR, 0, -0.34, 0);
  // Hardened Titan fists
  mitten(limbR * 2.5, isArmored ? armorMat : solid, foreL, -0.32);
  mitten(limbR * 2.5, isArmored ? armorMat : solid, foreR, -0.32);

  const legL = noodle(0.44, limbR * 1.2, isArmored ? armorMat : mat, hips, -0.14 * bodyW, -0.02, 0);
  const legR = noodle(0.44, limbR * 1.2, isArmored ? armorMat : mat, hips, 0.14 * bodyW, -0.02, 0);
  const shinL = noodle(0.44, limbR * 1.1, mat, legL, 0, -0.44, 0);
  const shinR = noodle(0.44, limbR * 1.1, mat, legR, 0, -0.44, 0);
  shoe(isArmored ? armorMat : mat, shinL, -0.44, bodyW * 0.85);
  shoe(isArmored ? armorMat : mat, shinR, -0.44, bodyW * 0.85);

  for (const [k, g] of [['armL', armL], ['armR', armR], ['foreL', foreL], ['foreR', foreR], ['legL', legL], ['legR', legR], ['shinL', shinL], ['shinR', shinR]]) parts[k] = g.userData.mid;
  const gun = new THREE.Group(); gun.position.set(0, -0.3, 0.08); foreR.add(gun);
  const tip = new THREE.Object3D(); tip.position.set(0, 0, 0.25); gun.add(tip);

  Object.assign(J, { hips, torso, headG, armL, armR, foreL, foreR, legL, legR, shinL, shinR, gun });
  const hit = [['head', 0.32], ['torso', 0.38], ['hips', 0.25], ['armL', 0.14], ['armR', 0.14], ['foreL', 0.13], ['foreR', 0.13], ['legL', 0.16], ['legR', 0.16], ['shinL', 0.14], ['shinR', 0.14]];
  root.scale.setScalar(T.scale);
  return { root, parts, J, tip, face: fc, hit };
}

export function buildCavalry(mat, solid, T) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const riderMat = makeInkMaterial({ ink: INK.BLACK, shadeScale: 0, shadeBias: 1 });
  const accMat = makeInkMaterial({ ink: INK.RED, fill: true });
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  parts.hips = hips;
  const torso = new THREE.Group(); hips.add(torso);
  // Warhorse body, saddle & chest barding
  blob(0.36, 0.36, 0.82, 0, 0.18, 0, mat, torso);
  bx(0.48, 0.18, 0.55, 0, 0.42, -0.05, solid, torso); // tactical saddle
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.65, 5), solid);
  tail.position.set(0, 0.24, -0.82); tail.rotation.x = -0.85; torso.add(tail);
  J.tail = tail;

  // Horse neck & armored head
  const neck = bx(0.24, 0.55, 0.32, 0, 0.55, 0.58, mat, torso); neck.rotation.x = 0.45;
  const horseHead = new THREE.Group(); horseHead.position.set(0, 0.82, 0.78); torso.add(horseHead);
  bx(0.22, 0.22, 0.46, 0, -0.04, 0.14, mat, horseHead).rotation.x = 0.35;
  bx(0.24, 0.08, 0.42, 0, 0.06, 0.16, solid, horseHead).rotation.x = 0.35; // armored chamfron
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), mat);
    ear.position.set(sx * 0.1, 0.14, -0.02); horseHead.add(ear);
  }

  // Horse legs
  const legFL = noodle(0.58, 0.042, mat, torso, -0.22, 0.05, 0.52);
  const legFR = noodle(0.58, 0.042, mat, torso, 0.22, 0.05, 0.52);
  const legBL = noodle(0.6, 0.046, mat, torso, -0.22, 0.05, -0.52);
  const legBR = noodle(0.6, 0.046, mat, torso, 0.22, 0.05, -0.52);
  J.legFL = legFL; J.legFR = legFR; J.legBL = legBL; J.legBR = legBR;
  J.legL = legFL; J.legR = legFR;

  // Mounted Cavalry Rider on top of saddle
  const rider = new THREE.Group(); rider.position.set(0, 0.48, -0.04); torso.add(rider);
  blob(0.26, 0.28, 0.18, 0, 0.26, 0, riderMat, rider);
  bx(0.34, 0.24, 0.22, 0, 0.28, 0, solid, rider); // tactical vest
  parts.torso = new THREE.Object3D(); parts.torso.position.y = 0.26; rider.add(parts.torso);
  const headG = new THREE.Group(); headG.position.set(0, 0.62, 0); rider.add(headG);
  blob(0.24, 0.26, 0.24, 0, 0.2, 0, riderMat, headG);
  buildHat(headG, solid, accMat, { hat: 'helmet' });
  const fc = doodleFace(headG, accMat, { ez: 0.22, er: 0.04 });
  parts.head = new THREE.Object3D(); parts.head.position.y = 0.2; headG.add(parts.head);

  // Rider arms & cavalry carbine + sabre
  const armL = noodle(0.28, 0.032, riderMat, rider, -0.24, 0.44, 0);
  const armR = noodle(0.28, 0.032, riderMat, rider, 0.24, 0.44, 0);
  armL.rotation.x = -0.8; armR.rotation.x = -1.15;
  const gun = new THREE.Group(); gun.position.set(0, -0.26, 0.12); armR.add(gun);
  bx(0.075, 0.11, 0.54, 0, 0.02, 0.18, solid, gun);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.05, 0.56); gun.add(tip);

  Object.assign(J, { hips, torso, headG, armL, armR, gun });
  const hit = [['head', 0.32], ['torso', 0.46], ['hips', 0.42]];
  root.scale.setScalar(T.scale);
  return { root, parts, J, tip, face: fc, hit };
}

export function buildTank(mat, solid, T) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const isConvoy = T.model === 'convoy';
  const darkMat = makeInkMaterial({ ink: INK.BLACK, fill: true });
  const redMat = makeInkMaterial({ ink: INK.RED, fill: true });

  const hips = new THREE.Group(); hips.position.y = 0.55; root.add(hips);
  parts.hips = hips;
  const torso = new THREE.Group(); hips.add(torso);
  parts.torso = new THREE.Object3D(); parts.torso.position.y = 0.45; torso.add(parts.torso);

  if (isConvoy) {
    // Blindado Tático do Comboio (APC / Armored Assault Truck)
    bx(1.85, 0.72, 3.3, 0, 0.32, 0, mat, torso);
    bx(1.65, 0.55, 1.8, 0, 0.85, -0.25, mat, torso);
    bx(1.55, 0.34, 0.12, 0, 0.86, 0.66, darkMat, torso); // armored windshield visor
    bx(1.95, 0.45, 0.28, 0, 0.22, 1.72, solid, torso); // heavy front rammer bullbar
    for (const sx of [-0.95, 0.95]) {
      for (const sz of [-1.05, 1.05]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), darkMat);
        w.rotation.z = Math.PI / 2; w.position.set(sx, -0.05, sz); torso.add(w);
      }
    }
  } else {
    // Tanque de Guerra Principal (Main Battle Tank)
    bx(2.15, 0.68, 3.5, 0, 0.26, 0, mat, torso); // main armored hull
    bx(1.85, 0.38, 0.75, 0, 0.38, 1.55, solid, torso); // sloped glacis plate
    // Left & right caterpillar tracks
    for (const sx of [-1.05, 1.05]) {
      bx(0.45, 0.56, 3.7, sx, 0.02, 0, darkMat, torso);
      bx(0.5, 0.14, 3.75, sx, 0.32, 0, solid, torso); // track skirts
    }
  }

  // Rotating Turret + Main Cannon (`headG` rotates to track the player in `_animate`)
  const headG = new THREE.Group();
  headG.position.set(0, isConvoy ? 1.22 : 0.78, isConvoy ? -0.15 : 0.1);
  torso.add(headG);
  parts.head = new THREE.Object3D(); parts.head.position.y = 0.2; headG.add(parts.head);

  if (isConvoy) {
    bx(0.85, 0.42, 0.95, 0, 0.16, 0, solid, headG);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.45, 8), darkMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.2, 0.85); headG.add(barrel);
  } else {
    bx(1.38, 0.52, 1.65, 0, 0.2, -0.1, mat, headG);
    bx(0.55, 0.22, 0.55, 0.32, 0.52, -0.25, solid, headG); // commander cupola
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 2.45, 8), darkMat);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(0, 0.22, 1.45); headG.add(cannon);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 8), solid);
    brake.rotation.x = Math.PI / 2; brake.position.set(0, 0.22, 2.65); headG.add(brake);
  }
  const fc = doodleFace(headG, redMat, { ex: 0.24, ey: 0.22, ez: isConvoy ? 0.5 : 0.76, er: 0.06 });
  const tip = new THREE.Object3D();
  tip.position.set(0, 0.22, isConvoy ? 1.6 : 2.75);
  headG.add(tip);

  Object.assign(J, { hips, torso, headG, gun: new THREE.Group() });
  const hit = [['head', 0.62], ['torso', 1.05], ['hips', 0.95]];
  root.scale.setScalar(T.scale);
  return { root, parts, J, tip, face: fc, hit };
}
