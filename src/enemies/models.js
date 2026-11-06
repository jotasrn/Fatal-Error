// Doodle model kit. Everything here is drawn as pen strokes: limbs are slightly bowed tubes,
// bodies are flattened ovals and none of it is hatched, so enemies read as ink drawings on the
// page. buildHumanoid / buildBomber / buildFlyer assemble the figures the manager animates.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeInkMaterial, INK } from '../render.js';
import { rand, TAU } from '../util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function bx(w, h, d, x, y, z, mat, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
function sph(r, x, y, z, mat, parent, seg = 8) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)), mat); m.position.set(x, y, z); parent.add(m); return m; }
// a flattened oval "drawn" body part
function blob(rx, ry, rz, x, y, z, mat, parent) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat); m.scale.set(rx, ry, rz); m.position.set(x, y, z); parent.add(m); return m; }
// a limb: one slightly bowed stroke hanging from its pivot, with a marker at its middle for hit tests
function noodle(len, r, mat, parent, x, y, z, bow = 0.05) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const c = new THREE.QuadraticBezierCurve3(V3(0, 0, 0), V3(rand(-bow, bow), -len * 0.5, rand(-bow, bow) + bow * 0.6), V3(0, -len, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 5, r, 6, false), mat));
  const mid = new THREE.Object3D(); mid.position.y = -len * 0.55; g.add(mid);
  g.userData.mid = mid; g.userData.len = len; return g;
}
function mitten(r, mat, parent, y) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat); m.position.y = y; m.scale.set(1, 1.15, 0.8); parent.add(m); return m; }
function shoe(mat, parent, y, s = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 7, 5), mat); m.position.set(0, y, 0.06 * s); m.scale.set(1, 0.62, 1.9); parent.add(m); return m; }
// dot eyes, angry brows and a curved mouth, all solid ink so they read at a glance
function doodleFace(headG, solid, opts = {}) {
  const eyes = new THREE.Group(); headG.add(eyes);
  const ex = opts.ex ?? 0.1, ey = opts.ey ?? 0.03, ez = opts.ez ?? 0.25, er = opts.er ?? 0.045;
  for (const sx of [-1, 1]) {
    const e = sph(er, sx * ex, ey, ez, solid, eyes, 6); e.scale.set(0.85, 1.15, 0.7);
    const b = bx(0.115, 0.026, 0.026, sx * ex, ey + 0.11, ez - 0.01, solid, eyes); b.rotation.z = sx * -0.5;
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.018, 4, 9, Math.PI * 0.9), solid);
  mouth.position.set(0, ey - 0.16, ez - 0.02); mouth.rotation.z = opts.smile ? Math.PI : 0; eyes.add(mouth);
  const xeyes = new THREE.Group(); headG.add(xeyes); xeyes.visible = false;
  for (const sx of [-1, 1]) for (const a of [0.8, -0.8]) { const c = bx(0.13, 0.024, 0.024, sx * ex, ey, ez, solid, xeyes); c.rotation.z = a; }
  const o = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 4, 9), solid); o.position.set(0, ey - 0.17, ez - 0.02); xeyes.add(o);
  return { eyes, xeyes };
}
function buildHat(headG, mat, solid, T) {
  const h = T.hat;
  if (h === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 5, 0, TAU, 0, Math.PI * 0.5), mat); c.position.y = 0.05; c.scale.y = 0.62; headG.add(c); const brim = bx(0.34, 0.035, 0.24, 0, 0.05, 0.24, mat, headG); brim.rotation.x = -0.18; sph(0.035, 0, 0.24, 0, solid, headG, 5); const logo = bx(0.09, 0.07, 0.02, 0, 0.13, 0.25, solid, headG); logo.rotation.x = -0.5; }
  else if (h === 'band') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.028, 5, 14), solid); b.rotation.x = Math.PI / 2; b.position.y = 0.11; headG.add(b); for (const [dx, dz, a] of [[0.24, -0.22, 0.5], [0.2, -0.3, -0.3]]) { const t = bx(0.04, 0.03, 0.4, dx, 0.08 - dz * 0.2, -0.26, solid, headG); t.rotation.y = a; } for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 4), mat); sp.position.set(-0.12 + i * 0.08, 0.28, 0.02); sp.rotation.z = (i - 1.5) * 0.35; headG.add(sp); } }
  else if (h === 'helmet') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, TAU, 0, Math.PI * 0.55), mat); c.position.y = 0.0; c.scale.y = 0.85; headG.add(c); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.315, 0.03, 4, 14), mat); rim.rotation.x = Math.PI / 2; rim.position.y = -0.02; headG.add(rim); const strap = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.014, 4, 12, Math.PI), solid); strap.rotation.y = Math.PI / 2; strap.rotation.z = Math.PI; strap.position.y = -0.02; headG.add(strap); const ridge = bx(0.05, 0.05, 0.5, 0, 0.27, -0.02, mat, headG); ridge.scale.y = 0.8; }
  else if (h === 'hood') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 7, 0, TAU, 0, Math.PI * 0.62), mat); c.position.y = -0.02; c.scale.set(1.03, 1.15, 0.95); headG.add(c); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 5), mat); tail.position.set(0, 0.16, -0.3); tail.rotation.x = 1.5; headG.add(tail); }
  else if (h === 'crown') { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 4), mat); sp.position.set(Math.cos(a) * 0.22, 0.34, Math.sin(a) * 0.22); headG.add(sp); } const b = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 4, 14), mat); b.rotation.x = Math.PI / 2; b.position.y = 0.24; headG.add(b); }
  else if (h === 'hair') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, TAU, 0, Math.PI * 0.52), solid); c.position.set(0, 0.02, -0.02); c.scale.set(0.98, 0.78, 1.04); headG.add(c); const fr = bx(0.3, 0.07, 0.08, 0.04, 0.17, 0.2, solid, headG); fr.rotation.z = -0.25; }
  else if (h === 'headset') { const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 4, 14, Math.PI), solid); band.position.y = 0.02; headG.add(band); for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 10), mat); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.29, 0.0, 0); headG.add(cup); } const mic = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(-0.3, -0.02, 0.02), V3(-0.26, -0.18, 0.2), V3(-0.08, -0.15, 0.28)), 6, 0.012, 4, false), solid); headG.add(mic); sph(0.03, -0.08, -0.15, 0.28, solid, headG, 6); const hair = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, TAU, 0, Math.PI * 0.45), mat); hair.position.y = 0.03; hair.scale.set(0.97, 0.7, 1.02); headG.add(hair); }
  else if (h === 'beret') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.09, 8), mat); c.position.set(0.08, 0.22, 0); c.rotation.z = -0.32; headG.add(c); bx(0.06, 0.06, 0.04, -0.15, 0.2, 0.18, solid, headG); }
}

