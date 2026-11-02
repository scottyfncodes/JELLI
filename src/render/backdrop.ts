import { WORLD, zoneAt } from '../content/world';
import type { ZoneId } from '../content/types';
import { TAU, clamp, lerp, mulberry32 } from '../core/math';
import { css, mixRGB, type Palette, type RGB } from './biomeArt';
import { drawGlow } from './sprites';

/**
 * The ocean behind and in front of the play field: distant geology, midground structures and
 * near silhouettes, each biome with its own shapes. Layers scroll at their own parallax rate;
 * the far ones are drawn into small offscreen canvases and scaled up, which softens them like
 * a camera's depth of field and keeps their fill cost low on phones.
 */

type Kind =
  | 'pinnacle'
  | 'bommie'
  | 'tower'
  | 'pillar'
  | 'colonnade'
  | 'ziggurat'
  | 'cliff'
  | 'chimney'
  | 'spire'
  | 'kelp'
  | 'school'
  | 'anemones'
  | 'fan'
  | 'fin'
  | 'drifter'
  | 'column'
  | 'head'
  | 'tubeworms'
  | 'smoker'
  | 'crystals'
  | 'blade'
  | 'branch'
  | 'rock'
  | 'shard';

type LayerKey = 'far' | 'mid' | 'fore';

/** Which shapes each biome is built from, per layer. Repeats weight the pick. */
const RECIPES: Record<ZoneId, Record<LayerKey, Kind[]>> = {
  shallows: { far: ['bommie', 'bommie', 'pinnacle'], mid: ['bommie', 'kelp', 'kelp', 'school'], fore: ['blade', 'blade', 'branch'] },
  gardens: { far: ['tower', 'tower', 'bommie'], mid: ['anemones', 'fan', 'anemones', 'school'], fore: ['branch', 'blade'] },
  twilight: { far: ['pillar', 'pillar', 'cliff'], mid: ['fin', 'drifter', 'school', 'fin'], fore: ['rock'] },
  forgotten: { far: ['colonnade', 'ziggurat', 'pillar'], mid: ['column', 'head', 'column', 'fin'], fore: ['rock'] },
  abyss: { far: ['cliff', 'chimney', 'cliff'], mid: ['tubeworms', 'smoker', 'drifter', 'fin'], fore: ['rock'] },
  hadal: { far: ['spire', 'spire', 'cliff'], mid: ['crystals', 'drifter', 'crystals'], fore: ['shard', 'rock'] },
};

interface Layer {
  id: number;
  key: LayerKey;
  /** Scroll rate relative to the camera. */
  f: number;
  /** Size relative to the play field at the same zoom. */
  scale: number;
  tile: number;
  /** Elements per million square layer units. */
  density: number;
  /** How far toward the haze color the layer is pushed: atmospheric perspective. */
  haze: number;
  alpha: number;
}

const LAYERS: Layer[] = [
  { id: 0, key: 'far', f: 0.1, scale: 0.42, tile: 1300, density: 2.6, haze: 0.62, alpha: 0.75 },
  { id: 1, key: 'far', f: 0.22, scale: 0.58, tile: 1000, density: 5, haze: 0.36, alpha: 0.9 },
  { id: 2, key: 'mid', f: 0.5, scale: 0.62, tile: 800, density: 8, haze: 0.16, alpha: 1 },
  { id: 3, key: 'fore', f: 1.5, scale: 1.55, tile: 900, density: 3.2, haze: 0, alpha: 0.85 },
];

interface El {
  kind: Kind;
  zone: ZoneId;
  x: number;
  y: number;
  s: number;
  seed: number;
  /** Extents around the anchor, in layer units. */
  ex: number;
  top: number;
  bottom: number;
  /** Precomputed outline (x, y pairs) for silhouettes. */
  pts: number[];
  /** Extra geometry: branches, columns, lights (kind specific). */
  extra: number[];
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------- geometry builders

function jagged(rng: () => number, pts: number[], x0: number, y0: number, x1: number, y1: number, steps: number, amp: number): void {
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const nl = Math.hypot(nx, ny) || 1;
    const j = i === steps ? 0 : (rng() - 0.5) * amp;
    pts.push(lerp(x0, x1, k) + (nx / nl) * j, lerp(y0, y1, k) + (ny / nl) * j);
  }
}

