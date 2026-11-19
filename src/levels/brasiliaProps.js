// Modelos instanciados de Brasília: vegetação típica do Plano Piloto e mobiliário urbano.
// Cada protótipo devolve peças { geo, lod } em que a geometria carrega o material por vértice (aMat):
// tinta, chapado, etiqueta (folha/casca/metal/luz/flor) e se usa a tinta da instância (cor do ipê etc.).
// lod:'near' = versão detalhada (perto), lod:'far' = versão leve (longe).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, TAG } from '../core/render.js';

const { BLUE: BL, RED: RD, BLACK: BK, ORANGE: OR, GREEN: GN, PINK: PK } = INK;
const _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _d = new THREE.Vector3();

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// marca a geometria com o material (e a deixa não indexada, só posição+normal, para poder mesclar)
function M(g, ink, { fill = false, tag = TAG.NONE, ov = false } = {}) {
  let ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
  if (!ng.attributes.normal) ng.computeVertexNormals();
  const n = ng.attributes.position.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = ink; a[i * 4 + 1] = fill ? 1 : 0; a[i * 4 + 2] = tag; a[i * 4 + 3] = ov ? 1 : 0; }
  ng.setAttribute('aMat', new THREE.BufferAttribute(a, 4));
  return ng;
}
const merge = (list) => { const g = mergeGeometries(list, false); for (const x of list) x.dispose(); return g; };

// cilindro de (x0,y0,z0) até (x1,y1,z1)
function limb(x0, y0, z0, x1, y1, z1, r0, r1, seg = 6) {
  _d.set(x1 - x0, y1 - y0, z1 - z0); const len = _d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(_up, _d.normalize()); g.applyQuaternion(_q);
  g.translate(x0, y0, z0);
  return g;
}

// tufo de folhas: esfera irregular (deformação contínua, sem rachar nas emendas), normais suaves
function blob(x, y, z, rx, ry, rz, r, ws = 9, hs = 6) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position, ph = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
    const k = 1 + 0.16 * Math.sin(vx * 3.1 + ph) * Math.cos(vz * 2.7 + ph * 0.7) + 0.1 * Math.sin(vy * 4.3 + ph * 1.3) - (vy < -0.3 ? 0.12 : 0);
    p.setXYZ(i, vx * k * rx + x, vy * k * ry + y, vz * k * rz + z);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ árvores
// Árvore do cerrado (pequizeiro, barbatimão): tronco torto, galhos abertos, copa achatada em tufos.
export function treeCerrado(seed) {
  return () => {
    const r = rng(seed), bark = [], leaf = [];
    const lean = (r() - 0.5) * 0.9, lz = (r() - 0.5) * 0.6;
    const k1 = [lean * 0.6, 1.4, lz * 0.5], k2 = [lean, 2.4, lz];
    bark.push(limb(0, 0, 0, ...k1, 0.26, 0.21, 7), limb(...k1, ...k2, 0.21, 0.17, 7));
    const nb = 3 + Math.floor(r() * 2);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + r() * 0.8, L = 1.4 + r() * 1.0;
      const tip = [k2[0] + Math.cos(a) * L, k2[1] + 0.8 + r() * 0.9, k2[2] + Math.sin(a) * L];
      const mid = [(k2[0] + tip[0]) / 2 + (r() - 0.5) * 0.4, (k2[1] + tip[1]) / 2 + 0.25, (k2[2] + tip[2]) / 2];
      bark.push(limb(...k2, ...mid, 0.13, 0.1, 5), limb(...mid, ...tip, 0.1, 0.06, 5));
      leaf.push(blob(tip[0], tip[1] + 0.35, tip[2], 1.35 + r() * 0.4, 0.62 + r() * 0.2, 1.25 + r() * 0.4, r));
    }
    leaf.push(blob(k2[0], k2[1] + 1.5, k2[2], 1.6, 0.75, 1.6, r));
    const near = merge([...bark.map((g) => M(g, BK, { fill: true, tag: TAG.BARK })), ...leaf.map((g) => M(g, GN, { tag: TAG.LEAF, ov: true }))]);
    const far = merge([M(limb(0, 0, 0, ...k2, 0.24, 0.16, 4), BK, { fill: true, tag: TAG.BARK }), M(blob(k2[0], k2[1] + 1.2, k2[2], 2.6, 1.0, 2.5, r, 6, 4), GN, { tag: TAG.LEAF, ov: true })]);
    return [{ geo: near, lod: 'near', allowOverride: true }, { geo: far, lod: 'far', allowOverride: true }];
  };
}

