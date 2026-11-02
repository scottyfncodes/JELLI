import type { MutationId } from '../content/mutations';
import type { FormId } from '../content/forms';
import type { PersonalityId } from '../content/personality';
import { TAU, clamp, hexToRgb, lerp, rgba } from '../core/math';
import { drawGlow } from './sprites';
import type { OctoVariant } from '../content/octopus';

/**
 * The octopus. Drawn in its own frame: mantle toward -y, arms hanging toward +y, one body
 * radius `r`. Arms arrive as polylines in that same frame, from the physics rig in play or from
 * a procedural pose in portraits, so every mutation and mood looks the same in both.
 */

export type EyeMood = 'calm' | 'alarm' | 'happy' | 'focus' | 'closed' | 'wonder';

export interface OctoLook {
  skin: string;
  spots: string;
  arm: string;
  rim: string;
  glow: string;
}

export interface OctoPose {
  r: number;
  t: number;
  /** 0..1 the mantle squeezing on a jet. */
  squeeze: number;
  mutations: readonly MutationId[];
  forms: readonly FormId[];
  /** Arms currently missing (regrowing), and 0..1 how far the newest has regrown. */
  armsLost: number;
  regrow: number;
  /** Where the eyes look, in the body frame (-1..1). */
  lookX: number;
  lookY: number;
  /** 0 shut .. 1 open (blinks). */
  open: number;
  mood: EyeMood;
  /** 0..1 skin turned to camouflage, and the color it matches. */
  camo: number;
  camoColor: string;
  /** 0..1 a fright: the skin blanches. */
  alarm: number;
  /** 0..1 inner light, stronger in dark water. */
  lum: number;
  personality: PersonalityId | null;
  /** This particular octopus's looks (spots, eyes, head, irises). */
  variant?: OctoVariant;
  /** Silhouette for unknown Journal entries. */
  flat?: boolean;
}

const has = (pose: OctoPose, id: MutationId) => pose.mutations.includes(id);

const DEFAULT_SPOTS: [number, number, number][] = [
  [-0.32, -0.75, 0.09], [0.22, -0.92, 0.07], [0.38, -0.45, 0.08], [-0.45, -0.25, 0.07], [0.05, -0.55, 0.06], [-0.12, -1.05, 0.05], [0.48, -0.1, 0.06], [-0.2, -0.05, 0.05],
];
const SPOT_CACHE = new Map<number, [number, number, number][]>();

/** This octopus's own spot pattern: how many, where and how big. */
function spotsFor(seed: number): [number, number, number][] {
  let out = SPOT_CACHE.get(seed);
  if (out) return out;
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  out = [];
  const n = 5 + Math.floor(rng() * 7);
  for (let i = 0; i < n; i++) out.push([(rng() - 0.5) * 1.1, -0.05 - rng() * 1.0, 0.04 + rng() * 0.07]);
  if (SPOT_CACHE.size > 64) SPOT_CACHE.clear();
  SPOT_CACHE.set(seed, out);
  return out;
}
const hasForm = (pose: OctoPose, id: FormId) => pose.forms.includes(id);

function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `#${[0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], clamp(t, 0, 1))).toString(16).padStart(2, '0')).join('')}`;
}

export const ARM_COUNT = 8;
/** Points along each arm, root to tip. */
export const ARM_POINTS = 11;

/** Where arm i joins the body, in the body frame. Arms 0..7 run left to right under the head. */
export function armRoot(i: number, r: number, out: { x: number; y: number }): { x: number; y: number } {
  // Roots sit round the underside of the head in a wide arc: outer arms high at the sides,
  // middle arms tucked further back under the body, so no two roots crowd together.
  const k = (i / (ARM_COUNT - 1)) * 2 - 1;
  out.x = k * r * 0.62;
  out.y = r * 0.3 + (1 - k * k) * r * 0.16;
  return out;
}

/** Which side an arm belongs to: -1 left, 1 right. */
export function armSide(i: number): number {
  return i < ARM_COUNT / 2 ? -1 : 1;
}

