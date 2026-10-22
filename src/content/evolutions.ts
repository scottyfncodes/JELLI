import type { PathDef, PathId, PlayerStats } from './types';

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
        desc: 'Light the dark around you, draw in nearby plankton, and rare species appear more often.',
        add: { lightRadius: 120, magnet: 70 },
        mul: { rareChance: 1.7 },
      },
      {
        title: 'Beacon Heart',
        desc: 'A compass points toward nearby rare species. Even wider light and pull.',
        add: { lightRadius: 90, magnet: 40, rareCompass: 1 },
        mul: { rareChance: 1.4 },
      },
      {
        title: 'Starlight Veil',
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
        desc: 'Bursts recharge faster and push harder.',
        mul: { burstCooldown: 0.72, burstPower: 1.25 },
      },
      {
        title: 'Riptide',
        desc: 'Swim faster and ride currents instead of fighting them.',
        add: { currentControl: 1 },
        mul: { speed: 1.12, burstCooldown: 0.85 },
      },
      {
        title: 'Comet',
        desc: 'Store two bursts. Bursting widens your bell to swallow more.',
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
        desc: 'Stinging tentacles stun the first hunter that bites you. Recharges over time.',
        add: { stingCooldown: 14, stingStun: 1.8 },
      },
      {
        title: 'Barbed Crown',
        desc: 'Stings recharge much faster and stun for longer.',
        add: { stingStun: 0.9 },
        mul: { stingCooldown: 0.62 },
      },
      {
        title: 'Thunder Nettle',
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

/** Folds the chosen evolution tiers over the base stats, path by path, tier by tier. */
export function computeStats(tiers: Tiers, base: PlayerStats = BASE_STATS): PlayerStats {
  const stats: PlayerStats = { ...base };
  for (const id of PATH_ORDER) {
    const level = Math.min(MAX_TIER, Math.max(0, tiers[id] | 0));
    for (let i = 0; i < level; i++) {
      const tier = PATHS[id].tiers[i];
      for (const [k, v] of Object.entries(tier.add ?? {})) {
        stats[k as keyof PlayerStats] += v as number;
      }
      for (const [k, v] of Object.entries(tier.mul ?? {})) {
        stats[k as keyof PlayerStats] *= v as number;
      }
    }
  }
  return stats;
}

/** Paths that can still take another tier. */
export function availablePaths(tiers: Tiers): PathId[] {
  return PATH_ORDER.filter((p) => tiers[p] < MAX_TIER);
}