function build(kind: Kind, s: number, rng: () => number): Pick<El, 'ex' | 'top' | 'bottom' | 'pts' | 'extra'> {
  const pts: number[] = [];
  const extra: number[] = [];
  switch (kind) {
    case 'pinnacle': {
      const w = 150 * s;
      const h = (300 + rng() * 260) * s;
      pts.push(-w, 0);
      jagged(rng, pts, -w, 0, -w * 0.35, -h * 0.82, 7, 40 * s);
      jagged(rng, pts, -w * 0.35, -h * 0.82, w * 0.05, -h, 3, 26 * s);
      jagged(rng, pts, w * 0.05, -h, w * 0.4, -h * 0.7, 3, 30 * s);
      jagged(rng, pts, w * 0.4, -h * 0.7, w * 1.1, 0, 7, 40 * s);
      return { ex: w * 1.2, top: h, bottom: 40, pts, extra };
    }
    case 'bommie': {
      // A coral head: a domed mound crowded with staghorn, brain coral, tube sponges and fans.
      const w = (190 + rng() * 120) * s;
      const h = (90 + rng() * 50) * s;
      pts.push(-w, 0);
      const bumps = 8;
      const crown: number[] = [];
      for (let i = 0; i <= bumps; i++) {
        const k = i / bumps;
        const y = -Math.sin(k * Math.PI) * h * (0.75 + rng() * 0.35);
        pts.push(lerp(-w, w, k), y);
        crown.push(lerp(-w, w, k), y);
      }
      pts.push(w, 0);
      // Pieces: [type, x, y, size, colorIndex, seed]
      const n = 5 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const k = 0.08 + (0.84 * (i + rng() * 0.6)) / n;
        const j = Math.min(bumps - 1, Math.floor(k * bumps));
        const f = k * bumps - j;
        const x = lerp(crown[j * 2], crown[j * 2 + 2], f);
        const y = lerp(crown[j * 2 + 1], crown[j * 2 + 3], f) + 6 * s;
        extra.push(Math.floor(rng() * 4), x, y, (26 + rng() * 26) * s, Math.floor(rng() * 3), rng() * 100);
      }
      return { ex: w * 1.1, top: h + 120 * s, bottom: 30, pts, extra };
    }
    case 'tower': {
      // A tube-coral tower: a tall column swelling in rings, dotted with lights.
      const h = (700 + rng() * 700) * s;
      const w = (34 + rng() * 22) * s;
      const rings = 6 + Math.floor(rng() * 4);
      pts.push(-w * 1.4, 0);
      for (let i = 1; i <= rings; i++) {
        const k = i / rings;
        const bulge = 1 + 0.35 * Math.sin(i * 2.1 + rng());
        pts.push(-w * bulge * (1 - k * 0.3), -h * k);
      }
      for (let i = rings; i >= 1; i--) {
        const k = i / rings;
        const bulge = 1 + 0.35 * Math.sin(i * 1.7 + rng());
        pts.push(w * bulge * (1 - k * 0.3), -h * k);
      }
      pts.push(w * 1.4, 0);
      for (let i = 0; i < 9; i++) extra.push((rng() - 0.5) * w * 1.4, -h * (0.15 + rng() * 0.85), 6 + rng() * 10, Math.floor(rng() * 3));
      return { ex: w * 2, top: h + 40, bottom: 30, pts, extra };
    }
    case 'pillar': {
      // A basalt column so tall both ends vanish into the water.
      const w = (130 + rng() * 120) * s;
      const h = (2200 + rng() * 1200) * s;
      pts.push(-w, h / 2);
      jagged(rng, pts, -w, h / 2, -w * 0.9, -h / 2, 16, 26 * s);
      pts.push(w * 0.9, -h / 2);
      jagged(rng, pts, w * 0.9, -h / 2, w, h / 2, 16, 26 * s);
      const facets = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < facets; i++) extra.push(lerp(-w * 0.6, w * 0.6, (i + 0.5) / facets) + (rng() - 0.5) * 20 * s);
      return { ex: w * 1.1, top: h / 2, bottom: h / 2, pts, extra };
    }
    case 'colonnade': {
      // Columns under a broken lintel, on a stepped plinth: [x, y, w, h] rects.
      const n = 4 + Math.floor(rng() * 3);
      const gap = 120 * s;
      const colH = (300 + rng() * 120) * s;
      const width = (n - 1) * gap;
      extra.push(-width / 2 - 70 * s, 0, width + 140 * s, 40 * s);
      extra.push(-width / 2 - 40 * s, -30 * s, width + 80 * s, 34 * s);
      const broken = Math.floor(rng() * n);
      for (let i = 0; i < n; i++) {
        const hh = i === broken ? colH * (0.35 + rng() * 0.3) : colH;
        extra.push(-width / 2 + i * gap - 22 * s, -30 * s - hh, 44 * s, hh);
      }
      const lintelEnd = broken > n / 2 ? broken : n - 1;
      const lintelStart = broken <= n / 2 ? broken + 1 : 0;
      if (lintelEnd > lintelStart) extra.push(-width / 2 + lintelStart * gap - 40 * s, -30 * s - colH - 46 * s, (lintelEnd - lintelStart) * gap + 80 * s, 46 * s);
      return { ex: width / 2 + 100 * s, top: colH + 120 * s, bottom: 50 * s, pts, extra };
    }
    case 'ziggurat': {
      const steps = 4 + Math.floor(rng() * 2);
      const base = (380 + rng() * 120) * s;
      const sh = 70 * s;
      for (let i = 0; i < steps; i++) {
        const w = base * (1 - i / (steps + 1));
        extra.push(-w / 2, -sh * (i + 1), w, sh);
      }
      return { ex: base / 2 + 20, top: sh * steps + 40, bottom: 20, pts, extra };
    }
    case 'cliff': {
      // A trench wall: a vast jagged mass that runs off the side of the view.
      const w = (520 + rng() * 300) * s;
      const h = (1500 + rng() * 900) * s;
      const side = rng() < 0.5 ? -1 : 1;
      pts.push(side * -w * 2, -h / 2);
      jagged(rng, pts, side * -w * 2, -h / 2, side * w * 0.2, -h / 2 + 60 * s, 6, 60 * s);
      jagged(rng, pts, side * w * 0.2, -h / 2 + 60 * s, side * w * 0.6, 0, 9, 110 * s);
      jagged(rng, pts, side * w * 0.6, 0, side * w * 0.1, h / 2, 9, 110 * s);
      pts.push(side * -w * 2, h / 2);
      return { ex: w * 2.1, top: h / 2 + 60, bottom: h / 2, pts, extra };
    }
    case 'chimney': {
      const h = (520 + rng() * 380) * s;
      const w = (60 + rng() * 40) * s;
      pts.push(-w * 2, 0);
      jagged(rng, pts, -w * 2, 0, -w * 0.5, -h, 10, 30 * s);
      pts.push(w * 0.5, -h);
      jagged(rng, pts, w * 0.5, -h, w * 2, 0, 10, 30 * s);
      return { ex: w * 2.2, top: h + 260 * s, bottom: 30, pts, extra };
    }
    case 'spire': {
      // Crystal spires: tall shards, pointing up from below and down from above.
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const x = (rng() - 0.5) * 260 * s;
        const h = (380 + rng() * 620) * s;
        const w = (40 + rng() * 50) * s;
        const tilt = (rng() - 0.5) * 0.4;
        const dir = rng() < 0.3 ? 1 : -1;
        extra.push(x, h, w, tilt, dir);
      }
      return { ex: 260 * s, top: 1000 * s, bottom: 1000 * s, pts, extra };
    }
    case 'kelp': {
      const n = 3 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) extra.push((rng() - 0.5) * 160 * s, (380 + rng() * 420) * s, (5 + rng() * 5) * s, rng() * TAU);
      return { ex: 160 * s, top: 820 * s, bottom: 20, pts, extra };
    }
    case 'school': {
      const n = 26 + Math.floor(rng() * 30);
      for (let i = 0; i < n; i++) extra.push(rng() * TAU, 20 + rng() * 70, 0.6 + rng() * 0.8, rng() * TAU);
      return { ex: 200 * s, top: 140 * s, bottom: 140 * s, pts, extra };
    }
    case 'anemones': {
      const w = (120 + rng() * 80) * s;
      pts.push(-w, 0);
      for (let i = 0; i <= 6; i++) {
        const k = i / 6;
        pts.push(lerp(-w, w, k), -Math.sin(k * Math.PI) * w * 0.45 * (0.8 + rng() * 0.4));
      }
      pts.push(w, 0);
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        extra.push(lerp(-w * 0.85, w * 0.85, k), -Math.sin(k * Math.PI) * w * 0.4, (70 + rng() * 80) * s, rng() * TAU, Math.floor(rng() * 3));
      }
      return { ex: w * 1.2, top: w * 0.5 + 200 * s, bottom: 20, pts, extra };
    }
    case 'fan': {
      // A sea fan: a forked lattice, glowing at its nodes.
      const segs: number[] = [];
      const grow = (x: number, y: number, a: number, len: number, d: number) => {
        const ex = x + Math.cos(a) * len;
        const ey = y + Math.sin(a) * len;
        segs.push(x, y, ex, ey, d);
        if (d < 5) {
          grow(ex, ey, a - 0.35 - rng() * 0.2, len * 0.78, d + 1);
          grow(ex, ey, a + 0.35 + rng() * 0.2, len * 0.78, d + 1);
        }
      };
      grow(0, 0, -Math.PI / 2, 70 * s, 1);
      extra.push(...segs);
      return { ex: 260 * s, top: 340 * s, bottom: 10, pts, extra };
    }
    case 'fin': {
      // A blade of rock rising from below or hanging from above.
      const h = (520 + rng() * 520) * s;
      const w = (90 + rng() * 70) * s;
      const dir = rng() < 0.5 ? -1 : 1;
      pts.push(-w, 0);
      jagged(rng, pts, -w, 0, (rng() - 0.5) * w, dir * h, 8, 50 * s);
      jagged(rng, pts, pts[pts.length - 2], dir * h, w, 0, 8, 50 * s);
      for (let i = 0; i < 7; i++) extra.push((rng() - 0.5) * w, dir * h * rng() * 0.8, 3 + rng() * 6);
      return { ex: w * 1.4, top: dir < 0 ? h + 30 : 30, bottom: dir > 0 ? h + 30 : 30, pts, extra };
    }
    case 'drifter': {
      extra.push(rng() < 0.5 ? -1 : 1, 0.6 + rng() * 0.8, rng() * TAU);
      return { ex: 560 * s, top: 120 * s, bottom: 360 * s, pts, extra };
    }
    case 'column': {
      const h = (260 + rng() * 260) * s;
      const w = (44 + rng() * 20) * s;
      const tilt = (rng() - 0.5) * 0.5;
      extra.push(h, w, tilt, rng() < 0.6 ? 1 : 0);
      return { ex: w * 3 + h * Math.abs(tilt), top: h + 60 * s, bottom: 40 * s, pts, extra };
    }
    case 'head': {
      extra.push(rng() < 0.5 ? -1 : 1, (0.9 + rng() * 0.5) * s, (rng() - 0.5) * 0.4);
      return { ex: 260 * s, top: 320 * s, bottom: 60 * s, pts, extra };
    }
    case 'tubeworms': {
      const n = 7 + Math.floor(rng() * 8);
      for (let i = 0; i < n; i++) extra.push((rng() - 0.5) * 120 * s, (60 + rng() * 140) * s, (5 + rng() * 4) * s, rng() * TAU);
      return { ex: 120 * s, top: 240 * s, bottom: 30, pts, extra };
    }
    case 'smoker': {
      const h = (220 + rng() * 220) * s;
      const w = (34 + rng() * 20) * s;
      pts.push(-w * 2.4, 0);
      jagged(rng, pts, -w * 2.4, 0, -w * 0.6, -h, 8, 24 * s);
      pts.push(w * 0.6, -h);
      jagged(rng, pts, w * 0.6, -h, w * 2.4, 0, 8, 24 * s);
      extra.push(h, w);
      return { ex: w * 3, top: h + 420 * s, bottom: 30, pts, extra };
    }
    case 'crystals': {
      const n = 4 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) extra.push((rng() - 0.5) * 150 * s, (90 + rng() * 220) * s, (18 + rng() * 22) * s, (rng() - 0.5) * 0.9, 1);
      return { ex: 200 * s, top: 340 * s, bottom: 30, pts, extra };
    }
    case 'blade': {
      extra.push((380 + rng() * 300) * s, (22 + rng() * 18) * s, rng() * TAU, rng() < 0.5 ? -1 : 1);
      return { ex: 140 * s, top: 700 * s, bottom: 40, pts, extra };
    }
    case 'branch': {
      const grow = (x: number, y: number, a: number, len: number, d: number) => {
        const ex = x + Math.cos(a) * len;
        const ey = y + Math.sin(a) * len;
        extra.push(x, y, ex, ey, (14 - d * 3) * s);
        if (d < 3) {
          grow(ex, ey, a - 0.3 - rng() * 0.4, len * 0.72, d + 1);
          if (rng() < 0.8) grow(ex, ey, a + 0.3 + rng() * 0.4, len * 0.72, d + 1);
        }
      };
      grow(0, 0, -Math.PI / 2 + (rng() - 0.5) * 0.5, 120 * s, 0);
      return { ex: 300 * s, top: 380 * s, bottom: 20, pts, extra };
    }
    case 'rock': {
      const w = (160 + rng() * 140) * s;
      const h = (240 + rng() * 260) * s;
      pts.push(-w, h);
      jagged(rng, pts, -w, h, -w * 0.7, -h * 0.4, 6, 50 * s);
      jagged(rng, pts, -w * 0.7, -h * 0.4, w * 0.2, -h, 5, 50 * s);
      jagged(rng, pts, w * 0.2, -h, w, h, 8, 50 * s);
      return { ex: w * 1.2, top: h + 30, bottom: h, pts, extra };
    }
    case 'shard': {
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) extra.push((rng() - 0.5) * 120 * s, (240 + rng() * 260) * s, (40 + rng() * 40) * s, (rng() - 0.5) * 0.6, -1);
      return { ex: 200 * s, top: 520 * s, bottom: 40, pts, extra };
    }
  }
}

