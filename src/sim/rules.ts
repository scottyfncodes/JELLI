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

/** Generous mouth: the bell only needs to overlap half the prey. */
export function eatContact(dist: number, playerR: number, preyR: number, maw = 1): boolean {
  return dist < playerR * 0.95 * maw + preyR * 0.5;
}

/** Forgiving bite: hunters must really reach the bell's core. */
export function threatContact(dist: number, playerR: number, hunterR: number): boolean {
  return dist < hunterR * 0.68 + playerR * 0.5;
}
