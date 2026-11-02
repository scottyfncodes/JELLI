import type { PowerId } from './powerups';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export type ZoneId = 'shallows' | 'gardens' | 'twilight' | 'forgotten' | 'abyss' | 'hadal';
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
  | 'shark'
  | 'comb'
  | 'whale'
  | 'crab'
  | 'clam'
  | 'octopus';

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
  | 'loom'
  | 'crawl'
  | 'clam'
  | 'rival';

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
  /** Touching it stings: the octopus is knocked back, numbed and loses its jet charge. */
  stings?: boolean;
  /** Hides in a shell when threatened; the arms can't take it while it is shut. */
  shell?: boolean;
  /** In dark water it is drawn toward the jelly's light, or flees it. */
  light?: 'drawn' | 'shy';
  /** When threatened it darts behind the nearest coral, where arms can't reach. */
  shelters?: boolean;
  /** A hunter that patrols around where it was first seen, and gives up a chase beyond this. */
  territory?: number;
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
  /** Multiplies how far an aimed lash reaches, and how fast it strikes. */
  lashReach: number;
  lashSpeed: number;
  /** Multiplies how far away a landmark's glint shows at the screen edge. */
  placeSense: number;
  /** Multiplies how far the arms reach on their own. */
  armReach: number;
  /** Multiplies how readily held prey wriggles free (lower holds better). */
  grip: number;
  /** 1: every jet leaves an ink cloud. */
  ink: number;
  /** 1: warning colors keep hunters not much bigger away. */
  warning: number;
  /** Multiplies how far away prey notice the octopus coming. */
  preyWary: number;
  /** 1: holding still turns the skin to camouflage. */
  camo: number;
  /** 1: a bite can take an arm instead of the octopus, now and then. */
  regrow: number;
  /** The deepest biome (by index) the body can stand; beyond it the water presses back. */
  depthTolerance: number;
  /** Multiplies body size. */
  sizeMult: number;
  /** 1: clams can be cracked even when shut. */
  crack: number;
}

export interface PathDef {
  id: PathId;
  name: string;
  tagline: string;
  color: string;
}
