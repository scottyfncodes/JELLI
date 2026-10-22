import { SPECIES, PLAYER_SPECIES } from '../content/species';
import type { PathId, PlayerStats, SpeciesDef, ZoneId } from '../content/types';
import { WORLD, ZONES, darknessAt, zoneAt, type ZoneDef } from '../content/world';
import { computeStats, emptyTiers, type Tiers } from '../content/evolutions';
import {
  MAX_MASS,
  START_MASS,
  STAGES,
  detectionScale,
  extraHunters,
  hunterScale,
  growthGain,
  maxSpeedFor,
  radiusForMass,
  stageForMass,
} from '../content/progression';
import { TAU, angleLerp, clamp, lerp, mulberry32 } from '../core/math';
import { emptyRunStats, type RunStats } from '../core/progress';
import { canEat, eatContact, isThreat, threatContact } from './rules';

export interface Coral {
  x: number;
  y: number;
  r: number;
}

export interface CoralCluster {
  circles: Coral[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  hue: number;
  seed: number;
}

export interface Current {
  x: number;
  y: number;
  w: number;
  h: number;
  fx: number;
  fy: number;
}

export type CreatureState = 'wander' | 'notice' | 'chase' | 'rest' | 'flee' | 'puffed';

export interface Creature {
  id: number;
  def: SpeciesDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  baseR: number;
  heading: number;
  phase: number;
  state: CreatureState;
  stateT: number;
  timer: number;
  stunned: number;
  dead: boolean;
  leader: Creature | null;
  offX: number;
  offY: number;
  homeX: number;
  homeY: number;
  lockX: number;
  lockY: number;
  chain: { x: number; y: number }[] | null;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  r: number;
  heading: number;
  pulse: number;
  thrust: number;
  burstT: number;
  charges: number;
  recharge: number;
  stingCd: number;
  invuln: number;
  stage: number;
  alive: boolean;
  deathT: number;
  inCurrent: boolean;
  tiers: Tiers;
  stats: PlayerStats;
}

export interface SimInput {
  ax: number;
  ay: number;
  burst: boolean;
}

export type SimEvent =
  | { type: 'eat'; x: number; y: number; def: SpeciesDef; r: number }
  | { type: 'burst'; x: number; y: number }
  | { type: 'nova'; x: number; y: number; r: number }
  | { type: 'sting'; x: number; y: number; def: SpeciesDef }
  | { type: 'caught'; def: SpeciesDef }
  | { type: 'discover'; def: SpeciesDef }
  | { type: 'stage'; stage: number }
  | { type: 'zone'; zone: ZoneDef }
  | { type: 'rare'; def: SpeciesDef }
  | { type: 'notice'; def: SpeciesDef; x: number; y: number };

export type RunEnd = 'caught' | null;

const DESPAWN_PAD = 380;
const START_X = WORLD.width / 2;
const START_Y = 430;

interface YRange {
  top: number;
  bottom: number;
}

const ZONE_RANGE: Record<string, YRange> = {};
for (const def of SPECIES) {
  const zs = ZONES.filter((z) => def.zones.includes(z.id));
  ZONE_RANGE[def.id] = {
    top: Math.min(...zs.map((z) => z.top)),
    bottom: Math.max(...zs.map((z) => z.bottom)),
  };
}

const RARE_DEFS = SPECIES.filter((s) => s.rare);

export interface WorldOptions {
  seed?: number;
  tiers?: Partial<Tiers>;
  /** Attract mode on the title screen: no hunters, no clock. */
  demo?: boolean;
  rng?: () => number;
}

export class World {
  readonly width = WORLD.width;
  readonly height = WORLD.height;
  readonly corals: CoralCluster[] = [];
  readonly coralGrid = new Map<number, Coral[]>();
  readonly currents: Current[] = [];
  readonly creatures: Creature[] = [];
  readonly events: SimEvent[] = [];
  readonly player: Player;
  readonly run: RunStats = emptyRunStats();
  readonly demo: boolean;

  time = 0;
  ended: RunEnd = null;
  pendingEvolutions = 0;
  zone: ZoneDef = ZONES[0];
  viewRadius = 500;
  /** Half extents of the visible area; hunters only notice the jelly from on screen. */
  viewHW = 300;
  viewHH = 500;

  private nextId = 1;
  private spawnTimer = 0;
  private rareTimer = 3;
  private seen = new Set<string>();
  private rand: () => number;

  constructor(opts: WorldOptions = {}) {
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    this.rand = opts.rng ?? Math.random;
    this.demo = opts.demo ?? false;
    const tiers = { ...emptyTiers(), ...opts.tiers };
    this.player = {
      x: START_X,
      y: START_Y,
      vx: 0,
      vy: 0,
      mass: START_MASS,
      r: radiusForMass(START_MASS),
      heading: -Math.PI / 2,
      pulse: 0,
      thrust: 0,
      burstT: 0,
      charges: 1,
      recharge: 0,
      stingCd: 0,
      invuln: 2.5,
      stage: 1,
      alive: true,
      deathT: 0,
      inCurrent: false,
      tiers,
      stats: computeStats(tiers),
    };
    this.player.charges = this.player.stats.burstCharges;
    this.generate(mulberry32(seed));
    this.markSeen(PLAYER_SPECIES);
  }