// Mangueira / oiti das superquadras: tronco grosso e curto, copa densa e redonda.
export function treeMangueira(seed) {
  return () => {
    const r = rng(seed), bark = [], leaf = [];
    bark.push(limb(0, 0, 0, 0, 2.0, 0, 0.36, 0.3, 8));
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + r() * 0.6;
      bark.push(limb(0, 1.9, 0, Math.cos(a) * 1.3, 3.6 + r() * 0.5, Math.sin(a) * 1.3, 0.2, 0.12, 6));
    }
    leaf.push(blob(0, 5.0, 0, 3.0, 2.3, 3.0, r, 11, 8));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r(), rr = 1.9 + r() * 0.6;
      leaf.push(blob(Math.cos(a) * rr, 4.0 + r() * 1.6, Math.sin(a) * rr, 1.7 + r() * 0.5, 1.4 + r() * 0.4, 1.7 + r() * 0.5, r));
    }
    const near = merge([...bark.map((g) => M(g, BK, { fill: true, tag: TAG.BARK })), ...leaf.map((g) => M(g, GN, { tag: TAG.LEAF, ov: true }))]);
    const far = merge([M(limb(0, 0, 0, 0, 2.6, 0, 0.34, 0.26, 4), BK, { fill: true, tag: TAG.BARK }), M(blob(0, 4.7, 0, 3.4, 2.5, 3.4, r, 7, 5), GN, { tag: TAG.LEAF, ov: true })]);
    return [{ geo: near, lod: 'near', allowOverride: true }, { geo: far, lod: 'far', allowOverride: true }];
  };
}

// Ipê (amarelo, roxo, branco): tronco alto e fino, galhos que sobem e abrem, copa florida em cachos.
export function treeIpe(seed) {
  return () => {
    const r = rng(seed), bark = [], flower = [];
    const top = [(r() - 0.5) * 0.5, 3.6, (r() - 0.5) * 0.5];
    bark.push(limb(0, 0, 0, top[0] * 0.5, 1.8, top[2] * 0.5, 0.2, 0.17, 7), limb(top[0] * 0.5, 1.8, top[2] * 0.5, ...top, 0.17, 0.14, 7));
    const nb = 4 + Math.floor(r() * 2);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + r() * 0.7, L = 1.3 + r() * 1.2;
      const tip = [top[0] + Math.cos(a) * L, top[1] + 1.4 + r() * 1.4, top[2] + Math.sin(a) * L];
      bark.push(limb(...top, ...tip, 0.11, 0.05, 5));
      // cachos de flor nas pontas (menores e mais espaçados que uma copa de folhas)
      flower.push(blob(tip[0], tip[1] + 0.3, tip[2], 0.95 + r() * 0.45, 0.75 + r() * 0.3, 0.95 + r() * 0.45, r, 8, 6));
      if (r() < 0.6) flower.push(blob((top[0] + tip[0]) / 2 + (r() - 0.5), (top[1] + tip[1]) / 2 + 0.4, (top[2] + tip[2]) / 2 + (r() - 0.5), 0.7, 0.55, 0.7, r, 7, 5));
    }
    flower.push(blob(top[0], top[1] + 2.4, top[2], 1.3, 0.9, 1.3, r, 8, 6));
    const near = merge([...bark.map((g) => M(g, BK, { fill: true, tag: TAG.BARK })), ...flower.map((g) => M(g, OR, { tag: TAG.FLOWER, ov: true }))]);
    const far = merge([M(limb(0, 0, 0, ...top, 0.19, 0.12, 4), BK, { fill: true, tag: TAG.BARK }), M(blob(top[0], top[1] + 1.9, top[2], 2.3, 1.5, 2.3, r, 6, 4), OR, { tag: TAG.FLOWER, ov: true })]);
    return [{ geo: near, lod: 'near', allowOverride: true }, { geo: far, lod: 'far', allowOverride: true }];
  };
}

