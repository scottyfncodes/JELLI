import type { PowerId } from './powerups';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type ZoneId = 'shallows' | 'twilight' | 'abyss';
export type PathId = 'glow' | 'surge' | 'sting';
export type Role = 'player' | 'prey' | 'predator' | 'ambient';

export type Shape =
  | 'jelly'
  | 'krill'
  | 'shrimp'
  | 'butterfly'
  | 'fry'
  | 'minnow'
  | 'puffer'
  | 'squid'
  | 'needlefin'
  | 'eel'
  | 'angler'
  | 'seahorse'
  | 'nautilus'
  | 'siphonophore'
  | 'ray'
  | 'moray'
  | 'razorfin'
  | 'shark';

export type Behavior =
  | 'drift'
  | 'dart'
  | 'school'
  | 'puff'
  | 'jet'
  | 'hide'
  | 'glide'
  | 'chain'
  | 'lunge'
  | 'stalk'
  | 'lure'
  | 'ambush'
  | 'pack'
  | 'circle'
  | 'loom';

export interface RareRule {
  /** Chance per rare roll (every few seconds) before Glow multipliers. */
  chance: number;
  minTime?: number;
  minStage?: number;
  requiresPath?: { path: PathId; tier: number };
  /** Spawns tucked against coral. */
  nearCoral?: boolean;
  /** Only appears while the player is riding a current. */
  playerInCurrent?: boolean;
  /** Only appears once the jelly has swum at least this deep. */
  minDepth?: number;
}

export interface HunterDef {
  /** Base detection radius in world units, scaled by player size. */
  detect: number;
  telegraph: number;
  chaseSpeed: number;
  chaseTime: number;
  rest: number;
}

export interface SpeciesDef {
  id: string;
  name: string;
  latin: string;
  rarity: Rarity;
  role: Role;
  shape: Shape;
  behavior: Behavior;
  radius: number;
  /** Random +/- fraction applied to radius on spawn. */
  radiusVar: number;
  speed: number;
  colors: { body: string; accent: string; glow: string };
  /** Bioluminescent creatures stay visible through deep-water darkness. */
  glows: boolean;
  /** Can never be eaten regardless of size. */
  inedible?: boolean;
  zones: ZoneId[];
  /** Weight in the regular spawner. Rare species use `rare` instead. */
  weight: number;
  group?: [number, number];
  growth: number;
  score: number;
  blurb: string;
  hint: string;
  rare?: RareRule;
  hunter?: HunterDef;
  /** Eating this creature grants a timed power-up. */
  power?: PowerId;
  /** Regular spawns tuck in against coral (ambush hunters). */
  spawnNearCoral?: boolean;
  /** The evolution path eating this creature pushes Jelli toward. Plain plankton has none. */
  diet?: PathId;
  /**
   * Too vast to take in at a glance: the jelly only glimpses it until its light
   * reaches at least this far, and only then does it count as discovered.
   */
  revealLight?: number;
}

export interface PlayerStats {
  lightRadius: number;
  rareChance: number;
  magnet: number;
  rareCompass: number;
  discoveryBonus: number;
  detectMult: number;
  speed: number;
  burstCooldown: number;
  burstPower: number;
  burstCharges: number;
  burstMaw: number;
  currentControl: number;
  stingCooldown: number;
  stingStun: number;
  stingNova: number;
  /** Arms that may hunt at once on top of the stage allowance. */
  extraArms: number;
  /** 1 lets tentacles reach through coral. */
  coralReach: number;
  /** Multiplies the growth and evolution food every meal gives. */
  foodMult: number;
  /** Seconds added to the catch-chain window. */
  comboBonus: number;
  /** Radius within which pearls drift toward the jelly. */
  pearlMagnet: number;
}

export interface PathTier {
  title: string;
  desc: string;
  /** A few words for the in-run evolution moment. */
  short: string;
  add?: Partial<PlayerStats>;
  mul?: Partial<PlayerStats>;
}

export interface PathDef {
  id: PathId;
  name: string;
  tagline: string;
  color: string;
  tiers: PathTier[];
}
