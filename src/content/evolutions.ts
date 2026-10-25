import type { PathDef, PathId, PlayerStats } from './types';
import { FORMS, type FormId } from './forms';

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
};

export const MAX_TIER = 3;

export const PATHS: Record<PathId, PathDef> = {
  glow: {
    id: 'glow',
    name: 'Glow',
    tagline: 'See further. Find the rare.',
    color: '#ffd27a',
    tiers: [
      {
        title: 'Lumen Bloom',
        short: 'Prey drift to your light.',
        desc: 'Small prey drift toward your glow instead of fleeing. Your light reaches further in the dark, and rare species appear more often.',
        add: { lightRadius: 120, magnet: 70 },
        mul: { rareChance: 1.7 },
      },
      {
        title: 'Beacon Heart',
        short: 'A compass finds the rare.',
        desc: 'A compass points toward nearby rare species. Even wider light and pull.',
        add: { lightRadius: 90, magnet: 40, rareCompass: 1 },
        mul: { rareChance: 1.4 },
      },
      {
        title: 'Starlight Veil',
        short: 'Hunters notice you later.',
        desc: 'Dazzle hunters so they notice you later. Discoveries are worth double.',
        add: { lightRadius: 90 },
        mul: { detectMult: 0.72, discoveryBonus: 2 },
      },
    ],
  },
  surge: {
    id: 'surge',
    name: 'Surge',
    tagline: 'Faster, stronger bursts.',
    color: '#5ee0d0',
    tiers: [
      {
        title: 'Jet Bell',
        short: 'Quicker, harder bursts.',
        desc: 'Bursts recharge faster and push harder.',
        mul: { burstCooldown: 0.72, burstPower: 1.25 },
      },
      {
        title: 'Riptide',
        short: 'Ride the currents.',
        desc: 'Swim faster and ride currents instead of fighting them.',
        add: { currentControl: 1 },
        mul: { speed: 1.12, burstCooldown: 0.85 },
      },
      {
        title: 'Comet',
        short: 'Two bursts, longer reach.',
        desc: 'Store two bursts. Bursting flings your tentacles further.',
        add: { burstCharges: 1, burstMaw: 0.35 },
        mul: { burstPower: 1.15 },
      },
    ],
  },
  sting: {
    id: 'sting',
    name: 'Sting',
    tagline: 'Make hunters regret it.',
    color: '#c59bff',
    tiers: [
      {
        title: 'Nettle Fringe',
        short: 'Stun the first hunter that bites.',
        desc: 'Stinging tentacles stun the first hunter that bites you. Recharges over time.',
        add: { stingCooldown: 14, stingStun: 1.8 },
      },
      {
        title: 'Barbed Crown',
        short: 'Stings recharge faster.',
        desc: 'Stings recharge much faster and stun for longer.',
        add: { stingStun: 0.9 },
        mul: { stingCooldown: 0.62 },
      },
      {
        title: 'Thunder Nettle',
        short: 'Every burst stings.',
        desc: 'Every burst releases a stinging nova that stuns nearby hunters.',
        add: { stingNova: 180, stingStun: 0.5 },
      },
    ],
  },
};

export const PATH_ORDER: PathId[] = ['glow', 'surge', 'sting'];

export type Tiers = Record<PathId, number>;

export function emptyTiers(): Tiers {
  return { glow: 0, surge: 0, sting: 0 };
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
export function computeStats(tiers: Tiers, base: PlayerStats = BASE_STATS, forms: readonly FormId[] = []): PlayerStats {
  const stats: PlayerStats = { ...base };
  for (const id of PATH_ORDER) {
    const level = Math.min(MAX_TIER, Math.max(0, tiers[id] | 0));
    for (let i = 0; i < level; i++) applyMod(stats, PATHS[id].tiers[i]);
  }
  for (const id of new Set(forms)) if (FORMS[id]) applyMod(stats, FORMS[id]);
  return stats;
}

export type Diet = Record<PathId, number>;

export function emptyDiet(): Diet {
  return { glow: 0, surge: 0, sting: 0 };
}

/**
 * The path the next evolution takes: whatever the jelly has eaten most of since the last one.
 * A diet of plain plankton (or of maxed paths) rounds out the least-grown path instead.
 * Returns null once every path is maxed.
 */
export function dietPath(diet: Diet, tiers: Tiers): PathId | null {
  const open = availablePaths(tiers);
  if (!open.length) return null;
  let best: PathId | null = null;
  for (const id of open) if (diet[id] > 0 && (!best || diet[id] > diet[best])) best = id;
  if (best) return best;
  return open.reduce((a, b) => (tiers[b] < tiers[a] ? b : a));
}

/** Paths that can still take another tier. */
export function availablePaths(tiers: Tiers): PathId[] {
  return PATH_ORDER.filter((p) => tiers[p] < MAX_TIER);
}