  // ---------------------------------------------------------------- layout

  private generate(rng: () => number): void {
    const W = this.width;
    const H = this.height;
    const addCluster = (cx: number, cy: number, count: number, minR: number, maxR: number, spread: number) => {
      const circles: Coral[] = [];
      for (let i = 0; i < count; i++) {
        const a = rng() * TAU;
        const d = i === 0 ? 0 : rng() * spread;
        circles.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.8, r: lerp(minR, maxR, rng()) });
      }
      this.addCoral(circles, rng);
    };

    // Reef walls hugging both edges and the seabed.
    for (let y = 120; y < H; y += 150 + rng() * 120) {
      addCluster(-30 + rng() * 40, y, 3, 50, 120, 70);
      addCluster(W + 30 - rng() * 40, y + rng() * 80, 3, 50, 120, 70);
    }
    for (let x = 80; x < W; x += 170 + rng() * 120) {
      addCluster(x, H + 20, 3, 60, 130, 80);
    }

    // Open-water outcrops, some paired with a tight gap only small jellies fit through.
    for (let y = 700; y < H - 200; y += 230 + rng() * 120) {
      const n = 1 + (rng() < 0.55 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const x = 260 + rng() * (W - 520);
        if (Math.hypot(x - START_X, y - START_Y) < 420) continue;
        const r = 40 + rng() * 45;
        addCluster(x, y, 3 + Math.floor(rng() * 4), 22, r, 70);
        if (rng() < 0.45) {
          const gap = 30 + rng() * 22;
          const r2 = 40 + rng() * 30;
          const side = rng() < 0.5 ? -1 : 1;
          this.addCoral([{ x: x + side * (r + gap + r2), y: y + (rng() - 0.5) * 30, r: r2 }], rng);
        }
      }
    }

