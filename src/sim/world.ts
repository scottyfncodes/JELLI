import { SPECIES, PLAYER_SPECIES } from '../content/species';
import type { PathId, PlayerStats, SpeciesDef, ZoneId } from '../content/types';
import { WORLD, ZONES, darknessAt, zoneAt, type ZoneDef } from '../content/world';
import { BASE_STATS, MAX_TIER, computeStats, dietPath, emptyDiet, emptyTiers, type Diet, type Tiers } from '../content/evolutions';
import { FORM_BY_SOURCE, type FormId } from '../content/forms';
import {
  MAX_MASS,
  START_MASS,
  STAGES,
  detectionScale,
  escalation,
  evolutionsEarned,
  extraHunters,
  hunterScale,
  growthGain,
  maxSpeedFor,
  radiusForMass,
  stageForMass,
} from '../content/progression';
import { TAU, angleLerp, clamp, lerp, mulberry32 } from '../core/math';
import { FRENZY_MAGNET, OVERCHARGE_RATE, POWERS, TITAN_SCALE, emptyPowers, type PowerId, type PowerTimers } from '../content/powerups';
import { emptyRunStats, type RunStats } from '../core/progress';
import {
  CHEST_SCORE,
  COMBO_WINDOW,
  REACH_ARC,
  THREAT_RATIO,
  busyArms,
  canEat,
  comboMult,
  escapeRate,
  isThreat,
  lureRadius,
  pearlScore,
  tentacleCount,
  tentaclePullSpeed,
  tentacleReach,
  tentacleReachSpeed,
  threatContact,
} from './rules';

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

/** A collectible pearl resting in the reef. */
export interface Pearl {
  x: number;
  y: number;
  taken: boolean;
  /** Animation offset so pearls don't shimmer in sync. */
  seed: number;
}

/** The sunken pirate ship: a landmark with a treasure chest beside it. */
export interface Wreck {
  x: number;
  y: number;
  /** Hull roll in radians. */
  tilt: number;
  chestX: number;
  chestY: number;
  chestOpen: boolean;
  /** The jelly has come close enough to see it this run. */
  found: boolean;
}

export type CreatureState = 'wander' | 'notice' | 'chase' | 'rest' | 'flee' | 'puffed' | 'orbit';

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
  /** A tentacle is reaching for this creature; no other arm may claim it. */
  claimed: boolean;
  /** Held by a tentacle: it no longer swims, the arm carries it. */
  held: boolean;
  /** Seconds before tentacles may target it again (after slipping free). */
  slip: number;
  /** 0..1 how far it has been swallowed. */
  consume: number;
}

/**
 * idle: trailing behind the bell. reach: tip homing on a target. grab: wrapped around it.
 * pull: reeling the catch to the mouth. eat: feeding it in. retract: returning empty.
 */
export type TentaclePhase = 'idle' | 'reach' | 'grab' | 'pull' | 'eat' | 'retract';

export interface Tentacle {
  /** 0..1 position across the bell rim, left to right. */
  slot: number;
  phase: TentaclePhase;
  target: Creature | null;
  /** Tip position in world space. */
  x: number;
  y: number;
  /** Seconds spent in the current phase. */
  t: number;
  cooldown: number;
  seed: number;
  /** Reach the arm was launched with, so a strike flung during a burst isn't cut short when it ends. */
  range: number;
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
  /** Seconds remaining on each power-up. */
  powers: PowerTimers;
  /** Total food eaten this run (untapered, uncapped); drives evolutions. */
  food: number;
  /** Food eaten toward each path since the last evolution; the biggest share decides the next one. */
  diet: Diet;
  /** Forms grown from remarkable meals (and the inherited one), in the order they grew. */
  forms: FormId[];
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
  | { type: 'notice'; def: SpeciesDef; x: number; y: number }
  | { type: 'power'; id: PowerId; x: number; y: number }
  | { type: 'shield'; x: number; y: number; def: SpeciesDef }
  | { type: 'grab'; x: number; y: number; def: SpeciesDef }
  | { type: 'escape'; x: number; y: number; def: SpeciesDef }
  | { type: 'pearl'; x: number; y: number; value: number }
  | { type: 'chest'; x: number; y: number }
  | { type: 'wreck' }
  | { type: 'evolve'; path: PathId; tier: number }
  | { type: 'form'; id: FormId; x: number; y: number }
  | { type: 'glimpse'; def: SpeciesDef };

export type RunEnd = 'caught' | null;

const DESPAWN_PAD = 380;
/** Ship-local hull colliders [x, y, r]: keel to deck, bow (-x) to the raised stern. Shared with the renderer. */
export const WRECK_HULL: [number, number, number][] = [
  [-250, 18, 34],
  [-190, 22, 46],
  [-120, 26, 52],
  [-50, 26, 54],
  [20, 26, 54],
  [90, 24, 54],
  [160, 18, 54],
  [215, -10, 50],
  [235, -60, 38],
  // The rock ledge the ship has settled on.
  [-340, 104, 46],
  [-255, 112, 52],
  [-160, 118, 56],
  [-60, 120, 58],
  [40, 120, 58],
  [140, 118, 56],
  [235, 112, 52],
  [320, 104, 46],
];
/** A reach that hasn't connected by then gives up. */
const REACH_TIME = 1.2;
/** How long the arm clings before reeling in. */
const GRAB_TIME = 0.12;
/** How long swallowing takes at the bell. */
export const EAT_TIME = 0.22;
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
  /** Forms the jelly hatches with (its inheritance). */
  forms?: FormId[];
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
  /** Hunting tentacles: the only way the jelly catches food. */
  readonly tentacles: Tentacle[] = [];
  readonly events: SimEvent[] = [];
  readonly pearls: Pearl[] = [];
  readonly wreck: Wreck = { x: 0, y: 0, tilt: 0, chestX: 0, chestY: 0, chestOpen: false, found: false };
  readonly player: Player;
  readonly run: RunStats = emptyRunStats();
  readonly demo: boolean;

