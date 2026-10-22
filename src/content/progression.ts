/** Size, stages and endless-run escalation. */

export const START_MASS = 10;
export const MAX_MASS = 320;
export const BASE_RADIUS = 10;

export interface StageDef {
  mass: number;
  name: string;
}

/** Size stages: names for how big the jelly has grown. */
export const STAGES: StageDef[] = [
  { mass: 0, name: 'Ephyra' },
  { mass: 34, name: 'Drifter' },
  { mass: 78, name: 'Bloom' },
  { mass: 165, name: 'Apex' },
];

/** Runs have no clock; after a grace period hunters slowly grow in size and number. */
export const ESCALATION_START = 120;
export const ESCALATION_SECONDS = 300;

/** 0..1 how far a run has escalated. */
export function escalation(time: number): number {
  return Math.max(0, Math.min(1, (time - ESCALATION_START) / ESCALATION_SECONDS));
}

/** Newly spawned hunters grow up to 70% bigger, so even an Apex jelly stays hunted. */
export function hunterScale(time: number): number {
  return 1 + 0.7 * escalation(time);
}

/** Up to two extra hunters on top of each zone's base count. */
export function extraHunters(time: number): number {
  return Math.round(2 * escalation(time));
}

/**
 * Food totals (untapered growth eaten this run) that earn each evolution choice.
 * Nine choices fill all three paths; the first three land near the old stage timings.
 */
export const EVOLUTION_FOOD = [26, 62, 115, 190, 290, 410, 560, 740, 950];

/** Evolutions earned for a food total. */
export function evolutionsEarned(food: number): number {
  let n = 0;
  while (n < EVOLUTION_FOOD.length && food >= EVOLUTION_FOOD[n]) n++;
  return n;
}

/** 0..1 progress toward the next evolution (1 once all are earned). */
export function evolutionProgress(food: number): number {
  const n = evolutionsEarned(food);
  if (n >= EVOLUTION_FOOD.length) return 1;
  const lo = n === 0 ? 0 : EVOLUTION_FOOD[n - 1];
  return Math.max(0, Math.min(1, (food - lo) / (EVOLUTION_FOOD[n] - lo)));
}

export function radiusForMass(mass: number): number {
  return BASE_RADIUS * Math.sqrt(Math.max(START_MASS * 0.5, mass) / START_MASS);
}

/** 1-based stage index for a given mass. */
export function stageForMass(mass: number): number {
  let stage = 1;
  for (let i = 1; i < STAGES.length; i++) {
    if (mass >= STAGES[i].mass) stage = i + 1;
  }
  return stage;
}

/** 0..1 progress from the current stage threshold to the next (1 at apex). */
export function stageProgress(mass: number): number {
  const stage = stageForMass(mass);
  if (stage >= STAGES.length) return Math.min(1, (mass - STAGES[stage - 1].mass) / (MAX_MASS - STAGES[stage - 1].mass));
  const lo = STAGES[stage - 1].mass;
  const hi = STAGES[stage].mass;
  return Math.max(0, Math.min(1, (mass - lo) / (hi - lo)));
}

/** Mass gained from food tapers slightly as the jelly grows so stages stay paced. */
export function growthGain(base: number, mass: number): number {
  const taper = 1 / (1 + Math.max(0, mass - START_MASS) / 420);
  return base * taper;
}

export function maxSpeedFor(radius: number, speedMult: number): number {
  return 235 * Math.pow(BASE_RADIUS / radius, 0.27) * speedMult;
}

/** Bigger jellies are easier for hunters to notice. */
export function detectionScale(radius: number): number {
  return 0.72 + 0.28 * Math.pow(radius / BASE_RADIUS, 0.65);
}

/**
 * 0..1 how developed the jelly's body looks, from food eaten this run.
 * Front-loaded so the first few meals already show, reaching full maturity near the last evolution.
 */
export function maturity(food: number): number {
  return Math.min(1, Math.sqrt(Math.max(0, food) / 900));
}
