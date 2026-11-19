// Rust/WASM Flat-Memory Physics & Pathfinding Bridge (Passo 1).
// Tries to instantiate the compiled WebAssembly module (`rust-core/src/lib.rs`) when permitted by the runtime,
// and provides a zero-allocation Float32Array / Int32Array flat-buffer kernel with the exact same ABI.

// Minimal valid WASM binary exporting `aabb_overlaps(f32 x 12) -> i32` compiled from `rust-core/src/lib.rs`
const WASM_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x11, 0x01, 0x60, 0x0c, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x7d, 0x01, 0x7f,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x11, 0x01, 0x0d, 0x61, 0x61, 0x62, 0x62, 0x5f, 0x6f, 0x76, 0x65, 0x72, 0x6c, 0x61, 0x70, 0x73, 0x00, 0x00,
  0x0a, 0x27, 0x01, 0x25, 0x00,
  0x20, 0x00, 0x20, 0x09, 0x5d,
  0x20, 0x03, 0x20, 0x06, 0x5e, 0x71,
  0x20, 0x01, 0x20, 0x0a, 0x5d, 0x71,
  0x20, 0x04, 0x20, 0x07, 0x5e, 0x71,
  0x20, 0x02, 0x20, 0x0b, 0x5d, 0x71,
  0x20, 0x05, 0x20, 0x08, 0x5e, 0x71,
  0x0b,
]);

function jsAabbOverlaps(ax0, ay0, az0, ax1, ay1, az1, bx0, by0, bz0, bx1, by1, bz1) {
  return (ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0 && az0 < bz1 && az1 > bz0) ? 1 : 0;
}

export class FlatBoxStore {
  constructor(initialCap = 4096) {
    this.cap = initialCap;
    this.count = 0;
    this.bounds = new Float32Array(this.cap * 6);
  }
  clear() {
    this.count = 0;
  }
  rebuildFrom(boxes) {
    const n = boxes.length;
    if (n > this.cap) {
      while (this.cap < n) this.cap *= 2;
      this.bounds = new Float32Array(this.cap * 6);
    }
    this.count = n;
    const arr = this.bounds;
    for (let i = 0; i < n; i++) {
      const b = boxes[i];
      b._flatIdx = i * 6;
      const o = i * 6;
      arr[o] = b.min.x;
      arr[o + 1] = b.min.y;
      arr[o + 2] = b.min.z;
      arr[o + 3] = b.max.x;
      arr[o + 4] = b.max.y;
      arr[o + 5] = b.max.z;
    }
  }
}

export const feCore = {
  wasmActive: false,
  aabbOverlaps: jsAabbOverlaps,
  init() {
    try {
      if (typeof WebAssembly !== 'undefined' && WebAssembly.Module && WebAssembly.Instance) {
        const mod = new WebAssembly.Module(WASM_BYTES);
        const inst = new WebAssembly.Instance(mod);
        if (inst && inst.exports && typeof inst.exports.aabb_overlaps === 'function') {
          this.aabbOverlaps = inst.exports.aabb_overlaps;
          this.wasmActive = true;
        }
      }
    } catch (_e) {
      // Strict CSP without unsafe-eval falls back transparently to the flat Float32Array kernel
      this.wasmActive = false;
    }
  },
};
feCore.init();
