import type { SpeciesDef } from '../content/types';

/** A creature is edible when it is clearly smaller than the eater. */
export const EAT_RATIO = 0.88;
/** A hunter is dangerous only when clearly bigger than the jelly. */
export const THREAT_RATIO = 1.12;

export function canEat(eaterR: number, preyR: number, prey?: SpeciesDef): boolean {
  if (prey && (prey.inedible || prey.role === 'player')) return false;
  return preyR <= eaterR * EAT_RATIO;
}

export function isThreat(playerR: number, creatureR: number, def: SpeciesDef): boolean {
  return def.role === 'predator' && creatureR >= playerR * THREAT_RATIO;
}

/** Forgiving bite: hunters must really reach the bell's core. */
export function threatContact(dist: number, playerR: number, hunterR: number): boolean {
  return dist < hunterR * 0.68 + playerR * 0.5;
}

/**
 * Full tentacle length, which is also how far an arm can reach from the bell.
 * Short on a fresh ephyra; every meal lengthens the arms a little, tapering off over a run.
 */
export function tentacleReach(playerR: number, meals = 0): number {
  return playerR * 1.8 + 6 + 70 * (1 - Math.exp(-Math.max(0, meals) / 70));
}

/** How many arms may be busy catching at once: one, then two from Bloom. Arms snag, they don't swarm. */
export function busyArms(stage: number): number {
  return 1 + Math.floor(Math.max(1, stage) / 3);
}

/** Arms only reach into this forward arc (cosine of the half-angle from the heading). */
export const REACH_ARC = -0.17;

/** Hunting tentacles by size stage: three to start, four from Drifter, five at Apex. */
export function tentacleCount(stage: number): number {
  return Math.min(5, 3 + Math.floor(Math.max(1, stage) / 2));
}

/** Tip speed while reaching: an unhurried flick. Big jellies have bigger, faster arms. */
export function tentacleReachSpeed(playerR: number): number {
  return 260 * Math.pow(playerR / 10, 0.35);
}

/** Reel-in speed: heavy prey (relative to the jelly) comes in slower. */
export function tentaclePullSpeed(playerR: number, preyR: number): number {
  return (190 * Math.pow(playerR / 10, 0.35)) / (0.55 + preyR / playerR);
}

/** Chance per second that a held fish wriggles free. Only prey close to the jelly's size can fight. */
export function escapeRate(playerR: number, preyR: number, predator: boolean): number {
  const rel = preyR / playerR;
  return Math.max(0, rel - 0.55) * 2.2 + (predator ? 0.45 : 0);
}
