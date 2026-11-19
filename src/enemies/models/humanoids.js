import * as THREE from 'three';
import { makeInkMaterial, INK } from '../../core/render.js';
import { rand } from '../../core/util.js';
import {
  V3, bx, sph, blob, noodle, mitten, shoe, doodleFace, buildHat,
  dressHumanoid, buildWeaponProp,
} from './kits.js';

export function buildHumanoid(mat, solid, T) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const build = T.build || {};
  const bodyW = build.bodyW ?? 1, headS = build.headS ?? 1, limbR = build.limbR ?? 0.032;
  const jit = rand(0.95, 1.06); // every figure is drawn slightly differently
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);
  parts.hips = new THREE.Object3D(); hips.add(parts.hips);
  const torso = new THREE.Group(); torso.position.y = 0.04; hips.add(torso);
  blob(0.3 * bodyW, 0.3, 0.19 * bodyW, 0, 0.26, 0, mat, torso);
  parts.torso = new THREE.Object3D(); parts.torso.position.y = 0.26; torso.add(parts.torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 6), mat); neck.position.y = 0.56; torso.add(neck);
  const headG = new THREE.Group(); headG.position.y = 0.62; torso.add(headG);
  const head = blob(0.275 * headS * jit, 0.3 * headS, 0.25 * headS, 0, 0.26, 0, mat, headG);
  parts.head = new THREE.Object3D(); parts.head.position.y = 0.26; headG.add(parts.head);
  const faceG = new THREE.Group(); faceG.position.y = 0.26; faceG.scale.setScalar(headS); headG.add(faceG);
  const fc = doodleFace(faceG, solid, { ez: 0.2 * headS + 0.06, smile: T.weapon === 'blade' });
  const hatG = new THREE.Group(); hatG.position.y = 0.26; hatG.scale.setScalar(headS); headG.add(hatG); buildHat(hatG, mat, solid, T);
  const shY = 0.46, shX = 0.26 * bodyW;
  const armL = noodle(0.3, limbR, mat, torso, -shX, shY, 0), armR = noodle(0.3, limbR, mat, torso, shX, shY, 0);
  const foreL = noodle(0.28, limbR * 0.92, mat, armL, 0, -0.3, 0), foreR = noodle(0.28, limbR * 0.92, mat, armR, 0, -0.3, 0);
  mitten(limbR * 2.3, mat, foreL, -0.3); mitten(limbR * 2.3, mat, foreR, -0.3);
  const legL = noodle(0.42, limbR * 1.15, mat, hips, -0.13 * bodyW, -0.02, 0), legR = noodle(0.42, limbR * 1.15, mat, hips, 0.13 * bodyW, -0.02, 0);
  const shinL = noodle(0.42, limbR * 1.05, mat, legL, 0, -0.42, 0), shinR = noodle(0.42, limbR * 1.05, mat, legR, 0, -0.42, 0);
  shoe(mat, shinL, -0.42, bodyW); shoe(mat, shinR, -0.42, bodyW);
  for (const [k, g] of [['armL', armL], ['armR', armR], ['foreL', foreL], ['foreR', foreR], ['legL', legL], ['legR', legR], ['shinL', shinL], ['shinR', shinR]]) parts[k] = g.userData.mid;
  const gun = new THREE.Group(); gun.position.set(0, -0.29, 0.07); foreR.add(gun); buildWeaponProp(gun, mat, solid, T);
  const tip = new THREE.Object3D(); tip.position.set(0, 0.05, T.weapon === 'blade' ? 0.92 : T.weapon === 'boss' ? 0.4 : 0.78); gun.add(tip);
  let shieldG = null;
  if (T.shield) {
    shieldG = new THREE.Group(); shieldG.position.set(-0.17, 0.34, 0.46); torso.add(shieldG);
    const plate = bx(0.92, 1.3, 0.07, 0, 0, 0, mat, shieldG);
    bx(0.62, 0.06, 0.09, 0, 0.26, 0.04, solid, shieldG); bx(0.06, 0.62, 0.09, 0, 0.26, 0.04, solid, shieldG);
    parts.shield = new THREE.Object3D(); shieldG.add(parts.shield);
  }
  Object.assign(J, { hips, torso, headG, armL, armR, foreL, foreR, legL, legR, shinL, shinR, gun, shieldG });
  if (!T.plain) dressHumanoid(J, hatG, mat, solid, T, bodyW, headS, limbR);
  const hit = [['head', 0.3], ['torso', 0.33], ['hips', 0.2], ['armL', 0.11], ['armR', 0.11], ['foreL', 0.1], ['foreR', 0.1], ['legL', 0.13], ['legR', 0.13], ['shinL', 0.11], ['shinR', 0.11]];
  if (T.shield) hit.unshift(['shield', 0.66]);
  root.scale.setScalar(T.scale);
  return { root, parts, J, tip, face: fc, hit };
}
export function buildBomber(mat, solid, T, boss = false) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const hips = new THREE.Group(); hips.position.y = 0.5; root.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  blob(0.44, 0.44, 0.44, 0, 0.32, 0, mat, torso);
  parts.torso = new THREE.Object3D(); parts.torso.position.y = 0.32; torso.add(parts.torso); parts.head = parts.torso; parts.hips = hips;
  const headG = new THREE.Group(); headG.position.y = 0.32; torso.add(headG);
  const fc = doodleFace(headG, solid, { ex: 0.13, ey: 0.1, ez: 0.38, er: 0.06 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 7), mat); cap.position.y = 0.76; torso.add(cap);
  const fuse = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(0, 0.8, 0), V3(0.16, 1.0, 0), V3(0.24, 1.14, 0)), 5, 0.02, 5, false), solid); torso.add(fuse);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), makeInkMaterial({ ink: INK.ORANGE, fill: true })); spark.position.set(0.24, 1.14, 0); torso.add(spark);
  const armL = noodle(0.26, 0.03, mat, torso, -0.42, 0.42, 0), armR = noodle(0.26, 0.03, mat, torso, 0.42, 0.42, 0);
  mitten(0.07, mat, armL, -0.26); mitten(0.07, mat, armR, -0.26);
  const legL = noodle(0.26, 0.035, mat, hips, -0.16, -0.06, 0), legR = noodle(0.26, 0.035, mat, hips, 0.16, -0.06, 0);
  const shinL = noodle(0.24, 0.032, mat, legL, 0, -0.26, 0), shinR = noodle(0.24, 0.032, mat, legR, 0, -0.26, 0);
  shoe(mat, shinL, -0.24, 0.9); shoe(mat, shinR, -0.24, 0.9);
  Object.assign(J, { hips, torso, headG, armL, armR, foreL: armL, foreR: armR, legL, legR, shinL, shinR, gun: new THREE.Group(), spark });
  root.scale.setScalar(T.scale);
  const tip = spark || (() => { const o = new THREE.Object3D(); o.position.set(0, 0.5, 0.5); torso.add(o); return o; })();
  return { root, parts, J, tip, face: fc, hit: [['torso', 0.5]] };
}
export function buildFlyer(mat, solid, T) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const body = new THREE.Group(); body.position.y = 0.6; root.add(body);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.25, 3), mat); cone.rotation.x = Math.PI / 2; cone.position.z = 0.08; body.add(cone);
  parts.torso = new THREE.Object3D(); body.add(parts.torso); parts.head = parts.torso; parts.hips = body;
  const wl = bx(0.86, 0.025, 0.5, -0.48, 0.04, -0.14, mat, body), wr = bx(0.86, 0.025, 0.5, 0.48, 0.04, -0.14, mat, body);
  const headG = new THREE.Group(); headG.position.set(0, -0.06, 0.3); headG.scale.setScalar(0.72); body.add(headG);
  const fc = doodleFace(headG, solid, { ex: 0.11, ey: 0.02, ez: 0.16, er: 0.05 });
  const tail = bx(0.04, 0.28, 0.3, 0, 0.14, -0.62, mat, body);
  Object.assign(J, { body, wl, wr, headG, torso: body, gun: new THREE.Group() });
  root.scale.setScalar(T.scale);
  return { root, parts, J, tip: headG, face: fc, hit: [['torso', 0.48]] };
}

