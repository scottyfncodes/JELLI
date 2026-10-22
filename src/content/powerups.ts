/** Timed power-ups granted by eating special fish. Durations are in seconds. */

export type PowerId = 'titan' | 'overcharge' | 'shield' | 'frenzy' | 'veil';

export interface PowerDef {
  id: PowerId;
  name: string;
  desc: string;
  color: string;
  duration: number;
}

export const POWERS: Record<PowerId, PowerDef> = {
  titan: { id: 'titan', name: 'Titan', desc: 'Swell huge: eat bigger prey, and hunters flee.', color: '#ff9f5a', duration: 8 },
  overcharge: { id: 'overcharge', name: 'Overcharge', desc: 'Bursts recharge almost instantly.', color: '#7ff0ff', duration: 8 },
  shield: { id: 'shield', name: 'Shell Shield', desc: 'Blocks the next bite.', color: '#ffd27a', duration: 25 },
  frenzy: { id: 'frenzy', name: 'Prism Frenzy', desc: 'Double points, and food drifts to you.', color: '#ff9ff3', duration: 10 },
  veil: { id: 'veil', name: 'Aurora Veil', desc: 'Hunters can’t see you.', color: '#7dffb9', duration: 10 },
};

export const POWER_ORDER: PowerId[] = ['titan', 'overcharge', 'shield', 'frenzy', 'veil'];

/** How much bigger Titan makes the jelly, for eating and for scaring hunters. */
export const TITAN_SCALE = 1.45;
/** Food-pull radius while Prism Frenzy is active. */
export const FRENZY_MAGNET = 160;
/** Burst recharge speed multiplier while Overcharged. */
export const OVERCHARGE_RATE = 5;

export type PowerTimers = Record<PowerId, number>;

export function emptyPowers(): PowerTimers {
  return { titan: 0, overcharge: 0, shield: 0, frenzy: 0, veil: 0 };
}