// Palmeira-imperial (Esplanada, palácios): estipe alto e liso, palmito verde, coroa de folhas arqueadas.
export function treePalmeira(seed) {
  return () => {
    const r = rng(seed), parts = [];
    const H = 9 + r() * 2;
    parts.push(M(limb(0, 0, 0, 0, H, 0, 0.32, 0.24, 8), BK, { tag: TAG.BARK }));
    for (let y = 0.8; y < H - 1; y += 0.9) parts.push(M(new THREE.TorusGeometry(0.27 - y * 0.004, 0.025, 4, 10).rotateX(Math.PI / 2).translate(0, y, 0), BK, { fill: true, tag: TAG.BARK }));
    parts.push(M(limb(0, H, 0, 0, H + 1.6, 0, 0.26, 0.2, 8), GN, { tag: TAG.LEAF }));
    const nf = 11;
    for (let i = 0; i < nf; i++) {
      const a = (i / nf) * Math.PI * 2 + r() * 0.3, droop = 0.25 + r() * 0.5;
      // folha = sequência de pequenas lâminas que sobem e caem em arco
      let px = 0, py = H + 1.5, pz = 0;
      for (let s = 0; s < 6; s++) {
        const t = (s + 1) / 6, nx = Math.cos(a) * 3.6 * t, nz = Math.sin(a) * 3.6 * t, ny = H + 1.5 + Math.sin(t * 2.2) * 1.0 - t * t * 2.4 * droop - t * 0.6;
        const w = 0.55 * Math.sin(t * Math.PI) + 0.12;
        const g = new THREE.BoxGeometry(w * 2, 0.04, Math.hypot(nx - px, ny - py, nz - pz));
        _d.set(nx - px, ny - py, nz - pz).normalize();
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), _d, _up);
        g.applyMatrix4(m); g.translate((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
        parts.push(M(g, GN, { tag: TAG.LEAF }));
        px = nx; py = ny; pz = nz;
      }
    }
    const near = merge(parts);
    const far = merge([M(limb(0, 0, 0, 0, H + 1.4, 0, 0.3, 0.22, 4), BK, { tag: TAG.BARK }), M(blob(0, H + 1.6, 0, 2.8, 0.9, 2.8, r, 6, 4), GN, { tag: TAG.LEAF })]);
    return [{ geo: near, lod: 'near' }, { geo: far, lod: 'far' }];
  };
}

// ------------------------------------------------------------------ jardins
// Arbustos (pingo-de-ouro, buxinho, moreia) em moita.
export function shrub(seed) {
  return () => {
    const r = rng(seed), g = [];
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r() * 1.1;
      g.push(blob(Math.cos(a) * d, 0.5 + r() * 0.3, Math.sin(a) * d, 0.7 + r() * 0.4, 0.55 + r() * 0.35, 0.7 + r() * 0.4, r, 7, 5));
    }
    return [{ geo: merge(g.map((x) => M(x, GN, { tag: TAG.LEAF, ov: true }))), lod: 'near', allowOverride: true, lodR: 110 }];
  };
}

// Canteiro estilo Burle Marx: moita baixa, espadas/agaves e flores coloridas.
export function flowerBed(seed) {
  return () => {
    const r = rng(seed), green = [], flowers = [], spikes = [];
    green.push(blob(0, 0.05, 0, 2.6, 0.35, 1.6, r, 10, 4));
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()), x = Math.cos(a) * d * 2.3, z = Math.sin(a) * d * 1.4;
      flowers.push(blob(x, 0.42 + r() * 0.12, z, 0.2, 0.14, 0.2, r, 5, 3));
    }
    for (let c = 0; c < 2; c++) {
      const cx = (r() - 0.5) * 2.6, cz = (r() - 0.5) * 1.2;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * 6.28 + r() * 0.4, tilt = 0.35 + r() * 0.35, h = 0.9 + r() * 0.5;
        spikes.push(limb(cx, 0.2, cz, cx + Math.cos(a) * h * tilt, 0.2 + h, cz + Math.sin(a) * h * tilt, 0.09, 0.0, 4));
      }
    }
    const geo = merge([...green.map((g) => M(g, GN, { tag: TAG.LEAF })), ...spikes.map((g) => M(g, GN, { tag: TAG.LEAF })), ...flowers.map((g) => M(g, PK, { tag: TAG.FLOWER, ov: true }))]);
    return [{ geo, lod: 'near', allowOverride: true, lodR: 110 }];
  };
}