// ---------------- draw-call baking ----------------
// A figure is built from dozens of small meshes; every one is a separate draw call. Once built,
// sibling meshes that share a material and never move on their own are merged into one mesh per
// (parent, material). Joints, hit markers, the face groups and anything animated (kept in `keep`)
// stay separate, so animation, flashing, ragdolls and hit tests behave exactly as before.
export function bakeStatic(root, keep = new Set()) {
  const parents = []; root.traverse((o) => { if (o.children && o.children.length > 1) parents.push(o); });
  for (const p of parents) {
    const groups = new Map();
    for (const c of p.children) {
      if (!c.isMesh || c.isInstancedMesh || keep.has(c) || c.children.length || !c.visible || !c.geometry.index || Array.isArray(c.material)) continue;
      const k = c.material.uuid; let l = groups.get(k); if (!l) groups.set(k, l = []); l.push(c);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
      const merged = mergeGeometries(geos, false); for (const g of geos) g.dispose();
      if (!merged) continue;
      for (const m of list) { p.remove(m); m.geometry.dispose(); }
      p.add(new THREE.Mesh(merged, list[0].material));
    }
  }
  return root;
}
export function bakeModel(model, extra = []) {
  const keep = new Set(extra);
  const add = (v) => { if (!v) return; if (Array.isArray(v)) v.forEach(add); else if (v.isObject3D) keep.add(v); else if (typeof v === 'object') Object.values(v).forEach((x) => { if (x && x.isObject3D) keep.add(x); }); };
  add(Object.values(model.J || {})); add(Object.values(model.parts || {})); add(model.tip); if (model.face) { add(model.face.eyes); add(model.face.xeyes); }
  return bakeStatic(model.root, keep);
}

