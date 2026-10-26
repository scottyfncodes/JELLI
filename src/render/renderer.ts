import { SWEEP, type World, type Creature, type CoralCluster, type Current } from '../sim/world';
import { canEat, isThreat } from '../sim/rules';
import { WORLD, darknessAt, depthMeters, zoneAt } from '../content/world';
import type { ZoneId } from '../content/types';
import { BASE_RADIUS, maturity } from '../content/progression';
import { TAU, angleLerp, clamp, damp, hexToRgb, lerp, rgba } from '../core/math';
import { bellSize, drawCreatureShape, drawJelly, jellyStyleForSpecies, lookFor, marginalLength, marginalTentacles, type JellyBody, type JellyStyle } from './creatures';
import { drawGlow } from './sprites';
import { drawChest, drawShip } from './wreck';
import { Particles } from './particles';
import { POWERS, TITAN_SCALE } from '../content/powerups';

export interface JoystickView {
  active: boolean;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
}

/** Samples along each hunting tentacle. */
const TENT_SEGS = 22;
/** Links in each trailing marginal tentacle. */
const TRAIL_LINKS = 12;
/** Edge arrows stay below the HUD's depth readout and evolution bar. */
const HUD_TOP = 120;
/** Height of one tile of the far parallax layer, in parallax units. */
const FAR_TILE = 2400;

/** Water color by depth: blue shallows, teal gardens, deep blue drop, sea-green ruins, black abyss, red dream. */
const WATER_STOPS: [number, string][] = [
  [0, '#2b6eaa'],
  [1800, '#1b5a86'],
  [2800, '#0f4a5c'],
  [4400, '#10345a'],
  [6000, '#0e2556'],
  [7400, '#0b1a40'],
  [8800, '#082430'],
  [10800, '#061422'],
  [12600, '#04081c'],
  [14600, '#12051c'],
  [16500, '#2c0a26'],
  [22000, '#34081c'],
];

/** The tint of the dark itself, which turns red in the Hadal Dream. */
function darkColor(y: number): string {
  const k = clamp((y - 14000) / 2500, 0, 1);
  return `${Math.round(lerp(2, 30, k))},${Math.round(lerp(4, 4, k))},${Math.round(lerp(18, 22, k))}`;
}

/** How a reef cluster is built in each biome: living reef, glowing reef, carved ruin, basalt or crystal. */
type CoralKind = 'reef' | 'ruin' | 'crystal';
const BIOME_ROCK: Partial<Record<ZoneId, { kind: CoralKind; base: string; lump: string; polyp: string; glow: number }>> = {
  forgotten: { kind: 'ruin', base: '#3a4e54', lump: '#71878a', polyp: '#5ee0b0', glow: 0.45 },
  abyss: { kind: 'reef', base: '#11142a', lump: '#20263f', polyp: '#b8c8ff', glow: 0.5 },
  hadal: { kind: 'crystal', base: '#3a0e3c', lump: '#8a2a6e', polyp: '#ff6fae', glow: 0.9 },
};

function waterAt(y: number): [number, number, number] {
  for (let i = 1; i < WATER_STOPS.length; i++) {
    if (y <= WATER_STOPS[i][0]) {
      const [y0, c0] = WATER_STOPS[i - 1];
      const [y1, c1] = WATER_STOPS[i];
      const t = clamp((y - y0) / (y1 - y0), 0, 1);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    }
  }
  return hexToRgb(WATER_STOPS[WATER_STOPS.length - 1][1]);
}

function rgbStr(c: [number, number, number], a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const CORAL_PALETTES: [string, string, string][] = [
  ['#4b2f7c', '#7a52b8', '#ff9fd8'],
  ['#17606c', '#2a9696', '#7ff0ff'],
  ['#6a2a52', '#b04f7b', '#ffd27a'],
];

function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return `#${[0, 1, 2].map((i) => Math.round(lerp(x[i], y[i], t)).toString(16).padStart(2, '0')).join('')}`;
}

interface CoralLook {
  kind: CoralKind;
  base: string;
  lump: string;
  polyp: string;
  /** How bright its polyps shine. */
  glow: number;
  /** Circles whose crown isn't buried inside a neighbour get rim light and lumps. */
  exposed: boolean[];
}

interface Streak {
  x: number;
  y: number;
  len: number;
}

interface BgShape {
  x: number;
  y: number;
  r: number[];
  ox: number[];
  oy: number[];
}

interface Kelp {
  x: number;
  y: number;
  h: number;
  w: number;
  ph: number;
}

interface Snow {
  u: number;
  v: number;
  f: number;
  s: number;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly particles = new Particles();
  w = 1;
  h = 1;
  dpr = 1;
  camX = 0;
  camY = 0;
  zoom = 1;
  /** Shifts the subject up the screen (title screen framing). */
  focusOffset = 0;
  /** Shifts the subject left (title screen framing in landscape). */
  focusOffsetX = 0;
  /** Extra magnification for the title showcase. */
  zoomBoost = 1;
  reducedMotion = false;
  shake = 0;
  playerStyle: JellyStyle;

  private coralLooks = new WeakMap<CoralCluster, CoralLook>();
  private streaks = new WeakMap<Current, Streak[]>();
  private far: BgShape[] = [];
  private kelp: Kelp[] = [];
  private snow: Snow[] = [];
  private vignette: CanvasGradient | null = null;
  private lastHeading = 0;
  private sway = 0;
  private time = 0;
  private titanK = 1;

