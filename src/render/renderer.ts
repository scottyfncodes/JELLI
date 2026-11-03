import { SWEEP, type World, type Creature, type CoralCluster, type Current } from '../sim/world';
import { canEat, isThreat } from '../sim/rules';
import { WORLD, darknessAt, depthMeters, zoneAt } from '../content/world';
import type { ZoneId } from '../content/types';
import { BASE_RADIUS, maturity } from '../content/progression';
import { TAU, angleLerp, clamp, damp, hexToRgb, lerp, rgba } from '../core/math';
import { drawCreatureShape, drawJelly, jellyStyleForSpecies, lookFor, type JellyBody, type JellyStyle } from './creatures';
import { drawGlow } from './sprites';
import { ARM_COUNT, armLength, drawOctopus, proceduralArms, type EyeMood, type OctoLook } from './octopus';
import { OctoRig } from './octorig';
import type { OctoVariant } from '../content/octopus';
import { Backdrop, coralPiece } from './backdrop';
import { css, mixRGB, paletteAt, waterColor, type Palette } from './biomeArt';
import { drawChest, drawShip } from './wreck';
import { drawBloom, drawLandmark, drawPlumeShimmer, drawPod, drawShelter, drawTreasure, drawVent } from './places';
import { TREASURES_BY_ID } from '../content/landmarks';
import { Particles } from './particles';
import { POWERS, TITAN_SCALE } from '../content/powerups';

export interface JoystickView {
  active: boolean;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
}

/** Edge arrows stay below the HUD's depth readout and evolution bar. */
const HUD_TOP = 120;
/** Height of one tile of the far parallax layer, in parallax units. */
const FAR_TILE = 2400;
/** World units across the short side of the screen for a hatchling. */
export const VIEW_SPAN = 135;
/** The darkness is drawn at this fraction of screen resolution: soft edges, cheap fill. */
const DARK_RES = 0.25;

/** The tint of the dark itself, which turns red in the Hadal Dream. */
function darkColor(y: number): string {
  const k = clamp((y - 14000) / 2500, 0, 1);
  return `${Math.round(lerp(2, 30, k))},${Math.round(lerp(4, 4, k))},${Math.round(lerp(18, 22, k))}`;
}

let HOLE: HTMLCanvasElement | null = null;
/** A soft white disc for cutting light out of the darkness mask. */
function holeSprite(): HTMLCanvasElement {
  if (HOLE) return HOLE;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  HOLE = c;
  return c;
}

