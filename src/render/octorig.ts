import { ARM_COUNT, ARM_POINTS, armRestAngle, armRoot, armSide } from './octopus';

/**
 * The octopus's arms in play: eight chains of points in world space. Each point keeps its
 * momentum, eases toward a relaxed curling line hanging from its root, and stays a fixed
 * length from its neighbour, so turns, jets and drifts drag the arms around like real limbs.
 * An arm given a target (prey it is reaching for, a pearl, a rock it is feeling) is solved with
 * FABRIK so its tip lands on the target, stretching a little if it has to.
 */
export interface RigInput {
  /** Body centre in world space, and the angle the body is drawn at (0 = mantle up). */
  x: number;
  y: number;
  angle: number;
  r: number;
  /** Arm length (world units). */
  len: number;
  /** How wide the arms fan (radians either side of straight down). */
  spread: number;
  /** How much the arms curl. */
  curl: number;
  time: number;
  dt: number;
  /** Per-arm targets in world space, or null to hang free. */
  targets: ({ x: number; y: number; w: number } | null)[];
}

export class OctoRig {
  /** World-space chains: [x, y, prevX, prevY] per point. */
  private chains: Float32Array[] = [];
  /** Body-frame copies for drawing. */
  readonly local: Float32Array[] = [];
  private root = { x: 0, y: 0 };

  constructor() {
    for (let i = 0; i < ARM_COUNT; i++) {
      this.chains.push(new Float32Array(ARM_POINTS * 4));
      this.local.push(new Float32Array(ARM_POINTS * 2));
    }
  }

  private fresh = true;

  /** Forget the arms' momentum (a new octopus, or a jump in position). */
  reset(): void {
    this.fresh = true;
  }

  update(inp: RigInput): void {
    const { x, y, angle, r, len, spread, curl, time, dt, targets } = inp;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const seg = len / (ARM_POINTS - 1);
    const N = ARM_POINTS;
    for (let i = 0; i < ARM_COUNT; i++) {
      const c = this.chains[i];
      armRoot(i, r, this.root);
      const rx = x + this.root.x * cos - this.root.y * sin;
      const ry = y + this.root.x * sin + this.root.y * cos;
      const base = angle + armRestAngle(i, spread);
      if (this.fresh || Math.hypot(c[0] - rx, c[1] - ry) > len * 2) {
        for (let j = 0; j < N; j++) {
          const px = rx + Math.cos(base) * seg * j;
          const py = ry + Math.sin(base) * seg * j;
          c.set([px, py, px, py], j * 4);
        }
      }
      c[0] = c[2] = rx;
      c[1] = c[3] = ry;
      if (dt > 0) {
        for (let j = 1; j < N; j++) {
          const f = j / (N - 1);
          const o = j * 4;
          let px = c[o];
          let py = c[o + 1];
          const keep = Math.pow(0.9, dt * 60);
          const vx = (px - c[o + 2]) * keep;
          const vy = (py - c[o + 3]) * keep;
          c[o + 2] = px;
          c[o + 3] = py;
          px += vx;
          py += vy;
          // A relaxed, curling line: each arm waves on its own rhythm, most toward the tip.
          const wave = Math.sin(time * 1.5 + i * 1.3 - f * 3.4) * curl + Math.sin(time * 2.3 + i * 2.1 - f * 6) * curl * 0.25;
          // Tips curl up and outward when relaxed; streaming fast, they straighten behind.
          const a = base + wave * f * 0.65 - armSide(i) * curl * 1.1 * f * f;
          const tx = c[o - 4] + Math.cos(a) * seg;
          const ty = c[o - 3] + Math.sin(a) * seg;
          const pull = 1 - Math.exp(-(10 - 7 * f) * dt);
          px += (tx - px) * pull;
          py += (ty - py) * pull;
          const dx = px - c[o - 4];
          const dy = py - c[o - 3];
          const d = Math.hypot(dx, dy) || 1;
          c[o] = c[o - 4] + (dx / d) * seg;
          c[o + 1] = c[o - 3] + (dy / d) * seg;
        }
        // Bending stiffness: ease each joint toward the midpoint of its neighbours, so a fast
        // turn bends the arm in a curve instead of folding it into zigzags.
        for (let pass = 0; pass < 2; pass++) {
          for (let j = 1; j < N - 1; j++) {
            const o = j * 4;
            const k = 0.35 * (1 - (j / (N - 1)) * 0.5);
            c[o] += ((c[o - 4] + c[o + 4]) * 0.5 - c[o]) * k;
            c[o + 1] += ((c[o - 3] + c[o + 5]) * 0.5 - c[o + 1]) * k;
          }
          for (let j = 1; j < N; j++) {
            const o = j * 4;
            const dx = c[o] - c[o - 4];
            const dy = c[o + 1] - c[o - 3];
            const d = Math.hypot(dx, dy) || 1;
            c[o] = c[o - 4] + (dx / d) * seg;
            c[o + 1] = c[o - 3] + (dy / d) * seg;
          }
        }
        const tg = targets[i];
        if (tg) this.reach(c, tg.x, tg.y, seg, tg.w);
      }
      // Into the body frame for drawing.
      const L = this.local[i];
      for (let j = 0; j < N; j++) {
        const dx = c[j * 4] - x;
        const dy = c[j * 4 + 1] - y;
        L[j * 2] = dx * cos + dy * sin;
        L[j * 2 + 1] = -dx * sin + dy * cos;
      }
    }
    this.fresh = false;
  }

  /** FABRIK: pull the chain so its tip lands on (tx, ty), blended by `w`, stretching up to half again. */
  private reach(c: Float32Array, tx: number, ty: number, seg: number, w: number): void {
    const N = ARM_POINTS;
    const d = Math.hypot(tx - c[0], ty - c[1]);
    const s = Math.min(seg * 1.6, Math.max(seg, d / (N - 1)));
    const px = new Float32Array(N * 2);
    for (let j = 0; j < N; j++) {
      px[j * 2] = c[j * 4];
      px[j * 2 + 1] = c[j * 4 + 1];
    }
    for (let iter = 0; iter < 3; iter++) {
      px[(N - 1) * 2] = tx;
      px[(N - 1) * 2 + 1] = ty;
      for (let j = N - 2; j >= 0; j--) {
        const dx = px[j * 2] - px[(j + 1) * 2];
        const dy = px[j * 2 + 1] - px[(j + 1) * 2 + 1];
        const m = Math.hypot(dx, dy) || 1;
        px[j * 2] = px[(j + 1) * 2] + (dx / m) * s;
        px[j * 2 + 1] = px[(j + 1) * 2 + 1] + (dy / m) * s;
      }
      px[0] = c[0];
      px[1] = c[1];
      for (let j = 1; j < N; j++) {
        const dx = px[j * 2] - px[(j - 1) * 2];
        const dy = px[j * 2 + 1] - px[(j - 1) * 2 + 1];
        const m = Math.hypot(dx, dy) || 1;
        px[j * 2] = px[(j - 1) * 2] + (dx / m) * s;
        px[j * 2 + 1] = px[(j - 1) * 2 + 1] + (dy / m) * s;
      }
    }
    for (let j = 1; j < N; j++) {
      const o = j * 4;
      c[o] += (px[j * 2] - c[o]) * w;
      c[o + 1] += (px[j * 2 + 1] - c[o + 1]) * w;
      c[o + 2] = c[o];
      c[o + 3] = c[o + 1];
    }
  }
}