// ------------------------------------------------------------------ mobiliário urbano
// Poste de Brasília: base de concreto, haste cônica de aço, braço em curva (pescoço de cisne) e luminária.
// A luminária fica em (0, 7.75, -2.15) no espaço do poste.
export const LAMP_HEAD = [0, 7.6, -2.15];
export function lampPost() {
  const near = [], far = [];
  near.push(M(new THREE.CylinderGeometry(0.28, 0.34, 0.6, 8).translate(0, 0.3, 0), BK, { tag: TAG.NONE }));
  near.push(M(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8).translate(0, 0.64, 0), BK, { fill: true, tag: TAG.METAL }));
  near.push(M(limb(0, 0.6, 0, 0, 7.4, 0, 0.13, 0.08, 8), BK, { fill: true, tag: TAG.METAL }));
  // braço curvo: arco de 6 segmentos
  let px = 0, py = 7.35, pz = 0;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6, a = t * Math.PI * 0.5;
    const nx = 0, nz = -Math.sin(a) * 1.9, ny = 7.35 + (1 - Math.cos(a)) * -0.1 + Math.sin(a) * 0.55 - t * t * 0.15;
    near.push(M(limb(px, py, pz, nx, ny, nz, 0.075, 0.065, 6), BK, { fill: true, tag: TAG.METAL }));
    px = nx; py = ny; pz = nz;
  }
  // luminária: carcaça achatada + lente que acende à noite
  near.push(M(new THREE.SphereGeometry(1, 10, 6).scale(0.42, 0.16, 0.62).translate(0, 7.78, -2.15), BK, { fill: true, tag: TAG.METAL }));
  near.push(M(new THREE.CylinderGeometry(0.3, 0.34, 0.06, 10).scale(1, 1, 1.35).translate(0, 7.63, -2.15), OR, { tag: TAG.LIGHT }));
  far.push(M(new THREE.CylinderGeometry(0.08, 0.13, 7.5, 4).translate(0, 3.75, 0), BK, { fill: true, tag: TAG.METAL }));
  far.push(M(new THREE.BoxGeometry(0.12, 0.12, 2.1).translate(0, 7.75, -1.05), BK, { fill: true, tag: TAG.METAL }));
  far.push(M(new THREE.BoxGeometry(0.5, 0.18, 0.8).translate(0, 7.7, -2.15), OR, { tag: TAG.LIGHT }));
  return () => [{ geo: merge(near), lod: 'near', lodR: 140 }, { geo: merge(far), lod: 'far', lodR: 140 }];
}

// Parada de ônibus típica do Plano: laje grossa de concreto aparente, pilares, painel e banco, placa azul.
export function busStop() {
  const near = [], far = [];
  const W = 4.4;
  // laje com beiral chanfrado
  near.push(M(new THREE.BoxGeometry(W, 0.22, 2.3).translate(0, 2.75, 0.1), BK));
  near.push(M(new THREE.BoxGeometry(W + 0.12, 0.1, 2.42).translate(0, 2.92, 0.1), BK));
  // pilares de concreto
  for (const sx of [-1, 1]) near.push(M(new THREE.BoxGeometry(0.28, 2.65, 0.28).translate(sx * (W / 2 - 0.3), 1.33, 0.95), BK));
  // painel de fundo com vão (vidro azul em cima)
  near.push(M(new THREE.BoxGeometry(W - 0.8, 1.0, 0.12).translate(0, 0.5, 1.0), BK));
  near.push(M(new THREE.BoxGeometry(W - 0.8, 1.05, 0.05).translate(0, 1.75, 1.0), BL, { tag: TAG.NONE }));
  near.push(M(new THREE.BoxGeometry(W - 0.8, 0.08, 0.14).translate(0, 2.3, 1.0), BK, { fill: true, tag: TAG.METAL }));
  // banco de madeira sobre suportes
  near.push(M(new THREE.BoxGeometry(3.0, 0.08, 0.42).translate(0, 0.5, 0.65), OR, { fill: true, tag: TAG.BARK }));
  for (const sx of [-1.2, 0, 1.2]) near.push(M(new THREE.BoxGeometry(0.08, 0.46, 0.3).translate(sx, 0.23, 0.65), BK, { fill: true, tag: TAG.METAL }));
  // placa de parada (haste + placa azul com faixa branca) e lixeira
  near.push(M(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6).translate(2.5, 1.6, -0.5), BK, { fill: true, tag: TAG.METAL }));
  near.push(M(new THREE.BoxGeometry(0.06, 0.62, 0.62).translate(2.5, 3.0, -0.5), BL, { fill: true }));
  near.push(M(new THREE.BoxGeometry(0.07, 0.12, 0.5).translate(2.5, 3.08, -0.5), BK));
  near.push(M(new THREE.CylinderGeometry(0.22, 0.2, 0.75, 8).translate(-2.55, 0.38, 0.4), OR, { fill: true }));
  // luz sob a laje (acende à noite)
  near.push(M(new THREE.BoxGeometry(2.2, 0.04, 0.16).translate(0, 2.62, 0.4), BK, { tag: TAG.LIGHT }));
  far.push(M(new THREE.BoxGeometry(W, 0.3, 2.3).translate(0, 2.8, 0.1), BK));
  far.push(M(new THREE.BoxGeometry(W - 0.6, 2.3, 0.12).translate(0, 1.4, 1.0), BL));
  return () => [{ geo: merge(near), lod: 'near', lodR: 140 }, { geo: merge(far), lod: 'far', lodR: 140 }];
}