/** The resting direction of arm i in the body frame (radians, 0 = +x). Arms fan downward. */
export function armRestAngle(i: number, spread: number): number {
  // Fan out from a gap in the middle: even the two centre arms angle away from each other,
  // so they never hang together as one thick column under the face.
  const k = (i / (ARM_COUNT - 1)) * 2 - 1;
  return Math.PI / 2 + Math.sign(k) * (0.32 + Math.abs(k) * 0.95) * spread;
}

/** How long the arms are, in body radii. */
export function armLength(r: number, mutations: readonly MutationId[], maturity: number): number {
  return r * (2.3 + 0.6 * maturity) * (mutations.includes('long-arms') ? 1.35 : 1);
}

/**
 * Procedural arms for portraits and other octopuses: each curls on its own slow rhythm.
 * Playful octopuses curl more; cautious ones keep their arms tucked.
 */
export function proceduralArms(r: number, t: number, mutations: readonly MutationId[], maturity: number, personality: PersonalityId | null, trail = 0): Float32Array[] {
  const len = armLength(r, mutations, maturity) * (personality === 'cautious' ? 0.85 : 1);
  const curlAmp = personality === 'playful' ? 0.75 : 0.5;
  const spread = personality === 'cautious' ? 0.7 : 1.05;
  const out: Float32Array[] = [];
  const root = { x: 0, y: 0 };
  for (let i = 0; i < ARM_COUNT; i++) {
    const pts = new Float32Array(ARM_POINTS * 2);
    armRoot(i, r, root);
    let x = root.x;
    let y = root.y;
    let a = armRestAngle(i, spread * (1 - trail * 0.6));
    const seg = len / (ARM_POINTS - 1);
    pts[0] = x;
    pts[1] = y;
    for (let j = 1; j < ARM_POINTS; j++) {
      const f = j / (ARM_POINTS - 1);
      // Each arm waves on its own, and its tip curls up and outward, the way octopus arms coil.
      a += (Math.sin(t * 1.4 + i * 1.3 - f * 3.2) * curlAmp * f * 0.6 - armSide(i) * 0.42 * f * f) * 0.5;
      x += Math.cos(a) * seg;
      y += Math.sin(a) * seg;
      pts[j * 2] = x;
      pts[j * 2 + 1] = y;
    }
    out.push(pts);
  }
  return out;
}

