import type { PathDef, PathId, PlayerStats } from './types';
import { FORMS, type FormId } from './forms';
import { MUTATIONS_BY_ID, type MutationId } from './mutations';
import { PERSONALITIES, type PersonalityId } from './personality';
import { TREASURES_BY_ID, type TreasureId } from './landmarks';

export const BASE_STATS: PlayerStats = {
  lightRadius: 250,
  rareChance: 1,
  magnet: 0,
  rareCompass: 0,
  discoveryBonus: 1,
  detectMult: 1,
  speed: 1,
  burstCooldown: 3,
  burstPower: 1,
  burstCharges: 1,
  burstMaw: 1,
  currentControl: 0,
  stingCooldown: 0,
  stingStun: 0,
  stingNova: 0,
  extraArms: 0,
  coralReach: 0,
  foodMult: 1,
  comboBonus: 0,
  pearlMagnet: 0,
  lashReach: 1,
  lashSpeed: 1,
  placeSense: 1,
  armReach: 1,
  grip: 1,
  ink: 0,
  warning: 0,
  preyWary: 1,
  camo: 0,
  regrow: 0,
  depthTolerance: 2,
  sizeMult: 1,
  crack: 0,
};

/**
 * Diet paths: what kind of food the octopus has been eating. They no longer grow tiers of their
 * own; they lean which mutations are offered (you are what you eat), and their colors split the
 * growth meter.
 */
export const PATHS: Record<PathId, PathDef> = {
  glow: { id: 'glow', name: 'Glow', tagline: 'Glowing food: senses and light.', color: '#ffd27a' },
  surge: { id: 'surge', name: 'Swift', tagline: 'Quick food: movement.', color: '#5ee0d0' },
  sting: { id: 'sting', name: 'Spiny', tagline: 'Spiny food and hunters: defense.', color: '#c59bff' },
};

export const PATH_ORDER: PathId[] = ['glow', 'surge', 'sting'];

/** How many mutations of each diet affinity the octopus carries (rare spawns and visuals read this). */
export type Tiers = Record<PathId, number>;

export function emptyTiers(): Tiers {
  return { glow: 0, surge: 0, sting: 0 };
}

export function tiersFor(mutations: readonly MutationId[]): Tiers {
  const t = emptyTiers();
  for (const id of mutations) {
    const a = MUTATIONS_BY_ID[id]?.affinity;
    if (a) t[a] += 1;
  }
  return t;
}

type StatMod = { add?: Partial<PlayerStats>; mul?: Partial<PlayerStats> };

function applyMod(stats: PlayerStats, mod: StatMod): void {
  for (const [k, v] of Object.entries(mod.add ?? {})) {
    stats[k as keyof PlayerStats] += v as number;
  }
  for (const [k, v] of Object.entries(mod.mul ?? {})) {
    stats[k as keyof PlayerStats] *= v as number;
  }
}

/** Folds the evolution tiers over the base stats, path by path, tier by tier, then any forms worn. */
export function computeStats(
  mutations: readonly MutationId[] = [],
  base: PlayerStats = BASE_STATS,
  forms: readonly FormId[] = [],
  relics: readonly TreasureId[] = [],
  personality: PersonalityId | null = null,
): PlayerStats {
  const stats: PlayerStats = { ...base };
  for (const id of new Set(mutations)) if (MUTATIONS_BY_ID[id]) applyMod(stats, MUTATIONS_BY_ID[id]);
  for (const id of new Set(forms)) if (FORMS[id]) applyMod(stats, FORMS[id]);
  for (const id of new Set(relics)) if (TREASURES_BY_ID[id]) applyMod(stats, TREASURES_BY_ID[id].relic);
  if (personality) applyMod(stats, PERSONALITIES[personality]);
  return stats;
}

export type Diet = Record<PathId, number>;

export function emptyDiet(): Diet {
  return { glow: 0, surge: 0, sting: 0 };
}

/** The kind of food eaten most since the last mutation, or null if it was all plain. */
export function dietPath(diet: Diet): PathId | null {
  let best: PathId | null = null;
  for (const id of PATH_ORDER) if (diet[id] > 0 && (!best || diet[id] > diet[best])) best = id;
  return best;
}
