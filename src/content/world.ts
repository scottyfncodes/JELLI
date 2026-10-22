import type { ZoneId } from './types';

export const WORLD = {
  width: 6000,
  height: 12000,
};

export interface ZoneDef {
  id: ZoneId;
  name: string;
  top: number;
  bottom: number;
  /** Background gradient (top, bottom) colors. */
  water: [string, string];
  /** 0 = sunlit, 1 = pitch black outside the jelly's light. */
  darkness: number;
  predators: number;
  prey: number;
}

export const ZONES: ZoneDef[] = [
  { id: 'shallows', name: 'Sunlit Shallows', top: 0, bottom: 3800, water: ['#1c4f86', '#163a72'], darkness: 0, predators: 1, prey: 50 },
  { id: 'twilight', name: 'Twilight Reef', top: 3800, bottom: 8000, water: ['#14306a', '#0f1f52'], darkness: 0.62, predators: 3, prey: 44 },
  { id: 'abyss', name: 'The Abyss', top: 8000, bottom: 12000, water: ['#0b1640', '#060a24'], darkness: 0.9, predators: 3, prey: 36 },
];

export function zoneAt(y: number): ZoneDef {
  for (const z of ZONES) if (y < z.bottom) return z;
  return ZONES[ZONES.length - 1];
}

/** Smoothly interpolated darkness for a depth, so zone borders don't pop. */
export function darknessAt(y: number): number {
  const stops: [number, number][] = [
    [0, 0],
    [2800, 0],
    [4900, 0.6],
    [7700, 0.72],
    [9200, 0.9],
    [12000, 0.94],
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