// Template cache: building a kitted figure costs several ms (tubes, spheres, merging); a wave or a
// protest spawning a dozen at once used to hitch. Each type keeps a few baked templates and new bots
// are clones that SHARE the geometry (marked userData.shared so removal never disposes it) and only
// get their own materials, so hit flashes stay per bot.
const _tpl = new Map(), TPL_VARIANTS = 1; // one shared model per kind: the whole crowd of a kind is drawn in one go
export function buildCached(type, T, build) {
  let list = _tpl.get(type); if (!list) _tpl.set(type, list = []);
  if (list.length < TPL_VARIANTS) {
    const tmat = makeInkMaterial({ ink: T.ink ?? INK.RED, shadeScale: 0, shadeBias: 1 });
    const tsolid = makeInkMaterial({ ink: T.ink === INK.BLACK ? INK.RED : INK.BLACK, fill: true, side: THREE.DoubleSide });
    const m = build(tmat, tsolid); bakeModel(m);
    m.root.traverse((o) => { o.userData = {}; if (o.geometry) o.geometry.userData.shared = true; });
    m.tmat = tmat; m.tsolid = tsolid; list.push(m);
  }
  return list[Math.floor(Math.random() * list.length)];
}
export function cloneModel(tpl, mat, solid) {
  const root = tpl.root.clone(true); const src = [], dst = [];
  tpl.root.traverse((o) => src.push(o)); root.traverse((o) => dst.push(o));
  const map = new Map(); for (let i = 0; i < src.length; i++) map.set(src[i], dst[i]);
  for (const o of dst) if (o.isMesh) { if (o.material === tpl.tmat) o.material = mat; else if (o.material === tpl.tsolid) o.material = solid; }
  const re = (v) => { if (!v) return v; if (v.isObject3D) return map.get(v) || v; if (Array.isArray(v)) return v.map(re); if (typeof v === 'object') { const o = {}; for (const k in v) o[k] = re(v[k]); return o; } return v; };
  const J = {}; for (const k in tpl.J) J[k] = re(tpl.J[k]);
  const parts = {}; for (const k in tpl.parts) parts[k] = re(tpl.parts[k]);
  return { root, parts, J, tip: re(tpl.tip), face: tpl.face ? { eyes: re(tpl.face.eyes), xeyes: re(tpl.face.xeyes) } : tpl.face, hit: tpl.hit };
}

