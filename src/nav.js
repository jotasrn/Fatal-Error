// Navigation grid auto-generated from the collision world (multi-level: one node per walkable surface per cell).
import * as THREE from 'three';

const _min = new THREE.Vector3(), _max = new THREE.Vector3(), _q = [];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

class Heap {
  constructor() { this.f = []; this.n = []; }
  clear() { this.f.length = 0; this.n.length = 0; }
  push(f, n) {
    const fa = this.f, na = this.n;
    let i = fa.length;
    fa.push(f); na.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fa[p] <= fa[i]) break;
      const tf = fa[p]; fa[p] = fa[i]; fa[i] = tf;
      const tn = na[p]; na[p] = na[i]; na[i] = tn;
      i = p;
    }
  }
  popNode() {
    const fa = this.f, na = this.n;
    const top = na[0];
    const lf = fa.pop(), ln = na.pop();
    const len = fa.length;
    if (len > 0) {
      fa[0] = lf; na[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < len && fa[l] < fa[m]) m = l;
        if (r < len && fa[r] < fa[m]) m = r;
        if (m === i) break;
        const tf = fa[m]; fa[m] = fa[i]; fa[i] = tf;
        const tn = na[m]; na[m] = na[i]; na[i] = tn;
        i = m;
      }
    }
    return top;
  }
  get size() { return this.f.length; }
}