export function buildQuadruped(mat, solid, T) {
  const root = new THREE.Group(); const parts = {}, J = {};
  const isSpider = T.model === 'spider';
  const hips = new THREE.Group(); hips.position.y = isSpider ? 0.42 : 0.65; root.add(hips);
  parts.hips = hips;
  const torso = new THREE.Group(); hips.add(torso);
  if (isSpider) {
    blob(0.42, 0.25, 0.52, 0, 0.1, -0.22, mat, torso);
    blob(0.28, 0.2, 0.28, 0, 0.12, 0.22, mat, torso);
  } else {
    blob(0.32, 0.3, 0.65, 0, 0.12, 0, mat, torso);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.5, 4), mat);
    tail.position.set(0, 0.2, -0.6); tail.rotation.x = -1.2; torso.add(tail);
    J.tail = tail;
  }
  parts.torso = new THREE.Object3D(); parts.torso.position.y = 0.12; torso.add(parts.torso);

  const headG = new THREE.Group(); headG.position.set(0, isSpider ? 0.14 : 0.28, isSpider ? 0.48 : 0.68); torso.add(headG);
  const head = blob(isSpider ? 0.22 : 0.24, isSpider ? 0.18 : 0.22, isSpider ? 0.22 : 0.32, 0, 0, 0, mat, headG);
  parts.head = headG;

  if (T.isPet) {
    // vira-lata caramelo: orelhonas caídas, focinho, coleira e corpo mais curto
    torso.children[0].scale.set(0.3, 0.28, 0.52);
    for (const sd of [-1, 1]) { const ear = blob(0.05, 0.17, 0.11, sd * 0.2, 0.02, -0.04, solid, headG); ear.rotation.z = sd * 0.35; }
    bx(0.17, 0.15, 0.26, 0, -0.05, 0.26, mat, headG); blob(0.05, 0.04, 0.04, 0, -0.01, 0.4, solid, headG);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 12), solid); collar.position.set(0, 0.22, 0.5); collar.rotation.x = 1.25; torso.add(collar);
  } else if (!isSpider) {
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), mat); earL.position.set(-0.14, 0.2, -0.05); earL.rotation.z = 0.3; headG.add(earL);
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 4), mat); earR.position.set(0.14, 0.2, -0.05); earR.rotation.z = -0.3; headG.add(earR);
    bx(0.16, 0.14, 0.22, 0, -0.04, 0.22, mat, headG);
  } else {
    bx(0.05, 0.12, 0.12, -0.08, -0.1, 0.24, solid, headG);
    bx(0.05, 0.12, 0.12, 0.08, -0.1, 0.24, solid, headG);
  }
  const fc = doodleFace(headG, solid, { ex: isSpider ? 0.08 : 0.09, ey: 0.04, ez: isSpider ? 0.2 : 0.26, er: isSpider ? 0.035 : 0.04, smile: true });

  const legs = [];
  if (isSpider) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const zOff = 0.3 - i * 0.18;
        const base = noodle(0.42, 0.024, mat, torso, side * 0.24, 0.1, zOff, 0.08);
        base.rotation.z = side * 0.55;
        const tipL = noodle(0.48, 0.02, mat, base, 0, -0.42, 0, 0.04);
        tipL.rotation.z = side * -1.1;
        legs.push({ base, tipL, side, i });
      }
    }
  } else {
    const legFL = noodle(0.38, 0.032, mat, torso, -0.22, 0, 0.35);
    const legFR = noodle(0.38, 0.032, mat, torso, 0.22, 0, 0.35);
    const legBL = noodle(0.42, 0.034, mat, torso, -0.22, 0, -0.35);
    const legBR = noodle(0.42, 0.034, mat, torso, 0.22, 0, -0.35);
    J.legFL = legFL; J.legFR = legFR; J.legBL = legBL; J.legBR = legBR;
    J.legL = legFL; J.legR = legFR;
  }
  J.spiderLegs = legs;
  Object.assign(J, { hips, torso, headG, gun: new THREE.Group() });

  const hit = [['head', 0.26], ['torso', 0.42], ['hips', 0.3]];
  root.scale.setScalar(T.scale);
  return { root, parts, J, tip: headG, face: fc, hit };
}