  time = 0;
  ended: RunEnd = null;
  /** Evolution milestones already reached this run. */
  evolutionsReached = 0;
  zone: ZoneDef = ZONES[0];
  /** Catches in the current chain, and seconds left before it breaks. */
  combo = 0;
  comboT = 0;
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
    const forms = [...new Set(opts.forms ?? [])];
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
      stats: computeStats(tiers, BASE_STATS, forms),
      powers: emptyPowers(),
      food: 0,
      diet: emptyDiet(),
      forms,
    };
    this.run.forms = [...forms];
    this.player.charges = this.player.stats.burstCharges;
    this.syncTentacles();
    for (const t of this.tentacles) this.restPoint(t, this.player.r, t);
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
      return this.addCoral(circles, rng);
    };

    // Reef walls hugging both edges and the seabed.
    for (let y = 120; y < H; y += 150 + rng() * 120) {
      addCluster(-30 + rng() * 40, y, 3, 50, 120, 70);
      addCluster(W + 30 - rng() * 40, y + rng() * 80, 3, 50, 120, 70);
    }
    for (let x = 80; x < W; x += 170 + rng() * 120) {
      addCluster(x, H + 20, 3, 60, 130, 80);
    }

    this.placeWreck(rng);
    const nearWreck = (x: number, y: number, pad: number) => Math.hypot(x - this.wreck.x, y - this.wreck.y) < 360 + pad;

    // Large reef mounds: landmarks to navigate by and cover for hiding prey.
    const mounds: { x: number; y: number }[] = [];
    for (let y = 1400; y < H - 600; y += 1100 + rng() * 500) {
      for (let x = 700 + rng() * 600; x < W - 500; x += 1700 + rng() * 900) {
        if (Math.hypot(x - START_X, y - START_Y) < 900 || nearWreck(x, y, 260)) continue;
        addCluster(x, y, 7 + Math.floor(rng() * 5), 40, 120, 190);
        mounds.push({ x, y });
      }
    }

    // Open-water outcrops, some paired with a tight gap only small jellies fit through.
    // Rows hold more outcrops the wider the reef, so open water keeps the same density.
    const perRow = W / 2400;
    for (let y = 700; y < H - 200; y += 230 + rng() * 120) {
      const n = Math.round((1 + (rng() < 0.55 ? 1 : 0)) * perRow);
      for (let k = 0; k < n; k++) {
        const x = 260 + rng() * (W - 520);
        if (Math.hypot(x - START_X, y - START_Y) < 420 || nearWreck(x, y, 120)) continue;
        const r = 40 + rng() * 45;
        // Keep outcrops apart so every gap stays a real, readable passage.
        if (this.coralWithin(x, y, r + 150)) continue;
        const cl = addCluster(x, y, 3 + Math.floor(rng() * 4), 22, r, 70);
        if (rng() < 0.45) {
          const gap = 30 + rng() * 22;
          const r2 = 40 + rng() * 30;
          const side = rng() < 0.5 ? -1 : 1;
          if (this.coralWithin(x + side * (r + gap + r2), y, r2 + 40, cl)) continue;
          this.addCoral([{ x: x + side * (r + gap + r2), y: y + (rng() - 0.5) * 30, r: r2 }], rng);
        }
      }
    }

    this.placePearls(rng, mounds);

    const cur = (x: number, y: number, w: number, h: number, fx: number, fy: number) =>
      this.currents.push({ x, y, w, h, fx, fy });
    cur(W * 0.08, 2450, W * 0.84, 160, 95, 0);
    cur(W * 0.55, 1300, W * 0.38, 140, -80, 0);
    cur(W * 0.06, 5250, W * 0.88, 170, -115, 0);
    cur(W * 0.2, 4300, 180, 2800, 0, -95);
    cur(W * 0.78, 3600, 180, 2200, 0, 90);
    cur(W * 0.1, 6900, W * 0.5, 160, 105, 0);
    cur(W * 0.08, 9100, W * 0.84, 180, 125, 0);
    cur(W * 0.1, 10600, W * 0.8, 180, -110, 0);
  }

  /**
   * The pirate ship rests on a ledge in the lower shallows, still sunlit, a long swim from the start.
   * Its hull collides like reef (invisible circles in the coral grid) but is drawn as a ship.
   */
  private placeWreck(rng: () => number): void {
    const wr = this.wreck;
    wr.x = this.width * 0.3 + (rng() - 0.5) * 500;
    wr.y = 3000 + rng() * 300;
    wr.tilt = -0.1 - rng() * 0.08;
    const cos = Math.cos(wr.tilt);
    const sin = Math.sin(wr.tilt);
    const at = (lx: number, ly: number) => ({ x: wr.x + lx * cos - ly * sin, y: wr.y + lx * sin + ly * cos });
    for (const [lx, ly, r] of WRECK_HULL) {
      const c = at(lx, ly);
      this.indexCoral({ x: c.x, y: c.y, r });
    }
    // The chest has spilled out onto the sand just past the bow.
    const chest = at(-330, 58);
    wr.chestX = chest.x;
    wr.chestY = chest.y;
  }

  /** Pearls: a trail spilling from the wreck, small hoards around reef mounds, and strays in open water. */
  private placePearls(rng: () => number, mounds: { x: number; y: number }[]): void {
    const add = (x: number, y: number) => {
      if (x < 60 || x > this.width - 60 || y < 80 || y > this.height - 80) return;
      if (this.coralWithin(x, y, 14)) return;
      this.pearls.push({ x, y, taken: false, seed: rng() * TAU });
    };
    const wr = this.wreck;
    for (let i = 0; i < 9; i++) add(wr.chestX - 30 - i * 34 + (rng() - 0.5) * 20, wr.chestY - 10 - i * 16 + (rng() - 0.5) * 20);
    for (let i = 0; i < 7; i++) add(wr.x - 200 + i * 66, wr.y - 150 - Math.sin((i / 6) * Math.PI) * 60);
    for (const m of mounds) {
      // Deeper reef hides bigger hoards.
      const zone = zoneAt(m.y).id;
      const n = 3 + Math.floor(rng() * 3) + (zone === 'abyss' ? 4 : zone === 'twilight' ? 2 : 0);
      const a0 = rng() * TAU;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * TAU * 0.6;
        add(m.x + Math.cos(a) * 260, m.y + Math.sin(a) * 210);
      }
    }
    for (let i = 0; i < 70; i++) add(200 + rng() * (this.width - 400), 600 + rng() * (this.height - 900));
  }

  private indexCoral(c: Coral): void {
    for (let gx = Math.floor((c.x - c.r) / 200); gx <= Math.floor((c.x + c.r) / 200); gx++) {
      for (let gy = Math.floor((c.y - c.r) / 200); gy <= Math.floor((c.y + c.r) / 200); gy++) {
        const key = gx * 1000 + gy;
        let cell = this.coralGrid.get(key);
        if (!cell) this.coralGrid.set(key, (cell = []));
        cell.push(c);
      }
    }
  }

  private addCoral(circles: Coral[], rng: () => number): CoralCluster {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of circles) {
      minX = Math.min(minX, c.x - c.r);
      minY = Math.min(minY, c.y - c.r);
      maxX = Math.max(maxX, c.x + c.r);
      maxY = Math.max(maxY, c.y + c.r);
      this.indexCoral(c);
    }
    const cluster = { circles, minX, minY, maxX, maxY, hue: rng(), seed: Math.floor(rng() * 1e6) };
    this.corals.push(cluster);
    return cluster;
  }

  /** True when any coral (outside `skip`) comes within `pad` of a point, across grid cells. */
  private coralWithin(x: number, y: number, pad: number, skip?: CoralCluster): boolean {
    const span = Math.ceil(pad / 200);
    const gx = Math.floor(x / 200);
    const gy = Math.floor(y / 200);
    for (let i = gx - span; i <= gx + span; i++) {
      for (let j = gy - span; j <= gy + span; j++) {
        const cell = this.coralGrid.get(i * 1000 + j);
        if (!cell) continue;
        for (const c of cell) {
          if (skip && skip.circles.includes(c)) continue;
          if (Math.hypot(x - c.x, y - c.y) < c.r + pad) return true;
        }
      }
    }
    return false;
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
      if (d2 < min * min) {
        // Dead centre has no direction to push along: pop out upward.
        const d = Math.sqrt(d2);
        const nx = d > 0.01 ? dx / d : 0;
        const ny = d > 0.01 ? dy / d : -1;
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

  /** Grows one tier along a path. Returns false when the path is already maxed. */
  evolve(path: PathId): boolean {
    const p = this.player;
    if (p.tiers[path] >= MAX_TIER) return false;
    p.tiers[path] += 1;
    this.refreshStats();
    if (path === 'sting') p.stingCd = 0;
    this.run.evolutions += 1;
    this.events.push({ type: 'evolve', path, tier: p.tiers[path] });
    return true;
  }

  /** Takes on the form of something remarkable it just ate. */
  grantForm(id: FormId): boolean {
    const p = this.player;
    if (p.forms.includes(id)) return false;
    p.forms.push(id);
    this.run.forms.push(id);
    this.refreshStats();
    this.events.push({ type: 'form', id, x: p.x, y: p.y });
    return true;
  }

  /** Recomputes stats after an evolution or a new form, handing over any new burst charge at once. */
  private refreshStats(): void {
    const p = this.player;
    const before = p.stats.burstCharges;
    p.stats = computeStats(p.tiers, BASE_STATS, p.forms);
    p.charges = Math.min(p.stats.burstCharges, p.charges + (p.stats.burstCharges - before));
  }

  /** The path the jelly's recent diet is steering it toward, or null with nothing on the scales yet. */
  dietLead(): PathId | null {
    const d = this.player.diet;
    if (d.glow + d.surge + d.sting <= 0) return null;
    return dietPath(d, this.player.tiers);
  }

  /** Seconds a catch chain survives between catches. */
  comboWindow(): number {
    return COMBO_WINDOW + this.player.stats.comboBonus;
  }

  /** Path tiers still available to evolve into. */
  tiersLeft(): number {
    const t = this.player.tiers;
    return 3 * MAX_TIER - t.glow - t.surge - t.sting;
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
      this.updateTentacles(dt);
      if (p.deathT > 1.5) this.ended = 'caught';
      return;
    }

    this.updatePlayer(dt, input);
    this.updateCreatures(dt);
    this.updateTentacles(dt);
    this.resolveContacts(dt);
    this.updateSpawning(dt);
    this.updateDiscovery();
    this.lastDt = dt;
    this.updateTreasure();
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

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
  private lastDt = 0;

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
      p.recharge += dt * (p.powers.overcharge > 0 ? OVERCHARGE_RATE : 1);
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
    for (const k in p.powers) {
      const id = k as PowerId;
      p.powers[id] = Math.max(0, p.powers[id] - dt);
    }
  }

  /** Size the jelly counts as for eating and threats (Titan makes it bigger). */
  playerReach(): number {
    const p = this.player;
    return p.powers.titan > 0 ? p.r * TITAN_SCALE : p.r;
  }

  grantPower(id: PowerId): void {
    const p = this.player;
    p.powers[id] = POWERS[id].duration;
    this.run.powerups += 1;
    if (id === 'overcharge') {
      p.charges = p.stats.burstCharges;
      p.recharge = 0;
    }
    if (id === 'veil') {
      // Hunters lose track instantly.
      for (const c of this.creatures) {
        if (c.def.hunter && (c.state === 'notice' || c.state === 'orbit' || c.state === 'chase')) {
          c.state = 'rest';
          c.stateT = 0.8;
        }
      }
    }
    this.events.push({ type: 'power', id, x: p.x, y: p.y });
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

  private stun(c: Creature, seconds: number, countsAsSting = true): void {
    const p = this.player;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    c.stunned = seconds;
    c.state = 'rest';
    c.stateT = seconds + (c.def.hunter?.rest ?? 1);
    c.vx = (dx / d) * 260;
    c.vy = (dy / d) * 260;
    if (countsAsSting) this.run.stings += 1;
  }

  // ---------------------------------------------------------------- creatures

  private updateCreatures(dt: number): void {
    const p = this.player;
    for (const c of this.creatures) {
      if (c.dead) continue;
      c.phase += dt;
      c.timer -= dt;
      c.slip = Math.max(0, c.slip - dt);
      // A caught creature goes where the tentacle takes it, wriggling.
      if (c.held) {
        c.vx = 0;
        c.vy = 0;
        c.heading = Math.atan2(p.y - c.y, p.x - c.x) + Math.PI + Math.sin(c.phase * 18) * 0.5;
        continue;
      }
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
      if (c.stunned <= 0 && sp > 8 && c.def.behavior !== 'lure' && c.def.behavior !== 'loom') {
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
    const reach = this.playerReach();
    const playerCanEat = p.alive && canEat(reach, c.r, def);
    const threatened = playerCanEat && dist < 110 + def.speed * 1.2 + reach * 2;

    if (def.hunter) {
      if (playerCanEat || !isThreat(reach, c.r, def)) {
        // Outgrown hunters keep their distance.
        if (threatened) this.steer(c, -nx, -ny, def.speed * 2.2, 2.5, dt);
        else this.wander(c, dt, def.speed);
        c.state = 'wander';
        return;
      }
      this.hunt(c, dt, p, dist, nx, ny);
      return;
    }

    // Glow: small prey is drawn to the jelly's light instead of fleeing it.
    if (playerCanEat && c.r < reach * 0.55 && dist < lureRadius(p.stats.magnet, reach)) {
      this.steer(c, nx, ny, def.speed * 0.7, 1.5, dt);
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
        if (threatened) this.steer(c, -nx, -ny, def.speed * 1.5, 3, dt);
        else if (!this.followLeader(c, dt)) this.wander(c, dt, def.speed * 0.8, 1.2);
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
      case 'loom': {
        // The Phantom drifts bell-up along the bottom of the Abyss, turning back before the walls.
        if (c.x < 400) c.offX = 0;
        else if (c.x > this.width - 400) c.offX = Math.PI;
        const range = ZONE_RANGE[def.id];
        const lift = c.y > range.bottom - 700 ? -10 : c.y < range.top + 2000 ? 10 : 0;
        this.steer(c, Math.cos(c.offX), 0, def.speed, 0.4, dt);
        c.vy = lift + Math.sin(c.phase * 0.35) * 7;
        c.heading = -Math.PI / 2;
        break;
      }
      case 'chain':
      default:
        this.wander(c, dt, def.speed, 0.6);
    }
  }

  /** Formation swimming behind a group leader. Returns false when there is no leader. */
  private followLeader(c: Creature, dt: number): boolean {
    const lead = c.leader && !c.leader.dead && !c.leader.held ? c.leader : null;
    if (!lead) return false;
    const cos = Math.cos(lead.heading);
    const sin = Math.sin(lead.heading);
    const tx = lead.x + c.homeX * cos - c.homeY * sin;
    const ty = lead.y + c.homeX * sin + c.homeY * cos;
    const ddx = tx - c.x;
    const ddy = ty - c.y;
    const dd = Math.hypot(ddx, ddy) || 1;
    this.steer(c, ddx / dd, ddy / dd, c.def.speed * Math.min(1.6, 0.6 + dd / 60), 3, dt);
    return true;
  }

  private goHome(c: Creature, dt: number, speed: number): void {
    const hx = c.homeX - c.x;
    const hy = c.homeY - c.y;
    const hd = Math.hypot(hx, hy);
    if (hd > 6) this.steer(c, hx / hd, hy / hd, Math.min(speed, hd * 3), 3, dt);
    else {
      c.vx *= Math.exp(-4 * dt);
      c.vy *= Math.exp(-4 * dt);
    }
  }

  private hunt(c: Creature, dt: number, p: Player, dist: number, nx: number, ny: number): void {
    const h = c.def.hunter!;
    const b = c.def.behavior;
    const detect = h.detect * detectionScale(p.r) * p.stats.detectMult;
    const veiled = p.powers.veil > 0;
    c.stateT -= dt;
    if (veiled && (c.state === 'notice' || c.state === 'orbit' || (c.state === 'chase' && (b === 'stalk' || b === 'pack')))) {
      c.state = 'rest';
      c.stateT = 0.8;
    }
    switch (c.state) {
      case 'wander':
      case 'flee':
      case 'puffed': {
        if (b === 'lure') {
          // Anglers hover in place, letting the lure do the work.
          this.steer(c, Math.cos(c.phase * 0.4), Math.sin(c.phase * 0.3), c.def.speed * 0.5, 1, dt);
          c.heading = angleLerp(c.heading, Math.atan2(ny, nx), 1 - Math.exp(-1.2 * dt));
        } else if (b === 'ambush') {
          // Morays wait at their coral hole, head turning to follow passers-by.
          this.goHome(c, dt, c.def.speed);
          const out = c.offY;
          const look = dist < detect * 1.6 ? Math.atan2(ny, nx) : out + Math.sin(c.phase * 0.6) * 0.4;
          c.heading = angleLerp(c.heading, look, 1 - Math.exp(-2 * dt));
        } else if (b === 'pack') {
          if (!this.followLeader(c, dt)) this.wander(c, dt, c.def.speed);
        } else this.wander(c, dt, c.def.speed);
        const visible = Math.abs(c.x - p.x) < this.viewHW - c.r * 0.3 && Math.abs(c.y - p.y) < this.viewHH - c.r * 0.3;
        if (p.alive && p.invuln <= 0 && !veiled && dist < detect && visible && !this.demo) {
          this.events.push({ type: 'notice', def: c.def, x: c.x, y: c.y });
          if (b === 'circle') {
            c.state = 'orbit';
            c.stateT = 2.2 + this.rand() * 0.8;
            c.lockX = this.rand() < 0.5 ? -1 : 1;
          } else {
            c.state = 'notice';
            c.stateT = h.telegraph;
          }
        }
        break;
      }
      case 'orbit': {
        // Lanternsharks circle at a distance before committing to a dash.
        const dir = c.lockX;
        const a = Math.atan2(c.y - p.y, c.x - p.x) + dir * 0.9;
        const ring = 170 + p.r * 2;
        const tx = p.x + Math.cos(a) * ring - c.x;
        const ty = p.y + Math.sin(a) * ring - c.y;
        const tm = Math.hypot(tx, ty) || 1;
        this.steer(c, tx / tm, ty / tm, 190, 2.5, dt);
        if (dist > detect * 2) {
          c.state = 'wander';
        } else if (c.stateT <= 0) {
          c.state = 'notice';
          c.stateT = h.telegraph;
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
        if (b === 'stalk' || b === 'pack') {
          this.steer(c, nx, ny, h.chaseSpeed, b === 'pack' ? 3 : 2.2, dt);
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
        if (b === 'ambush' && c.stunned <= 0) this.goHome(c, dt, 140);
        else {
          c.vx *= Math.exp(-2.2 * dt);
          c.vy *= Math.exp(-2.2 * dt);
        }
        if (c.stateT <= 0) c.state = 'wander';
        break;
      }
    }
  }

  // ---------------------------------------------------------------- tentacles

  /** Current hunting reach (Comet's wide maw flings the arms further while bursting). */
  tentacleReach(): number {
    const p = this.player;
    const maw = p.burstT > 0 ? p.stats.burstMaw : 1;
    return tentacleReach(this.playerReach(), this.run.eaten) * maw;
  }

  /** Where a tentacle joins the bell rim, for a bell of radius r. */
  tentacleRoot(t: Tentacle, r: number, out: { x: number; y: number }): { x: number; y: number } {
    return this.bellPoint((t.slot - 0.5) * r * 1.3, r * 0.2, out);
  }

  /** The mouth under the bell, where caught food is fed in. */
  mouth(out: { x: number; y: number }): { x: number; y: number } {
    return this.bellPoint(0, this.playerReach() * 0.2, out);
  }

  /** Jelly-local point (bell facing -y) to world space. */
  private bellPoint(lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
    const p = this.player;
    const a = p.heading + Math.PI / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    out.x = p.x + lx * cos - ly * sin;
    out.y = p.y + lx * sin + ly * cos;
    return out;
  }

  /** Where an idle arm hangs: trailing behind the bell, swaying on its own rhythm. */
  private restPoint(t: Tentacle, r: number, out: { x: number; y: number }): { x: number; y: number } {
    this.tentacleRoot(t, r, out);
    const h = this.player.heading;
    // A relaxed arm streams out at most of its length, so longer arms read as longer reach.
    const len = tentacleReach(r, this.run.eaten) * 0.85;
    const sway = (Math.sin(this.time * 1.3 + t.seed) + 0.5 * Math.sin(this.time * 2.1 + t.seed * 1.7)) * r * 0.8;
    const side = (t.slot - 0.5) * r * 1.2;
    out.x += -Math.cos(h) * len - Math.sin(h) * (sway + side);
    out.y += -Math.sin(h) * len + Math.cos(h) * (sway + side);
    return out;
  }

  /** Grows the set of arms to match the jelly's stage and spreads them across the rim. */
  private syncTentacles(): void {
    const want = Math.max(tentacleCount(this.player.stage), busyArms(this.player.stage) + this.player.stats.extraArms + 1);
    while (this.tentacles.length < want) {
      const p = this.player;
      this.tentacles.push({ slot: 0.5, phase: 'idle', target: null, x: p.x, y: p.y, t: 0, cooldown: 0, seed: this.tentacles.length * 2.39, range: 0 });
    }
    const n = this.tentacles.length;
    this.tentacles.forEach((t, i) => (t.slot = (i + 0.5) / n));
  }

  /** True when coral stands between two points. */
  private blocked(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / 18));
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      if (this.insideCoral(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 0)) return true;
    }
    return false;
  }

  /** Coral stops an arm reaching for this creature (unless the jelly wears the Moray Mottle). */
  private armBlocked(c: Creature): boolean {
    const p = this.player;
    return p.stats.coralReach <= 0 && this.blocked(p.x, p.y, c.x, c.y);
  }

  /** Whether a creature is a valid, live tentacle target right now. */
  private huntable(c: Creature): boolean {
    return !c.dead && c.def.role !== 'ambient' && canEat(this.playerReach(), c.r, c.def) && this.creatures.includes(c);
  }

  /** Drops whatever the arm holds or reaches for and sends it home. */
  private letGo(t: Tentacle, escaped: boolean): void {
    const c = t.target;
    if (c) {
      c.claimed = false;
      if (c.held) {
        c.held = false;
        c.consume = 0;
        c.slip = 1.2;
        if (escaped) {
          const p = this.player;
          const dx = c.x - p.x;
          const dy = c.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          c.vx = (dx / d) * (c.def.speed * 2 + 120);
          c.vy = (dy / d) * (c.def.speed * 2 + 120);
          this.events.push({ type: 'escape', x: c.x, y: c.y, def: c.def });
        }
      } else if (escaped) c.slip = 0.6;
    }
    t.target = null;
    if (t.phase !== 'idle') {
      t.phase = 'retract';
      t.t = 0;
    }
  }

  private tmp = { x: 0, y: 0 };
  private tmp2 = { x: 0, y: 0 };

  /** Moves a point toward a goal at a capped speed. Returns the remaining distance. */
  private static approach(t: { x: number; y: number }, gx: number, gy: number, speed: number, dt: number): number {
    const dx = gx - t.x;
    const dy = gy - t.y;
    const d = Math.hypot(dx, dy);
    const step = speed * dt;
    if (d <= step || d < 1e-6) {
      t.x = gx;
      t.y = gy;
      return 0;
    }
    t.x += (dx / d) * step;
    t.y += (dy / d) * step;
    return d - step;
  }

  /**
   * The hunting cycle. Each arm detects edible prey in reach, reaches for it,
   * grabs it, reels it to the mouth and feeds it in, then hangs idle again.
   */
  private updateTentacles(dt: number): void {
    const p = this.player;
    const R = this.playerReach();
    const reach = this.tentacleReach();
    const speed = tentacleReachSpeed(R) * (p.burstT > 0 ? 1.3 : 1);
    this.syncTentacles();
    const rest = this.tmp;
    const mouth = this.mouth(this.tmp2);
    let picking = false;

    for (const t of this.tentacles) {
      t.t += dt;
      t.cooldown = Math.max(0, t.cooldown - dt);
      const c = t.target;
      switch (t.phase) {
        case 'idle': {
          this.restPoint(t, R, rest);
          // Ease toward the rest pose with plenty of drag, so the arm streams and lags behind turns.
          const k = 1 - Math.exp(-4 * dt);
          t.x += (rest.x - t.x) * k;
          t.y += (rest.y - t.y) * k;
          // Never let a trailing arm stretch into a hunting-length line.
          this.tentacleRoot(t, R, rest);
          const dx = t.x - rest.x;
          const dy = t.y - rest.y;
          const d = Math.hypot(dx, dy);
          const max = tentacleReach(R, this.run.eaten) * 1.4;
          if (d > max) {
            t.x = rest.x + (dx / d) * max;
            t.y = rest.y + (dy / d) * max;
          }
          if (t.cooldown <= 0 && p.alive) picking = true;
          break;
        }
        case 'reach': {
          if (!c || !p.alive || !this.huntable(c) || c.held) {
            this.letGo(t, false);
            break;
          }
          const away = Math.hypot(c.x - p.x, c.y - p.y) - c.r * 0.5;
          if (away > Math.max(reach, t.range) * 1.2 || t.t > REACH_TIME || this.armBlocked(c)) {
            // Out of range, too slow, or it ducked behind coral: it got away.
            this.letGo(t, true);
            t.cooldown = 0.8;
            break;
          }
          const left = World.approach(t, c.x, c.y, speed, dt);
          if (left <= c.r * 0.9 + 2) {
            t.phase = 'grab';
            t.t = 0;
            c.held = true;
            c.x = t.x;
            c.y = t.y;
            this.events.push({ type: 'grab', x: c.x, y: c.y, def: c.def });
          }
          break;
        }
        case 'grab':
        case 'pull': {
          if (!c || !p.alive || c.dead || !this.creatures.includes(c)) {
            this.letGo(t, false);
            break;
          }
          if (t.phase === 'grab') {
            if (t.t >= GRAB_TIME) {
              t.phase = 'pull';
              t.t = 0;
            }
          } else {
            // Prey close to the jelly's size can wriggle free; anything it outgrew mid-catch slips out.
            const fight = escapeRate(R, c.r, c.def.role === 'predator');
            if (!canEat(R, c.r, c.def) || (fight > 0 && this.rand() < fight * dt)) {
              this.letGo(t, true);
              t.cooldown = 0.5;
              break;
            }
            const left = World.approach(t, mouth.x, mouth.y, tentaclePullSpeed(R, c.r), dt);
            if (left <= R * 0.35) {
              t.phase = 'eat';
              t.t = 0;
            }
          }
          c.x = t.x;
          c.y = t.y;
          break;
        }
        case 'eat': {
          if (!c || c.dead || !this.creatures.includes(c)) {
            this.letGo(t, false);
            break;
          }
          const k = Math.min(1, t.t / EAT_TIME);
          const f = 1 - Math.exp(-14 * dt);
          t.x += (mouth.x - t.x) * f;
          t.y += (mouth.y - t.y) * f;
          c.x = t.x;
          c.y = t.y;
          c.consume = k;
          if (k >= 1) {
            if (p.alive) this.eat(c);
            else c.dead = true;
            c.held = false;
            c.claimed = false;
            t.target = null;
            t.phase = 'idle';
            t.t = 0;
            t.cooldown = 1.1;
          }
          break;
        }
        case 'retract': {
          this.restPoint(t, R, rest);
          if (World.approach(t, rest.x, rest.y, speed * 0.8, dt) < R * 0.6) {
            t.phase = 'idle';
            t.t = 0;
          }
          break;
        }
      }
    }

    if (picking) this.pickTargets(reach);
  }

  /** Detect: hand each ready arm the nearest free prey on its side with a clear line to it. */
  private pickTargets(reach: number): void {
    const p = this.player;
    const cands: Creature[] = [];
    for (const c of this.creatures) {
      if (c.claimed || c.held || c.slip > 0 || !this.huntable(c)) continue;
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d - c.r * 0.5 > reach) continue;
      // Arms strike forward, toward where the jelly is heading; only food brushing the bell is taken from behind.
      const ahead = (dx * Math.cos(p.heading) + dy * Math.sin(p.heading)) / d;
      if (ahead < REACH_ARC && d > this.playerReach() * 1.6 + c.r) continue;
      if (this.armBlocked(c)) continue;
      cands.push(c);
    }
    if (!cands.length) return;
    let free = busyArms(p.stage) + p.stats.extraArms - this.tentacles.filter((t) => t.phase !== 'idle' && t.phase !== 'retract').length;
    const root = this.tmp;
    for (const t of this.tentacles) {
      if (free <= 0) return;
      if (t.phase !== 'idle' || t.cooldown > 0) continue;
      this.tentacleRoot(t, this.playerReach(), root);
      let best: Creature | null = null;
      let bd = Infinity;
      for (const c of cands) {
        if (c.claimed) continue;
        const d = Math.hypot(c.x - root.x, c.y - root.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best) return;
      best.claimed = true;
      free -= 1;
      t.target = best;
      t.phase = 'reach';
      t.t = 0;
      t.range = reach;
    }
  }

  // ---------------------------------------------------------------- contacts

  private resolveContacts(dt: number): void {
    const p = this.player;
    const st = p.stats;
    const R = this.playerReach();
    const magnet = Math.max(st.magnet, p.powers.frenzy > 0 ? FRENZY_MAGNET : 0);
    for (const c of this.creatures) {
      if (c.dead || c.held) continue;
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > R + c.r + magnet + 40) continue;

      // Food is never eaten by touch: the tentacles catch it (see updateTentacles).
      if (canEat(R, c.r, c.def)) {
        if (magnet > 0 && c.r < R * 0.55 && dist < magnet + R) {
          const pull = (p.powers.frenzy > 0 ? 180 : 110) * (1 - dist / (magnet + R));
          c.x -= (dx / (dist || 1)) * pull * dt;
          c.y -= (dy / (dist || 1)) * pull * dt;
        }
        continue;
      }

      if (isThreat(R, c.r, c.def)) {
        if (c.stunned > 0 || p.invuln > 0) continue;
        if (threatContact(dist, R, c.r)) {
          if (p.powers.shield > 0) {
            p.powers.shield = 0;
            p.invuln = 1.2;
            this.stun(c, 1.4, false);
            this.events.push({ type: 'shield', x: p.x, y: p.y, def: c.def });
          } else if (this.stingReady()) {
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
        const min = (R + c.r) * 0.8;
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
    const fed = c.def.growth * p.stats.foodMult;
    p.mass = Math.min(MAX_MASS, p.mass + growthGain(fed * sizeK, p.mass));
    p.food += fed;
    // You are what you eat: each meal tips the scales toward the path its creature belongs to.
    if (c.def.diet) p.diet[c.def.diet] += fed;
    p.r = radiusForMass(p.mass);
    // Catches in quick succession build a chain that multiplies their score.
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = this.comboWindow();
    this.run.bestCombo = Math.max(this.run.bestCombo, this.combo);
    this.run.score += Math.round(c.def.score * (p.powers.frenzy > 0 ? 2 : 1) * comboMult(this.combo));
    this.run.eaten += 1;
    this.run.eatenBySpecies[c.def.id] = (this.run.eatenBySpecies[c.def.id] ?? 0) + 1;
    if (c.def.role === 'predator') this.run.predatorsEaten += 1;
    this.markSeen(c.def);
    this.events.push({ type: 'eat', x: c.x, y: c.y, def: c.def, r: c.r });
    if (c.def.power) this.grantPower(c.def.power);
    // Hunters and rare creatures leave part of themselves on the jelly that eats them.
    const form = FORM_BY_SOURCE[c.def.id];
    if (form && !this.demo) this.grantForm(form);

    const stage = stageForMass(p.mass);
    while (p.stage < stage) {
      p.stage += 1;
      if (p.stage <= STAGES.length) this.events.push({ type: 'stage', stage: p.stage });
    }
    // Feeding earns evolutions until every path is maxed. No menu: the diet decides.
    const earned = this.demo ? 0 : evolutionsEarned(p.food);
    while (this.evolutionsReached < earned) {
      this.evolutionsReached += 1;
      const path = dietPath(p.diet, p.tiers);
      if (!path) continue;
      this.evolve(path);
      p.diet = emptyDiet();
    }
  }

  private catchPlayer(c: Creature): void {
    const p = this.player;
    for (const t of this.tentacles) this.letGo(t, false);
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

  // ---------------------------------------------------------------- treasure

  /** Pearls are picked up by swimming through them (they are treasure, not food). */
  private updateTreasure(): void {
    const p = this.player;
    if (!p.alive) return;
    const reach = p.r + 12;
    const pull = p.stats.pearlMagnet;
    for (const pr of this.pearls) {
      if (pull > 0 && !pr.taken && Math.abs(pr.x - p.x) < pull && Math.abs(pr.y - p.y) < pull) {
        // The Gilded Spiral draws pearls in, faster the closer they are.
        const dx = p.x - pr.x;
        const dy = p.y - pr.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < pull) {
          const step = Math.min(d, (60 + 260 * (1 - d / pull)) * this.lastDt);
          pr.x += (dx / d) * step;
          pr.y += (dy / d) * step;
        }
      }
      if (pr.taken || Math.abs(pr.x - p.x) > reach || Math.abs(pr.y - p.y) > reach) continue;
      if (Math.hypot(pr.x - p.x, pr.y - p.y) > reach) continue;
      pr.taken = true;
      this.run.pearls += 1;
      const value = pearlScore(zoneAt(pr.y).id);
      this.run.score += value;
      // A pearl keeps a running chain alive.
      if (this.combo > 0) this.comboT = this.comboWindow();
      this.events.push({ type: 'pearl', x: pr.x, y: pr.y, value });
    }
    const wr = this.wreck;
    if (!wr.found && Math.hypot(wr.x - p.x, wr.y - p.y) < 520) {
      wr.found = true;
      this.events.push({ type: 'wreck' });
    }
    if (!wr.chestOpen && Math.hypot(wr.chestX - p.x, wr.chestY - p.y) < p.r + 24) {
      wr.chestOpen = true;
      this.run.chest = 1;
      this.run.score += CHEST_SCORE;
      this.events.push({ type: 'chest', x: wr.chestX, y: wr.chestY });
      // The lid bursts open and spills a few more pearls to scoop up.
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i - 3.5) * 0.32;
        const d = 50 + (i % 3) * 22;
        const x = wr.chestX + Math.cos(a) * d;
        const y = wr.chestY + Math.sin(a) * d;
        if (!this.insideCoral(x, y, 8)) this.pearls.push({ x, y, taken: false, seed: i });
      }
    }
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
      const reveal = c.def.revealLight;
      if (!reveal) {
        if (Math.hypot(c.x - p.x, c.y - p.y) - c.r < vis) this.markSeen(c.def);
        continue;
      }
      // Something this vast only shows itself to a light strong enough to take it in.
      // A dimmer jelly drifting past its rim lights just glimpses it.
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (p.stats.lightRadius >= reveal && d - c.r * 0.6 < p.stats.lightRadius) this.markSeen(c.def);
      else if (d - c.r < vis + 120 && !this.run.glimpsed.includes(c.def.id)) {
        this.run.glimpsed.push(c.def.id);
        this.events.push({ type: 'glimpse', def: c.def });
      }
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
      const pad = DESPAWN_PAD + (c.def.role === 'ambient' ? c.r : 0);
      if (c.dead || (!c.held && !c.claimed && Math.hypot(c.x - p.x, c.y - p.y) > this.viewRadius + pad)) {
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
        else if (c.def.role === 'predator' && !c.def.rare) hunters += c.def.group ? 2 / (c.def.group[0] + c.def.group[1]) : 1;
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
      // Power-up fish keep turning up whatever your size.
      if (role === 'prey' && !s.power) {
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
    if (def.spawnNearCoral) {
      const spot = this.coralSpot(def.radius, this.viewRadius + 20, this.viewRadius + 320, false);
      if (!spot) return;
      const c = this.spawn(def, spot.x, spot.y);
      c.offY = spot.a;
      c.heading = spot.a;
      return;
    }
    const [lo, hi] = def.group ?? [1, 1];
    const n = lo + Math.floor(this.rand() * (hi - lo + 1));
    let leader: Creature | null = null;
    for (let i = 0; i < n; i++) {
      const c = this.spawn(def, pt.x + (this.rand() - 0.5) * 70, pt.y + (this.rand() - 0.5) * 70);
      if (def.behavior === 'school' || def.behavior === 'pack') {
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
    let r = def.radius * (1 + (this.rand() * 2 - 1) * def.radiusVar) * grow;
    // Later in a run, the odd lone hunter grows to match the jelly, so no zone is ever fully safe.
    const esc = def.role === 'predator' && !def.group && !this.demo ? escalation(this.time) : 0;
    if (esc > 0 && this.rand() < 0.3 * esc) {
      r = Math.max(r, this.player.r * THREAT_RATIO * (1.05 + this.rand() * 0.2));
    }
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
      claimed: false,
      held: false,
      slip: 0,
      consume: 0,
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
      if (rule.minDepth && p.y < rule.minDepth) return false;
      return !this.creatures.some((c) => c.def === def && !c.dead);
    });
  }

  private rollRare(): void {
    const p = this.player;
    // Something as vast as the Phantom drifts in its own time; it doesn't crowd out the other rares.
    const alive = this.creatures.filter((c) => c.def.rare && !c.def.revealLight && !c.dead).length;
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

  /** A free spot on the open face of a coral circle, between minD and maxD from the jelly. */
  private coralSpot(radius: number, minD: number, maxD: number, gap: boolean): { x: number; y: number; a: number } | null {
    const p = this.player;
    const options: Coral[] = [];
    for (const cl of this.corals) {
      for (const c of cl.circles) {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d > minD && d < maxD && c.x > 60 && c.x < this.width - 60 && c.y < this.height - 60) options.push(c);
      }
    }
    for (let tries = 0; tries < 4 && options.length; tries++) {
      const coral = options[Math.floor(this.rand() * options.length)];
      const a = Math.atan2(p.y - coral.y, p.x - coral.x) + (this.rand() - 0.5) * 1.4;
      const off = coral.r + (gap ? radius + 6 : radius * 0.9);
      const x = coral.x + Math.cos(a) * off;
      const y = coral.y + Math.sin(a) * off;
      if (this.insideCoral(x, y, radius * 0.5)) continue;
      return { x, y, a };
    }
    return null;
  }

  private spawnRare(def: SpeciesDef): boolean {
    const p = this.player;
    const rule = def.rare!;
    if (rule.nearCoral) {
      const spot = this.coralSpot(def.radius, this.viewRadius * 0.55, this.viewRadius + 380, true);
      if (!spot) return false;
      this.spawn(def, spot.x, spot.y);
      return true;
    }
    if (def.behavior === 'loom') {
      // Drift in from the side, just below the jelly, heading across its path.
      const side = this.rand() < 0.5 ? -1 : 1;
      const x = clamp(p.x + side * (this.viewRadius + def.radius * 0.9), 300, this.width - 300);
      const range = ZONE_RANGE[def.id];
      const y = clamp(p.y + 160 + this.rand() * 260, range.top + 400, range.bottom - 500);
      const c = this.spawn(def, x, y);
      c.offX = x < p.x ? 0 : Math.PI;
      c.heading = -Math.PI / 2;
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