// ---------------- gear kit ----------------
// Small details (belts, vests, badges, packs…) are collected per (parent, material) and merged into
// one mesh each, so a fully kitted figure still costs only a handful of draw calls.
const _o3 = new THREE.Object3D();
function gearKit() {
  const groups = new Map();
  const put = (parent, mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    _o3.position.set(x, y, z); _o3.rotation.set(rx, ry, rz); _o3.scale.set(sx, sy, sz); _o3.updateMatrix(); geo.applyMatrix4(_o3.matrix);
    if (!geo.index) return; const k = parent.uuid + '|' + mat.uuid; let g = groups.get(k);
    if (!g) groups.set(k, g = { parent, mat, geos: [] }); g.geos.push(geo);
  };
  const flush = () => {
    for (const g of groups.values()) {
      const merged = g.geos.length === 1 ? g.geos[0] : mergeGeometries(g.geos, false);
      if (!merged) continue; g.parent.add(new THREE.Mesh(merged, g.mat)); if (merged !== g.geos[0]) for (const x of g.geos) x.dispose();
    }
    groups.clear();
  };
  const box = (p, m, w, h, d, x, y, z, rx, ry, rz) => put(p, m, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const ball = (p, m, rx, ry, rz, x, y, z, seg = 8) => put(p, m, new THREE.SphereGeometry(1, seg, Math.max(4, seg - 2)), x, y, z, 0, 0, 0, rx, ry, rz);
  const can = (p, m, r1, r2, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 8) => put(p, m, new THREE.CylinderGeometry(r1, r2, h, seg), x, y, z, rx, ry, rz);
  const ring = (p, m, rx, rz, tube, x, y, z, tilt = 0) => put(p, m, new THREE.TorusGeometry(1, tube, 4, 18), x, y, z, Math.PI / 2 + tilt, 0, 0, rx, rz, 1);
  const hoop = (p, m, r, tube, x, y, z, ry = 0) => put(p, m, new THREE.TorusGeometry(r, tube, 4, 12), x, y, z, 0, ry, 0);
  return { put, flush, box, ball, can, ring, hoop };
}

// Dresses a humanoid: every figure gets ears, a nose, a belt, a collar, trousers and boot soles,
// then T.gear adds the kit that tells one kind of enemy from another at a glance.
function dressHumanoid(J, hatG, mat, solid, T, bw, hs, limbR) {
  const gear = new Set(T.gear || []);
  const acc = makeInkMaterial({ ink: T.accent ?? INK.ORANGE, fill: true, side: THREE.DoubleSide });
  const K = gearKit(); const { put, box, ball, can, ring, hoop } = K;
  const tor = J.torso, hips = J.hips, H = hatG;
  // torso surface helpers (the torso blob is centred at y 0.26 with radii 0.3bw, 0.3, 0.19bw)
  const fz = (y) => 0.19 * bw * Math.sqrt(Math.max(0, 1 - ((y - 0.26) / 0.3) ** 2));
  const fx = (y) => 0.3 * bw * Math.sqrt(Math.max(0, 1 - ((y - 0.26) / 0.3) ** 2));
  // --- everyone ---
  ball(H, mat, 0.045, 0.085, 0.06, 0.272, -0.01, -0.01, 6); ball(H, mat, 0.045, 0.085, 0.06, -0.272, -0.01, -0.01, 6); // ears
  ball(H, mat, 0.042, 0.05, 0.05, 0, -0.06, 0.255, 6); // nose
  ball(hips, mat, 0.25 * bw, 0.13, 0.17 * bw, 0, 0.02, 0); // trousers
  ring(tor, solid, fx(0.1) * 1.05, fz(0.1) * 1.08, 0.12, 0, 0.1, 0); // belt
  box(tor, acc, 0.085, 0.065, 0.03, 0, 0.1, fz(0.1) * 1.08 + 0.01); // buckle
  ring(tor, mat, 0.085, 0.075, 0.3, 0, 0.53, 0.0); // collar
  for (const k of ['shinL', 'shinR']) { box(J[k], solid, 0.13 * bw, 0.035, 0.27 * bw, 0, -0.455, 0.05 * bw); ring(J[k], mat, limbR * 1.9, limbR * 1.9, 0.25, 0, -0.33, 0); } // soles + boot cuffs
  for (const k of ['foreL', 'foreR']) ring(J[k], mat, limbR * 1.7, limbR * 1.7, 0.25, 0, -0.24, 0); // sleeves
  // shirt seam and buttons
  if (!gear.has('vest') && !gear.has('plate')) for (let i = 0; i < 3; i++) { const y = 0.42 - i * 0.1; ball(tor, solid, 0.018, 0.018, 0.01, 0, y, fz(y) + 0.005, 5); }
  // --- kit ---
  if (gear.has('vest')) {
    ball(tor, mat, 0.31 * bw, 0.17, 0.205 * bw, 0, 0.3, 0); // vest band over the chest
    for (const x of [-0.13, 0, 0.13]) box(tor, mat, 0.08, 0.1, 0.05, x * bw, 0.22, fz(0.22) + 0.03); // magazine pouches
    for (const x of [-0.1, 0.1]) box(tor, solid, 0.035, 0.3, 0.02, x * bw, 0.38, fz(0.38) + 0.035, 0, 0, 0); // straps
  }
  if (gear.has('plate')) { box(tor, mat, 0.42 * bw, 0.3, 0.06, 0, 0.3, fz(0.3) + 0.02); box(tor, solid, 0.3 * bw, 0.04, 0.07, 0, 0.36, fz(0.3) + 0.025); box(tor, mat, 0.4 * bw, 0.28, 0.06, 0, 0.3, -fz(0.3) - 0.02); }
  if (gear.has('pack')) {
    box(tor, T.packAccent ? acc : mat, 0.36 * bw, 0.38, 0.16, 0, 0.32, -fz(0.32) - 0.08); box(tor, solid, 0.3 * bw, 0.04, 0.17, 0, 0.36, -fz(0.32) - 0.08);
    can(tor, mat, 0.06, 0.06, 0.38 * bw, 0, 0.55, -fz(0.32) - 0.08, 0, 0, Math.PI / 2); // bedroll
    for (const x of [-0.11, 0.11]) box(tor, solid, 0.035, 0.32, 0.02, x * bw, 0.34, fz(0.34) + 0.01);
  }
  if (gear.has('radio')) { box(tor, solid, 0.07, 0.12, 0.05, 0.17 * bw, 0.44, 0.08); can(tor, solid, 0.008, 0.008, 0.5, 0.2 * bw, 0.7, -0.12, 0.2, 0, -0.15, 4); }
  if (gear.has('canteen')) { can(tor, mat, 0.06, 0.06, 0.13, -0.24 * bw, 0.06, 0.02); can(tor, solid, 0.025, 0.025, 0.03, -0.24 * bw, 0.14, 0.02, 0, 0, 0, 5); }
  if (gear.has('grenades')) for (const x of [0.2, 0.26]) ball(tor, solid, 0.04, 0.05, 0.04, x * bw, 0.2, fz(0.2) - 0.02, 6);
  if (gear.has('pads')) {
    for (const s of [-1, 1]) ball(tor, mat, 0.12 * bw, 0.07, 0.12, s * 0.27 * bw, 0.5, 0, 8); // shoulder pads
    for (const k of ['shinL', 'shinR']) ball(J[k], mat, limbR * 2.3, limbR * 2.6, limbR * 1.8, 0, -0.02, limbR * 1.3, 6); // knee pads
  }
  if (gear.has('bandolier')) { box(tor, solid, 0.06, 0.78, 0.03, 0, 0.28, fz(0.28) + 0.03, 0, 0, 0.75); for (let i = -2; i <= 2; i++) can(tor, acc, 0.016, 0.016, 0.07, i * 0.07 * Math.cos(0.75), 0.28 + i * 0.07 * Math.sin(0.75) * -1, fz(0.28) + 0.05, 0, 0, 0.75, 5); }
  if (gear.has('sash')) box(tor, mat, 0.08, 0.8, 0.02, 0, 0.26, fz(0.26) + 0.02, 0, 0, -0.7);
  if (gear.has('scarf')) { ring(tor, solid, 0.12, 0.11, 0.35, 0, 0.5, 0); box(tor, solid, 0.07, 0.34, 0.02, 0.06, 0.36, -0.13, 0.35, 0, 0.2); }
  if (gear.has('wraps')) for (const k of ['foreL', 'foreR']) for (let i = 0; i < 3; i++) ring(J[k], solid, limbR * 1.4, limbR * 1.4, 0.2, 0, -0.08 - i * 0.06, 0, 0.3);
  if (gear.has('ghillie')) {
    for (let i = 0; i < 9; i++) { const x = (i - 4) * 0.065 * bw; box(tor, mat, 0.05, rand(0.3, 0.5), 0.02, x, rand(0.15, 0.3), -fz(0.3) - 0.03, rand(-0.3, 0.1), 0, rand(-0.25, 0.25)); }
    for (let i = 0; i < 5; i++) ball(H, mat, 0.06, 0.03, 0.08, rand(-0.2, 0.2), 0.27, rand(-0.2, 0.1), 5); // leaves on the hood
  }
  if (gear.has('pouch')) box(tor, mat, 0.12, 0.09, 0.07, -0.2 * bw, 0.06, fz(0.06) + 0.02);
  if (gear.has('tie')) { box(tor, acc, 0.06, 0.24, 0.02, 0, 0.35, fz(0.35) + 0.015); ball(tor, acc, 0.035, 0.03, 0.02, 0, 0.48, fz(0.48) + 0.02, 5); for (const s of [-1, 1]) box(tor, mat, 0.06, 0.26, 0.02, s * 0.075, 0.42, fz(0.42) + 0.01, 0, 0, s * 0.35); }
  if (gear.has('glasses')) { for (const s of [-1, 1]) hoop(H, solid, 0.058, 0.012, s * 0.1, 0.03, 0.27); box(H, solid, 0.06, 0.014, 0.014, 0, 0.04, 0.28); for (const s of [-1, 1]) box(H, solid, 0.012, 0.012, 0.22, s * 0.16, 0.04, 0.16); }
  if (gear.has('goggles')) { for (const s of [-1, 1]) can(H, solid, 0.065, 0.065, 0.05, s * 0.095, 0.14, 0.245, Math.PI / 2 - 0.35, 0, 0); ring(H, solid, 0.28, 0.255, 0.1, 0, 0.13, 0); }
  if (gear.has('bandana')) ball(H, acc, 0.25, 0.13, 0.215, 0, -0.13, 0.04, 9);
  if (gear.has('mustache')) for (const s of [-1, 1]) box(H, solid, 0.12, 0.035, 0.03, s * 0.055, -0.1, 0.27, 0, 0, s * -0.25);
  if (gear.has('badge')) { can(tor, acc, 0.045, 0.045, 0.02, -0.12 * bw, 0.38, fz(0.38) + 0.025, Math.PI / 2, 0, 0, 5); box(tor, acc, 0.16, 0.035, 0.02, 0.12 * bw, 0.4, fz(0.4) + 0.025); }
  if (gear.has('stripe')) ring(tor, acc, fx(0.24) * 1.06, fz(0.24) * 1.12, 0.1, 0, 0.24, 0);
  if (gear.has('holster')) { box(tor, solid, 0.07, 0.15, 0.1, 0.27 * bw, 0.02, 0.02); box(tor, mat, 0.05, 0.06, 0.04, 0.27 * bw, 0.12, 0.05); }
  if (gear.has('shirtstar')) put(tor, solid, new THREE.CylinderGeometry(0.075, 0.075, 0.02, 5), 0, 0.33, fz(0.33) + 0.012, Math.PI / 2, 0, 0);
  if (gear.has('armband')) for (const k of ['armL', 'armR']) ring(J[k], acc, limbR * 1.8, limbR * 1.8, 0.35, 0, -0.1, 0);
  if (gear.has('jersey')) { // camisa amarela da seleção: gola e punhos verdes, escudo no peito
    ring(tor, acc, fx(0.5) * 1.08 + 0.015, fz(0.5) * 1.1 + 0.015, 0.06, 0, 0.5, 0);
    for (const k of ['armL', 'armR']) ring(J[k], acc, limbR * 1.9, limbR * 1.9, 0.07, 0, -0.17, 0);
    put(tor, acc, new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6), -0.1 * bw, 0.38, fz(0.38) + 0.012, Math.PI / 2, 0, 0);
  }
  if (gear.has('cape')) { box(tor, mat, 0.62 * bw, 1.1, 0.03, 0, 0.0, -fz(0.3) - 0.06, 0.12, 0, 0); ring(tor, solid, 0.13, 0.12, 0.3, 0, 0.52, 0); }
  K.flush();
}