/** How a reef cluster is built in each biome: living reef, glowing reef, carved ruin, basalt or crystal. */
type CoralKind = 'reef' | 'ruin' | 'crystal';
const BIOME_ROCK: Partial<Record<ZoneId, { kind: CoralKind; base: string; lump: string; polyp: string; glow: number }>> = {
  forgotten: { kind: 'ruin', base: '#3a4e54', lump: '#71878a', polyp: '#5ee0b0', glow: 0.45 },
  abyss: { kind: 'reef', base: '#11142a', lump: '#20263f', polyp: '#b8c8ff', glow: 0.5 },
  hadal: { kind: 'crystal', base: '#3a0e3c', lump: '#8a2a6e', polyp: '#ff6fae', glow: 0.9 },
};

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Living reef by biome: [base, lump, polyp]. Warm coral in the sun; glowing reef below it; violet lichen in the twilight. */
const CORAL_PALETTES: Partial<Record<ZoneId, [string, string, string][]>> = {
  shallows: [
    ['#7a3f55', '#d0766a', '#ffc46b'],
    ['#4f3a78', '#9a68b0', '#ff9fd8'],
    ['#6e4a30', '#c98a52', '#ffe2a3'],
    ['#2a6670', '#4fa8a0', '#a8fff0'],
  ],
  gardens: [
    ['#1d3f86', '#3a72b8', '#7dffb9'],
    ['#33287c', '#6a52b8', '#ff7fd0'],
    ['#174a70', '#2f8fa8', '#ffd27a'],
  ],
  twilight: [
    ['#1c2058', '#33388a', '#a99aff'],
    ['#161a4c', '#2a3a7a', '#7fe3ff'],
  ],
};


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
  /** Smoothed frame time, for stepping effects down on a device that can't keep up. */
  private frameAvg = 1 / 60;
  private slowT = 0;

  /**
   * Adaptive quality: if frames run long for a few seconds, drop the most expensive effects one
   * step at a time (foreground and caustics first, then the farthest layer). It never steps back
   * up within a session, so the picture doesn't flicker between levels.
   */
  trackFrame(raw: number): void {
    if (raw <= 0 || raw > 0.25) return;
    this.frameAvg += (raw - this.frameAvg) * 0.05;
    if (this.frameAvg > 1 / 42 && this.backdrop.quality > 0) {
      this.slowT += raw;
      if (this.slowT > 3) {
        this.backdrop.quality -= 1;
        this.slowT = 0;
        this.frameAvg = 1 / 60;
      }
    } else this.slowT = 0;
  }
  shake = 0;
  playerStyle: JellyStyle;

  readonly backdrop = new Backdrop();
  /** This frame's blended biome palette. */
  private pal: Palette = paletteAt(0);
  private darkCanvas: HTMLCanvasElement;
  private darkCtx: CanvasRenderingContext2D;
  /** Brief lights from bursts, catches and glowing things, cut out of the dark. */
  private flashes: { x: number; y: number; r: number; life: number; max: number }[] = [];
  private coralLooks = new WeakMap<CoralCluster, CoralLook>();
  private streaks = new WeakMap<Current, Streak[]>();
  private far: BgShape[] = [];
  private snow: Snow[] = [];
  /** Out-of-focus specks drifting just in front of the lens: depth of field for the whole scene. */
  private motes: Snow[] = [];
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
    this.darkCanvas = document.createElement('canvas');
    this.darkCtx = this.darkCanvas.getContext('2d')!;
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
    this.far = shapes(28, WORLD.width * 0.35 + 1400, FAR_TILE, 60, 150);
    for (let i = 0; i < 9; i++) {
      this.motes.push({ u: Math.random(), v: Math.random(), f: 1.5 + Math.random() * 0.9, s: 18 + Math.random() * 34 });
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
    this.backdrop.resize(this.w, this.h);
    this.darkCanvas.width = Math.max(1, Math.ceil(this.w * DARK_RES));
    this.darkCanvas.height = Math.max(1, Math.ceil(this.h * DARK_RES));
  }

  /** A short-lived light cut into the darkness at a world point. */
  addFlash(x: number, y: number, r: number, life = 0.5): void {
    if (this.flashes.length > 24) this.flashes.shift();
    this.flashes.push({ x, y, r, life, max: life });
  }

  /**
   * World units visible across the screen's short side; grows with the octopus. Tight enough
   * that the octopus is the star of the screen, its face and arms easy to read on a phone.
   */
  targetZoom(r: number): number {
    const visible = VIEW_SPAN * Math.pow(r / BASE_RADIUS, 0.66);
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
    this.resetOctopus();
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

    this.pal = paletteAt(this.camY);
    this.backdrop.warm();
    const bt = this.reducedMotion ? this.time * 0.3 : this.time;
    this.drawWater();
    const ck = this.pal.caustics * clamp(1 - this.camY / 2600, 0, 1);
    this.backdrop.drawBack(ctx, this.pal, this.camX, this.camY, this.zoom, bt, 0.1 * ck, this.sx(0) * 0.6, this.sy(0) * 0.6);
    this.backdrop.drawRays(ctx, this.pal, this.camX, this.camY, this.zoom, bt);
    this.drawFar();
    this.drawHaze();
    this.drawSnow(0.5);
    this.backdrop.drawMid(ctx, this.pal, this.camX, this.camY, this.zoom, bt);
    this.drawCurrents(world, dt);
    this.drawFeatures(world, false);
    this.drawCorals(world);
    this.drawRecord();
    this.drawWreck(world);
    this.drawPods(world);
    this.drawPearls(world);
    this.drawCreatures(world);
    this.drawPlayer(world, dt);
    this.drawFeatures(world, true);
    this.drawInk(world);
    this.particles.update(dt);
    this.particles.draw(ctx, this.camX, this.camY, this.zoom, w, h);
    this.drawDarkness(world, dt);
    this.backdrop.drawSceneryLights(ctx, darknessAt(this.camY));
    this.drawLights(world);
    this.drawEncounter(world);
    this.drawSnow(1.1);
    this.backdrop.drawFore(ctx, this.pal, this.camX, this.camY, this.zoom, bt);
    if (this.backdrop.quality > 0) this.drawMotes();
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, w, h);
    }
    this.drawIndicators(world);
    if (joystick?.active) this.drawJoystick(joystick);
  }

  private drawWater(): void {
    const ctx = this.ctx;
    const top = this.camY - this.h / 2 / this.zoom;
    const bottom = this.camY + this.h / 2 / this.zoom;
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, css(waterColor(top)));
    g.addColorStop(0.5, css(waterColor((top + bottom) / 2)));
    g.addColorStop(1, css(waterColor(bottom)));
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, this.w + 40, this.h + 40);
    if (top < 60) this.drawSurface();
  }

  /**
   * The underside of the surface: a bright, rippling ceiling of light with the sky beyond,
   * the first thing a hatchling sees.
   */
  private drawSurface(): void {
    const ctx = this.ctx;
    const sy = this.sy(0);
    if (sy < -40) return;
    const t = this.reducedMotion ? 0 : this.time;
    const sky = ctx.createLinearGradient(0, sy - 160, 0, sy);
    sky.addColorStop(0, 'rgba(214,250,255,1)');
    sky.addColorStop(1, 'rgba(150,232,240,1)');
    ctx.fillStyle = sky;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(this.w + 10, -10);
    const step = 12;
    for (let x = this.w + 10; x >= -10; x -= step) {
      const wx = this.camX + (x - this.w / 2) / this.zoom;
      const y = sy + (Math.sin(wx * 0.045 + t * 1.6) * 3 + Math.sin(wx * 0.11 - t * 2.3) * 1.6) * this.zoom;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // A glowing band just under the surface where the light pours in.
    const band = ctx.createLinearGradient(0, sy, 0, sy + 140 * this.zoom);
    band.addColorStop(0, 'rgba(230,255,250,0.55)');
    band.addColorStop(1, 'rgba(230,255,250,0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, sy, this.w, 140 * this.zoom);
  }

  /** The murk below: water thickens toward the bottom of the view, so down always reads as deeper. */
  private drawHaze(): void {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, this.h * 0.35, 0, this.h);
    const deep = mixRGB(this.pal.water, [0, 0, 8], 0.45);
    g.addColorStop(0, css(deep, 0));
    g.addColorStop(1, css(deep, 0.42));
    ctx.fillStyle = g;
    ctx.fillRect(0, this.h * 0.35, this.w, this.h * 0.65);
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
      const rr = s.r[0] * z * 1.7;
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

  private drawSnow(layer: number): void {
    const ctx = this.ctx;
    const W = this.w + 40;
    const H = this.h + 40;
    const t = this.reducedMotion ? 0 : this.time;
    // In the Hadal Dream the snow falls upward.
    const hadal = this.camY > 14600;
    const fall = hadal ? -6 : 6;
    ctx.fillStyle = css(this.pal.snow, layer > 1 ? 0.36 : 0.22);
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

  private drawMotes(): void {
    const ctx = this.ctx;
    const pad = 80;
    const W = this.w + pad * 2;
    const H = this.h + pad * 2;
    const t = this.reducedMotion ? 0 : this.time;
    // Quantized, so the glow-sprite cache stays small while the palette blends between biomes.
    const color = `#${this.pal.snow.map((v) => Math.min(255, Math.round(v / 32) * 32).toString(16).padStart(2, '0')).join('')}`;
    // Brighter in sunlit water, where light catches them; faint glints in the dark.
    const alpha = 0.05 + 0.07 * (1 - darknessAt(this.camY));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      let x = (m.u * W - this.camX * this.zoom * m.f + Math.sin(t * 0.21 + i * 2.1) * 26) % W;
      let y = (m.v * H - this.camY * this.zoom * m.f + Math.cos(t * 0.17 + i) * 18) % H;
      if (x < 0) x += W;
      if (y < 0) y += H;
      drawGlow(ctx, color, x - pad, y - pad, m.s, alpha * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 1.7)));
    }
    ctx.globalCompositeOperation = 'source-over';
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
      const set = CORAL_PALETTES[cl.zone] ?? CORAL_PALETTES.twilight!;
      const pal = set[Math.floor(cl.hue * set.length) % set.length];
      const rock = BIOME_ROCK[cl.zone];
      look = {
        kind: rock?.kind ?? 'reef',
        base: rock?.base ?? pal[0],
        lump: rock?.lump ?? pal[1],
        polyp: rock?.polyp ?? pal[2],
        glow: rock?.glow ?? (cl.zone === 'gardens' ? 1 : cl.zone === 'shallows' ? 0.35 : 0.6),
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
      g.addColorStop(1, css(mixRGB(hexToRgb(look.base), [4, 8, 30], 0.65)));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (const c of cl.circles) {
        const x = this.sx(c.x);
        const y = this.sy(c.y);
        ctx.moveTo(x + c.r * z, y);
        ctx.arc(x, y, c.r * z, 0, TAU);
      }
      ctx.fill();
      // Sunlight ripples across the reef in shallow water.
      const sun = this.pal.caustics * clamp(1 - cl.minY / 2600, 0, 1);
      if (sun > 0.03 && this.backdrop.quality > 1) {
        ctx.save();
        ctx.clip();
        this.backdrop.drawCaustics(ctx, this.sx(cl.minX), top, (cl.maxX - cl.minX) * z, bottom - top, this.sx(0), this.sy(0), 1.6 * z, 0.55 * sun, t, false);
        ctx.restore();
      }
      // Living coral crowns the exposed tops of the reef.
      if (look.kind === 'reef' && (cl.zone === 'shallows' || cl.zone === 'gardens')) {
        cl.circles.forEach((c, i) => {
          if (!look.exposed[i] || c.r < 26) return;
          const n = c.r > 70 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const a = -Math.PI / 2 + (hash(cl.seed + i * 5 + k) - 0.5) * 1.1;
            const px = this.sx(c.x + Math.cos(a) * c.r * 0.86);
            const py = this.sy(c.y + Math.sin(a) * c.r * 0.86);
            const pal = CORAL_PALETTES[cl.zone]!;
            const col = hexToRgb(pal[Math.floor(hash(cl.seed + i + k * 3) * pal.length)][2]);
            const body = mixRGB(hexToRgb(look.lump), col, cl.zone === 'shallows' ? 0.55 : 0.3);
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(z, z);
            ctx.rotate(a + Math.PI / 2);
            coralPiece(ctx, Math.floor(hash(cl.seed + i * 9 + k) * 4), 0, 0, c.r * (0.32 + hash(cl.seed + i + k) * 0.2), body, mixRGB(body, [255, 255, 255], 0.4), cl.seed + i, t, cl.zone === 'gardens' ? look.polyp : null);
            ctx.restore();
          }
        });
      }
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

  /** Runs `fn` with the context in world units around (x, y), if that spot is near the view. */
  private atWorld(x: number, y: number, pad: number, fn: () => void): void {
    const sx = this.sx(x);
    const sy = this.sy(y);
    if (!this.onScreen(sx, sy, pad * this.zoom)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(this.zoom, this.zoom);
    fn();
    ctx.restore();
  }

  /**
   * Shelters, vents and landmarks. The back pass draws them behind the creatures; the front
   * pass draws the fronds that wave in front of a jelly hiding among them.
   */
  private drawFeatures(world: World, front: boolean): void {
    const ctx = this.ctx;
    const t = this.reducedMotion ? this.time * 0.3 : this.time;
    const lit = this.pal.sunK;
    for (const sh of world.shelters) this.atWorld(sh.x, sh.y, sh.r * 2.6, () => drawShelter(ctx, sh, t, front, lit));
    if (front) return;
    for (const lm of world.landmarks) {
      if (lm.def.id === 'galleon' || lm.def.id === 'kelp-cathedral') continue;
      this.atWorld(lm.x, lm.y, 700, () => drawLandmark(ctx, lm, t));
    }
    for (const v of world.vents) {
      this.atWorld(v.x, v.y, v.h + 700, () => drawVent(ctx, v, t));
      const sx = this.sx(v.x);
      const sy = this.sy(v.y - v.h);
      if (this.onScreen(sx, sy, 600 * this.zoom)) drawPlumeShimmer(ctx, sx, sy, 560, t, this.zoom);
    }
    for (const lm of world.landmarks) {
      if (!lm.revealed || lm.taken || lm.def.id === 'galleon') continue;
      const def = TREASURES_BY_ID[lm.def.treasure];
      this.atWorld(lm.tx, lm.ty - (lm.def.id === 'crystal-heart' ? 120 : 0), 80, () => drawTreasure(ctx, def.id, def.color, t, lm.wakeT));
    }
  }

  private drawPods(world: World): void {
    const ctx = this.ctx;
    const t = this.reducedMotion ? this.time * 0.3 : this.time;
    const color = this.pal.accents[0];
    for (const pod of world.pods) this.atWorld(pod.x, pod.y, 60, () => drawPod(ctx, pod, t, pod.grove ? '#7dffb9' : color));
  }

  /** Ink clouds: dark, billowing, thinning as they drift apart. */
  private drawInk(world: World): void {
    const ctx = this.ctx;
    const z = this.zoom;
    for (const k of world.inks) {
      const age = 1 - k.t / k.max;
      const fade = Math.min(1, k.t / 1.2);
      const grow = 0.55 + 0.45 * Math.min(1, age * 3);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.7 + k.x * 0.01;
        const ox = Math.cos(a) * k.r * 0.45 * grow + Math.sin(this.time * 0.6 + i) * 6;
        const oy = Math.sin(a) * k.r * 0.4 * grow - age * 20;
        const x = this.sx(k.x + ox);
        const y = this.sy(k.y + oy);
        const rr = k.r * (0.55 + (i % 3) * 0.12) * grow * z;
        if (!this.onScreen(x, y, rr)) continue;
        const g = ctx.createRadialGradient(x, y, rr * 0.1, x, y, rr);
        g.addColorStop(0, `rgba(14,8,26,${0.75 * fade})`);
        g.addColorStop(0.6, `rgba(20,12,38,${0.45 * fade})`);
        g.addColorStop(1, 'rgba(20,12,38,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** A bloom in progress, laid over the darkness so it lights the whole view. */
  private drawEncounter(world: World): void {
    const e = world.encounter;
    if (!e || e.kind !== 'bloom') return;
    const k = Math.min(1, e.t / 3, (e.dur - e.t) / 4);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    drawBloom(ctx, e.x, e.y, this.zoom, this.reducedMotion ? this.time * 0.3 : this.time, k, this.w, this.h, this.camX, this.camY);
    ctx.globalCompositeOperation = 'source-over';
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
      } else if (c.def.stings && Math.hypot(c.x - world.player.x, c.y - world.player.y) < 320) {
        // Not food, not a hunter: dangerous to touch. A dashed amber ring says keep clear.
        ctx.strokeStyle = 'rgba(255,170,90,0.45)';
        ctx.lineWidth = Math.max(1, 1.4 * z);
        ctx.setLineDash([4 * z, 5 * z]);
        ctx.beginPath();
        ctx.arc(x, y + c.r * z * 0.6, c.r * z * 1.7, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.save();
      ctx.translate(x, y);
      // Swallowed food shrinks into the bell.
      const gulp = 1 - 0.85 * c.consume;
      ctx.scale(z * gulp, z * gulp);
      if (c.consume > 0) ctx.globalAlpha = 1 - c.consume * 0.6;
      if (c.def.shape === 'octopus') {
        // Another octopus: arms trailing as it swims, eyes on you.
        ctx.rotate(c.heading + Math.PI / 2);
        const sp = Math.min(1, Math.hypot(c.vx, c.vy) / 120);
        const look: OctoLook = { skin: c.def.colors.body, spots: c.def.colors.accent, arm: c.def.colors.body, rim: '#ffffff', glow: c.def.colors.glow };
        drawOctopus(ctx, look, { r: c.r, t: c.phase, squeeze: sp, mutations: [], forms: [], armsLost: 0, regrow: 1, lookX: 0, lookY: -0.5, open: 1, mood: c.timer > 2 ? 'alarm' : 'calm', camo: 0, camoColor: '#000000', alarm: 0, lum: 0, personality: null }, proceduralArms(c.r, c.phase, [], 0.3, null, sp));
      } else if (c.def.shape === 'jelly') {
        ctx.rotate(c.heading + Math.PI / 2);
        // Until the jelly's light is strong enough to take it in, the Phantom is barely there.
        if (c.def.revealLight) ctx.globalAlpha = world.hasSeen(c.def.id) ? 0.75 : 0.1;
        drawJelly(ctx, c.r, c.phase, Math.pow(Math.max(0, Math.sin(c.phase * 2.2)), 2), jellyStyleForSpecies(c.def), null, false);
      } else {
        ctx.rotate(c.heading);
        if (Math.cos(c.heading) < 0 && c.def.shape !== 'seahorse') ctx.scale(1, -1);
        if (c.stunned > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 20);
        drawCreatureShape(ctx, c.def, lookFor(c.def), { r: c.r, t: c.phase, alert, puffed: c.state === 'puffed' ? 1 : 0, shut: Math.min(1, c.shell * 4) });
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
    // Inner light rises with the dark; a fright flushes the bell; a catch in hand brightens it.
    this.body.lum = clamp(darknessAt(p.y) * 1.1, 0, 1);
    const locked = p.alive && world.creatures.some((c) => (c.state === 'notice' || c.state === 'orbit') && isThreat(world.playerReach(), c.r, c.def) && Math.hypot(c.x - p.x, c.y - p.y) < 600);
    this.body.startle = damp(this.body.startle ?? 0, locked ? 0.8 : 0, locked ? 10 : 2.5, dt);
    const holding = world.tentacles.some((tt) => tt.phase === 'grab' || tt.phase === 'pull' || tt.phase === 'eat');
    this.body.hunt = damp(this.body.hunt ?? 0, holding ? 1 : 0, holding ? 12 : 3, dt);
    if (world.sweepT > 0 && p.alive) this.drawSweep(world);
    this.drawOctopusPlayer(world, tr * scale, alpha, dt, x, y);
  }

  private rig = new OctoRig();
  /** The angle the octopus is drawn at: upright when drifting, mantle-first when swimming hard. */
  private bodyAngle = 0;
  private blinkT = 2;
  private eyeOpen = 1;
  private lookX = 0;
  private lookY = 0;
  private saccadeT = 0;
  private saccadeX = 0;
  private saccadeY = 0;
  private happyT = 0;
  private wonderT = 0;
  /** This octopus's own looks. */
  playerVariant: OctoVariant | undefined;

  /** Something new: the octopus goes wide-eyed and flares its arms. */
  wonder(): void {
    this.wonderT = 1.3;
  }
  /** Paused: the octopus dozes with its eyes shut. */
  sleeping = false;
  private camoK = 0;
  private squeeze = 0;

  /** Called when a new octopus hatches, so its arms start fresh. */
  resetOctopus(): void {
    this.rig.reset();
    this.bodyAngle = 0;
  }

  private drawOctopusPlayer(world: World, r: number, alpha: number, dt: number, x: number, y: number): void {
    const ctx = this.ctx;
    const p = world.player;
    const z = this.zoom;
    const t = this.reducedMotion ? world.time * 0.6 : world.time;
    const speed = Math.hypot(p.vx, p.vy);
    const fast = clamp((speed - 70) / 160, 0, 1) || (p.burstT > 0 ? 1 : 0);
    const mood = p.personality;
    // Drifting, it floats upright and tilts a little into its motion; swimming hard, the mantle leads.
    const upright = clamp(p.vx / 260, -0.45, 0.45) + Math.sin(world.time * 0.8) * 0.05;
    const target = fast > 0.5 ? p.heading + Math.PI / 2 : upright;
    this.bodyAngle = angleLerp(this.bodyAngle, target, 1 - Math.exp(-(fast > 0.5 ? 6 : 3) * dt));
    this.squeeze = damp(this.squeeze, Math.max(p.thrust * 0.6, p.burstT > 0 ? 1 : 0), 10, dt);

    // Which arm does what: hunting arms follow the simulation's tentacles; one idle arm feels the reef.
    const targets: ({ x: number; y: number; w: number } | null)[] = new Array(ARM_COUNT).fill(null);
    const used = new Set<number>();
    for (const tt of world.tentacles) {
      if (tt.phase === 'idle') continue;
      let i = Math.round(clamp(tt.slot, 0, 1) * (ARM_COUNT - 1));
      for (let k = 0; used.has(i) && k < ARM_COUNT; k++) i = (i + (k % 2 ? k : -k) + ARM_COUNT) % ARM_COUNT;
      if (used.has(i)) continue;
      used.add(i);
      targets[i] = { x: tt.x, y: tt.y, w: tt.phase === 'retract' ? 0.5 : 1 };
    }
    const len = armLength(r, p.mutations, this.body.maturity) * (mood === 'cautious' ? 0.88 : 1);
    if (p.alive && speed < 60 && !used.has(3)) {
      // Curious arms: when it is still, an arm reaches out to touch the nearest rock.
      const cell = world.coralNear(p.x, p.y + r);
      if (cell) {
        let best: { x: number; y: number } | null = null;
        let bd = len * 0.95;
        for (const c of cell) {
          const d = Math.hypot(c.x - p.x, c.y - p.y) - c.r;
          if (d < bd && d > r * 0.6) {
            bd = d;
            const k = c.r / (d + c.r);
            best = { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
          }
        }
        if (best) targets[mood === 'playful' ? 2 : 3] = { x: best.x, y: best.y, w: 0.35 };
      }
    }
    const spreadBase = mood === 'cautious' ? 0.55 : mood === 'aggressive' ? 0.75 : 0.9;
    const curlBase = mood === 'playful' ? 0.75 : mood === 'cautious' ? 0.3 : 0.5;
    this.rig.update({
      x: p.x,
      y: p.y,
      angle: this.bodyAngle,
      r,
      len,
      spread: lerp(spreadBase + Math.min(1, this.wonderT * 2) * 0.3, 0.26, fast),
      curl: lerp(curlBase, 0.3, fast),
      time: t,
      dt,
      targets,
    });

    // Eyes: on whatever matters most. A hunter about to strike, then the catch, then food, then the way ahead.
    let lx = Math.cos(p.heading) * 0.6;
    let ly = Math.sin(p.heading) * 0.6;
    let mood2: EyeMood = 'calm';
    let focus: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const c of world.creatures) {
      if (c.dead) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if ((c.state === 'notice' || c.state === 'chase' || c.state === 'orbit') && isThreat(world.playerReach(), c.r, c.def) && d < 600) {
        focus = c;
        mood2 = 'alarm';
        break;
      }
      if (d < bestD && d < 260 && canEat(world.playerReach(), c.r, c.def)) {
        bestD = d;
        focus = c;
      }
    }
    const busy = world.tentacles.find((tt) => tt.phase === 'reach' || tt.phase === 'grab' || tt.phase === 'pull');
    if (mood2 !== 'alarm' && busy) {
      focus = busy;
      mood2 = 'focus';
    }
    this.saccadeT -= dt;
    if (this.saccadeT <= 0) {
      // Idle glances; a curious octopus looks around far more.
      this.saccadeT = mood === 'curious' ? 0.5 + Math.random() * 0.8 : 1.2 + Math.random() * 2;
      this.saccadeX = (Math.random() - 0.5) * 1.6;
      this.saccadeY = (Math.random() - 0.5) * 1.2;
    }
    if (focus) {
      lx = focus.x - p.x;
      ly = focus.y - p.y;
      const m = Math.hypot(lx, ly) || 1;
      lx /= m;
      ly /= m;
    } else if (speed < 40) {
      lx = this.saccadeX;
      ly = this.saccadeY;
    }
    const ca = Math.cos(-this.bodyAngle);
    const sa = Math.sin(-this.bodyAngle);
    this.lookX = damp(this.lookX, lx * ca - ly * sa, 12, dt);
    this.lookY = damp(this.lookY, lx * sa + ly * ca, 12, dt);
    this.happyT = Math.max(0, this.happyT - dt);
    this.wonderT = Math.max(0, this.wonderT - dt);
    if (this.happyT > 0 && mood2 === 'calm') mood2 = 'happy';
    else if (this.wonderT > 0 && (mood2 === 'calm' || mood2 === 'focus')) mood2 = 'wonder';
    if (!p.alive || this.sleeping) mood2 = 'closed';
    this.blinkT -= dt;
    if (this.blinkT <= 0) this.blinkT = 2.5 + Math.random() * 3.5;
    this.eyeOpen = this.blinkT < 0.12 ? 0 : 1;
    this.camoK = damp(this.camoK, p.camo ? 1 : 0, p.camo ? 3 : 8, dt);

    const style = this.playerStyle;
    const look: OctoLook = { skin: style.bell, spots: style.organ, arm: style.tentacle, rim: style.rim, glow: style.glow };
    const water = this.pal.water;
    const camoColor = `#${water.map((v) => Math.round(v * 1.15).toString(16).padStart(2, '0').slice(-2)).join('')}`;
    const lost = p.armsLost;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(z, z);
    ctx.rotate(this.bodyAngle);
    // A gulp: the body squashes wide and springs back, a wobble that settles as the meal goes down.
    const g = this.reducedMotion ? 0 : this.body.gulp;
    if (g > 0.01) {
      const wob = g * g * Math.cos((1 - g) * 14);
      ctx.scale(1 + 0.16 * wob, 1 - 0.12 * wob);
    }
    drawOctopus(
      ctx,
      look,
      {
        r,
        t,
        squeeze: this.squeeze,
        mutations: p.mutations,
        forms: p.forms,
        armsLost: lost,
        regrow: lost > 0 ? 1 - p.regrowT / 25 : 1,
        lookX: this.lookX,
        lookY: this.lookY,
        open: this.eyeOpen,
        mood: mood2,
        camo: this.camoK,
        camoColor,
        alarm: (this.body.startle ?? 0) * 0.8,
        lum: this.body.lum ?? 0,
        personality: mood,
        variant: this.playerVariant,
      },
      this.rig.local,
    );
    ctx.restore();

    // Prey held at an arm's tip, coiled round so the grip reads.
    for (const tt of world.tentacles) {
      const prey = tt.target;
      if (!prey || (tt.phase !== 'grab' && tt.phase !== 'pull' && tt.phase !== 'eat')) continue;
      const cr = prey.r * (1 - 0.85 * prey.consume) * z * 1.1;
      const spin = world.time * 6 + tt.seed;
      ctx.strokeStyle = rgba(style.tentacle, 0.9 * alpha);
      ctx.lineWidth = Math.max(1.6, r * z * 0.08);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(this.sx(tt.x), this.sy(tt.y), cr, spin, spin + Math.PI * 1.3);
      ctx.stroke();
    }
  }

  private body: JellyBody = { maturity: 0, gulp: 0, gut: '#ffffff' };
  /** The heading the body is drawn at: it trails the swim heading for a softer turn. */
  private visHeading = -Math.PI / 2;

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

  /** A meal just went down: the bell swells and glows with its color for a moment. */
  feed(color: string): void {
    this.happyT = 0.55;
    this.body.gulp = 1;
    this.body.gut = color;
  }

  private drawDarkness(world: World, dt: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    const p = world.player;
    const dark = darknessAt(this.camY);
    if (dark <= 0.01) return;
    const dc = this.darkCtx;
    const R = DARK_RES;
    const z = this.zoom;
    dc.setTransform(1, 0, 0, 1, 0, 0);
    dc.globalCompositeOperation = 'source-over';
    dc.globalAlpha = 1;
    dc.clearRect(0, 0, this.darkCanvas.width, this.darkCanvas.height);
    dc.fillStyle = `rgba(${darkColor(this.camY)},${dark})`;
    dc.fillRect(0, 0, this.darkCanvas.width, this.darkCanvas.height);
    dc.setTransform(R, 0, 0, R, 0, 0);
    dc.globalCompositeOperation = 'destination-out';
    const hole = holeSprite();
    const cut = (x: number, y: number, r: number, a: number) => {
      if (a <= 0.01 || r < 2 || x < -r || y < -r || x > this.w + r || y > this.h + r) return;
      dc.globalAlpha = Math.min(1, a);
      dc.drawImage(hole, x - r, y - r, r * 2, r * 2);
    };
    if (p.alive || p.deathT < 1) {
      const light = world.lightRadius() * z * (1 + 0.03 * Math.sin(this.time * 2));
      cut(this.sx(p.x), this.sy(p.y), light, p.alive ? 1 : 1 - p.deathT);
    }
    for (const c of world.creatures) {
      if (c.dead || !c.def.glows || c.def.revealLight) continue;
      const tw = 0.75 + 0.25 * Math.sin(c.phase * 3);
      cut(this.sx(c.x), this.sy(c.y), Math.max(40, c.r * z * 5), 0.55 * tw);
    }
    for (const f of this.flashes) cut(this.sx(f.x), this.sy(f.y), f.r * z, (f.life / f.max) * 0.9);
    this.cutSceneLights(world, cut);
    dc.globalAlpha = 1;
    dc.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.darkCanvas, 0, 0, this.w, this.h);
  }

  /** Glowing scenery that lights its own surroundings. Filled in by the world's features. */
  private cutSceneLights(world: World, cut: (x: number, y: number, r: number, a: number) => void): void {
    const z = this.zoom;
    const L = (x: number, y: number, r: number, a: number) => cut(this.sx(x), this.sy(y), r * z, a);
    for (const pod of world.pods) if (pod.regrow <= 0) L(pod.x, pod.y, 90, 0.5);
    for (const v of world.vents) L(v.x, v.y - v.h, 170, 0.6);
    for (const lm of world.landmarks) {
      switch (lm.def.id) {
        case 'lantern-grove':
          L(lm.x, lm.y, 420, 0.45);
          break;
        case 'whale-fall':
          L(lm.x, lm.y, 380, 0.3);
          break;
        case 'drowned-gate':
          L(lm.x, lm.y - 160, 420, 0.15 + (lm.revealed ? 0.4 : 0));
          break;
        case 'crystal-heart':
          L(lm.x, lm.y, 620, 0.7);
          break;
        default:
          break;
      }
      if (lm.revealed && !lm.taken && lm.def.id !== 'galleon') L(lm.tx, lm.ty, 120, 0.7);
    }
    const e = world.encounter;
    if (e && e.kind === 'bloom') L(e.x, e.y, 1100, 0.55 * Math.min(1, e.t / 3, (e.dur - e.t) / 4));
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

    // Places glint at the screen edge when they are somewhere near: faintly before they are found,
    // brightly once their treasure is showing and still to be taken.
    for (const lm of world.landmarks) {
      if (lm.taken) continue;
      const tx = lm.found && lm.revealed ? lm.tx : lm.x;
      const ty = lm.found && lm.revealed ? lm.ty : lm.y;
      const cx = this.sx(tx);
      const cy = this.sy(ty);
      const d = Math.hypot(tx - p.x, ty - p.y);
      const want = lm.found && lm.revealed;
      if (d > (want ? 1600 : 1300) * p.stats.placeSense || this.onScreen(cx, cy, -20)) continue;
      const color = want ? TREASURES_BY_ID[lm.def.treasure].color : lm.def.color;
      const a = Math.atan2(cy - py, cx - px);
      const ex = clamp(px + Math.cos(a) * 2000, 30, this.w - 30);
      const ey = clamp(py + Math.sin(a) * 2000, HUD_TOP, this.h - 30);
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 3);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, color, ex, ey, want ? 18 : 13, (want ? 0.8 : 0.4) * pulse);
      ctx.globalCompositeOperation = 'source-over';
      this.drawChevron(ex, ey, a, want ? '#ffe2a3' : rgba(color, 0.55));
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