export class NavGrid {
  constructor(world, bounds, cell = 1.0) {
    this.world = world; this.cell = cell;
    this.minX = bounds.minX; this.minZ = bounds.minZ; this.minY = bounds.minY ?? -5;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / cell); this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    this.nodes = []; this.cells = new Array(this.nx * this.nz).fill(null);
    this._gen = null; this._closed = null; this._heap = new Heap(); this._searchId = 0;
  }
  build() {
    const w = this.world, c = this.cell;
    for (let iz = 0; iz < this.nz; iz++) for (let ix = 0; ix < this.nx; ix++) {
      const x = this.minX + (ix + 0.5) * c, z = this.minZ + (iz + 0.5) * c;
      _min.set(x - 0.05, -30, z - 0.05); _max.set(x + 0.05, 90, z + 0.05); w.query(_min, _max, _q);
      if (_q.length === 0) continue;
      const tops = new Set();
      for (const b of _q) if (!b.data.noNav) tops.add(b.max.y);
      for (const y of [...tops].sort((a, b) => a - b)) {
        if (y < this.minY || y > 70) continue;
        _min.set(x - 0.22, y + 0.72, z - 0.22); _max.set(x + 0.22, y + 1.85, z + 0.22);
        if (w.overlapsAABB(_min, _max)) continue;
        const id = this.nodes.length; this.nodes.push({ x, y, z, ix, iz, links: [] });
        const ci = iz * this.nx + ix; (this.cells[ci] || (this.cells[ci] = [])).push(id);
      }
    }
    const maxRise = Math.max(1.35, c * 1.22);
    for (const A of this.nodes) {
      for (const [dx, dz] of DIRS) {
        const nix = A.ix + dx, niz = A.iz + dz;
        if (nix < 0 || niz < 0 || nix >= this.nx || niz >= this.nz) continue;
        const cand = this.cells[niz * this.nx + nix]; if (!cand) continue;
        for (const id of cand) {
          const B = this.nodes[id]; const dy = B.y - A.y;
          if (dy > maxRise || dy < -8) continue;
          if (dx !== 0 && dz !== 0 && (!this._hasNodeNear(A.ix + dx, A.iz, A.y, B.y) || !this._hasNodeNear(A.ix, A.iz + dz, A.y, B.y))) continue;
          if (!this._linkClear(A, B)) continue;
          if (dy < -0.6 && !this._dropClear(A, B)) continue;
          const horiz = Math.hypot(dx, dz) * c; let cost = Math.hypot(horiz, dy);
          if (dy > 0.6) cost *= 1 + dy * 1.1; else if (dy < -0.6) cost += -dy * 0.35;
          A.links.push({ to: id, cost, dy });
        }
      }
    }
    this._gen = new Int32Array(this.nodes.length); this._closed = new Int32Array(this.nodes.length); this._g = new Float32Array(this.nodes.length); this._from = new Int32Array(this.nodes.length);
    return this;
  }
  _hasNodeNear(ix, iz, y1, y2) {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return false;
    const cand = this.cells[iz * this.nx + ix]; if (!cand) return false;
    const tol = Math.max(0.75, this.cell * 0.55);
    for (const id of cand) { const y = this.nodes[id].y; if (Math.abs(y - y1) < tol || Math.abs(y - y2) < tol) return true; }
    return false;
  }
  _linkClear(A, B) {
    // Start above knee/tread height so the next stair tread does not read as a wall; railings are
    // a metre tall and still block, which is what keeps enemies off balconies they cannot reach.
    const yBase = Math.max(A.y, B.y);
    _min.set(Math.min(A.x, B.x) - 0.15, yBase + 0.68, Math.min(A.z, B.z) - 0.15);
    _max.set(Math.max(A.x, B.x) + 0.15, yBase + 1.72, Math.max(A.z, B.z) + 0.15);
    return !this.world.overlapsAABB(_min, _max);
  }
  _dropClear(A, B) {
    _min.set(B.x - 0.2, B.y + 0.05, B.z - 0.2); _max.set(B.x + 0.2, A.y + 0.05, B.z + 0.2);
    return !this.world.overlapsAABB(_min, _max);
  }
  nearestNode(pos, r = 3, maxDy = 4) {
    const c = this.cell; const cx = Math.floor((pos.x - this.minX) / c), cz = Math.floor((pos.z - this.minZ) / c);
    let best = -1, bestS = Infinity, bestAny = -1, bestAnyS = Infinity;
    for (let iz = cz - r; iz <= cz + r; iz++) for (let ix = cx - r; ix <= cx + r; ix++) {
      if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
      const cand = this.cells[iz * this.nx + ix]; if (!cand) continue;
      for (const id of cand) {
        const n = this.nodes[id]; const dy = n.y - pos.y; const h = Math.hypot(n.x - pos.x, n.z - pos.z);
        const sAny = h + Math.abs(dy) * 2.0; if (sAny < bestAnyS) { bestAnyS = sAny; bestAny = id; }
        if (dy < -maxDy || dy > 2.2) continue;
        const s = h + Math.abs(dy) * 1.5; if (s < bestS) { bestS = s; best = id; }
      }
    }
    return best >= 0 ? best : bestAny;
  }
  // A* between two world positions; returns array of Vector3 or null
  findPath(from, to, maxExpand = 2200) {
    const start = this.nearestNode(from, 3, 3), goal = this.nearestNode(to, 4, 8);
    if (start < 0 || goal < 0) return null;
    const nodes = this.nodes, gen = this._gen, closed = this._closed, g = this._g, fromArr = this._from;
    const sid = ++this._searchId;
    const G = nodes[goal], gx = G.x, gy = G.y, gz = G.z;
    const heap = this._heap; heap.clear();
    const sNode = nodes[start];
    const hStart = Math.hypot(sNode.x - gx, sNode.y - gy, sNode.z - gz) * 1.15;
    gen[start] = sid; g[start] = 0; fromArr[start] = -1; heap.push(hStart, start);
    let bestN = start, bestH = hStart; let expanded = 0; let found = false;
    while (heap.size) {
      const cur = heap.popNode();
      if (closed[cur] === sid) continue;
      closed[cur] = sid;
      if (cur === goal) { found = true; bestN = cur; break; }
      if (++expanded > maxExpand) break;
      const N = nodes[cur];
      const hc = Math.hypot(N.x - gx, N.y - gy, N.z - gz) * 1.15;
      if (hc < bestH) { bestH = hc; bestN = cur; }
      const links = N.links;
      for (let i = 0; i < links.length; i++) {
        const l = links[i], toId = l.to;
        if (closed[toId] === sid) continue;
        const ng = g[cur] + l.cost;
        if (gen[toId] !== sid || ng < g[toId]) {
          gen[toId] = sid; g[toId] = ng; fromArr[toId] = cur;
          const nb = nodes[toId];
          heap.push(ng + Math.hypot(nb.x - gx, nb.y - gy, nb.z - gz) * 1.15, toId);
        }
      }
    }
    const path = []; let n = bestN;
    while (n >= 0) { const nd = nodes[n]; path.push(new THREE.Vector3(nd.x, nd.y, nd.z)); n = fromArr[n]; }
    path.reverse(); path.complete = found;
    return path;
  }
  randomNode() { return this.nodes[Math.floor(Math.random() * this.nodes.length)]; }
}
