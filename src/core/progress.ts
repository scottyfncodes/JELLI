import { CHALLENGES, type ChallengeDef, type ChallengeMetric } from '../content/challenges';
import { SPECIES_BY_ID } from '../content/species';
import type { UnlockId } from '../content/unlocks';
import type { SaveData } from '../persistence/save';

/** Everything the end-of-run summary and challenges need to know about a run. */
export interface RunStats {
  score: number;
  mass: number;
  stage: number;
  eaten: number;
  predatorsEaten: number;
  evolutions: number;
  stings: number;
  powerups: number;
  /** Longest catch chain this run. */
  bestCombo: number;
  pearls: number;
  /** 1 once the pirate chest has been opened this run. */
  chest: number;
  maxDepth: number;
  time: number;
  caughtBy: string | null;
  seen: string[];
  eatenBySpecies: Record<string, number>;
}

export function emptyRunStats(): RunStats {
  return {
    score: 0,
    mass: 0,
    stage: 1,
    eaten: 0,
    predatorsEaten: 0,
    evolutions: 0,
    stings: 0,
    powerups: 0,
    bestCombo: 0,
    pearls: 0,
    chest: 0,
    maxDepth: 0,
    time: 0,
    caughtBy: null,
    seen: [],
    eatenBySpecies: {},
  };
}

export function countDiscovered(save: SaveData, rarity?: string): number {
  return Object.keys(save.discovered).filter((id) => !rarity || SPECIES_BY_ID[id]?.rarity === rarity).length;
}

export function metricValue(metric: ChallengeMetric, run: RunStats | null, save: SaveData): number {
  switch (metric) {
    case 'life.discovered':
      return countDiscovered(save);
    case 'life.rareDiscovered':
      return countDiscovered(save, 'rare') + countDiscovered(save, 'legendary');
    case 'life.legendaryDiscovered':
      return countDiscovered(save, 'legendary');
    case 'life.pearls':
      return save.stats.pearls;
  }
  if (!run) return 0;
  switch (metric) {
    case 'run.evolutions':
      return run.evolutions;
    case 'run.maxDepth':
      return run.maxDepth;
    case 'run.eaten':
      return run.eaten;
    case 'run.time':
      return run.time;
    case 'run.predatorsEaten':
      return run.predatorsEaten;
    case 'run.stage':
      return run.stage;
    case 'run.stings':
      return run.stings;
    case 'run.score':
      return run.score;
    case 'run.powerups':
      return run.powerups;
    case 'run.bestCombo':
      return run.bestCombo;
    case 'run.chest':
      return run.chest;
  }
  return 0;
}

/** Records the species a run saw/ate into the save. Returns ids that were new to the Field Guide. */
export function recordDiscoveries(save: SaveData, seen: Iterable<string>, eaten: Record<string, number>, now = Date.now()): string[] {
  const fresh: string[] = [];
  for (const id of seen) {
    if (!(id in SPECIES_BY_ID)) continue;
    const rec = save.discovered[id];
    if (rec) rec.seen += 1;
    else {
      save.discovered[id] = { seen: 1, eaten: 0, firstSeen: now };
      fresh.push(id);
    }
  }
  for (const [id, n] of Object.entries(eaten)) {
    const rec = save.discovered[id];
    if (rec) rec.eaten += n;
  }
  return fresh;
}

export interface RunOutcome {
  newDiscoveries: string[];
  completed: ChallengeDef[];
  unlocked: UnlockId[];
  newBest: boolean;
}

/** Applies a finished run to the save: discoveries, bests, stats, challenges, unlocks. */
export function applyRun(save: SaveData, run: RunStats, now = Date.now()): RunOutcome {
  const newDiscoveries = recordDiscoveries(save, run.seen, run.eatenBySpecies, now);
  const newBest = run.score > save.best.score;
  if (newBest) save.best.score = run.score;
  save.best.mass = Math.max(save.best.mass, run.mass);
  save.stats.runs += 1;
  save.stats.longest = Math.max(save.stats.longest, run.time);
  save.stats.eaten += run.eaten;
  save.stats.pearls += run.pearls ?? 0;
  save.stats.chests += run.chest ?? 0;
  save.best.combo = Math.max(save.best.combo, run.bestCombo ?? 0);

  const completed: ChallengeDef[] = [];
  const unlocked: UnlockId[] = [];
  for (const c of CHALLENGES) {
    if (save.challenges[c.id]) continue;
    if (metricValue(c.metric, run, save) >= c.goal) {
      save.challenges[c.id] = now;
      completed.push(c);
      if (c.reward && !save.unlocks.includes(c.reward)) {
        save.unlocks.push(c.reward);
        unlocked.push(c.reward);
      }
    }
  }
  return { newDiscoveries, completed, unlocked, newBest };
}

/** The next unfinished challenge, for nudging the player toward another run. */
export function nextChallenge(save: SaveData): ChallengeDef | null {
  return CHALLENGES.find((c) => !save.challenges[c.id]) ?? null;
}