/** Draws the whole octopus: arms, webbing, mantle, eyes and every mutation's mark. */
export function drawOctopus(ctx: CanvasRenderingContext2D, look: OctoLook, pose: OctoPose, arms: Float32Array[]): void {
  const { r, t } = pose;
  const flat = !!pose.flat;
  const deep = has(pose, 'deep-body');
  // Skin: blanches when frightened, darkens in a deep body, and takes on the water when camouflaged.
  let skin = look.skin;
  if (!flat) {
    if (deep) skin = mixHex(skin, '#3a1838', 0.3);
    if (pose.alarm > 0) skin = mixHex(skin, '#fff1ea', pose.alarm * 0.45);
    if (pose.camo > 0) skin = mixHex(skin, pose.camoColor, pose.camo * 0.75);
  }
  const armColor = flat ? look.skin : pose.camo > 0 ? mixHex(look.arm, pose.camoColor, pose.camo * 0.75) : deep ? mixHex(look.arm, '#3a1838', 0.3) : look.arm;
  const lit = flat ? look.skin : mixHex(skin, '#ffffff', 0.35);
  const dark = flat ? look.skin : mixHex(skin, '#1a0a20', 0.45);
  const fade = flat ? 1 : 1 - pose.camo * 0.35;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * fade;

  if (!flat && (pose.lum > 0.05 || has(pose, 'bioluminescence'))) {
    drawGlow(ctx, look.glow, 0, 0, r * (2.6 + (has(pose, 'bioluminescence') ? 1.2 : 0)), 0.12 + 0.18 * pose.lum + (has(pose, 'bioluminescence') ? 0.15 : 0));
  }

  // Lost arms: the newest regrowing one is drawn short; others are stubs.
  const armVisible = (i: number) => {
    const lostOrder = [6, 1, 4];
    const k = lostOrder.indexOf(i);
    if (k < 0 || k >= pose.armsLost) return 1;
    return k === pose.armsLost - 1 ? 0.15 + 0.85 * pose.regrow : 0.15;
  };

  if (has(pose, 'webbed-arms') && !flat) drawWebbing(ctx, arms, armColor, r);
  // Back arms first (outer pairs), front arms over them.
  const order = [3, 4, 2, 5, 1, 6, 0, 7];
  for (const i of order) drawArm(ctx, arms[i], i, armColor, look, pose, armVisible(i));

  // The arm crown: where the arms meet under the head, a soft skirt of skin, so they grow out of
  // the body instead of hanging from it.
  if (!flat) {
    const cg = ctx.createLinearGradient(0, r * 0.2, 0, r * 0.75);
    cg.addColorStop(0, armColor);
    cg.addColorStop(1, mixHex(armColor, '#14081c', 0.25));
    ctx.fillStyle = cg;
  } else ctx.fillStyle = armColor;
  ctx.beginPath();
  ctx.moveTo(-r * 0.66, r * 0.26);
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const a = arms[i];
    ctx.lineTo(a[2], a[3]);
  }
  ctx.lineTo(r * 0.66, r * 0.26);
  ctx.quadraticCurveTo(0, r * 0.12, -r * 0.66, r * 0.26);
  ctx.closePath();
  ctx.fill();

  // Mantle: a soft dome lit from above, squeezing on each jet.
  const sq = pose.squeeze;
  const mx = r * (0.82 - 0.1 * sq) * (deep ? 1.08 : 1);
  const my = r * (1.0 + 0.06 * sq) * (deep ? 1.06 : 1) * (pose.variant?.mantle ?? 1);
  const mcy = -r * 0.32;
  const sway = Math.sin(t * 1.1) * r * 0.04;
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, r * 0.36);
  ctx.bezierCurveTo(-mx * 1.12, r * 0.1, -mx * 1.05, mcy - my * 0.85, sway, mcy - my);
  ctx.bezierCurveTo(mx * 1.05 + sway, mcy - my * 0.85, mx * 1.12, r * 0.1, r * 0.62, r * 0.36);
  ctx.quadraticCurveTo(0, r * 0.62, -r * 0.62, r * 0.36);
  ctx.closePath();
  if (flat) {
    ctx.fillStyle = skin;
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-mx * 0.35, mcy - my * 0.45, r * 0.08, 0, mcy * 0.4, r * 1.25);
    g.addColorStop(0, lit);
    g.addColorStop(0.5, skin);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Chromatophore spots that pulse slowly, and texture when camouflaged.
    const spots: [number, number, number][] = pose.variant ? spotsFor(pose.variant.spots) : DEFAULT_SPOTS;
    const spotColor = pose.camo > 0.2 ? mixHex(pose.camoColor, '#000000', 0.35) : look.spots;
    for (const [sx, sy, sr] of spots) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 1.7 + sx * 9);
      ctx.fillStyle = rgba(spotColor, 0.42 * pulse);
      ctx.beginPath();
      ctx.ellipse(sx * mx * 1.2, sy * my + mcy * 0.2, sr * r * (1 + pose.camo), sr * r * 0.8 * (1 + pose.camo), sx, 0, TAU);
      ctx.fill();
    }
    if (has(pose, 'ink-sac')) {
      ctx.fillStyle = 'rgba(16,10,30,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.05, r * 0.24, r * 0.16, 0, 0, TAU);
      ctx.fill();
    }
    if (has(pose, 'abyssal-heart')) drawGlow(ctx, '#ff6fae', 0, -r * 0.15, r * 0.6, 0.6 + 0.3 * Math.pow(Math.max(0, Math.sin(t * 2.4)), 4));
    if (pose.lum > 0.2) drawGlow(ctx, look.glow, 0, mcy, r * 0.7, 0.25 * pose.lum * (0.6 + 0.4 * sq));
    // Rim light along the dome: soft, translucent skin catching the light.
    const fr = ctx.createRadialGradient(0, mcy * 0.6, r * 0.55, 0, mcy * 0.6, r * 1.15);
    fr.addColorStop(0, rgba(look.rim, 0));
    fr.addColorStop(1, rgba(look.rim, 0.32));
    ctx.fillStyle = fr;
    ctx.fillRect(-r * 1.4, -r * 1.6, r * 2.8, r * 2.4);
    ctx.restore();
    // Specular sheen.
    ctx.strokeStyle = rgba('#ffffff', 0.5);
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-mx * 0.2, mcy - my * 0.15, my * 0.62, Math.PI * 1.18, Math.PI * 1.42);
    ctx.stroke();
    if (has(pose, 'lateral-line')) {
      ctx.fillStyle = rgba(lit, 0.85);
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (1.12 + (k / 8) * 0.76);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * mx * 0.98, mcy + Math.sin(a) * my * 0.98, r * 0.045, 0, TAU);
        ctx.fill();
      }
    }
    if (has(pose, 'blue-rings')) drawRings(ctx, t, [[-0.4, -0.6], [0.3, -0.85], [0.42, -0.3], [-0.15, -0.3], [0, -1.0]].map(([x, y]) => [x * mx, mcy * 0.2 + y * my]), r * 0.09);
  }

  // Siphon: a funnel at the side of the head; a Jet Siphon makes it broad, a Twin Jet doubles it.
  if (!flat) {
    const big = has(pose, 'jet-siphon');
    const sides = has(pose, 'twin-jet') ? [-1, 1] : [1];
    for (const sd of sides) {
      ctx.fillStyle = mixHex(skin, '#000000', 0.15);
      ctx.beginPath();
      const sx = sd * r * 0.6;
      const len = r * (big ? 0.42 : 0.26);
      ctx.moveTo(sx, r * 0.12);
      ctx.quadraticCurveTo(sx + sd * len, r * 0.18 - sq * r * 0.05, sx + sd * len * 1.1, r * 0.32);
      ctx.lineTo(sx + sd * len * 0.6, r * 0.38);
      ctx.quadraticCurveTo(sx + sd * len * 0.3, r * 0.3, sx - sd * r * 0.05, r * 0.32);
      ctx.closePath();
      ctx.fill();
      if (big) {
        ctx.fillStyle = mixHex(skin, '#1a0a20', 0.6);
        ctx.beginPath();
        ctx.ellipse(sx + sd * len * 0.95, r * 0.34, r * 0.06, r * 0.04, 0.4 * sd, 0, TAU);
        ctx.fill();
      }
    }
  }

  if (!flat && pose.variant?.freckles) {
    // Freckles under the eyes, a few or none: one of the little things that make each octopus itself.
    ctx.fillStyle = rgba(look.spots, 0.55);
    for (const sd of [-1, 1]) {
      for (let k = 0; k < pose.variant.freckles; k++) {
        ctx.beginPath();
        ctx.arc(sd * r * (0.62 + k * 0.07), r * (0.3 + (k % 2) * 0.05), r * 0.025, 0, TAU);
        ctx.fill();
      }
    }
  }
  drawEyes(ctx, look, pose, skin);

  if (!flat && has(pose, 'crushing-beak')) {
    ctx.fillStyle = '#2a1a14';
    ctx.beginPath();
    ctx.moveTo(-r * 0.09, r * 0.5);
    ctx.quadraticCurveTo(0, r * 0.74, r * 0.09, r * 0.5);
    ctx.quadraticCurveTo(0, r * 0.56, -r * 0.09, r * 0.5);
    ctx.fill();
  }
  if (!flat) drawForms(ctx, pose, skin, mx, my, mcy);
  ctx.globalAlpha = prevAlpha;
}