    const cur = (x: number, y: number, w: number, h: number, fx: number, fy: number) =>
      this.currents.push({ x, y, w, h, fx, fy });
    cur(W * 0.08, 1150, W * 0.84, 150, 95, 0);
    cur(W * 0.06, 2450, W * 0.88, 160, -115, 0);
    cur(W * 0.2, 2000, 170, 1300, 0, -95);
    cur(W * 0.08, 4250, W * 0.84, 170, 125, 0);
    cur(W * 0.1, 4950, W * 0.8, 170, -110, 0);
  }

  private addCoral(circles: Coral[], rng: () => number): void {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of circles) {
      minX = Math.min(minX, c.x - c.r);
      minY = Math.min(minY, c.y - c.r);
      maxX = Math.max(maxX, c.x + c.r);
      maxY = Math.max(maxY, c.y + c.r);
      // Index into every grid cell the circle touches.
      for (let gx = Math.floor((c.x - c.r) / 200); gx <= Math.floor((c.x + c.r) / 200); gx++) {
        for (let gy = Math.floor((c.y - c.r) / 200); gy <= Math.floor((c.y + c.r) / 200); gy++) {
          const key = gx * 1000 + gy;
          let cell = this.coralGrid.get(key);
          if (!cell) this.coralGrid.set(key, (cell = []));
          cell.push(c);
        }
      }
    }
    this.corals.push({ circles, minX, minY, maxX, maxY, hue: rng(), seed: Math.floor(rng() * 1e6) });
  }

  coralNear(x: number, y: number): Coral[] | undefined {
    return this.coralGrid.get(Math.floor(x / 200) * 1000 + Math.floor(y / 200));
  }

  /** Pushes a circle out of any coral it overlaps. Returns true on contact. */
  private collideCoral(e: { x: number; y: number; vx: number; vy: number }, r: number): boolean {
    const cell = this.coralNear(e.x, e.y);
    if (!cell) return false;
    let hit = false;
    for (const c of cell) {
      const dx = e.x - c.x;
      const dy = e.y - c.y;
      const min = c.r + r * 0.85;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        e.x = c.x + nx * min;
        e.y = c.y + ny * min;
        const vn = e.vx * nx + e.vy * ny;
        if (vn < 0) {
          e.vx -= vn * nx * 1.3;
          e.vy -= vn * ny * 1.3;
        }
        hit = true;
      }
    }
    return hit;
  }

  insideCoral(x: number, y: number, pad: number): boolean {
    const cell = this.coralNear(x, y);
    if (!cell) return false;
    for (const c of cell) if (Math.hypot(x - c.x, y - c.y) < c.r + pad) return true;
    return false;
  }

  flowAt(x: number, y: number, out: { x: number; y: number }): boolean {
    out.x = 0;
    out.y = 0;
    let inside = false;
    for (const c of this.currents) {
      if (x < c.x || x > c.x + c.w || y < c.y || y > c.y + c.h) continue;
      const edge = Math.min(x - c.x, c.x + c.w - x, y - c.y, c.y + c.h - y);
      const k = clamp(edge / 50, 0, 1);
      out.x += c.fx * k;
      out.y += c.fy * k;
      inside = inside || k > 0.4;
    }
    return inside;
  }

  // ---------------------------------------------------------------- run control

  applyEvolution(path: PathId): void {
    const p = this.player;
    if (this.pendingEvolutions <= 0) return;
    p.tiers[path] = Math.min(3, p.tiers[path] + 1);
    const before = p.stats.burstCharges;
    p.stats = computeStats(p.tiers);
    p.charges = Math.min(p.stats.burstCharges, p.charges + (p.stats.burstCharges - before));
    if (path === 'sting') p.stingCd = 0;
    this.pendingEvolutions -= 1;
    this.run.evolutions += 1;
  }

  /** Visible radius around the player, shrinking from the full view to the light radius as water darkens. */
  visibleRadius(): number {
    const dark = darknessAt(this.player.y);
    return lerp(this.viewRadius, Math.min(this.viewRadius, this.player.stats.lightRadius), clamp(dark / 0.8, 0, 1));
  }

  stingReady(): boolean {
    return this.player.stats.stingCooldown > 0 && this.player.stingCd <= 0;
  }

  // ---------------------------------------------------------------- update

  setView(hw: number, hh: number): void {
    this.viewHW = hw;
    this.viewHH = hh;
    this.viewRadius = Math.hypot(hw, hh);
  }

  update(dt: number, input: SimInput): void {
    if (this.ended) return;
    this.time += dt;
    const p = this.player;

    if (!p.alive) {
      p.deathT += dt;
      p.vx *= Math.exp(-3 * dt);
      p.vy *= Math.exp(-3 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.updateCreatures(dt);
      if (p.deathT > 1.5) this.ended = 'caught';
      return;
    }

    this.updatePlayer(dt, input);
    this.updateCreatures(dt);
    this.resolveContacts(dt);
    this.updateSpawning(dt);
    this.updateDiscovery();

    const zone = zoneAt(p.y);
    if (zone !== this.zone) {
      this.zone = zone;
      this.events.push({ type: 'zone', zone });
    }
    this.run.maxDepth = Math.max(this.run.maxDepth, p.y);
    this.run.time = this.time;
    this.run.mass = p.mass;
    this.run.stage = p.stage;
  }

  private flow = { x: 0, y: 0 };

  private updatePlayer(dt: number, input: SimInput): void {
    const p = this.player;
    const st = p.stats;
    let ax = input.ax;
    let ay = input.ay;
    const mag = Math.min(1, Math.hypot(ax, ay));
    if (mag > 1e-3) {
      const m = Math.hypot(ax, ay);
      ax = (ax / m) * mag;
      ay = (ay / m) * mag;
    }
    const maxSp = maxSpeedFor(p.r, st.speed);

    // The bell contracts in rhythm; thrust peaks on each contraction for a buoyant feel.
    p.pulse += dt * (1.1 + 1.6 * mag);
    const contraction = Math.pow(Math.max(0, Math.sin(p.pulse * TAU)), 2);
    p.thrust = contraction;
    const drag = 2.4;
    const accel = maxSp * drag * (0.72 + 0.62 * contraction);
    p.vx += ax * accel * dt;
    p.vy += ay * accel * dt;

    // Burst
    if (p.charges < st.burstCharges) {
      p.recharge += dt;
      if (p.recharge >= st.burstCooldown) {
        p.charges += 1;
        p.recharge = 0;
      }
    } else p.recharge = 0;

    if (input.burst && p.charges >= 1) {
      p.charges -= 1;
      let dx = ax;
      let dy = ay;
      if (Math.hypot(dx, dy) < 0.2) {
        dx = Math.cos(p.heading);
        dy = Math.sin(p.heading);
      }
      const dm = Math.hypot(dx, dy) || 1;
      const impulse = 340 * st.burstPower;
      p.vx += (dx / dm) * impulse;
      p.vy += (dy / dm) * impulse;
      p.burstT = 0.55;
      p.pulse = Math.floor(p.pulse) + 0.25;
      this.events.push({ type: 'burst', x: p.x, y: p.y });
      if (st.stingNova > 0) this.stingNova(st.stingNova);
    }
    p.burstT = Math.max(0, p.burstT - dt);

    p.vx -= p.vx * drag * dt;
    p.vy -= p.vy * drag * dt;
    // Gentle idle drift so the jelly never feels frozen.
    p.vy += Math.sin(this.time * 1.3) * 7 * dt * (1 - mag);

    const cap = maxSp * (p.burstT > 0 ? 1 + 1.2 * st.burstPower * (p.burstT / 0.55) : 1.08);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > cap) {
      p.vx = (p.vx / sp) * cap;
      p.vy = (p.vy / sp) * cap;
    }

    const f = this.flow;
    p.inCurrent = this.flowAt(p.x, p.y, f);
    let fm = 1;
    if (st.currentControl > 0 && p.inCurrent && mag > 0.2) {
      const fl = Math.hypot(f.x, f.y) || 1;
      const align = (f.x * ax + f.y * ay) / (fl * mag);
      fm = align > 0 ? 1 + 0.6 * st.currentControl * align : 1 + 0.8 * st.currentControl * align;
    }
    p.x += (p.vx + f.x * fm) * dt;
    p.y += (p.vy + f.y * fm) * dt;

    if (sp > 25) p.heading = angleLerp(p.heading, Math.atan2(p.vy, p.vx), 1 - Math.exp(-6 * dt));

    this.collideCoral(p, p.r);
    p.x = clamp(p.x, p.r, this.width - p.r);
    p.y = clamp(p.y, p.r + 30, this.height - p.r);

    p.invuln = Math.max(0, p.invuln - dt);
    p.stingCd = Math.max(0, p.stingCd - dt);
  }

  private stingNova(radius: number): void {
    const p = this.player;
    this.events.push({ type: 'nova', x: p.x, y: p.y, r: radius });
    for (const c of this.creatures) {
      if (c.def.role !== 'predator' || c.dead) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < radius + c.r * 0.5) this.stun(c, p.stats.stingStun);
    }
  }

  private stun(c: Creature, seconds: number): void {
    const p = this.player;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    c.stunned = seconds;
    c.state = 'rest';
    c.stateT = seconds + (c.def.hunter?.rest ?? 1);
    c.vx = (dx / d) * 260;
    c.vy = (dy / d) * 260;
    this.run.stings += 1;
  }

  // ---------------------------------------------------------------- creatures

  private updateCreatures(dt: number): void {
    const p = this.player;
    for (const c of this.creatures) {
      if (c.dead) continue;
      c.phase += dt;
      c.timer -= dt;
      if (c.stunned > 0) {
        c.stunned -= dt;
        c.vx *= Math.exp(-2.5 * dt);
        c.vy *= Math.exp(-2.5 * dt);
        c.heading += dt * 3;
      } else {
        this.think(c, dt, p);
      }

      if (c.def.behavior !== 'glide') {
        const f = this.flow;
        this.flowAt(c.x, c.y, f);
        const k = c.def.role === 'predator' ? 0.4 : 0.85;
        c.x += (c.vx + f.x * k) * dt;
        c.y += (c.vy + f.y * k) * dt;
        if (c.def.role !== 'ambient') this.collideCoral(c, c.r);
      } else {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
      }

      if (c.chain) {
        let px = c.x;
        let py = c.y;
        for (const s of c.chain) {
          const dx = s.x - px;
          const dy = s.y - py;
          const d = Math.hypot(dx, dy) || 1;
          const seg = 15;
          s.x = px + (dx / d) * seg;
          s.y = py + (dy / d) * seg + Math.sin(c.phase * 1.5 + px * 0.01) * 0.3;
          px = s.x;
          py = s.y;
        }
      }

      // Puffers swell toward their current size.
      const targetR = c.state === 'puffed' ? c.baseR * 1.8 : c.baseR;
      c.r = lerp(c.r, targetR, 1 - Math.exp(-8 * dt));

      const sp = Math.hypot(c.vx, c.vy);
      if (c.stunned <= 0 && sp > 8 && c.def.behavior !== 'lure') {
        c.heading = angleLerp(c.heading, Math.atan2(c.vy, c.vx), 1 - Math.exp(-5 * dt));
      }
    }
  }

  private steer(c: Creature, dirX: number, dirY: number, speed: number, rate: number, dt: number): void {
    const k = 1 - Math.exp(-rate * dt);
    c.vx += (dirX * speed - c.vx) * k;
    c.vy += (dirY * speed - c.vy) * k;
  }

  private wander(c: Creature, dt: number, speed: number, turn = 1.4): void {
    c.offX += (this.rand() - 0.5) * turn * 2 * dt;
    let h = c.offX;
    const range = ZONE_RANGE[c.def.id];
    const margin = 140;
    let bx = 0;
    let by = 0;
    if (c.x < margin) bx = 1;
    else if (c.x > this.width - margin) bx = -1;
    if (c.y < range.top + 60) by = 1;
    else if (c.y > range.bottom - 60) by = -1;
    if (bx || by) {
      h = angleLerp(h, Math.atan2(by, bx), 0.08);
      c.offX = h;
    }
    this.steer(c, Math.cos(h), Math.sin(h), speed, 2, dt);
  }

  private think(c: Creature, dt: number, p: Player): void {
    const def = c.def;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const playerCanEat = p.alive && canEat(p.r, c.r, def);
    const threatened = playerCanEat && dist < 110 + def.speed * 1.2 + p.r * 2;

    if (def.hunter) {
      if (playerCanEat || !isThreat(p.r, c.r, def)) {
        // Outgrown hunters keep their distance.
        if (threatened) this.steer(c, -nx, -ny, def.speed * 2.2, 2.5, dt);
        else this.wander(c, dt, def.speed);
        c.state = 'wander';
        return;
      }
      this.hunt(c, dt, p, dist, nx, ny);
      return;
    }

    switch (def.behavior) {
      case 'drift': {
        if (threatened && def.speed > 30) this.steer(c, -nx, -ny, def.speed * 1.3, 2, dt);
        else this.wander(c, dt, def.speed, 1);
        break;
      }
      case 'dart': {
        if (threatened && c.timer <= 0) {
          const a = Math.atan2(-ny, -nx) + (this.rand() - 0.5) * 1.2;
          c.vx = Math.cos(a) * def.speed * 3.6;
          c.vy = Math.sin(a) * def.speed * 3.6;
          c.timer = 0.9 + this.rand() * 0.5;
        } else if (c.timer < 0.5) {
          this.wander(c, dt, def.speed * 0.6);
        } else {
          c.vx *= Math.exp(-3 * dt);
          c.vy *= Math.exp(-3 * dt);
        }
        break;
      }
      case 'school': {
        const lead = c.leader && !c.leader.dead ? c.leader : null;
        if (threatened) {
          this.steer(c, -nx, -ny, def.speed * 1.5, 3, dt);
        } else if (lead) {
          const cos = Math.cos(lead.heading);
          const sin = Math.sin(lead.heading);
          const tx = lead.x + c.homeX * cos - c.homeY * sin;
          const ty = lead.y + c.homeX * sin + c.homeY * cos;
          const ddx = tx - c.x;
          const ddy = ty - c.y;
          const dd = Math.hypot(ddx, ddy) || 1;
          this.steer(c, ddx / dd, ddy / dd, def.speed * Math.min(1.6, 0.6 + dd / 60), 3, dt);
        } else {
          this.wander(c, dt, def.speed * 0.8, 1.2);
        }
        break;
      }
      case 'puff': {
        if (c.state === 'puffed') {
          c.vx *= Math.exp(-2 * dt);
          c.vy *= Math.exp(-2 * dt);
          c.stateT -= dt;
          if (c.stateT <= 0 && dist > 200) c.state = 'wander';
        } else if (canEat(p.r, c.baseR, def) && dist < 150 + p.r * 2 && p.alive && c.timer <= 0) {
          c.state = 'puffed';
          c.stateT = 2.6;
          c.timer = 5;
        } else {
          this.wander(c, dt, def.speed, 0.8);
        }
        break;
      }
      case 'jet': {
        if (c.timer <= 0) {
          let a = c.offX + (this.rand() - 0.5) * 1.2;
          if (threatened) a = Math.atan2(-ny, -nx) + (this.rand() - 0.5) * 0.8;
          c.offX = a;
          const range = ZONE_RANGE[def.id];
          if (c.y < range.top + 80) a = Math.PI / 2;
          if (c.y > range.bottom - 80) a = -Math.PI / 2;
          if (c.x < 160) a = 0;
          if (c.x > this.width - 160) a = Math.PI;
          c.vx = Math.cos(a) * def.speed * 3.2;
          c.vy = Math.sin(a) * def.speed * 3.2;
          c.timer = threatened ? 0.7 : 1.5 + this.rand();
        }
        c.vx *= Math.exp(-1.6 * dt);
        c.vy *= Math.exp(-1.6 * dt);
        break;
      }
      case 'hide': {
        const hx = c.homeX - c.x;
        const hy = c.homeY - c.y;
        const hd = Math.hypot(hx, hy);
        if (threatened && dist < 90) this.steer(c, -nx, -ny, def.speed * 2.5, 3, dt);
        else if (hd > 30) this.steer(c, hx / hd, hy / hd, def.speed, 1.5, dt);
        else this.steer(c, Math.cos(c.phase * 0.7), Math.sin(c.phase * 1.1), def.speed * 0.4, 1, dt);
        break;
      }
      case 'glide': {
        const h = c.offX;
        c.vx = Math.cos(h) * def.speed;
        c.vy = Math.sin(h) * def.speed + Math.sin(c.phase * 0.8) * 14;
        break;
      }
      case 'chain':
      default:
        this.wander(c, dt, def.speed, 0.6);
    }
  }

  private hunt(c: Creature, dt: number, p: Player, dist: number, nx: number, ny: number): void {
    const h = c.def.hunter!;
    const detect = h.detect * detectionScale(p.r) * p.stats.detectMult;
    c.stateT -= dt;
    switch (c.state) {
      case 'wander':
      case 'flee':
      case 'puffed': {
        if (c.def.behavior === 'lure') {
          // Anglers hover in place, letting the lure do the work.
          this.steer(c, Math.cos(c.phase * 0.4), Math.sin(c.phase * 0.3), c.def.speed * 0.5, 1, dt);
          c.heading = angleLerp(c.heading, Math.atan2(ny, nx), 1 - Math.exp(-1.2 * dt));
        } else this.wander(c, dt, c.def.speed);
        const visible = Math.abs(c.x - p.x) < this.viewHW - c.r * 0.3 && Math.abs(c.y - p.y) < this.viewHH - c.r * 0.3;
        if (p.alive && p.invuln <= 0 && dist < detect && visible && !this.demo) {
          c.state = 'notice';
          c.stateT = h.telegraph;
          this.events.push({ type: 'notice', def: c.def, x: c.x, y: c.y });
        }
        break;
      }
      case 'notice': {
        c.vx *= Math.exp(-4 * dt);
        c.vy *= Math.exp(-4 * dt);
        c.heading = angleLerp(c.heading, Math.atan2(ny, nx), 1 - Math.exp(-8 * dt));
        if (c.stateT <= 0) {
          // Lock the lunge line with a little lead on the jelly's motion.
          const tx = p.x + p.vx * 0.18 - c.x;
          const ty = p.y + p.vy * 0.18 - c.y;
          const tm = Math.hypot(tx, ty) || 1;
          c.lockX = tx / tm;
          c.lockY = ty / tm;
          c.state = 'chase';
          c.stateT = h.chaseTime;
        }
        break;
      }
      case 'chase': {
        if (c.def.behavior === 'stalk') {
          this.steer(c, nx, ny, h.chaseSpeed, 2.2, dt);
          if (dist > detect * 1.9) c.stateT = Math.min(c.stateT, 0);
        } else {
          c.vx = c.lockX * h.chaseSpeed;
          c.vy = c.lockY * h.chaseSpeed;
        }
        if (c.stateT <= 0) {
          c.state = 'rest';
          c.stateT = h.rest;
        }
        break;
      }
      case 'rest': {
        c.vx *= Math.exp(-2.2 * dt);
        c.vy *= Math.exp(-2.2 * dt);
        if (c.stateT <= 0) c.state = 'wander';
        break;
      }
    }
  }

  // ---------------------------------------------------------------- contacts

  private resolveContacts(dt: number): void {
    const p = this.player;
    const st = p.stats;
    const maw = p.burstT > 0 ? st.burstMaw : 1;
    for (const c of this.creatures) {
      if (c.dead) continue;
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > p.r + c.r + st.magnet + 40) continue;

      if (canEat(p.r, c.r, c.def)) {
        if (eatContact(dist, p.r, c.r, maw)) {
          this.eat(c);
          continue;
        }
        if (st.magnet > 0 && c.r < p.r * 0.55 && dist < st.magnet + p.r) {
          const pull = 110 * (1 - dist / (st.magnet + p.r));
          c.x -= (dx / (dist || 1)) * pull * dt;
          c.y -= (dy / (dist || 1)) * pull * dt;
        }
        continue;
      }

      if (isThreat(p.r, c.r, c.def)) {
        if (c.stunned > 0 || p.invuln > 0) continue;
        if (threatContact(dist, p.r, c.r)) {
          if (this.stingReady()) {
            p.stingCd = st.stingCooldown;
            p.invuln = 1.2;
            this.stun(c, st.stingStun);
            this.events.push({ type: 'sting', x: p.x, y: p.y, def: c.def });
          } else {
            this.catchPlayer(c);
            return;
          }
        }
        continue;
      }

      // Neither can eat the other: soft bump.
      if (c.def.role !== 'ambient') {
        const min = (p.r + c.r) * 0.8;
        if (dist < min && dist > 0.01) {
          const push = (min - dist) / dist;
          p.x -= dx * push * 0.5;
          p.y -= dy * push * 0.5;
          c.x += dx * push * 0.5;
          c.y += dy * push * 0.5;
        }
      }
    }
  }

  private eat(c: Creature): void {
    const p = this.player;
    c.dead = true;
    const sizeK = (c.r / c.def.radius) ** 2;
    p.mass = Math.min(MAX_MASS, p.mass + growthGain(c.def.growth * sizeK, p.mass));
    p.r = radiusForMass(p.mass);
    this.run.score += c.def.score;
    this.run.eaten += 1;
    this.run.eatenBySpecies[c.def.id] = (this.run.eatenBySpecies[c.def.id] ?? 0) + 1;
    if (c.def.role === 'predator') this.run.predatorsEaten += 1;
    this.markSeen(c.def);
    this.events.push({ type: 'eat', x: c.x, y: c.y, def: c.def, r: c.r });

    const stage = stageForMass(p.mass);
    while (p.stage < stage) {
      p.stage += 1;
      if (p.stage <= STAGES.length) {
        this.pendingEvolutions += 1;
        this.events.push({ type: 'stage', stage: p.stage });
      }
    }
  }

  private catchPlayer(c: Creature): void {
    const p = this.player;
    p.alive = false;
    p.deathT = 0;
    p.vx = (p.x - c.x) * 0.5;
    p.vy = (p.y - c.y) * 0.5;
    c.state = 'rest';
    c.stateT = 3;
    this.run.caughtBy = c.def.id;
    this.finalizeRun();
    this.events.push({ type: 'caught', def: c.def });
  }

  private finalizeRun(): void {
    const r = this.run;
    r.time = this.time;
    r.mass = this.player.mass;
    r.stage = this.player.stage;
    r.score += Math.floor(r.time * 5);
    r.seen = [...this.seen];
  }

  // ---------------------------------------------------------------- discovery

  private markSeen(def: SpeciesDef): void {
    if (this.seen.has(def.id)) return;
    this.seen.add(def.id);
    if (def.role !== 'player') {
      this.run.score += 25;
      this.events.push({ type: 'discover', def });
    }
  }

  private updateDiscovery(): void {
    const p = this.player;
    const vis = this.visibleRadius();
    for (const c of this.creatures) {
      if (c.dead || this.seen.has(c.def.id)) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) - c.r < vis) this.markSeen(c.def);
    }
  }

  hasSeen(id: string): boolean {
    return this.seen.has(id);
  }

  // ---------------------------------------------------------------- spawning

  private updateSpawning(dt: number): void {
    const p = this.player;
    // Despawn far-away and eaten creatures.
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      if (c.dead || Math.hypot(c.x - p.x, c.y - p.y) > this.viewRadius + DESPAWN_PAD) {
        this.creatures.splice(i, 1);
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 0.25;
      const zone = zoneAt(p.y);
      let prey = 0;
      let hunters = 0;
      for (const c of this.creatures) {
        if (c.def.role === 'prey') prey++;
        else if (c.def.role === 'predator' && !c.def.rare) hunters++;
      }
      const ramp = this.demo ? 0 : clamp((this.time - 14) / 30, 0, 1);
      const hunterTarget = Math.round(zone.predators * ramp + (zone.id === 'shallows' && this.time > 70 ? 1 : 0)) + (this.demo ? 0 : extraHunters(this.time));
      if (prey < zone.prey) this.spawnGroup('prey');
      else if (hunters < hunterTarget) this.spawnGroup('predator');
    }

    if (this.demo) return;
    this.rareTimer -= dt;
    if (this.rareTimer <= 0) {
      this.rareTimer = 5;
      this.rollRare();
    }
  }

  private spawnPoint(minD: number, maxD: number): { x: number; y: number } | null {
    const p = this.player;
    for (let tries = 0; tries < 8; tries++) {
      // Bias spawns toward the direction of travel so the way ahead feels alive.
      let a = this.rand() * TAU;
      if (this.rand() < 0.5 && Math.hypot(p.vx, p.vy) > 40) a = Math.atan2(p.vy, p.vx) + (this.rand() - 0.5) * 1.6;
      const d = lerp(minD, maxD, this.rand());
      const x = p.x + Math.cos(a) * d;
      const y = p.y + Math.sin(a) * d;
      if (x < 80 || x > this.width - 80 || y < 60 || y > this.height - 80) continue;
      if (this.insideCoral(x, y, 30)) continue;
      return { x, y };
    }
    return null;
  }

  /** Fills the neighbourhood (including the visible area) so a run starts alive. */
  populate(): void {
    const zone = zoneAt(this.player.y);
    for (let i = 0; i < 40 && this.creatures.length < zone.prey; i++) this.spawnGroup('prey', 140);
  }

  private spawnGroup(role: 'prey' | 'predator', minD = this.viewRadius + 30): void {
    const p = this.player;
    const pt = this.spawnPoint(minD, this.viewRadius + 260);
    if (!pt) return;
    const zoneId: ZoneId = zoneAt(pt.y).id;
    let total = 0;
    const weights: number[] = [];
    // The title scene is magnified, so it keeps to small, unobtrusive prey.
    const pool = SPECIES.filter((s) => s.role === role && s.weight > 0 && s.zones.includes(zoneId) && (!this.demo || s.radius <= 9));
    for (const s of pool) {
      let w = s.weight;
      if (role === 'prey') {
        const rel = s.radius / p.r;
        if (rel < 0.3) w *= 0.35;
        else if (rel > 2.2) w *= 0.3;
        else if (rel < 0.88) w *= 1.4;
      }
      weights.push(w);
      total += w;
    }
    if (total <= 0) return;
    let roll = this.rand() * total;
    let def = pool[0];
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        def = pool[i];
        break;
      }
    }
    const [lo, hi] = def.group ?? [1, 1];
    const n = lo + Math.floor(this.rand() * (hi - lo + 1));
    let leader: Creature | null = null;
    for (let i = 0; i < n; i++) {
      const c = this.spawn(def, pt.x + (this.rand() - 0.5) * 70, pt.y + (this.rand() - 0.5) * 70);
      if (def.behavior === 'school') {
        if (!leader) leader = c;
        else {
          c.leader = leader;
          c.homeX = -20 - this.rand() * 50;
          c.homeY = (this.rand() - 0.5) * 70;
        }
      }
    }
  }

  spawn(def: SpeciesDef, x: number, y: number): Creature {
    const grow = def.role === 'predator' && !this.demo ? hunterScale(this.time) : 1;
    const r = def.radius * (1 + (this.rand() * 2 - 1) * def.radiusVar) * grow;
    const heading = this.rand() * TAU;
    const c: Creature = {
      id: this.nextId++,
      def,
      x,
      y,
      vx: 0,
      vy: 0,
      r,
      baseR: r,
      heading,
      phase: this.rand() * 10,
      state: 'wander',
      stateT: 0,
      timer: this.rand(),
      stunned: 0,
      dead: false,
      leader: null,
      offX: heading,
      offY: 0,
      homeX: x,
      homeY: y,
      lockX: 0,
      lockY: 0,
      chain: null,
    };
    if (def.behavior === 'chain') {
      c.chain = [];
      for (let i = 0; i < 16; i++) c.chain.push({ x: x - i * 15, y });
    }
    this.creatures.push(c);
    return c;
  }

  /** Rare species eligible right now, given depth, time, evolution and conditions. */
  eligibleRares(): SpeciesDef[] {
    const p = this.player;
    const zone = zoneAt(p.y).id;
    return RARE_DEFS.filter((def) => {
      const rule = def.rare!;
      if (!def.zones.includes(zone)) return false;
      if (rule.minTime && this.time < rule.minTime) return false;
      if (rule.minStage && p.stage < rule.minStage) return false;
      if (rule.requiresPath && p.tiers[rule.requiresPath.path] < rule.requiresPath.tier) return false;
      if (rule.playerInCurrent && !p.inCurrent) return false;
      return !this.creatures.some((c) => c.def === def && !c.dead);
    });
  }

  private rollRare(): void {
    const p = this.player;
    const alive = this.creatures.filter((c) => c.def.rare && !c.dead).length;
    if (alive >= 1 + (p.tiers.glow > 0 ? 1 : 0)) return;
    const pool = this.eligibleRares();
    // Shuffle so earlier entries don't crowd out the rest.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (const def of pool) {
      if (this.rand() >= Math.min(0.95, def.rare!.chance * p.stats.rareChance)) continue;
      if (this.spawnRare(def)) {
        this.events.push({ type: 'rare', def });
        return;
      }
    }
  }

  private spawnRare(def: SpeciesDef): boolean {
    const p = this.player;
    const rule = def.rare!;
    if (rule.nearCoral) {
      const min = this.viewRadius * 0.55;
      const max = this.viewRadius + 380;
      const options: Coral[] = [];
      for (const cl of this.corals) {
        for (const c of cl.circles) {
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d > min && d < max && c.x > 60 && c.x < this.width - 60) options.push(c);
        }
      }
      if (!options.length) return false;
      const coral = options[Math.floor(this.rand() * options.length)];
      const a = Math.atan2(p.y - coral.y, p.x - coral.x) + (this.rand() - 0.5) * 1.4;
      const x = coral.x + Math.cos(a) * (coral.r + def.radius + 6);
      const y = coral.y + Math.sin(a) * (coral.r + def.radius + 6);
      if (this.insideCoral(x, y, def.radius * 0.5)) return false;
      this.spawn(def, x, y);
      return true;
    }
    if (rule.playerInCurrent) {
      const f = this.flow;
      this.flowAt(p.x, p.y, f);
      const fm = Math.hypot(f.x, f.y) || 1;
      const x = clamp(p.x - (f.x / fm) * (this.viewRadius + 160), 40, this.width - 40);
      const y = p.y - (f.y / fm) * (this.viewRadius + 160) + (this.rand() - 0.5) * 80;
      const c = this.spawn(def, x, y);
      c.offX = Math.atan2(f.y, f.x);
      c.heading = c.offX;
      return true;
    }
    const pt = this.spawnPoint(this.viewRadius * 0.7, this.viewRadius + 300);
    if (!pt) return false;
    this.spawn(def, pt.x, pt.y);
    return true;
  }

  /** Nearest living rare creature, for the Glow compass. */
  nearestRare(): Creature | null {
    const p = this.player;
    let best: Creature | null = null;
    let bd = Infinity;
    for (const c of this.creatures) {
      if (c.dead || !c.def.rare || c.def.role === 'predator') continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
}
