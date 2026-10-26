import type { ZoneId } from './types';

/**
 * The ocean is a shaft that never ends: as wide as a few screens, and as deep as you can swim.
 * The world generates in bands as the jelly sinks (see World.ensureGenerated).
 */
export const WORLD = {
  width: 3000,
  height: Number.POSITIVE_INFINITY,
};

export interface ZoneDef {
  id: ZoneId;
  name: string;
  /** What this place asks of you, in a few words, shown on arrival. */
  sub: string;
  /** Field notes about this biome before it has ever been reached, for the run-end glimpse. */
  teaser: string;
  top: number;
  bottom: number;
  /** The biome's signature color: its distant lights, its band in the depth strip. */
  color: string;
  predators: number;
  prey: number;
  /** Prey groups spawn this many times larger (the Glow Gardens' swarms). */
  swarm: number;
  /** Chance per band of a strong down-current to ride. */
  downCurrents: number;
  /** Fraction of reef outcrops that come with a tight gap only a small jelly fits through. */
  gaps: number;
}

export const ZONES: ZoneDef[] = [
  {
    id: 'shallows',
    name: 'Sunlit Shallows',
    sub: 'Sunlight and safety. Feed up',
    teaser: '',
    top: 0,
    bottom: 1800,
    color: '#7fe3ff',
    predators: 1,
    prey: 50,
    swarm: 1,
    downCurrents: 0,
    gaps: 0.45,
  },
  {
    id: 'gardens',
    name: 'Glow Gardens',
    sub: 'Glowing swarms. Sweep them up',
    teaser: 'Below the sunlight, the reef starts to glow. Something down there swarms in the thousands.',
    top: 1800,
    bottom: 4400,
    color: '#7dffb9',
    predators: 2,
    prey: 54,
    swarm: 2,
    downCurrents: 0,
    gaps: 0.4,
  },
  {
    id: 'twilight',
    name: 'Twilight Drop',
    sub: 'Down-currents. Ride them deeper',
    teaser: 'The reef falls away into blue. Currents pour straight down into the dark.',
    top: 4400,
    bottom: 7400,
    color: '#8fb4ff',
    predators: 3,
    prey: 44,
    swarm: 1,
    downCurrents: 0.9,
    gaps: 0.35,
  },
  {
    id: 'forgotten',
    name: 'Forgotten Depths',
    sub: 'Ancient ruins. Giants pass here',
    teaser: 'Carved stone, older than the reef. Shapes the size of the ruins move between them.',
    top: 7400,
    bottom: 10800,
    color: '#5ee0b0',
    predators: 3,
    prey: 38,
    swarm: 1,
    downCurrents: 0.35,
    gaps: 0.7,
  },
  {
    id: 'abyss',
    name: 'The Abyss',
    sub: 'Only the light you bring',
    teaser: 'Total dark, except for lights that are not your friends.',
    top: 10800,
    bottom: 14600,
    color: '#b8c8ff',
    predators: 4,
    prey: 34,
    swarm: 1,
    downCurrents: 0.35,
    gaps: 0.4,
  },
  {
    id: 'hadal',
    name: 'The Hadal Dream',
    sub: 'Nothing should live this deep',
    teaser: 'Below six thousand meters the water turns red, and the snow falls upward.',
    top: 14600,
    bottom: Number.POSITIVE_INFINITY,
    color: '#ff6fae',
    predators: 4,
    prey: 32,
    swarm: 1,
    downCurrents: 0.6,
    gaps: 0.3,
  },
];

export const ZONES_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<ZoneId, ZoneDef>;

export function zoneAt(y: number): ZoneDef {
  for (const z of ZONES) if (y < z.bottom) return z;
  return ZONES[ZONES.length - 1];
}

/** Index of a zone in descent order. */
export function zoneIndex(id: ZoneId): number {
  return ZONES.findIndex((z) => z.id === id);
}

/**
 * Depth in meters for a world depth. Each biome spans a real ocean band (sunlit to 200 m,
 * hadal from 6,000 m), so meters climb faster the deeper you go, and keep climbing forever.
 */
const METERS: [number, number][] = [
  [0, 0],
  [1800, 200],
  [4400, 1000],
  [7400, 2000],
  [10800, 4000],
  [14600, 6000],
];

export function depthMeters(y: number): number {
  const v = Math.max(0, y);
  for (let i = 1; i < METERS.length; i++) {
    const [y1, m1] = METERS[i];
    if (v <= y1) {
      const [y0, m0] = METERS[i - 1];
      return m0 + ((v - y0) / (y1 - y0)) * (m1 - m0);
    }
  }
  const [ya, ma] = METERS[METERS.length - 2];
  const [yb, mb] = METERS[METERS.length - 1];
  return mb + ((v - yb) * (mb - ma)) / (yb - ya);
}

/** Smoothly interpolated darkness for a depth, so zone borders don't pop. */
export function darknessAt(y: number): number {
  const stops: [number, number][] = [
    [0, 0],
    [1400, 0],
    [2600, 0.42],
    [4400, 0.55],
    [6200, 0.68],
    [7400, 0.74],
    [9400, 0.84],
    [10800, 0.9],
    [14600, 0.94],
    // In the Hadal Dream the dark lifts into a dim red glow nobody can explain.
    [16200, 0.84],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [y1, d1] = stops[i];
    if (y <= y1) {
      const [y0, d0] = stops[i - 1];
      const t = (y - y0) / (y1 - y0);
      return d0 + (d1 - d0) * Math.max(0, Math.min(1, t));
    }
  }
  return stops[stops.length - 1][1];
}