function drawRings(ctx: CanvasRenderingContext2D, t: number, pts: number[][], rr: number): void {
  const pulse = 0.6 + 0.4 * Math.sin(t * 4);
  ctx.lineWidth = Math.max(0.6, rr * 0.45);
  for (const [x, y] of pts) {
    ctx.strokeStyle = rgba('#1a1030', 0.7);
    ctx.beginPath();
    ctx.arc(x, y, rr * 1.2, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = rgba('#3ab8ff', 0.95 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.stroke();
    drawGlow(ctx, '#3ab8ff', x, y, rr * 2.4, 0.35 * pulse);
  }
}

function drawWebbing(ctx: CanvasRenderingContext2D, arms: Float32Array[], color: string, r: number): void {
  ctx.fillStyle = rgba(color, 0.35);
  for (let i = 0; i < ARM_COUNT - 1; i++) {
    const a = arms[i];
    const b = arms[i + 1];
    const reach = 4;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    for (let j = 1; j <= reach; j++) ctx.lineTo(a[j * 2], a[j * 2 + 1]);
    const ax = a[reach * 2];
    const ay = a[reach * 2 + 1];
    const bx = b[reach * 2];
    const by = b[reach * 2 + 1];
    // The web's edge dips between the arms.
    ctx.quadraticCurveTo((ax + bx) / 2 + (a[1] - ay) * 0.08, (ay + by) / 2 - r * 0.15, bx, by);
    for (let j = reach - 1; j >= 0; j--) ctx.lineTo(b[j * 2], b[j * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }
}

/** One arm: a tapered, shaded ribbon with a row of suckers along its inner edge. */
function drawArm(ctx: CanvasRenderingContext2D, pts: Float32Array, index: number, color: string, look: OctoLook, pose: OctoPose, visible: number): void {
  const r = pose.r;
  const N = Math.max(2, Math.round((ARM_POINTS - 1) * visible) + 1);
  const L: number[] = [];
  const R: number[] = [];
  const base = r * 0.16 * (has(pose, 'deep-body') ? 1.12 : 1);
  for (let j = 0; j < N; j++) {
    const j0 = Math.max(0, j - 1) * 2;
    const j1 = Math.min(N - 1, j + 1) * 2;
    let tx = pts[j1] - pts[j0];
    let ty = pts[j1 + 1] - pts[j0 + 1];
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm;
    ty /= tm;
    const f = j / (ARM_POINTS - 1);
    const w = Math.max(r * 0.025, base * Math.pow(1 - f, 0.85) + r * 0.02) * (j === N - 1 && visible < 1 ? 0.7 : 1);
    L.push(pts[j * 2] - ty * w, pts[j * 2 + 1] + tx * w);
    R.push(pts[j * 2] + ty * w, pts[j * 2 + 1] - tx * w);
  }
  const ribbon = () => {
    ctx.beginPath();
    ctx.moveTo(L[0], L[1]);
    for (let j = 1; j < N; j++) ctx.lineTo(L[j * 2], L[j * 2 + 1]);
    for (let j = N - 1; j >= 0; j--) ctx.lineTo(R[j * 2], R[j * 2 + 1]);
    ctx.closePath();
  };
  if (pose.flat) {
    ctx.fillStyle = color;
    ribbon();
    ctx.fill();
    return;
  }
  // Outline, body, then a lighter stripe down the upper side for a rounded, fleshy arm.
  ctx.fillStyle = mixHex(color, '#14081c', 0.5);
  ribbon();
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = mixHex(color, '#14081c', 0.5);
  ctx.lineWidth = Math.max(0.6, r * 0.03);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo((L[0] * 2 + R[0]) / 3, (L[1] * 2 + R[1]) / 3);
  for (let j = 1; j < N; j++) ctx.lineTo((L[j * 2] * 3 + R[j * 2]) / 4, (L[j * 2 + 1] * 3 + R[j * 2 + 1]) / 4);
  for (let j = N - 1; j >= 0; j--) ctx.lineTo((L[j * 2] + R[j * 2] * 3) / 4, (L[j * 2 + 1] + R[j * 2 + 1] * 3) / 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(mixHex(color, '#ffffff', 0.45), 0.55);
  ctx.lineWidth = Math.max(0.5, r * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let j = 0; j < N - 1; j++) {
    const x = (L[j * 2] * 2 + pts[j * 2]) / 3;
    const y = (L[j * 2 + 1] * 2 + pts[j * 2 + 1]) / 3;
    if (j === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Suckers along the inner edge: bigger and rimmed when strong, hooked when hooked.
  const strong = has(pose, 'strong-suckers');
  const hooked = has(pose, 'hooked-suckers');
  const inner = index < ARM_COUNT / 2 ? R : L;
  for (let j = 1; j < N - 1; j++) {
    const f = j / (ARM_POINTS - 1);
    const sr = r * 0.075 * (1 - f * 0.75) * (strong ? 1.45 : 1);
    const x = (inner[j * 2] * 2 + pts[j * 2]) / 3;
    const y = (inner[j * 2 + 1] * 2 + pts[j * 2 + 1]) / 3;
    ctx.fillStyle = rgba(look.rim, 0.85);
    ctx.beginPath();
    ctx.arc(x, y, sr, 0, TAU);
    ctx.fill();
    if (strong || hooked) {
      ctx.strokeStyle = rgba(mixHex(color, '#14081c', 0.4), 0.9);
      ctx.lineWidth = Math.max(0.4, sr * 0.35);
      ctx.beginPath();
      if (hooked) ctx.arc(x, y, sr * 0.7, -0.4, Math.PI * 0.9);
      else ctx.arc(x, y, sr * 0.55, 0, TAU);
      ctx.stroke();
    }
  }
  const tipX = pts[(N - 1) * 2];
  const tipY = pts[(N - 1) * 2 + 1];
  if (has(pose, 'venom') && visible >= 1) {
    ctx.fillStyle = rgba('#c59bff', 0.95);
    ctx.beginPath();
    ctx.arc(tipX, tipY, r * 0.06, 0, TAU);
    ctx.fill();
    drawGlow(ctx, '#c59bff', tipX, tipY, r * 0.3, 0.6);
  }
  if (has(pose, 'bioluminescence')) {
    for (let j = 2; j < N; j += 2) drawGlow(ctx, look.glow, pts[j * 2], pts[j * 2 + 1], r * 0.22, 0.55 + 0.35 * Math.sin(pose.t * 3 - j - index));
  }
  if (has(pose, 'blue-rings')) {
    const j = Math.min(N - 2, 3);
    drawRings(ctx, pose.t, [[pts[j * 2], pts[j * 2 + 1]]], r * 0.06);
  }
  if (hasForm(pose, 'razor') && visible >= 1) {
    ctx.fillStyle = rgba('#ff6b6b', 0.9);
    ctx.beginPath();
    ctx.moveTo(L[(N - 2) * 2], L[(N - 2) * 2 + 1]);
    ctx.lineTo(tipX + (tipX - pts[(N - 2) * 2]) * 0.8, tipY + (tipY - pts[(N - 2) * 2 + 1]) * 0.8);
    ctx.lineTo(R[(N - 2) * 2], R[(N - 2) * 2 + 1]);
    ctx.fill();
  }
}

/** Big, expressive eyes with an octopus's horizontal pupils. */
function drawEyes(ctx: CanvasRenderingContext2D, look: OctoLook, pose: OctoPose, skin: string): void {
  const { r, t } = pose;
  const keen = has(pose, 'keen-eyes');
  const alarm = pose.mood === 'alarm';
  const wonder = pose.mood === 'wonder';
  const size = r * 0.27 * (keen ? 1.22 : 1) * (alarm ? 1.12 : wonder ? 1.16 : 1) * (pose.variant?.eye ?? 1);
  const iris = keen ? (['#ffe28a', '#c88a10'] as const) : (pose.variant?.iris ?? (['#e8a050', '#8a4a20'] as const));
  const lx = clamp(pose.lookX, -1, 1);
  const ly = clamp(pose.lookY, -1, 1);
  for (const sd of [-1, 1]) {
    const ex = sd * r * 0.4;
    const ey = r * 0.08;
    // A raised socket of skin around each eye.
    ctx.fillStyle = pose.flat ? skin : mixHex(skin, '#ffffff', 0.12);
    ctx.beginPath();
    ctx.ellipse(ex, ey - size * 0.12, size * 1.28, size * 1.22, 0, 0, TAU);
    ctx.fill();
    if (pose.flat) continue;
    if (pose.mood === 'closed') {
      ctx.strokeStyle = mixHex(skin, '#14081c', 0.6);
      ctx.lineWidth = Math.max(0.8, size * 0.18);
      ctx.beginPath();
      ctx.arc(ex, ey - size * 0.2, size * 0.8, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      continue;
    }
    if (pose.mood === 'happy') {
      // Squinting with pleasure after a good meal.
      ctx.strokeStyle = '#2a1410';
      ctx.lineWidth = Math.max(0.8, size * 0.22);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(ex, ey + size * 0.25, size * 0.75, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.ellipse(ex, ey, size, size * 0.98, 0, 0, TAU);
    ctx.fill();
    // Iris and the horizontal pupil, following whatever it is looking at.
    const ix = ex + lx * size * 0.32;
    const iy = ey + ly * size * 0.28;
    const ir = size * (alarm ? 0.55 : 0.68);
    const ig = ctx.createRadialGradient(ix, iy, ir * 0.2, ix, iy, ir);
    ig.addColorStop(0, iris[0]);
    ig.addColorStop(1, iris[1]);
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(ix, iy, ir, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#120a10';
    // In wonder the pupils open wide and round; in alarm they shrink to slits.
    const pw = ir * (alarm ? 0.55 : wonder ? 0.62 : 0.82);
    const ph = ir * (alarm ? 0.32 : wonder ? 0.56 : 0.36);
    ctx.beginPath();
    ctx.ellipse(ix, iy, pw, ph, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ix - ir * 0.35, iy - ir * 0.4, ir * 0.24, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix + ir * 0.3, iy + ir * 0.25, ir * (wonder ? 0.16 : 0.1), 0, TAU);
    ctx.fill();
    if (wonder) {
      // A starry glint: something new.
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(0.5, ir * 0.08);
      const gx = ix - ir * 0.35;
      const gy = iy - ir * 0.4;
      ctx.beginPath();
      ctx.moveTo(gx - ir * 0.45, gy);
      ctx.lineTo(gx + ir * 0.45, gy);
      ctx.moveTo(gx, gy - ir * 0.45);
      ctx.lineTo(gx, gy + ir * 0.45);
      ctx.stroke();
    }
    // Eyelid: blinks, and lowers in concentration.
    const lid = pose.mood === 'focus' ? 0.42 : 0;
    const shut = clamp(1 - pose.open + lid, 0, 1);
    if (shut > 0.02) {
      ctx.fillStyle = skin;
      ctx.beginPath();
      const top = ey - size * 1.05;
      const edge = top + size * 2.1 * shut;
      const tilt = pose.mood === 'focus' ? sd * size * 0.25 : 0;
      ctx.moveTo(ex - size * 1.1, top);
      ctx.lineTo(ex + size * 1.1, top);
      ctx.lineTo(ex + size * 1.1, edge + tilt);
      ctx.quadraticCurveTo(ex, edge + size * 0.15, ex - size * 1.1, edge - tilt);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = mixHex(skin, '#14081c', 0.45);
      ctx.lineWidth = Math.max(0.5, size * 0.1);
      ctx.beginPath();
      ctx.moveTo(ex - size * 0.95, edge - tilt * 0.9);
      ctx.quadraticCurveTo(ex, edge + size * 0.15, ex + size * 0.95, edge + tilt * 0.9);
      ctx.stroke();
    }
    // A brow ridge that tells the mood: raised in alarm, low and angled when hunting.
    const browY = ey - size * (alarm ? 1.45 : 1.2);
    const browTilt = pose.mood === 'focus' ? sd * size * 0.3 : alarm ? -sd * size * 0.15 : 0;
    ctx.strokeStyle = mixHex(skin, '#14081c', 0.35);
    ctx.lineWidth = Math.max(0.7, size * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - sd * size * 0.7, browY - browTilt);
    ctx.quadraticCurveTo(ex, browY - size * 0.25, ex + sd * size * 0.7, browY + browTilt);
    ctx.stroke();
    void look;
    void t;
  }
}

/** Forms taken from remarkable meals, drawn onto the octopus. */
function drawForms(ctx: CanvasRenderingContext2D, pose: OctoPose, skin: string, mx: number, my: number, mcy: number): void {
  const { r, t } = pose;
  const top = mcy - my;
  if (hasForm(pose, 'needle')) {
    ctx.fillStyle = rgba('#e8f1ff', 0.92);
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, top + r * 0.1);
    ctx.lineTo(0, top - r * 0.9);
    ctx.lineTo(r * 0.08, top + r * 0.1);
    ctx.closePath();
    ctx.fill();
  }
  if (hasForm(pose, 'lure')) {
    const lx = r * 0.35 + Math.sin(t * 1.7) * r * 0.08;
    const ly = top - r * 0.7;
    ctx.strokeStyle = mixHex(skin, '#14081c', 0.4);
    ctx.lineWidth = Math.max(0.8, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, top + r * 0.1);
    ctx.quadraticCurveTo(0, top - r * 0.8, lx, ly);
    ctx.stroke();
    drawGlow(ctx, '#ffe07a', lx, ly, r * 0.8, 0.85);
    ctx.fillStyle = '#fff4c2';
    ctx.beginPath();
    ctx.arc(lx, ly, r * 0.1, 0, TAU);
    ctx.fill();
  }
  if (hasForm(pose, 'lantern')) {
    for (let i = 0; i < 7; i++) {
      const k = i / 6;
      const a = Math.PI * (1.15 + k * 0.7);
      drawGlow(ctx, '#7fe3ff', Math.cos(a) * mx * 0.75, mcy + Math.sin(a) * my * 0.5, r * 0.18, 0.7 + 0.3 * Math.sin(t * 2.4 - i));
    }
  }
  if (hasForm(pose, 'moray')) {
    for (const [sx, sy] of [[-0.4, -0.5], [0.35, -0.7], [0.1, -0.2]]) {
      ctx.fillStyle = rgba('#7f8f3a', 0.55);
      ctx.beginPath();
      ctx.ellipse(sx * mx, mcy * 0.3 + sy * my, r * 0.13, r * 0.1, sx, 0, TAU);
      ctx.fill();
    }
  }
  if (hasForm(pose, 'gilded')) {
    ctx.strokeStyle = rgba('#ffd27a', 0.85);
    ctx.lineWidth = Math.max(0.7, r * 0.045);
    ctx.beginPath();
    for (let k = 0; k <= 36; k++) {
      const a = k * 0.32;
      const rr = r * 0.03 * Math.exp(a * 0.2);
      const x = Math.cos(a + t * 0.4) * rr;
      const y = mcy - my * 0.35 + Math.sin(a + t * 0.4) * rr * 0.8;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (hasForm(pose, 'prism')) {
    const pg = ctx.createLinearGradient(-mx, 0, mx, 0);
    for (let k = 0; k <= 4; k++) pg.addColorStop(k / 4, `hsla(${(t * 70 + k * 80) % 360}, 95%, 76%, 0.85)`);
    ctx.strokeStyle = pg;
    ctx.lineWidth = Math.max(1, r * 0.07);
    ctx.beginPath();
    ctx.ellipse(0, mcy, mx * 0.98, my * 0.98, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  if (hasForm(pose, 'maw')) drawGlow(ctx, '#ff5c8a', 0, r * 0.55, r * 0.5, 0.5);
  if (hasForm(pose, 'aurora')) drawGlow(ctx, '#7dffb9', 0, r * 1.2, r * 1.4, 0.3 + 0.1 * Math.sin(t * 2));
}