export function buildWeaponProp(gun, mat, solid, T) {
  if (T.weapon === 'blade') { bx(0.02, 0.05, 0.95, 0, 0.04, 0.42, mat, gun); bx(0.11, 0.11, 0.03, 0, 0.04, -0.06, solid, gun); bx(0.035, 0.045, 0.24, 0, 0.04, -0.19, solid, gun); }
  else if (T.weapon === 'flag' && T.isRioter) {
    // bandeira do Brasil: retângulo verde, losango amarelo e círculo azul
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.45, 6), solid);
    mast.rotation.x = Math.PI / 2.3; mast.position.set(0, 0.28, 0.38); gun.add(mast);
    const fg = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.012), makeInkMaterial({ ink: INK.GREEN, fill: true, side: THREE.DoubleSide })); fg.position.set(0.25, 0.52, 0.65); fg.rotation.y = Math.PI / 10; gun.add(fg);
    const rh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.02), mat); rh.position.set(0.25, 0.52, 0.65); rh.rotation.set(0, Math.PI / 10, Math.PI / 4); rh.scale.set(1.25, 0.85, 1); gun.add(rh);
    const ci = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 10), makeInkMaterial({ ink: INK.BLUE, fill: true })); ci.position.set(0.25, 0.52, 0.65); ci.rotation.set(Math.PI / 2, 0, 0); ci.rotation.y = 0; gun.add(ci);
  }
  else if (T.weapon === 'flag' || T.isProtester) {
    // Mastro da bandeira
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.45, 6), solid);
    mast.rotation.x = Math.PI / 2.3; mast.position.set(0, 0.28, 0.38); gun.add(mast);
    // Bandeira vermelha do PT
    const flagGeo = new THREE.BoxGeometry(0.55, 0.38, 0.012);
    const flagMesh = new THREE.Mesh(flagGeo, mat);
    flagMesh.position.set(0.24, 0.52, 0.65); flagMesh.rotation.y = Math.PI / 10; gun.add(flagMesh);
    // Estrela branca central
    const starGeo = new THREE.BoxGeometry(0.14, 0.14, 0.02);
    const starMesh = new THREE.Mesh(starGeo, solid);
    starMesh.position.set(0.245, 0.52, 0.65); gun.add(starMesh);
  }
  else if (T.weapon === 'smg') {
    bx(0.065, 0.1, 0.38, 0, 0.02, 0.12, mat, gun);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), solid);
    b.rotation.x = Math.PI / 2; b.position.set(0, 0.04, 0.36); gun.add(b);
    bx(0.04, 0.16, 0.05, 0, -0.09, 0.08, solid, gun);
  }
  else if (T.weapon === 'laser') {
    bx(0.075, 0.12, 0.52, 0, 0.02, 0.15, solid, gun);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 6), mat);
    b.rotation.x = Math.PI / 2; b.position.set(0, 0.05, 0.48); gun.add(b);
  }
  else if (T.weapon === 'shotgun') { bx(0.1, 0.13, 0.66, 0, 0.02, 0.2, mat, gun); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 6), solid); b.rotation.x = Math.PI / 2; b.position.set(0, 0.08, 0.5); gun.add(b); }
  else if (T.weapon === 'sniper') { bx(0.075, 0.11, 0.6, 0, 0.02, 0.15, mat, gun); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), solid); b.rotation.x = Math.PI / 2; b.position.set(0, 0.05, 0.72); gun.add(b); bx(0.06, 0.07, 0.22, 0, 0.13, 0.06, solid, gun); }
  else if (T.weapon === 'bazooka') {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.15, 8), mat); tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.08, 0.28); gun.add(tube);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.065, 0.18, 8), solid); bell.rotation.x = Math.PI / 2; bell.position.set(0, 0.08, -0.32); gun.add(bell);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8), solid); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.08, 0.82); gun.add(ring);
    bx(0.045, 0.12, 0.05, 0, -0.05, 0.2, solid, gun);
  }
  else if (T.weapon === 'pistol' || T.weapon === 'revolver') { bx(0.055, 0.09, 0.3, 0, 0.03, 0.13, mat, gun); bx(0.045, 0.11, 0.055, 0, -0.05, 0, solid, gun); }
  else if (T.weapon === 'none') {
    // Maleta de servidor público de Brasília (cidadão)
    bx(0.08, 0.22, 0.28, 0, -0.15, 0.05, solid, gun);
    bx(0.04, 0.08, 0.14, 0, -0.01, 0.05, mat, gun);
  }
  else if (T.weapon === 'boss') { const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 7), makeInkMaterial({ ink: INK.ORANGE, shadeScale: 0, shadeBias: 1 })); pen.position.y = 0.7; gun.add(pen); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 6), solid); tip.position.y = 2.08; gun.add(tip); const er = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 8), makeInkMaterial({ ink: INK.PINK, shadeScale: 0, shadeBias: 1 })); er.position.y = -0.62; gun.add(er); }
  else { bx(0.085, 0.12, 0.5, 0, 0.02, 0.16, mat, gun); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.34, 6), solid); b.rotation.x = Math.PI / 2; b.position.set(0, 0.05, 0.52); gun.add(b); bx(0.05, 0.16, 0.09, 0, -0.09, 0.08, mat, gun); }
}

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
  let spark = null;
  if (!boss) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 7), mat); cap.position.y = 0.76; torso.add(cap);
    const fuse = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(0, 0.8, 0), V3(0.16, 1.0, 0), V3(0.24, 1.14, 0)), 5, 0.02, 5, false), solid); torso.add(fuse);
    spark = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), makeInkMaterial({ ink: INK.ORANGE, fill: true })); spark.position.set(0.24, 1.14, 0); torso.add(spark);
  } else if (T.bossKind === 'inkblot') {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 5), mat); sp.position.set(Math.cos(a) * 0.42, 0.32 + Math.sin(a * 2.3) * 0.25, Math.sin(a) * 0.42); sp.lookAt(Math.cos(a) * 3, 0.32, Math.sin(a) * 3); sp.rotateX(Math.PI / 2); torso.add(sp); }
  } else {
    // a chunky rubber block on top: the eraser wears its own head
    bx(0.7, 0.32, 0.5, 0, 0.86, 0, mat, torso); bx(0.74, 0.05, 0.54, 0, 0.7, 0, solid, torso);
  }
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