// ---------------------------------------------------------------- caustics

const CAUSTIC_SIZE = 128;
const CAUSTIC_FRAMES = 24;

/** One frame of tileable water caustics: bright, sharp-edged light lines. */
function causticFrame(time: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = CAUSTIC_SIZE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(CAUSTIC_SIZE, CAUSTIC_SIZE);
  const d = img.data;
  const inten = 0.005;
  for (let py = 0; py < CAUSTIC_SIZE; py++) {
    for (let px = 0; px < CAUSTIC_SIZE; px++) {
      const x0 = (px / CAUSTIC_SIZE) * TAU - 250;
      const y0 = (py / CAUSTIC_SIZE) * TAU - 250;
      let ix = x0;
      let iy = y0;
      let col = 1;
      for (let n = 0; n < 4; n++) {
        const t = time * (1 - 3.5 / (n + 1));
        const nx = x0 + Math.cos(t - ix) + Math.sin(t + iy);
        const ny = y0 + Math.sin(t - iy) + Math.cos(t + ix);
        ix = nx;
        iy = ny;
        col += 1 / Math.hypot(x0 / (Math.sin(ix + t) / inten), y0 / (Math.cos(iy + t) / inten));
      }
      col /= 4;
      col = 1.17 - Math.pow(col, 1.4);
      const v = clamp(Math.pow(Math.abs(col), 8) * 1.6, 0, 1);
      const o = (py * CAUSTIC_SIZE + px) * 4;
      d[o] = 235;
      d[o + 1] = 255;
      d[o + 2] = 250;
      d[o + 3] = v * 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- the backdrop

export class Backdrop {
  private cache = new Map<number, El[]>();
  private farCanvas: HTMLCanvasElement;
  private farCtx: CanvasRenderingContext2D;
  private foreCanvas: HTMLCanvasElement;
  private foreCtx: CanvasRenderingContext2D;
  private caustics: HTMLCanvasElement[] = [];
  private w = 1;
  private h = 1;
  /** Offscreen resolution of the soft layers, as a fraction of the screen. */
  private static FAR_RES = 0.34;
  private static FORE_RES = 0.22;

  constructor() {
    this.farCanvas = document.createElement('canvas');
    this.farCtx = this.farCanvas.getContext('2d')!;
    this.foreCanvas = document.createElement('canvas');
    this.foreCtx = this.foreCanvas.getContext('2d')!;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.farCanvas.width = Math.max(1, Math.ceil(w * Backdrop.FAR_RES));
    this.farCanvas.height = Math.max(1, Math.ceil(h * Backdrop.FAR_RES));
    this.foreCanvas.width = Math.max(1, Math.ceil(w * Backdrop.FORE_RES));
    this.foreCanvas.height = Math.max(1, Math.ceil(h * Backdrop.FORE_RES));
  }

  /** Builds caustic frames a couple at a time, so start-up never stalls. */
  warm(): void {
    if (this.caustics.length < CAUSTIC_FRAMES) this.caustics.push(causticFrame(this.caustics.length * 0.16));
  }

  /** Elements of one layer tile, generated deterministically and cached. */
  private tile(L: Layer, i: number): El[] {
    const key = L.id * 100000 + i;
    let els = this.cache.get(key);
    if (els) return els;
    if (this.cache.size > 160) this.cache.clear();
    els = [];
    const worldY = ((i + 0.5) * L.tile) / L.f;
    if (worldY > 120) {
      const zone = zoneAt(worldY).id;
      const rng = mulberry32((Math.imul(i + 7919, 2654435761) ^ (L.id * 97531)) >>> 0);
      const margin = 600;
      const x0 = -margin;
      const x1 = WORLD.width * L.f + margin;
      const expected = (L.density * (x1 - x0) * L.tile) / 1e6;
      const n = Math.floor(expected + rng());
      const kinds = RECIPES[zone][L.key];
      for (let k = 0; k < n; k++) {
        const kind = kinds[Math.floor(rng() * kinds.length)];
        const s = 0.7 + rng() * 0.6;
        const x = x0 + rng() * (x1 - x0);
        const y = i * L.tile + rng() * L.tile;
        // Nothing grows above the surface.
        if (y / L.f < 260 && L.key !== 'fore') continue;
        els.push({ kind, zone, x, y, s, seed: rng() * 1000, ...build(kind, s, rng) });
      }
    }
    this.cache.set(key, els);
    return els;
  }

  // ------------------------------------------------------------ drawing

  /**
   * Distant formations and midground structures, drawn behind the play field.
   * `camX/camY/zoom` are the gameplay camera's.
   */
  drawBack(ctx: CanvasRenderingContext2D, pal: Palette, camX: number, camY: number, zoom: number, time: number, caustic = 0, causticX = 0, causticY = 0): void {
    const fc = this.farCtx;
    const R = Backdrop.FAR_RES;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, this.farCanvas.width, this.farCanvas.height);
    fc.setTransform(R, 0, 0, R, 0, 0);
    REC.list.length = 0;
    REC.on = true;
    this.drawLayer(fc, LAYERS[0], pal, camX, camY, zoom, time);
    this.drawLayer(fc, LAYERS[1], pal, camX, camY, zoom, time);
    REC.on = false;
    // A faint web of caustic light in the open water, drawn soft and cheap at the far layer's resolution.
    if (caustic > 0.01) this.drawCaustics(fc, 0, 0, this.w, this.h, causticX, causticY, 2.6 * zoom, caustic, time, false);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.farCanvas, 0, 0, this.w, this.h);
  }

  drawMid(ctx: CanvasRenderingContext2D, pal: Palette, camX: number, camY: number, zoom: number, time: number): void {
    REC.on = true;
    this.drawLayer(ctx, LAYERS[2], pal, camX, camY, zoom, time);
    REC.on = false;
  }

  /** Scenery lights recorded this frame, laid back over the darkness so they show through it. */
  drawSceneryLights(ctx: CanvasRenderingContext2D, dark: number): void {
    if (dark < 0.05 || !REC.list.length) return;
    const k = Math.min(1, dark * 1.1);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of REC.list) drawGlow(ctx, l.color, l.x, l.y, l.r * 1.4, l.a * k * 0.75);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Near silhouettes passing in front of everything, softly out of focus. */
  drawFore(ctx: CanvasRenderingContext2D, pal: Palette, camX: number, camY: number, zoom: number, time: number): void {
    const fc = this.foreCtx;
    const R = Backdrop.FORE_RES;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, this.foreCanvas.width, this.foreCanvas.height);
    fc.setTransform(R, 0, 0, R, 0, 0);
    if (!this.drawLayer(fc, LAYERS[3], pal, camX, camY, zoom, time)) return;
    // Keep the middle of the view clear: foreground only frames the edges, never hides the jelly.
    fc.globalCompositeOperation = 'destination-out';
    const g = fc.createLinearGradient(0, 0, this.w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.24, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.4, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.76, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fc.fillStyle = g;
    fc.fillRect(0, 0, this.w, this.h);
    fc.globalCompositeOperation = 'source-over';
    // Only the edge strips hold anything now; skip compositing the cleared middle.
    const cw = this.foreCanvas.width;
    const ch = this.foreCanvas.height;
    const strip = Math.ceil(cw * 0.4);
    ctx.drawImage(this.foreCanvas, 0, 0, strip, ch, 0, 0, (strip / cw) * this.w, this.h);
    ctx.drawImage(this.foreCanvas, cw - strip, 0, strip, ch, this.w - (strip / cw) * this.w, 0, (strip / cw) * this.w, this.h);
  }

  private drawLayer(ctx: CanvasRenderingContext2D, L: Layer, pal: Palette, camX: number, camY: number, zoom: number, time: number): boolean {
    const z = zoom * L.scale;
    const cx = camX * L.f;
    const cy = camY * L.f;
    const hw = this.w / 2 / z;
    const hh = this.h / 2 / z;
    const i0 = Math.floor((cy - hh - 1800) / L.tile);
    const i1 = Math.floor((cy + hh + 1800) / L.tile);
    const base = L.key === 'far' ? pal.far : L.key === 'mid' ? pal.mid : pal.fore;
    const fill = mixRGB(base, pal.haze, L.haze);
    const lit = mixRGB(L.key === 'far' ? pal.farLit : pal.midLit, pal.haze, L.haze * 0.6);
    let drew = false;
    for (let i = i0; i <= i1; i++) {
      for (const el of this.tile(L, i)) {
        if (el.x + el.ex < cx - hw || el.x - el.ex > cx + hw || el.y + el.bottom < cy - hh || el.y - el.top > cy + hh) continue;
        const sx = (el.x - cx) * z + this.w / 2;
        const sy = (el.y - cy) * z + this.h / 2;
        const alpha = L.alpha;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(z, z);
        ctx.globalAlpha = alpha;
        REC.sx = sx;
        REC.sy = sy;
        REC.z = z;
        drawElement(ctx, el, fill, lit, pal, L, time);
        ctx.restore();
        drew = true;
      }
    }
    ctx.globalAlpha = 1;
    return drew;
  }

  /**
   * Sunlight shafts falling from the surface: wide soft beams that sway and breathe,
   * strongest near the surface and gone by the twilight.
   */
  drawRays(ctx: CanvasRenderingContext2D, pal: Palette, camX: number, camY: number, zoom: number, time: number): void {
    const k = pal.sunK * clamp(1 - camY / 5200, 0, 1);
    if (k <= 0.01) return;
    const { w, h } = this;
    ctx.globalCompositeOperation = 'lighter';
    const n = 7;
    for (let i = 0; i < n; i++) {
      const phase = hash(i + 3) * TAU;
      const breathe = 0.55 + 0.45 * Math.sin(time * (0.21 + hash(i) * 0.2) + phase);
      const a = k * 0.16 * breathe;
      if (a < 0.004) continue;
      const span = w + 400;
      const base = ((i + 0.5) / n) * span - camX * zoom * 0.08 + Math.sin(time * 0.11 + phase) * w * 0.05;
      const x = (((base % span) + span) % span) - 200;
      const tw = (24 + hash(i * 7) * 70) * (0.8 + 0.2 * Math.sin(time * 0.3 + i));
      const skew = w * 0.22;
      const len = h * (0.9 + hash(i * 3) * 0.4);
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, css(pal.sun, a));
      g.addColorStop(0.55, css(pal.sun, a * 0.4));
      g.addColorStop(1, css(pal.sun, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - tw * 0.5, -10);
      ctx.lineTo(x + tw * 0.5, -10);
      ctx.lineTo(x + tw * 2.2 + skew, len);
      ctx.lineTo(x - tw * 0.9 + skew, len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** A slow drift of light across everything in the sunlit water, anchored to the world. */
  drawCaustics(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ox: number, oy: number, scale: number, alpha: number, time: number, smooth = true): void {
    const frames = this.caustics.length;
    if (frames < 2 || alpha <= 0.01) return;
    // Ping-pong through the frames, crossfading between neighbours.
    const span = frames - 1;
    const p = (time * (smooth ? 2.2 : 5)) % (span * 2);
    const pos = p < span ? p : span * 2 - p;
    const f0 = Math.floor(pos);
    const f1 = Math.min(span, f0 + 1);
    // Without crossfading, step through frames faster so the motion still reads as smooth.
    const mix = smooth ? pos - f0 : 0;
    const size = CAUSTIC_SIZE * scale;
    const sx0 = x - ((((x - ox) % size) + size) % size);
    const sy0 = y - ((((y - oy) % size) + size) % size);
    const prevOp = ctx.globalCompositeOperation;
    const prevA = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (const [img, a] of [
      [this.caustics[f0], 1 - mix],
      [this.caustics[f1], mix],
    ] as const) {
      if (a <= 0.02) continue;
      ctx.globalAlpha = alpha * a;
      for (let ty = sy0; ty < y + h; ty += size) {
        for (let tx = sx0; tx < x + w; tx += size) ctx.drawImage(img, tx, ty, size + 0.5, size + 0.5);
      }
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevA;
  }
}

// ---------------------------------------------------------------- element art

/**
 * Lights in the scenery are drawn into their layer, and also recorded in screen space so the
 * renderer can lay them back over the darkness: distant bioluminescence that shows through the dark.
 */
const REC = { on: false, sx: 0, sy: 0, z: 1, list: [] as { x: number; y: number; r: number; color: string; a: number }[] };

function glow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, a: number): void {
  drawGlow(ctx, color, x, y, r, a);
  if (REC.on && REC.list.length < 160) REC.list.push({ x: REC.sx + x * REC.z, y: REC.sy + y * REC.z, r: r * REC.z, color, a });
}

/** One coral on a coral head: staghorn, brain coral, tube sponge or a small fan. */
export function coralPiece(ctx: CanvasRenderingContext2D, type: number, x: number, y: number, size: number, c: RGB, hi: RGB, seed: number, time: number, glowColor: string | null): void {
  const rng = mulberry32(seed * 1000);
  ctx.save();
  ctx.translate(x, y);
  switch (type) {
    case 0: {
      // Staghorn: thick, short forking branches with pale tips.
      ctx.strokeStyle = css(c);
      const grow = (px: number, py: number, a: number, len: number, d: number) => {
        const ex = px + Math.cos(a) * len;
        const ey = py + Math.sin(a) * len;
        ctx.lineWidth = size * (0.28 - d * 0.06);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (d < 2) {
          grow(ex, ey, a - 0.45 - rng() * 0.2, len * 0.75, d + 1);
          grow(ex, ey, a + 0.45 + rng() * 0.2, len * 0.75, d + 1);
        } else {
          ctx.fillStyle = css(hi);
          ctx.beginPath();
          ctx.arc(ex, ey, size * 0.09, 0, TAU);
          ctx.fill();
          if (glowColor) glow(ctx, glowColor, ex, ey, size * 0.35, 0.5 + 0.3 * Math.sin(time * 1.4 + seed + ex));
        }
      };
      grow(0, 0, -Math.PI / 2 + (rng() - 0.5) * 0.4, size * 0.7, 0);
      break;
    }
    case 1: {
      // Brain coral: a dome traced with meandering grooves.
      ctx.fillStyle = css(c);
      ctx.beginPath();
      ctx.ellipse(0, 0, size, size * 0.7, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = css(hi, 0.55);
      ctx.lineWidth = size * 0.07;
      ctx.beginPath();
      for (let k = 1; k <= 3; k++) {
        const rr = size * (0.25 * k);
        ctx.moveTo(-rr, 0);
        for (let a = 0; a <= 12; a++) {
          const q = a / 12;
          const ang = Math.PI + q * Math.PI;
          const wob = 1 + 0.12 * Math.sin(q * 18 + k * 2 + seed);
          ctx.lineTo(Math.cos(ang) * rr * wob, Math.sin(ang) * rr * 0.7 * wob);
        }
      }
      ctx.stroke();
      break;
    }
    case 2: {
      // Tube sponges: open-topped vases, leaning apart.
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        const ox = (k - (n - 1) / 2) * size * 0.45;
        const hh = size * (1.1 + rng() * 0.8);
        const lean = (k - (n - 1) / 2) * 0.18;
        ctx.save();
        ctx.translate(ox, 0);
        ctx.rotate(lean);
        ctx.fillStyle = css(c);
        ctx.beginPath();
        ctx.moveTo(-size * 0.14, 0);
        ctx.lineTo(-size * 0.2, -hh);
        ctx.lineTo(size * 0.2, -hh);
        ctx.lineTo(size * 0.14, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = css(mixRGB(c, [0, 0, 0], 0.45));
        ctx.beginPath();
        ctx.ellipse(0, -hh, size * 0.2, size * 0.07, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    default: {
      // A small sea fan, swaying.
      const sway = Math.sin(time * 0.8 + seed) * 0.08;
      ctx.rotate(sway);
      ctx.strokeStyle = css(c, 0.95);
      const grow = (px: number, py: number, a: number, len: number, d: number) => {
        const ex = px + Math.cos(a) * len;
        const ey = py + Math.sin(a) * len;
        ctx.lineWidth = Math.max(1, size * (0.12 - d * 0.025));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (d < 3) {
          grow(ex, ey, a - 0.4, len * 0.78, d + 1);
          grow(ex, ey, a + 0.4, len * 0.78, d + 1);
        }
      };
      grow(0, 0, -Math.PI / 2, size * 0.6, 0);
    }
  }
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, pts: number[]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/** Lit from above, dissolving into the murk below: the cue that the ocean continues. */
function shade(ctx: CanvasRenderingContext2D, el: El, fill: RGB, lit: RGB, pal: Palette, sunny: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, -el.top, 0, el.bottom);
  g.addColorStop(0, css(mixRGB(fill, lit, 0.18 + 0.3 * sunny)));
  g.addColorStop(0.45, css(fill));
  g.addColorStop(1, css(mixRGB(fill, pal.haze, 0.55), 0));
  return g;
}

function drawElement(ctx: CanvasRenderingContext2D, el: El, fill: RGB, lit: RGB, pal: Palette, L: Layer, time: number): void {
  const s = el.s;
  const t = time + el.seed;
  const sunny = pal.sunK;
  const accents = pal.accents;
  const glowOn = L.key !== 'fore';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (el.kind) {
    case 'pinnacle':
    case 'cliff':
    case 'chimney':
    case 'rock': {
      ctx.fillStyle = shade(ctx, el, fill, lit, pal, sunny);
      polygon(ctx, el.pts);
      ctx.fill();
      // Light catching the upper edges.
      ctx.strokeStyle = css(lit, 0.35 + 0.25 * sunny);
      ctx.lineWidth = 6 * s;
      ctx.beginPath();
      const p = el.pts;
      for (let i = 2; i < p.length; i += 2) {
        const up = p[i + 1] < p[i - 1] - 2;
        if (up && p[i + 1] < 0) {
          ctx.moveTo(p[i - 2], p[i - 1]);
          ctx.lineTo(p[i], p[i + 1]);
        }
      }
      ctx.stroke();
      if (el.kind === 'chimney' && glowOn) {
        const top = el.pts.reduce((m, v, i) => (i % 2 ? Math.min(m, v) : m), 0);
        glow(ctx, '#ff9a5a', 0, top, 110 * s, 0.45 + 0.15 * Math.sin(t * 2));
        glow(ctx, accents[0], 0, top - 120 * s, 200 * s, 0.12);
      }
      break;
    }
    case 'bommie': {
      ctx.fillStyle = shade(ctx, el, fill, lit, pal, sunny);
      polygon(ctx, el.pts);
      ctx.fill();
      const e = el.extra;
      const warm = L.key === 'mid' && (el.zone === 'shallows' || el.zone === 'gardens');
      for (let i = 0; i < e.length; i += 6) {
        const [type, x, y, size, ci, sd] = [e[i], e[i + 1], e[i + 2], e[i + 3], e[i + 4], e[i + 5]];
        const c = warm ? mixRGB(fill, hexRGB(accents[ci]), el.zone === 'shallows' ? 0.55 : 0.35) : mixRGB(fill, lit, 0.1);
        coralPiece(ctx, type, x, y, size, c, mixRGB(c, [255, 255, 255], 0.35 * sunny), sd, time, warm && el.zone === 'gardens' && glowOn ? accents[ci] : null);
      }
      break;
    }
    case 'tower': {
      ctx.fillStyle = shade(ctx, el, fill, lit, pal, sunny);
      polygon(ctx, el.pts);
      ctx.fill();
      if (glowOn) {
        const e = el.extra;
        for (let i = 0; i < e.length; i += 4) glow(ctx, accents[e[i + 3]], e[i], e[i + 1], e[i + 2] * 3 * s, 0.4 + 0.3 * Math.sin(t * 1.3 + i));
      }
      break;
    }
    case 'pillar': {
      ctx.fillStyle = shade(ctx, el, fill, lit, pal, sunny);
      polygon(ctx, el.pts);
      ctx.fill();
      ctx.strokeStyle = css(mixRGB(fill, [0, 0, 0], 0.25), 0.6);
      ctx.lineWidth = 5 * s;
      ctx.beginPath();
      for (const fx of el.extra) {
        ctx.moveTo(fx, -el.top);
        ctx.lineTo(fx, el.bottom);
      }
      ctx.stroke();
      ctx.strokeStyle = css(lit, 0.25);
      ctx.lineWidth = 8 * s;
      ctx.beginPath();
      ctx.moveTo(el.pts[0] + 6 * s, el.pts[1]);
      for (let i = 2; i < 34 && i < el.pts.length; i += 2) ctx.lineTo(el.pts[i] + 6 * s, el.pts[i + 1]);
      ctx.stroke();
      break;
    }
    case 'colonnade':
    case 'ziggurat': {
      const g = ctx.createLinearGradient(0, -el.top, 0, el.bottom);
      g.addColorStop(0, css(mixRGB(fill, lit, 0.2)));
      g.addColorStop(0.7, css(fill));
      g.addColorStop(1, css(fill, 0));
      ctx.fillStyle = g;
      const e = el.extra;
      ctx.beginPath();
      for (let i = 0; i < e.length; i += 4) ctx.rect(e[i], e[i + 1], e[i + 2], e[i + 3]);
      ctx.fill();
      if (glowOn) {
        if (el.kind === 'ziggurat') {
          const topStep = e.length - 4;
          glow(ctx, accents[0], 0, e[topStep + 1] + e[topStep + 3] * 0.5, 70 * s, 0.6 + 0.2 * Math.sin(t));
        } else {
          for (let i = 8; i < e.length; i += 4) glow(ctx, accents[0], e[i] + e[i + 2] / 2, e[i + 1] + 30 * s, 26 * s, 0.25 + 0.15 * Math.sin(t * 0.8 + i));
        }
      }
      break;
    }
    case 'spire':
    case 'crystals':
    case 'shard': {
      const e = el.extra;
      for (let i = 0; i < e.length; i += 5) {
        const [x, h, w, tilt, dir] = [e[i], e[i + 1], e[i + 2], e[i + 3], e[i + 4]];
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(tilt);
        ctx.scale(1, -dir);
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, css(fill, 0));
        g.addColorStop(0.4, css(fill));
        g.addColorStop(1, css(mixRGB(fill, lit, 0.4)));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.lineTo(-w * 0.8, h * 0.85);
        ctx.lineTo(0, h);
        ctx.lineTo(w * 0.8, h * 0.85);
        ctx.lineTo(w, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = css(lit, 0.5);
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.2);
        ctx.lineTo(0, h);
        ctx.stroke();
        if (glowOn) glow(ctx, accents[0], 0, h * 0.8, w * 1.6, 0.25 + 0.15 * Math.sin(t * 0.9 + i));
        ctx.restore();
      }
      break;
    }
    case 'kelp': {
      // Translucent kelp, swaying in the swell with gas bladders along each strand.
      const e = el.extra;
      const kelpC = mixRGB(fill, [40, 120, 90], 0.35);
      ctx.fillStyle = css(kelpC, 0.85);
      for (let i = 0; i < e.length; i += 4) {
        const [bx, hgt, w, ph] = [e[i], e[i + 1], e[i + 2], e[i + 3]];
        const segs = 10;
        ctx.beginPath();
        for (let j = 0; j <= segs; j++) {
          const q = j / segs;
          const x = bx + Math.sin(time * 0.7 + ph + q * 2.4) * 34 * s * q - w * (1 - q * 0.7);
          ctx[j === 0 ? 'moveTo' : 'lineTo'](x, -hgt * q);
        }
        for (let j = segs; j >= 0; j--) {
          const q = j / segs;
          ctx.lineTo(bx + Math.sin(time * 0.7 + ph + q * 2.4) * 34 * s * q + w * (1 - q * 0.7), -hgt * q);
        }
        ctx.fill();
        // Leaves.
        for (let j = 2; j < segs; j += 2) {
          const q = j / segs;
          const x = bx + Math.sin(time * 0.7 + ph + q * 2.4) * 34 * s * q;
          const side = j % 4 ? 1 : -1;
          ctx.beginPath();
          ctx.ellipse(x + side * w * 2.2, -hgt * q, w * 2.6, w * 0.9, side * 0.6 + Math.sin(time + j) * 0.2, 0, TAU);
          ctx.fill();
        }
      }
      if (sunny > 0.3) {
        ctx.strokeStyle = css(lit, 0.18 * sunny);
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        for (let i = 0; i < e.length; i += 4) {
          const [bx, hgt, w, ph] = [e[i], e[i + 1], e[i + 2], e[i + 3]];
          for (let j = 0; j <= 10; j++) {
            const q = j / 10;
            const x = bx + Math.sin(time * 0.7 + ph + q * 2.4) * 34 * s * q - w * 0.5 * (1 - q * 0.7);
            ctx[j === 0 ? 'moveTo' : 'lineTo'](x, -hgt * q);
          }
        }
        ctx.stroke();
      }
      break;
    }
    case 'school': {
      // A bait ball: dozens of small fish wheeling as one.
      const e = el.extra;
      const fishC = mixRGB(fill, lit, 0.35 + 0.3 * sunny);
      ctx.fillStyle = css(fishC, 0.9);
      const swirl = time * 0.5;
      const drift = Math.sin(time * 0.12 + el.seed) * 90 * s;
      for (let i = 0; i < e.length; i += 4) {
        const [a0, rad, sz, ph] = [e[i], e[i + 1], e[i + 2], e[i + 3]];
        const a = a0 + swirl * (1.2 - rad / 140);
        const x = drift + Math.cos(a) * rad * 1.8 * s;
        const y = Math.sin(a) * rad * 0.8 * s + Math.sin(time * 1.4 + ph) * 6 * s;
        const dir = a + Math.PI / 2;
        ctx.beginPath();
        ctx.ellipse(x, y, 9 * sz * s, 2.8 * sz * s, dir, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'anemones': {
      ctx.fillStyle = shade(ctx, el, fill, lit, pal, sunny);
      polygon(ctx, el.pts);
      ctx.fill();
      const e = el.extra;
      for (let i = 0; i < e.length; i += 5) {
        const [x, y, h, ph, ci] = [e[i], e[i + 1], e[i + 2], e[i + 3], e[i + 4]];
        const c = accents[ci];
        const body = mixRGB(fill, hexRGB(c), 0.4);
        // A stalk with a crown of fine tentacles, each tip glowing.
        const stalk = h * 0.35;
        const sway = Math.sin(time * 0.9 + ph) * h * 0.08;
        ctx.strokeStyle = css(body, 0.95);
        ctx.lineWidth = 9 * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + sway * 0.5, y - stalk);
        ctx.stroke();
        ctx.lineWidth = 2.6 * s;
        ctx.beginPath();
        const tips: number[] = [];
        for (let k = 0; k < 9; k++) {
          const a = -Math.PI / 2 + (k - 4) * 0.28 + Math.sin(time * 1.3 + ph + k) * 0.08;
          const len = h * (0.45 + 0.15 * Math.sin(k * 1.7 + ph));
          const bx = x + sway * 0.5;
          const by = y - stalk;
          const tx = bx + Math.cos(a) * len + sway;
          const ty = by + Math.sin(a) * len;
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.5 - sway * 0.3, by + Math.sin(a) * len * 0.6, tx, ty);
          tips.push(tx, ty);
        }
        ctx.stroke();
        if (glowOn) {
          for (let k = 0; k < tips.length; k += 2) glow(ctx, c, tips[k], tips[k + 1], 9 * s, 0.5 + 0.35 * Math.sin(time * 1.6 + ph + k));
        }
      }
      break;
    }
    case 'fan': {
      const e = el.extra;
      const c = hexRGB(accents[Math.floor(el.seed) % accents.length]);
      ctx.strokeStyle = css(mixRGB(fill, c, 0.3), 0.85);
      for (let i = 0; i < e.length; i += 5) {
        ctx.lineWidth = Math.max(1.5, (7 - e[i + 4]) * 2 * s);
        ctx.beginPath();
        ctx.moveTo(e[i], e[i + 1]);
        ctx.lineTo(e[i + 2], e[i + 3]);
        ctx.stroke();
      }
      if (glowOn) {
        for (let i = 0; i < e.length; i += 5) {
          if (e[i + 4] < 4) continue;
          glow(ctx, accents[Math.floor(el.seed) % accents.length], e[i + 2], e[i + 3], 14 * s, 0.35 + 0.3 * Math.sin(time * 2 + i * 0.3));
        }
      }
      break;
    }
    case 'fin': {
      ctx.fillStyle = css(fill);
      polygon(ctx, el.pts);
      ctx.fill();
      if (glowOn) {
        const e = el.extra;
        for (let i = 0; i < e.length; i += 3) glow(ctx, accents[i % accents.length], e[i], e[i + 1], e[i + 2] * 4 * s, 0.35 + 0.25 * Math.sin(time * 0.7 + i));
      }
      break;
    }
    case 'drifter': {
      // A great jelly crossing far off: a translucent bell trailing long arms and lights.
      const [dir, k, ph] = el.extra;
      const x = Math.sin(time * 0.05 * k + ph) * 420 * s * dir;
      const y = Math.sin(time * 0.17 + ph) * 30 * s;
      const r = 70 * s * k;
      const pulse = 1 + 0.06 * Math.sin(time * 0.9 + ph);
      const bc = mixRGB(fill, lit, 0.3);
      const g = ctx.createRadialGradient(x, y - r * 0.5, r * 0.1, x, y, r * 1.1);
      g.addColorStop(0, css(bc, 0.5));
      g.addColorStop(1, css(bc, 0.12));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r * pulse, r * 0.75 / pulse, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = css(bc, 0.3);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const ax = x + (i - 4) * r * 0.2;
        ctx.moveTo(ax, y);
        ctx.quadraticCurveTo(ax + Math.sin(time * 0.6 + i) * r * 0.3, y + r * 1.6, ax + Math.sin(time * 0.4 + i * 2) * r * 0.5, y + r * (3 + (i % 3) * 0.8));
      }
      ctx.stroke();
      if (glowOn) {
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          glow(ctx, accents[i % accents.length], x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.7, 14 * s * k, 0.55 + 0.4 * Math.sin(time * 1.5 - i * 0.6));
        }
      }
      break;
    }
    case 'column': {
      const [h, w, tilt, capital] = el.extra;
      ctx.rotate(tilt);
      const g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, css(mixRGB(fill, lit, 0.3)));
      g.addColorStop(0.5, css(fill));
      g.addColorStop(1, css(mixRGB(fill, [0, 0, 0], 0.3)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.rect(-w, -h, w * 2, h);
      if (capital) ctx.rect(-w * 1.5, -h - 30 * s, w * 3, 30 * s);
      ctx.rect(-w * 1.6, 0, w * 3.2, 24 * s);
      ctx.fill();
      // Fluting and a broken top.
      ctx.strokeStyle = css(mixRGB(fill, [0, 0, 0], 0.35), 0.7);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo((i * w) / 3, -h + 10);
        ctx.lineTo((i * w) / 3, 0);
      }
      ctx.stroke();
      if (glowOn) glow(ctx, accents[0], 0, -h * 0.5, 24 * s, 0.3 + 0.2 * Math.sin(time + el.seed));
      break;
    }
    case 'head': {
      // A colossal stone face, half sunk, its eye still faintly lit.
      const [dir, k, tilt] = el.extra;
      ctx.scale(dir * k, k);
      ctx.rotate(tilt);
      const g = ctx.createLinearGradient(0, -300, 0, 60);
      g.addColorStop(0, css(mixRGB(fill, lit, 0.25)));
      g.addColorStop(1, css(fill, 0.2));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-160, 60);
      ctx.lineTo(-170, -160);
      ctx.quadraticCurveTo(-150, -300, -20, -310);
      ctx.quadraticCurveTo(90, -300, 110, -220);
      ctx.lineTo(118, -170);
      ctx.lineTo(150, -110);
      ctx.lineTo(118, -96);
      ctx.lineTo(126, -60);
      ctx.lineTo(108, -50);
      ctx.quadraticCurveTo(110, -10, 80, 0);
      ctx.lineTo(60, 60);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = css(mixRGB(fill, [0, 0, 0], 0.4), 0.8);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(40, -170);
      ctx.quadraticCurveTo(70, -186, 98, -172);
      ctx.moveTo(-60, -250);
      ctx.lineTo(-90, -120);
      ctx.stroke();
      if (glowOn) glow(ctx, accents[0], 70, -164, 40, 0.5 + 0.3 * Math.sin(time * 0.6 + el.seed));
      break;
    }
    case 'tubeworms': {
      const e = el.extra;
      for (let i = 0; i < e.length; i += 4) {
        const [x, h, w, ph] = [e[i], e[i + 1], e[i + 2], e[i + 3]];
        const bend = Math.sin(time * 0.8 + ph) * 8 * s;
        ctx.strokeStyle = css(mixRGB(fill, [220, 220, 210], 0.22), 0.9);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x, -h * 0.6, x + bend, -h);
        ctx.stroke();
        ctx.fillStyle = css(mixRGB(fill, [220, 40, 60], 0.55), 0.9);
        ctx.beginPath();
        ctx.ellipse(x + bend, -h - w * 0.8, w * 0.9, w * 1.4, bend * 0.02, 0, TAU);
        ctx.fill();
      }
      if (glowOn) glow(ctx, '#ff6a5a', 0, -60 * s, 120 * s, 0.18);
      break;
    }
    case 'smoker': {
      // A black smoker: a chimney breathing a dark plume, its mouth glowing hot.
      const [h, w] = el.extra;
      ctx.fillStyle = shade(ctx, el, fill, lit, pal, 0);
      polygon(ctx, el.pts);
      ctx.fill();
      ctx.fillStyle = css(mixRGB(fill, [0, 0, 0], 0.4), 0.45);
      for (let i = 0; i < 7; i++) {
        const q = ((time * 0.18 + i / 7) % 1);
        const r = w * (0.8 + q * 3.2);
        ctx.beginPath();
        ctx.arc(Math.sin(time * 0.5 + i * 2) * q * 40 * s, -h - q * 400 * s, r, 0, TAU);
        ctx.fill();
      }
      if (glowOn) glow(ctx, '#ff8a3a', 0, -h, w * 2.4, 0.55 + 0.2 * Math.sin(time * 3 + el.seed));
      break;
    }
    case 'blade': {
      // One huge kelp blade drifting across the lens.
      const [len, w, ph, dir] = el.extra;
      ctx.fillStyle = css(mixRGB(fill, [20, 70, 50], 0.3));
      ctx.beginPath();
      const segs = 12;
      for (let j = 0; j <= segs; j++) {
        const q = j / segs;
        const x = Math.sin(time * 0.5 + ph + q * 2.6) * 60 * s * q * dir - w * (1 - q * 0.5);
        ctx[j === 0 ? 'moveTo' : 'lineTo'](x, -len * q);
      }
      for (let j = segs; j >= 0; j--) {
        const q = j / segs;
        ctx.lineTo(Math.sin(time * 0.5 + ph + q * 2.6) * 60 * s * q * dir + w * (1 - q * 0.5), -len * q);
      }
      ctx.fill();
      break;
    }
    case 'branch': {
      const e = el.extra;
      ctx.strokeStyle = css(fill);
      for (let i = 0; i < e.length; i += 5) {
        ctx.lineWidth = e[i + 4] * 2;
        ctx.beginPath();
        ctx.moveTo(e[i], e[i + 1]);
        ctx.lineTo(e[i + 2], e[i + 3]);
        ctx.stroke();
      }
      break;
    }
  }
}

const HEX_CACHE = new Map<string, RGB>();
function hexRGB(hex: string): RGB {
  let v = HEX_CACHE.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    HEX_CACHE.set(hex, v);
  }
  return v;
}