  constructor(private canvas: HTMLCanvasElement, style: JellyStyle) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    this.playerStyle = style;
    const shapes = (n: number, spanX: number, spanY: number, minR: number, maxR: number) => {
      const out: BgShape[] = [];
      for (let i = 0; i < n; i++) {
        const k = 2 + Math.floor(Math.random() * 3);
        const s: BgShape = { x: Math.random() * spanX - 400, y: Math.random() * spanY - 400, r: [], ox: [], oy: [] };
        for (let j = 0; j < k; j++) {
          s.r.push(lerp(minR, maxR, Math.random()) * (j === 0 ? 1 : 0.7));
          s.ox.push(j === 0 ? 0 : (Math.random() - 0.5) * maxR * 1.6);
          s.oy.push(j === 0 ? 0 : (Math.random() - 0.5) * maxR * 0.9);
        }
        out.push(s);
      }
      return out;
    };
    // Parallax layers only need to span the world scaled by their scroll factor.
    // Parallax layers tile vertically, so the endless shaft never runs out of background.
    this.far = shapes(70, WORLD.width * 0.35 + 1400, FAR_TILE, 60, 150);
    for (let i = 0; i < 110; i++) {
      this.kelp.push({ x: Math.random() * (WORLD.width * 0.6 + 1200) - 600, y: Math.random() * (1800 * 0.6 + 900) - 200, h: 180 + Math.random() * 320, w: 5 + Math.random() * 6, ph: Math.random() * TAU });
    }
    for (let i = 0; i < 110; i++) {
      this.snow.push({ u: Math.random(), v: Math.random(), f: 0.25 + Math.random() * 0.9, s: 0.6 + Math.random() * 1.6 });
    }
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    const g = this.ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.hypot(this.w, this.h) * 0.6);
    g.addColorStop(0, 'rgba(2,4,20,0)');
    g.addColorStop(1, 'rgba(2,4,20,0.55)');
    this.vignette = g;
  }

  /** World units visible across the screen's short side; grows with the jelly. */
  targetZoom(r: number): number {
    const visible = 215 * Math.pow(r / BASE_RADIUS, 0.66);
    return (Math.min(this.w, this.h) / visible) * this.zoomBoost;
  }

  viewRadius(): number {
    return Math.hypot(this.w, this.h) / 2 / this.zoom;
  }

  viewHalf(): { hw: number; hh: number } {
    return { hw: this.w / 2 / this.zoom, hh: this.h / 2 / this.zoom };
  }

  snapCamera(world: World): void {
    const p = world.player;
    // A new jelly: its body faces where it does, and its tentacles start fresh.
    this.visHeading = p.heading;
    this.trails = [];
    this.zoom = this.targetZoom(p.r);
    this.camX = p.x + this.focusOffsetX / this.zoom;
    this.camY = p.y + this.focusOffset / this.zoom;
  }

  updateCamera(world: World, dt: number): void {
    const p = world.player;
    this.zoom = damp(this.zoom, this.targetZoom(p.r), 1.5, dt);
    const lead = this.reducedMotion ? 0.1 : 0.22;
    const tx = p.x + p.vx * lead + this.focusOffsetX / this.zoom;
    const ty = p.y + p.vy * lead + this.focusOffset / this.zoom;
    this.camX = damp(this.camX, tx, 4, dt);
    this.camY = damp(this.camY, ty, 4, dt);
    const { hw, hh } = this.viewHalf();
    this.camX = clamp(this.camX, Math.min(hw, world.width / 2), Math.max(world.width - hw, world.width / 2));
    this.camY = clamp(this.camY, -40 + hh * 0.3, world.height - hh + 60);
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  addShake(v: number): void {
    if (!this.reducedMotion) this.shake = Math.min(1, this.shake + v);
  }

  private sx(x: number): number {
    return (x - this.camX) * this.zoom + this.w / 2;
  }

  private sy(y: number): number {
    return (y - this.camY) * this.zoom + this.h / 2;
  }

  // ------------------------------------------------------------------ frame

  render(world: World, dt: number, joystick: JoystickView | null): void {
    this.time += dt;
    const ctx = this.ctx;
    const { w, h } = this;
    const sh = this.shake * this.shake * 10;
    const ox = sh ? (Math.random() - 0.5) * sh : 0;
    const oy = sh ? (Math.random() - 0.5) * sh : 0;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, ox * this.dpr, oy * this.dpr);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    this.drawWater(world);
    this.drawRays();
    this.drawFar();
    this.drawSnow(0.5);
    this.drawKelp();
    this.drawCurrents(world, dt);
    this.drawCorals(world);
    this.drawRecord();
    this.drawWreck(world);
    this.drawPearls(world);
    this.drawCreatures(world);
    this.drawPlayer(world, dt);
    this.particles.update(dt);
    this.particles.draw(ctx, this.camX, this.camY, this.zoom, w, h);
    this.drawDarkness(world);
    this.drawLights(world);
    this.drawSnow(1.1);
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawIndicators(world);
    if (joystick?.active) this.drawJoystick(joystick);
  }

  private drawWater(world: World): void {
    const ctx = this.ctx;
    const top = this.camY - this.h / 2 / this.zoom;
    const bottom = this.camY + this.h / 2 / this.zoom;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, rgbStr(waterAt(top)));
    g.addColorStop(1, rgbStr(waterAt(bottom)));
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
    if (top < 0) {
      // Surface shimmer above the shallows.
      const sy = this.sy(0);
      const sg = ctx.createLinearGradient(0, sy - 80, 0, sy + 30);
      sg.addColorStop(0, 'rgba(160,230,255,0.35)');
      sg.addColorStop(1, 'rgba(160,230,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, this.w, Math.max(0, sy + 30));
    }
    void world;
  }

  private drawRays(): void {
    const k = clamp(1 - this.camY / 2600, 0, 1);
    if (k <= 0) return;
    const ctx = this.ctx;
    const { w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(170,230,255,${0.12 * k})`);
    g.addColorStop(1, 'rgba(170,230,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    const t = this.reducedMotion ? 0 : this.time;
    for (let i = 0; i < 5; i++) {
      const base = ((i + 0.5) / 5) * w + Math.sin(t * 0.15 + i * 2) * w * 0.06 - this.camX * this.zoom * 0.05;
      const x = ((base % (w + 200)) + w + 200) % (w + 200) - 100;
      const tw = 30 + hash(i) * 60;
      const skew = w * 0.18;
      ctx.beginPath();
      ctx.moveTo(x - tw, -10);
      ctx.lineTo(x + tw, -10);
      ctx.lineTo(x + tw * 2.6 + skew, h);
      ctx.lineTo(x - tw * 0.6 + skew, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Distant pools of light drifting slowly behind everything, in the color of the biome just
   * below: the next place glows up through the water before you reach it.
   */
  private drawFar(): void {
    const ctx = this.ctx;
    const f = 0.3;
    const z = this.zoom * 0.6;
    const ahead = zoneAt(this.camY + 1400);
    const here = zoneAt(this.camY);
    const color = ahead.id === 'shallows' ? '#6fb6ff' : ahead.color;
    // Brighter once the water darkens, and brightest just above a new biome.
    const near = ahead !== here ? 1.6 : 1;
    const alpha = (0.06 + 0.1 * darknessAt(this.camY)) * near;
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.far) {
      const x = (s.x - this.camX * f) * z + this.w / 2;
      const py = (((s.y - this.camY * f) % FAR_TILE) + FAR_TILE) % FAR_TILE;
      const y = (py - FAR_TILE / 2) * z + this.h / 2;
      const rr = s.r[0] * z * 2.4;
      if (x < -rr || x > this.w + rr || y < -rr || y > this.h + rr) continue;
      drawGlow(ctx, color, x, y, rr, alpha);
    }
    ctx.globalCompositeOperation = 'source-over';
    this.drawGiants();
  }

  /**
   * Below the Twilight Drop, something enormous is always passing far off in the dark: a dim
   * silhouette with a string of lights, crossing slowly behind everything. It never comes closer.
   */
  private drawGiants(): void {
    const depth = this.camY;
    if (depth < 6800) return;
    const ctx = this.ctx;
    const k = clamp((depth - 6800) / 1200, 0, 1);
    const t = this.reducedMotion ? this.time * 0.3 : this.time;
    const span = this.w + 900;
    const period = span / 22;
    const lap = Math.floor(t / period);
    const x = ((t % period) / period) * span - 450;
    const dir = lap % 2 === 0 ? 1 : -1;
    const sx = dir > 0 ? x : this.w - x;
    const sy = this.h * (0.25 + hash(lap) * 0.5) + Math.sin(t * 0.2) * 20;
    const hadal = depth > 14600;
    const len = Math.min(this.w, this.h) * (hadal ? 0.9 : 1.2);
    const body = hadal ? 'rgba(40,6,30,0.55)' : 'rgba(2,6,14,0.5)';
    const lamp = hadal ? '#ff6fae' : zoneAt(depth).color;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(sx, sy);
    ctx.scale(dir, 1);
    ctx.fillStyle = body;
    ctx.beginPath();
    if (hadal) {
      // A jelly the size of the sky, trailing arms.
      ctx.ellipse(0, 0, len * 0.35, len * 0.22, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = body;
      ctx.lineWidth = len * 0.02;
      for (let i = 0; i < 6; i++) {
        const ax = (i - 2.5) * len * 0.1;
        ctx.beginPath();
        ctx.moveTo(ax, 0);
        ctx.quadraticCurveTo(ax + Math.sin(t * 0.4 + i) * len * 0.1, len * 0.4, ax + Math.sin(t * 0.3 + i * 2) * len * 0.15, len * 0.8);
        ctx.stroke();
      }
    } else {
      // A long, slow leviathan.
      ctx.moveTo(-len * 0.5, 0);
      ctx.quadraticCurveTo(-len * 0.1, -len * 0.12, len * 0.35, -len * 0.04);
      ctx.quadraticCurveTo(len * 0.55, 0, len * 0.35, len * 0.05);
      ctx.quadraticCurveTo(-len * 0.1, len * 0.1, -len * 0.5, 0);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const lx = (hadal ? (i / 8 - 0.5) * len * 0.62 : -len * 0.4 + (i / 8) * len * 0.75);
      const ly = hadal ? -Math.sin((i / 8) * Math.PI) * len * 0.18 : Math.sin(i * 0.9) * len * 0.015;
      drawGlow(ctx, lamp, lx, ly, len * 0.025, 0.5 + 0.4 * Math.sin(t * 1.5 + i));
    }
    ctx.restore();
  }

  /** Swaying kelp silhouettes in a mid parallax layer, fading out with depth. */
  private drawKelp(): void {
    const k = clamp(1 - (this.camY - 1400) / 1400, 0, 1);
    if (k <= 0) return;
    const ctx = this.ctx;
    const f = 0.6;
    const z = this.zoom * 0.8;
    const t = this.reducedMotion ? 0 : this.time;
    ctx.fillStyle = `rgba(6,26,52,${0.4 * k})`;
    for (const kp of this.kelp) {
      const bx = (kp.x - this.camX * f) * z + this.w / 2;
      const by = (kp.y - this.camY * f) * z + this.h / 2;
      const hh = kp.h * z;
      if (bx < -120 || bx > this.w + 120 || by < -20 || by - hh > this.h + 20) continue;
      const segs = 6;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const q = i / segs;
        const x = bx + Math.sin(t * 0.7 + kp.ph + q * 2.2) * 26 * z * q - kp.w * z * (1 - q * 0.85);
        ctx[i === 0 ? 'moveTo' : 'lineTo'](x, by - hh * q);
      }
      for (let i = segs; i >= 0; i--) {
        const q = i / segs;
        const x = bx + Math.sin(t * 0.7 + kp.ph + q * 2.2) * 26 * z * q + kp.w * z * (1 - q * 0.85);
        ctx.lineTo(x, by - hh * q);
      }
      ctx.fill();
    }
  }

  private drawSnow(layer: number): void {
    const ctx = this.ctx;
    const W = this.w + 40;
    const H = this.h + 40;
    const t = this.reducedMotion ? 0 : this.time;
    // In the Hadal Dream the snow falls upward.
    const hadal = this.camY > 14600;
    const fall = hadal ? -6 : 6;
    ctx.fillStyle = hadal ? (layer > 1 ? 'rgba(255,170,210,0.4)' : 'rgba(255,150,200,0.25)') : layer > 1 ? 'rgba(220,240,255,0.35)' : 'rgba(200,230,255,0.22)';
    for (let i = layer > 1 ? 0 : 1; i < this.snow.length; i += 2) {
      const s = this.snow[i];
      const f = s.f * layer;
      let x = (s.u * W - this.camX * this.zoom * f + Math.sin(t * 0.3 + i) * 8) % W;
      let y = (s.v * H - this.camY * this.zoom * f + t * fall * s.f) % H;
      if (x < 0) x += W;
      if (y < 0) y += H;
      const size = s.s * (layer > 1 ? 1.4 : 1);
      ctx.fillRect(x - 20, y - 20, size, size);
    }
  }

  private drawCurrents(world: World, dt: number): void {
    const ctx = this.ctx;
    const { hw, hh } = this.viewHalf();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(160,235,255,0.13)';
    ctx.lineWidth = Math.max(1, 1.6 * this.zoom);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const c of world.currents) {
      if (c.x > this.camX + hw || c.x + c.w < this.camX - hw || c.y > this.camY + hh || c.y + c.h < this.camY - hh) continue;
      let list = this.streaks.get(c);
      if (!list) {
        list = [];
        const n = Math.min(70, Math.floor((c.w * c.h) / 7000));
        for (let i = 0; i < n; i++) list.push({ x: c.x + Math.random() * c.w, y: c.y + Math.random() * c.h, len: 0.15 + Math.random() * 0.25 });
        this.streaks.set(c, list);
      }
      const move = this.reducedMotion ? 0.4 : 1.4;
      for (const s of list) {
        s.x += c.fx * dt * move;
        s.y += c.fy * dt * move;
        if (s.x > c.x + c.w) s.x -= c.w;
        if (s.x < c.x) s.x += c.w;
        if (s.y > c.y + c.h) s.y -= c.h;
        if (s.y < c.y) s.y += c.h;
        const x = this.sx(s.x);
        const y = this.sy(s.y);
        if (x < -40 || x > this.w + 40 || y < -40 || y > this.h + 40) continue;
        ctx.moveTo(x, y);
        ctx.lineTo(x - c.fx * s.len * this.zoom, y - c.fy * s.len * this.zoom);
      }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private coralLook(cl: CoralCluster): CoralLook {
    let look = this.coralLooks.get(cl);
    if (!look) {
      const pal = CORAL_PALETTES[Math.floor(cl.hue * CORAL_PALETTES.length) % CORAL_PALETTES.length];
      const rock = BIOME_ROCK[cl.zone];
      const depth = clamp(((cl.minY + cl.maxY) / 2) / 7400, 0, 1);
      const gardens = cl.zone === 'gardens';
      look = {
        kind: rock?.kind ?? 'reef',
        base: rock?.base ?? mix(pal[0], '#0a0d2c', 0.25 + depth * 0.55),
        lump: rock?.lump ?? mix(pal[1], '#121845', 0.15 + depth * 0.55),
        // The Glow Gardens' reef shines green and gold.
        polyp: rock?.polyp ?? (gardens ? (cl.hue < 0.5 ? '#7dffb9' : '#ffd27a') : depth > 0.6 ? '#7ff0ff' : pal[2]),
        glow: rock?.glow ?? (gardens ? 1 : 0.6),
        exposed: cl.circles.map((c) => !cl.circles.some((o) => o !== c && Math.hypot(c.x - o.x, c.y - c.r * 0.8 - o.y) < o.r * 0.95)),
      };
      this.coralLooks.set(cl, look);
    }
    return look;
  }

  private drawCorals(world: World): void {
    const ctx = this.ctx;
    const { hw, hh } = this.viewHalf();
    const z = this.zoom;
    const t = this.reducedMotion ? 0 : this.time;
    for (const cl of world.corals) {
      if (cl.maxX < this.camX - hw - 20 || cl.minX > this.camX + hw + 20 || cl.maxY < this.camY - hh - 20 || cl.minY > this.camY + hh + 20) continue;
      const look = this.coralLook(cl);
      if (look.kind === 'crystal') {
        this.drawCrystal(cl, look);
        continue;
      }
      // Sea fans behind the rock (ruins have none).
      ctx.strokeStyle = rgba(look.polyp, look.kind === 'ruin' ? 0 : 0.28);
      ctx.lineWidth = Math.max(1, 2 * z);
      ctx.beginPath();
      cl.circles.forEach((c, i) => {
        if (c.r < 34 || hash(cl.seed + i) > 0.45) return;
        const bx = this.sx(c.x);
        const by = this.sy(c.y - c.r * 0.7);
        for (let b = 0; b < 3; b++) {
          const a = -Math.PI / 2 + (b - 1) * 0.5 + Math.sin(t * 0.8 + i + b) * 0.06;
          const len = c.r * (0.8 + hash(cl.seed + i * 3 + b) * 0.6) * z;
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx + Math.cos(a) * len * 0.4 - 6 * z, by + Math.sin(a) * len * 0.5, bx + Math.cos(a) * len, by + Math.sin(a) * len);
        }
      });
      ctx.stroke();

      const top = this.sy(cl.minY);
      const bottom = this.sy(cl.maxY);
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, look.lump);
      g.addColorStop(0.45, look.base);
      g.addColorStop(1, '#060a24');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (const c of cl.circles) {
        const x = this.sx(c.x);
        const y = this.sy(c.y);
        ctx.moveTo(x + c.r * z, y);
        ctx.arc(x, y, c.r * z, 0, TAU);
      }
      ctx.fill();
      // Small knobbly bumps along exposed crowns.
      ctx.fillStyle = rgba(look.lump, 0.55);
      ctx.beginPath();
      cl.circles.forEach((c, i) => {
        if (!look.exposed[i]) return;
        for (let k = 0; k < 4; k++) {
          const a = Math.PI * (1.2 + hash(cl.seed + i * 7 + k) * 0.6);
          const lr = c.r * (0.1 + hash(cl.seed + i * 11 + k) * 0.12);
          const x = this.sx(c.x + Math.cos(a) * c.r * 0.88);
          const y = this.sy(c.y + Math.sin(a) * c.r * 0.88);
          ctx.moveTo(x + lr * z, y);
          ctx.arc(x, y, lr * z, 0, TAU);
        }
      });
      ctx.fill();
      ctx.strokeStyle = rgba(look.polyp, 0.25);
      ctx.lineWidth = Math.max(1, 2 * z);
      ctx.beginPath();
      cl.circles.forEach((c, i) => {
        if (!look.exposed[i]) return;
        const x = this.sx(c.x);
        const y = this.sy(c.y);
        ctx.moveTo(x + Math.cos(Math.PI * 1.2) * c.r * z, y + Math.sin(Math.PI * 1.2) * c.r * z);
        ctx.arc(x, y, c.r * z, Math.PI * 1.2, Math.PI * 1.8);
      });
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      cl.circles.forEach((c, i) => {
        for (let k = 0; k < 3; k++) {
          const a = Math.PI + 0.3 + hash(cl.seed + i * 13 + k) * (Math.PI - 0.6);
          const x = this.sx(c.x + Math.cos(a) * c.r * 0.92);
          const y = this.sy(c.y + Math.sin(a) * c.r * 0.92);
          const tw = 0.55 + 0.45 * Math.sin(t * 1.5 + i * 3 + k);
          drawGlow(ctx, look.polyp, x, y, Math.max(2, 7 * z * (0.6 + look.glow * 0.5)), look.glow * tw);
        }
      });
      ctx.globalCompositeOperation = 'source-over';
      if (look.kind === 'ruin') {
        // Carved bands and a worn ring on every stone: someone shaped these, long ago.
        ctx.strokeStyle = 'rgba(170,220,205,0.4)';
        ctx.lineWidth = Math.max(1, 1.6 * z);
        ctx.beginPath();
        cl.circles.forEach((c, i) => {
          const x = this.sx(c.x);
          const y = this.sy(c.y);
          const r = c.r * z;
          for (const f of [-0.35, 0.2]) {
            const hw = Math.sqrt(1 - f * f) * r * 0.9;
            ctx.moveTo(x - hw, y + f * r);
            ctx.lineTo(x + hw, y + f * r);
          }
          if (hash(cl.seed + i) < 0.5) {
            ctx.moveTo(x + r * 0.35, y - r * 0.1);
            ctx.arc(x, y - r * 0.1, r * 0.35, 0, TAU);
          }
        });
        ctx.stroke();
      }
    }
  }

  /** A Hadal crystal: each reef circle grows as a glowing six-sided shard. */
  private drawCrystal(cl: CoralCluster, look: CoralLook): void {
    const ctx = this.ctx;
    const z = this.zoom;
    const t = this.reducedMotion ? 0 : this.time;
    const top = this.sy(cl.minY);
    const bottom = this.sy(cl.maxY);
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, look.lump);
    g.addColorStop(1, look.base);
    ctx.fillStyle = g;
    ctx.strokeStyle = rgba(look.polyp, 0.55 + 0.2 * Math.sin(t * 1.2 + cl.seed));
    ctx.lineWidth = Math.max(1, 1.8 * z);
    ctx.beginPath();
    cl.circles.forEach((c, i) => {
      const x = this.sx(c.x);
      const y = this.sy(c.y);
      const r = c.r * z * 1.06;
      const rot = hash(cl.seed + i) * TAU;
      for (let k = 0; k <= 6; k++) {
        const a = rot + (k / 6) * TAU;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r * 1.15;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    });
    ctx.fill();
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    cl.circles.forEach((c, i) => {
      drawGlow(ctx, look.polyp, this.sx(c.x), this.sy(c.y - c.r * 0.3), c.r * z * 0.8, 0.18 + 0.1 * Math.sin(t * 0.8 + i));
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Your deepest dive, drawn across the water: pass it and the record is yours again. */
  recordY = 0;

  private drawRecord(): void {
    const y0 = this.recordY;
    if (y0 <= 0) return;
    const y = this.sy(y0);
    if (y < -20 || y > this.h + 20) return;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,210,122,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,226,163,0.85)';
    ctx.font = '700 12px Outfit Variable, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`YOUR RECORD · ${Math.round(depthMeters(y0)).toLocaleString('en-US')} M`, this.w - 16, y - 6);
  }

  private drawWreck(world: World): void {
    const wr = world.wreck;
    const z = this.zoom;
    const x = this.sx(wr.x);
    const y = this.sy(wr.y);
    if (!this.onScreen(x, y, 420 * z)) return;
    const ctx = this.ctx;
    const t = this.reducedMotion ? 0 : this.time;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(z, z);
    ctx.rotate(wr.tilt);
    drawShip(ctx, t);
    ctx.restore();
    ctx.save();
    ctx.translate(this.sx(wr.chestX), this.sy(wr.chestY));
    ctx.scale(z, z);
    ctx.rotate(wr.tilt);
    drawChest(ctx, t, wr.chestOpen);
    ctx.restore();
  }

  /** Pearls: small pale spheres that bob and shimmer. */
  private drawPearls(world: World): void {
    const ctx = this.ctx;
    const z = this.zoom;
    const t = this.reducedMotion ? 0 : this.time;
    for (const pr of world.pearls) {
      if (pr.taken) continue;
      const x = this.sx(pr.x);
      const y = this.sy(pr.y + Math.sin(t * 1.5 + pr.seed) * 2);
      if (!this.onScreen(x, y, 20 * z)) continue;
      const r = 4.5 * z;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#f1e6f6');
      g.addColorStop(1, '#b9a7cf');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  private onScreen(x: number, y: number, pad: number): boolean {
    return x > -pad && x < this.w + pad && y > -pad && y < this.h + pad;
  }

  private drawCreatures(world: World): void {
    const ctx = this.ctx;
    const reachR = world.playerReach();
    const z = this.zoom;
    for (const c of world.creatures) {
      if (c.dead) continue;
      const x = this.sx(c.x);
      const y = this.sy(c.y);
      const reach = c.r * z * (c.def.shape === 'eel' ? 4.5 : c.def.shape === 'ray' ? 2.5 : 2);
      if (c.chain) {
        this.drawChain(c);
        continue;
      }
      if (!this.onScreen(x, y, reach)) continue;
      const edible = canEat(reachR, c.r, c.def);
      const threat = isThreat(reachR, c.r, c.def);
      const alert = c.state === 'notice' || c.state === 'chase' || c.state === 'orbit' ? 1 : 0;

      if (c.def.power) {
        // Power-up fish: a turning dashed ring in the power's color.
        const pc = POWERS[c.def.power].color;
        drawGlow(ctx, pc, x, y, c.r * z * 4, 0.22 + 0.12 * Math.sin(this.time * 5));
        ctx.strokeStyle = rgba(pc, 0.75);
        ctx.lineWidth = Math.max(1.2, 1.8 * z);
        ctx.setLineDash([3 * z, 4 * z]);
        ctx.beginPath();
        ctx.arc(x, y, c.r * z * 1.9, this.time * 2, this.time * 2 + TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (edible && !c.held) {
        // Readability: edible creatures wear a soft cyan halo, never too small to spot; tiny snacks get a fainter one.
        ctx.strokeStyle = c.r > reachR * 0.4 ? 'rgba(140,250,255,0.28)' : 'rgba(140,250,255,0.2)';
        ctx.lineWidth = Math.max(1, 1.5 * z);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(c.r * z * 1.35, 9), 0, TAU);
        ctx.stroke();
      } else if (threat) {
        drawGlow(ctx, '#ff4d6d', x, y, c.r * z * 2.2, 0.12 + alert * 0.12);
      }

      ctx.save();
      ctx.translate(x, y);
      // Swallowed food shrinks into the bell.
      const gulp = 1 - 0.85 * c.consume;
      ctx.scale(z * gulp, z * gulp);
      if (c.consume > 0) ctx.globalAlpha = 1 - c.consume * 0.6;
      if (c.def.shape === 'jelly') {
        ctx.rotate(c.heading + Math.PI / 2);
        // Until the jelly's light is strong enough to take it in, the Phantom is barely there.
        if (c.def.revealLight) ctx.globalAlpha = world.hasSeen(c.def.id) ? 0.75 : 0.1;
        drawJelly(ctx, c.r, c.phase, Math.pow(Math.max(0, Math.sin(c.phase * 2.2)), 2), jellyStyleForSpecies(c.def), null, false);
      } else {
        ctx.rotate(c.heading);
        if (Math.cos(c.heading) < 0 && c.def.shape !== 'seahorse') ctx.scale(1, -1);
        if (c.stunned > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 20);
        drawCreatureShape(ctx, c.def, lookFor(c.def), { r: c.r, t: c.phase, alert, puffed: c.state === 'puffed' ? 1 : 0 });
      }
      ctx.restore();

      if (c.stunned > 0) {
        ctx.strokeStyle = 'rgba(197,155,255,0.7)';
        ctx.lineWidth = Math.max(1, 2 * z);
        for (let i = 0; i < 3; i++) {
          const a = this.time * 4 + (i * TAU) / 3;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * c.r * z * 0.8, y - c.r * z * 0.9 + Math.sin(a) * c.r * z * 0.25, 2.5 * z, 0, TAU);
          ctx.stroke();
        }
      }
    }
  }

  private drawChain(c: Creature): void {
    const ctx = this.ctx;
    const z = this.zoom;
    const pts = c.chain!;
    const hx = this.sx(c.x);
    const hy = this.sy(c.y);
    if (!this.onScreen(hx, hy, 300 * z)) return;
    ctx.strokeStyle = rgba(c.def.colors.body, 0.35);
    ctx.lineWidth = Math.max(1, 2 * z);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    for (const s of pts) ctx.lineTo(this.sx(s.x), this.sy(s.y));
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, c.def.colors.glow, hx, hy, 22 * z, 0.9);
    pts.forEach((s, i) => {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 3 - i * 0.6);
      drawGlow(ctx, i % 3 === 0 ? c.def.colors.accent : c.def.colors.glow, this.sx(s.x), this.sy(s.y), (10 + (i % 3) * 3) * z, 0.5 + tw * 0.5);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawPlayer(world: World, dt: number): void {
    const ctx = this.ctx;
    const p = world.player;
    const z = this.zoom;
    const x = this.sx(p.x);
    const y = this.sy(p.y);

    // The body eases round after the heading instead of snapping to it, with a slow idle rock,
    // so a turn reads as a soft animal swinging through water rather than a sprite rotating.
    const rock = (this.reducedMotion ? 0.02 : 0.07) * Math.sin(world.time * 0.9) * (1 - Math.min(1, Math.hypot(p.vx, p.vy) / 120));
    this.visHeading = angleLerp(this.visHeading, p.heading, 1 - Math.exp(-5 * dt));
    const heading = this.visHeading + rock;
    let dh = heading - this.lastHeading;
    if (dh > Math.PI) dh -= TAU;
    if (dh < -Math.PI) dh += TAU;
    this.lastHeading = heading;
    this.sway = damp(this.sway, clamp((-dh / Math.max(dt, 1e-3)) * 0.25, -1, 1), 4, dt);
    // The margin squeezes a beat after the crown, so each pulse ripples down the bell.
    this.body.rimLag = damp(this.body.rimLag ?? 0, p.thrust, 6, dt);
    this.body.lean = clamp(this.sway * 0.3, -0.3, 0.3);
    this.body.trailing = true;
    this.bodyHeading = heading;

    let alpha = 1;
    let scale = 1;
    if (!p.alive) {
      alpha = clamp(1 - p.deathT / 1.2, 0, 1);
      scale = 1 - p.deathT * 0.3;
    } else if (p.invuln > 0 && world.time > 2.6) {
      alpha = 0.55 + 0.45 * Math.sin(this.time * 28);
    }
    if (alpha <= 0) return;

    const pw = p.powers;
    this.titanK = damp(this.titanK, pw.titan > 0 ? TITAN_SCALE : 1, 6, dt);
    const tr = p.r * this.titanK;
    if (pw.veil > 0 && p.alive) alpha *= 0.4 + 0.15 * Math.sin(this.time * 6);
    if (p.alive) {
      ctx.globalCompositeOperation = 'lighter';
      if (pw.titan > 0) drawGlow(ctx, POWERS.titan.color, x, y, tr * z * 3.2, 0.4 + 0.1 * Math.sin(this.time * 8));
      if (pw.frenzy > 0) drawGlow(ctx, POWERS.frenzy.color, x, y, tr * z * 2.8, 0.25 + 0.1 * Math.sin(this.time * 10));
      if (pw.overcharge > 0) drawGlow(ctx, POWERS.overcharge.color, x, y, tr * z * 2.6, 0.25 + 0.2 * Math.random());
      if (pw.veil > 0) drawGlow(ctx, POWERS.veil.color, x, y, tr * z * 3, 0.2);
      ctx.globalCompositeOperation = 'source-over';
      if (pw.shield > 0) {
        // Golden bubble that blinks out as the shield expires.
        const fading = pw.shield < 3 ? 0.5 + 0.5 * Math.sin(this.time * 18) : 1;
        ctx.strokeStyle = rgba(POWERS.shield.color, 0.7 * fading);
        ctx.lineWidth = Math.max(1.5, 2.4 * z);
        ctx.beginPath();
        ctx.arc(x, y, tr * z * 1.7, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = rgba(POWERS.shield.color, 0.08 * fading);
        ctx.fill();
      }
    }

    if (world.stingReady() && p.alive) {
      const pr = tr * z * (1.55 + 0.06 * Math.sin(this.time * 4));
      ctx.strokeStyle = 'rgba(197,155,255,0.45)';
      ctx.lineWidth = Math.max(1, 1.6 * z);
      ctx.setLineDash([4 * z, 5 * z]);
      ctx.beginPath();
      ctx.arc(x, y, pr, this.time * 0.6, this.time * 0.6 + TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.body.maturity = maturity(p.food);
    this.body.gulp = damp(this.body.gulp, 0, 2.2, dt);
    if (world.sweepT > 0 && p.alive) this.drawSweep(world);
    this.drawTrails(world, tr * scale, alpha, dt);
    this.drawTentacles(world, tr * scale, alpha);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(z * scale, z * scale);
    ctx.rotate(heading + Math.PI / 2);
    drawJelly(ctx, tr, world.time, p.thrust, this.playerStyle, p.tiers, false, this.sway, this.body, p.forms);
    ctx.restore();
  }

  private body: JellyBody = { maturity: 0, gulp: 0, gut: '#ffffff' };
  /** The heading the body is drawn at: it trails the swim heading for a softer turn. */
  private visHeading = -Math.PI / 2;
  private bodyHeading = -Math.PI / 2;
  /** Marginal tentacles as chains of [x, y, prevX, prevY] links in world space. */
  private trails: Float32Array[] = [];
  private bodyPt = { x: 0, y: 0 };

  /**
   * The sweep's net while it is open: a fan of light ahead of the bell, the size and angle
   * that actually catch, so players learn its reach by seeing it.
   */
  private drawSweep(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    const k = clamp(world.sweepT / SWEEP.time, 0, 1);
    const R = world.sweepReach() * this.zoom * (1.08 - 0.08 * k);
    const half = Math.acos(SWEEP.cone);
    const h = p.heading;
    const x = this.sx(p.x);
    const y = this.sy(p.y);
    const color = this.playerStyle.glow;
    const fade = Math.sqrt(k);
    const g = ctx.createRadialGradient(x, y, R * 0.15, x, y, R);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(0.7, rgba(color, 0.14 * fade));
    g.addColorStop(1, rgba(color, 0.38 * fade));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, R, h - half, h + half);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, color, x + Math.cos(h) * R, y + Math.sin(h) * R, R * 0.35, 0.5 * fade);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = rgba('#ffffff', 0.9 * fade);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, R, h - half, h + half);
    ctx.stroke();
  }

  /** A point in the jelly's own frame (bell facing -y) to world space, at the drawn heading. */
  private bodyPoint(world: World, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
    const p = world.player;
    const a = this.bodyHeading + Math.PI / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    out.x = p.x + lx * cos - ly * sin;
    out.y = p.y + lx * sin + ly * cos;
    return out;
  }

  /**
   * Marginal tentacles that really trail. Each is a chain of links hanging from the rim:
   * every link keeps its momentum, eases toward a relaxed line streaming behind the bell
   * (stiff near the rim, loose at the tip), and stays a fixed length from the link before it.
   * Turns and bursts drag the tips round behind the body instead of swinging them with it.
   */
  private drawTrails(world: World, r: number, alpha: number, dt: number): void {
    const p = world.player;
    const tiers = p.tiers;
    const { count, lenBase } = marginalTentacles(r, tiers, this.body.maturity);
    const { w } = bellSize(r, p.thrust, this.body);
    const rimY = r * 0.2;
    const N = TRAIL_LINKS;
    const h = this.bodyHeading;
    const time = this.reducedMotion ? world.time * 0.5 : world.time;
    if (this.trails.length !== count) this.trails = [];
    const anchor = this.bodyPt;
    const ctx = this.ctx;
    const z = this.zoom;
    const sting = tiers.sting;
    const color = sting > 0 ? '#c59bff' : this.playerStyle.tentacle;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(color, 0.5 * alpha);
    ctx.lineWidth = Math.max(0.6, r * (0.055 + sting * 0.008) * z);
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const k = count === 1 ? 0.5 : i / (count - 1);
      this.bodyPoint(world, (k - 0.5) * w * 1.7, rimY, anchor);
      const seg = marginalLength(lenBase, i) / N;
      // Outer tentacles fan out a little from the bell's axis.
      const fan = h + Math.PI + (k - 0.5) * 0.5;
      let chain = this.trails[i];
      if (!chain || Math.hypot(chain[0] - anchor.x, chain[1] - anchor.y) > seg * N) {
        chain = this.trails[i] = new Float32Array((N + 1) * 4);
        for (let j = 0; j <= N; j++) {
          const x = anchor.x + Math.cos(fan) * seg * j;
          const y = anchor.y + Math.sin(fan) * seg * j;
          chain.set([x, y, x, y], j * 4);
        }
      }
      chain[0] = chain[2] = anchor.x;
      chain[1] = chain[3] = anchor.y;
      if (dt > 0) {
        for (let j = 1; j <= N; j++) {
          const f = j / N;
          const o = j * 4;
          let x = chain[o];
          let y = chain[o + 1];
          // Momentum: water damps it quickly, but the tip still swings through a turn.
          const vx = (x - chain[o + 2]) * 0.9;
          const vy = (y - chain[o + 3]) * 0.9;
          chain[o + 2] = x;
          chain[o + 3] = y;
          x += vx;
          y += vy;
          // Relaxed line: straight back from the previous link, curling with a wave that travels to the tip.
          const curl = Math.sin(time * 1.8 + i * 0.9 - f * 3.6) * 0.22 + Math.sin(time * 2.9 + i * 2.1 - f * 6.5) * 0.07;
          const a = fan + curl * (0.4 + 0.6 * f);
          const tx = chain[o - 4] + Math.cos(a) * seg;
          const ty = chain[o - 3] + Math.sin(a) * seg;
          const pull = 1 - Math.exp(-(9 - 7 * f) * dt);
          x += (tx - x) * pull;
          y += (ty - y) * pull;
          // Keep each link its length from the one before.
          const dx = x - chain[o - 4];
          const dy = y - chain[o - 3];
          const d = Math.hypot(dx, dy) || 1;
          chain[o] = chain[o - 4] + (dx / d) * seg;
          chain[o + 1] = chain[o - 3] + (dy / d) * seg;
        }
      }
      // Smooth curve through the link midpoints.
      ctx.moveTo(this.sx(chain[0]), this.sy(chain[1]));
      for (let j = 1; j < N; j++) {
        const o = j * 4;
        ctx.quadraticCurveTo(this.sx(chain[o]), this.sy(chain[o + 1]), this.sx((chain[o] + chain[o + 4]) / 2), this.sy((chain[o + 1] + chain[o + 5]) / 2));
      }
      ctx.lineTo(this.sx(chain[N * 4]), this.sy(chain[N * 4 + 1]));
    }
    ctx.stroke();
    if (sting > 0) {
      // Barbed nettles along every other tentacle.
      ctx.fillStyle = rgba('#e3ccff', 0.85 * alpha);
      for (let i = 0; i < count; i += 2) {
        const chain = this.trails[i];
        for (let j = 1; j <= 2 + sting; j++) {
          const o = Math.round((j / (3 + sting)) * N) * 4;
          ctx.beginPath();
          ctx.arc(this.sx(chain[o]), this.sy(chain[o + 1]), Math.max(0.6, r * 0.05 * z), 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  /** A meal just went down: the bell swells and glows with its color for a moment. */
  feed(color: string): void {
    this.body.gulp = 1;
    this.body.gut = color;
  }

  private tentRoot = { x: 0, y: 0 };
  private ribbon = new Float32Array((TENT_SEGS + 1) * 4);

  /**
   * Hunting arms, drawn in world space from the bell rim to each simulated tip.
   * A cubic curve leaves the rim sideways and back, then bends toward the tip; a travelling
   * wave rides on top and calms as the arm pulls taut around a catch.
   */
  private drawTentacles(world: World, r: number, alpha: number): void {
    const ctx = this.ctx;
    const p = world.player;
    const z = this.zoom;
    const time = this.reducedMotion ? world.time * 0.4 : world.time;
    const color = p.tiers.sting > 0 ? '#c59bff' : this.playerStyle.tentacle;
    const fx = Math.cos(this.bodyHeading);
    const fy = Math.sin(this.bodyHeading);
    const pts = this.ribbon;
    const N = TENT_SEGS;

    for (const tt of world.tentacles) {
      const root = this.bodyPoint(world, (tt.slot - 0.5) * r * 1.3, r * 0.2, this.tentRoot);
      const dx = tt.x - root.x;
      const dy = tt.y - root.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) continue;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      const side = tt.slot < 0.5 ? -1 : 1;
      const active = tt.phase !== 'idle';
      const taut =
        tt.phase === 'reach' ? 0.3 + 0.4 * Math.min(1, tt.t / 0.35) : tt.phase === 'grab' || tt.phase === 'pull' ? 0.75 : tt.phase === 'eat' ? 0.5 : 0;

      // Leave the rim out to the arm's own side, then run straight at the tip. A trailing arm
      // also hangs back; one striking forward drops that, so it reaches ahead past the bell.
      const back = clamp(0.45 - (ux * fx + uy * fy) * 0.9, 0, 0.9);
      let ox = -fx * back - fy * side * 0.6 + ux;
      let oy = -fy * back + fx * side * 0.6 + uy;
      const om = Math.hypot(ox, oy) || 1;
      ox /= om;
      oy /= om;
      const bend = Math.sin(time * 2.1 + tt.seed) * len * 0.2 * (1 - taut);
      const x1 = root.x + ox * len * 0.38;
      const y1 = root.y + oy * len * 0.38;
      const x2 = tt.x - ux * len * 0.3 + nx * bend;
      const y2 = tt.y - uy * len * 0.3 + ny * bend;
      const amp = Math.min(r * 0.9, len * 0.16) * (1 - taut * 0.8);
      const speed = active ? 8 : 2.6;

      for (let i = 0; i <= N; i++) {
        const s = i / N;
        const m = 1 - s;
        const a = m * m * m;
        const b = 3 * m * m * s;
        const c = 3 * m * s * s;
        const d = s * s * s;
        // Two travelling waves, a long swell and a quick ripple, for a loose, flowing arm.
        const wave = (Math.sin(s * 9 - time * speed + tt.seed) + 0.4 * Math.sin(s * 17 - time * speed * 1.5 + tt.seed * 2)) * amp * Math.sin(Math.PI * s);
        pts[i * 2] = a * root.x + b * x1 + c * x2 + d * tt.x + nx * wave;
        pts[i * 2 + 1] = a * root.y + b * y1 + c * y2 + d * tt.y + ny * wave;
      }

      // Tapered ribbon: thick at the rim, fine at the tip.
      const base = r * (active ? 0.19 : 0.13) * (1 + 0.35 * this.body.maturity);
      const L = (N + 1) * 2;
      for (let i = 0; i <= N; i++) {
        const j0 = Math.max(0, i - 1) * 2;
        const j1 = Math.min(N, i + 1) * 2;
        let tx = pts[j1] - pts[j0];
        let ty = pts[j1 + 1] - pts[j0 + 1];
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm;
        ty /= tm;
        // Never thinner than a couple of screen pixels, so a young jelly's arms still read on a phone.
        const w = Math.max((base * (1 - i / N) + r * 0.03) * 0.5, ((active ? 2.2 : 1.4) * (1 - i / N) + 0.5) / z);
        pts[L + i * 2] = -ty * w;
        pts[L + i * 2 + 1] = tx * w;
      }
      ctx.fillStyle = rgba(color, (active ? 0.82 : 0.5) * alpha);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const X = this.sx(pts[i * 2] + pts[L + i * 2]);
        const Y = this.sy(pts[i * 2 + 1] + pts[L + i * 2 + 1]);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      for (let i = N; i >= 0; i--) ctx.lineTo(this.sx(pts[i * 2] - pts[L + i * 2]), this.sy(pts[i * 2 + 1] - pts[L + i * 2 + 1]));
      ctx.closePath();
      ctx.fill();

      if (!active || alpha < 0.3) continue;
      const tipX = this.sx(tt.x);
      const tipY = this.sy(tt.y);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, this.playerStyle.glow, tipX, tipY, r * z * 0.7, 0.55 * alpha);
      ctx.globalCompositeOperation = 'source-over';
      const prey = tt.target;
      if (prey && (tt.phase === 'grab' || tt.phase === 'pull' || tt.phase === 'eat')) {
        // The tip coils around the catch so the grip reads clearly.
        const cr = prey.r * (1 - 0.85 * prey.consume) * z * 1.15;
        const spin = time * 6 + tt.seed;
        ctx.strokeStyle = rgba(color, 0.85 * alpha);
        ctx.lineWidth = Math.max(1.8, r * z * 0.07);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(tipX, tipY, cr, spin, spin + Math.PI * 1.3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tipX, tipY, cr * 0.8, spin + Math.PI, spin + Math.PI * 2.1);
        ctx.stroke();
      }
    }
  }

  private drawDarkness(world: World): void {
    const p = world.player;
    const dark = darknessAt(this.camY);
    if (dark <= 0.01) return;
    const ctx = this.ctx;
    const x = this.sx(p.x);
    const y = this.sy(p.y);
    const light = p.stats.lightRadius * this.zoom * (1 + 0.03 * Math.sin(this.time * 2));
    const g = ctx.createRadialGradient(x, y, light * 0.15, x, y, light);
    const dc = darkColor(this.camY);
    g.addColorStop(0, `rgba(${dc},0)`);
    g.addColorStop(0.5, `rgba(${dc},${dark * 0.25})`);
    g.addColorStop(1, `rgba(${dc},${dark})`);
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
  }

  /** Bioluminescence and hunters' eyes shine through the darkness. */
  private drawLights(world: World): void {
    const ctx = this.ctx;
    const dark = darknessAt(this.camY);
    const p = world.player;
    const z = this.zoom;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of world.creatures) {
      if (c.dead || c.chain) continue;
      const x = this.sx(c.x);
      const y = this.sy(c.y);
      if (!this.onScreen(x, y, c.r * z * 3)) continue;
      if (c.def.revealLight) {
        this.drawPhantomLights(c, dark);
        continue;
      }
      if (c.def.glows) {
        const tw = 0.75 + 0.25 * Math.sin(c.phase * 3);
        drawGlow(ctx, c.def.colors.glow, x, y, c.r * z * 2.4, (0.18 + dark * 0.55) * tw);
      }
      if (c.def.role === 'predator') {
        const alert = c.state === 'notice' || c.state === 'chase' || c.state === 'orbit';
        const fwd = c.def.shape === 'needlefin' ? 1.05 : c.def.shape === 'shark' ? 0.8 : c.def.shape === 'moray' ? 0.75 : 0.3;
        const ex = c.x + Math.cos(c.heading) * c.r * fwd;
        const ey = c.y + Math.sin(c.heading) * c.r * fwd - c.r * 0.2;
        const threat = isThreat(world.playerReach(), c.r, c.def);
        drawGlow(ctx, threat ? '#ff5d5d' : '#b8c8ff', this.sx(ex), this.sy(ey), c.r * z * (alert ? 0.7 : 0.4), (alert ? 0.9 : 0.3 + dark * 0.4));
        if (c.def.behavior === 'lure') {
          const lx = c.x + Math.cos(c.heading) * c.r * 1.25;
          const ly = c.y + Math.sin(c.heading) * c.r * 1.25 - c.r * 0.95;
          drawGlow(ctx, c.def.colors.accent, this.sx(lx), this.sy(ly), c.r * z * 1.3, 0.85);
        }
      }
    }
    // Pearls catch whatever light there is, so they stay findable in the deep.
    for (const pr of world.pearls) {
      if (pr.taken) continue;
      const x = this.sx(pr.x);
      const y = this.sy(pr.y);
      if (!this.onScreen(x, y, 30 * z)) continue;
      const tw = 0.7 + 0.3 * Math.sin(this.time * 2.2 + pr.seed);
      drawGlow(ctx, '#fff0fa', x, y, 15 * z, (0.25 + dark * 0.5) * tw);
    }
    if (p.alive) drawGlow(ctx, this.playerStyle.glow, this.sx(p.x), this.sy(p.y), p.r * z * 2.4, 0.12 + dark * 0.12);
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * The Phantom's rim lights shine through any darkness: a slow arc of lights far wider
   * than the screen is often all a dim jelly ever sees of it.
   */
  private drawPhantomLights(c: Creature, dark: number): void {
    const ctx = this.ctx;
    const z = this.zoom;
    const r = c.r;
    const n = 22;
    const breathe = 0.6 + 0.4 * Math.sin(c.phase * 0.5);
    drawGlow(ctx, c.def.colors.glow, this.sx(c.x), this.sy(c.y - r * 0.4), r * z * 1.6, 0.1 + dark * 0.12);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const a = Math.PI + k * Math.PI;
      const lx = c.x + Math.cos(a) * r * 0.98;
      const ly = c.y + Math.sin(a) * r * 0.8 + r * 0.2 * (1 - Math.abs(Math.sin(a)));
      const tw = 0.5 + 0.5 * Math.sin(c.phase * 1.2 - i * 0.45);
      drawGlow(ctx, i % 4 === 0 ? c.def.colors.accent : c.def.colors.glow, this.sx(lx), this.sy(ly), r * z * 0.16, (0.25 + dark * 0.5) * tw * breathe);
    }
    // Lights strung down its arms, fading into the deep.
    for (let arm = 0; arm < 4; arm++) {
      const ax = c.x + (arm - 1.5) * r * 0.35;
      for (let j = 1; j <= 6; j++) {
        const f = j / 6;
        const lx = ax + Math.sin(c.phase * 0.4 + arm * 1.7 - f * 3) * r * 0.25 * f;
        const ly = c.y + r * 0.2 + f * r * 2.4;
        drawGlow(ctx, c.def.colors.glow, this.sx(lx), this.sy(ly), r * z * 0.1, (0.2 + dark * 0.4) * (1 - f * 0.7) * breathe);
      }
    }
  }

  private drawIndicators(world: World): void {
    const ctx = this.ctx;
    const p = world.player;
    const z = this.zoom;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    if (!p.alive) return;

    for (const c of world.creatures) {
      if (c.dead || c.def.role !== 'predator' || !isThreat(world.playerReach(), c.r, c.def)) continue;
      const x = this.sx(c.x);
      const y = this.sy(c.y);
      if (c.state === 'notice') {
        // Telegraph: a warning mark and the lunge line, before any attack.
        const pulse = 0.7 + 0.3 * Math.sin(this.time * 18);
        if (c.def.behavior !== 'stalk' && c.def.behavior !== 'pack') {
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          const d = Math.hypot(dx, dy) || 1;
          const len = (c.def.hunter!.chaseSpeed * c.def.hunter!.chaseTime + c.r) * z;
          ctx.strokeStyle = `rgba(255,93,93,${0.28 * pulse})`;
          ctx.lineWidth = Math.max(2, c.r * z * 0.35);
          ctx.lineCap = 'round';
          ctx.setLineDash([6, 8]);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (dx / d) * len, y + (dy / d) * len);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        this.drawAlert(x, y - c.r * z * 1.1 - 14, pulse);
      }
      if (!this.onScreen(x, y, -c.r * z * 0.3) && Math.hypot(c.x - p.x, c.y - p.y) < world.viewRadius * 1.25) {
        const a = Math.atan2(y - py, x - px);
        const ex = clamp(px + Math.cos(a) * 2000, 26, this.w - 26);
        const ey = clamp(py + Math.sin(a) * 2000, HUD_TOP, this.h - 26);
        const chasing = c.state === 'chase' || c.state === 'notice';
        this.drawChevron(ex, ey, a, chasing ? '#ff5d5d' : 'rgba(255,140,140,0.6)');
      }
    }

    // The unopened pirate chest glints at the screen edge when it is somewhere nearby.
    const wr = world.wreck;
    if (!wr.chestOpen) {
      const cx = this.sx(wr.chestX);
      const cy = this.sy(wr.chestY);
      const d = Math.hypot(wr.chestX - p.x, wr.chestY - p.y);
      if (d < 1600 && !this.onScreen(cx, cy, -20)) {
        const a = Math.atan2(cy - py, cx - px);
        const ex = clamp(px + Math.cos(a) * 2000, 30, this.w - 30);
        const ey = clamp(py + Math.sin(a) * 2000, HUD_TOP, this.h - 30);
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 3);
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, '#ffd27a', ex, ey, 18, pulse * 0.8);
        ctx.globalCompositeOperation = 'source-over';
        this.drawChevron(ex, ey, a, '#ffe2a3');
      }
    }

    if (p.stats.rareCompass > 0) {
      const rare = world.nearestRare();
      if (rare) {
        const d = Math.hypot(rare.x - p.x, rare.y - p.y);
        if (d > p.r * 4) {
          const a = Math.atan2(rare.y - p.y, rare.x - p.x);
          const rr = p.r * z * 2.4 + 26;
          const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, '#ffd27a', px + Math.cos(a) * rr, py + Math.sin(a) * rr, 16, pulse);
          ctx.globalCompositeOperation = 'source-over';
          this.drawChevron(px + Math.cos(a) * rr, py + Math.sin(a) * rr, a, '#ffe2a3');
        }
      }
    }
  }

  private drawAlert(x: number, y: number, pulse: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(255,93,93,${0.85 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 15px Outfit Variable, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y + 1);
  }

  private drawChevron(x: number, y: number, a: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawJoystick(j: JoystickView): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(200,240,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.cx, j.cy, 52, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,240,255,0.22)';
    ctx.beginPath();
    ctx.arc(j.cx + j.ax * 52, j.cy + j.ay * 52, 20, 0, TAU);
    ctx.fill();
  }
}