// Semáforo de braço (W3/L2): coluna, braço sobre a pista, grupo focal vermelho/amarelo/verde com pala,
// e grupo de pedestre na coluna. As lentes acendem (etiqueta LIGHT).
export function trafficLight() {
  const near = [], far = [];
  near.push(M(new THREE.CylinderGeometry(0.2, 0.24, 0.35, 8).translate(0, 0.17, 0), BK));
  near.push(M(limb(0, 0.3, 0, 0, 5.6, 0, 0.11, 0.09, 8), BK, { fill: true, tag: TAG.METAL }));
  near.push(M(limb(0, 5.4, 0, 0, 5.55, -4.6, 0.07, 0.06, 6), BK, { fill: true, tag: TAG.METAL }));
  near.push(M(limb(0, 4.6, 0, 0, 5.45, -1.4, 0.04, 0.04, 5), BK, { fill: true, tag: TAG.METAL }));
  // grupo focal montado na origem com as lentes para -X (de frente para quem chega), depois posicionado
  const head = (x, y, z, s = 1) => {
    const hp = [];
    hp.push(M(new THREE.BoxGeometry(0.38 * s, 1.15 * s, 0.32 * s), BK, { fill: true, tag: TAG.METAL }));
    hp.push(M(new THREE.BoxGeometry(0.62 * s, 1.45 * s, 0.04).translate(0, 0, -0.18 * s), BK, { fill: true }));   // anteparo
    const ink = [RD, OR, GN];
    for (let i = 0; i < 3; i++) {
      const yy = (1 - i) * 0.36 * s;
      hp.push(M(new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.05, 10).rotateX(Math.PI / 2).translate(0, yy, 0.18 * s), ink[i], { tag: TAG.LIGHT }));
      hp.push(M(new THREE.CylinderGeometry(0.14 * s, 0.14 * s, 0.16, 10, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(0, yy + 0.05 * s, 0.26 * s), BK, { fill: true, tag: TAG.METAL }));
    }
    for (const g of hp) { g.rotateY(-Math.PI / 2); g.translate(x, y, z); near.push(g); }
  };
  head(0, 5.0, -4.3);
  head(-0.3, 3.3, 0, 0.85);
  // grupo de pedestre (boneco vermelho/verde)
  near.push(M(new THREE.BoxGeometry(0.3, 0.62, 0.26).translate(-0.28, 2.6, 0), BK, { fill: true, tag: TAG.METAL }));
  near.push(M(new THREE.BoxGeometry(0.2, 0.2, 0.04).translate(-0.28, 2.74, 0.14), RD, { tag: TAG.LIGHT }));
  near.push(M(new THREE.BoxGeometry(0.2, 0.2, 0.04).translate(-0.28, 2.46, 0.14), GN, { tag: TAG.LIGHT }));
  // botoeira
  near.push(M(new THREE.BoxGeometry(0.14, 0.24, 0.1).translate(0, 1.1, 0.13), OR, { fill: true }));
  far.push(M(new THREE.CylinderGeometry(0.1, 0.12, 5.6, 4).translate(0, 2.8, 0), BK, { fill: true, tag: TAG.METAL }));
  far.push(M(new THREE.BoxGeometry(0.12, 0.12, 4.6).translate(0, 5.5, -2.3), BK, { fill: true, tag: TAG.METAL }));
  far.push(M(new THREE.BoxGeometry(0.4, 1.15, 0.34).translate(0, 5.0, -4.3), BK, { fill: true }));
  return () => [{ geo: merge(near), lod: 'near', lodR: 140 }, { geo: merge(far), lod: 'far', lodR: 140 }];
}
