import { CHALLENGES, type ChallengeDef, type ChallengeMetric } from '../content/challenges';
import { SPECIES, SPECIES_BY_ID } from '../content/species';
import { FORMS, FORM_ORDER, type FormId } from '../content/forms';
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
  /** Most caught in a single sweep this run. */
  bestSweep: number;
  pearls: number;
  /** 1 once the pirate chest has been opened this run. */
  chest: number;
  maxDepth: number;
  time: number;
  caughtBy: string | null;
  seen: string[];
  eatenBySpecies: Record<string, number>;
  /** Forms worn this run, inherited first, in the order they grew. */
  forms: FormId[];
  /** Species glimpsed but never seen clearly this run. */
  glimpsed: string[];
  /** The state the jelly was caught in, if it was caught. */
  death: DeathInfo | null;
}

export interface DeathInfo {
  /** A burst was charged and unused. */
  burstReady: boolean;
  /** Seconds since the last burst. */
  sinceBurst: number;
  /** How much the last sweep caught. */
  lastSweep: number;
  /** How the hunter that caught it hunts. */
  behavior: string;
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
    bestSweep: 0,
    pearls: 0,
    chest: 0,
    maxDepth: 0,
    time: 0,
    caughtBy: null,
    seen: [],
    eatenBySpecies: {},
    forms: [],
    glimpsed: [],
    death: null,
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
    case 'life.forms':
      return save.forms.length;
    case 'life.phantom':
      return save.discovered.phantom ? 1 : 0;
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
    case 'run.forms':
      return run.forms?.length ?? 0;
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

/** Adds a form to the collection. Returns true the first time any Jelli wears it. */
export function recordForm(save: SaveData, id: FormId): boolean {
  if (save.forms.includes(id)) return false;
  save.forms.push(id);
  return true;
}

/** Counts a dive in which something too vast to see was glimpsed. */
export function recordGlimpse(save: SaveData, id: string): void {
  if (id in SPECIES_BY_ID) save.glimpses[id] = (save.glimpses[id] ?? 0) + 1;
}

export interface RunOutcome {
  newDiscoveries: string[];
  completed: ChallengeDef[];
  unlocked: UnlockId[];
  newBest: boolean;
  /** The biggest sweep on record before this run. */
  prevBestSweep: number;
}

/** Applies a finished run to the save: discoveries, bests, stats, challenges, unlocks. */
export function applyRun(save: SaveData, run: RunStats, now = Date.now()): RunOutcome {
  const newDiscoveries = recordDiscoveries(save, run.seen, run.eatenBySpecies, now);
  const newBest = run.score > save.best.score;
  const prevBestSweep = save.best.sweep;
  if (newBest) save.best.score = run.score;
  save.best.mass = Math.max(save.best.mass, run.mass);
  save.stats.runs += 1;
  save.stats.longest = Math.max(save.stats.longest, run.time);
  save.stats.eaten += run.eaten;
  save.stats.pearls += run.pearls ?? 0;
  save.stats.chests += run.chest ?? 0;
  save.best.combo = Math.max(save.best.combo, run.bestCombo ?? 0);
  save.best.sweep = Math.max(save.best.sweep, run.bestSweep ?? 0);
  // The newest form passes on by default; the results screen lets the player pick another.
  const forms = run.forms ?? [];
  for (const id of forms) recordForm(save, id);
  save.heirloom = forms.length ? forms[forms.length - 1] : null;

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
  return { newDiscoveries, completed, unlocked, newBest, prevBestSweep };
}

/** The next unfinished challenge, for nudging the player toward another run. */
export function nextChallenge(save: SaveData): ChallengeDef | null {
  return CHALLENGES.find((c) => !save.challenges[c.id]) ?? null;
}

export interface Mystery {
  title: string;
  text: string;
}

/** One thing still out there, so a finished run leaves something to wonder about. */
export function mystery(save: SaveData, run: RunStats | null): Mystery | null {
  const vast = SPECIES.find((s) => s.revealLight && !save.discovered[s.id] && (run?.glimpsed.includes(s.id) || save.glimpses[s.id]));
  if (vast) {
    const n = save.glimpses[vast.id] ?? 0;
    return run?.glimpsed.includes(vast.id)
      ? { title: 'Something vast drifted past', text: 'It moved just beyond your light at the bottom of the Abyss. A brighter Jelli might see what it was.' }
      : { title: 'Something vast waits in the Abyss', text: `Glimpsed in ${n} ${n === 1 ? 'dive' : 'dives'}. Your light has never reached it.` };
  }
  // A hunter or rare met, but never eaten: what would it do to you?
  const met = FORM_ORDER.find((id) => !save.forms.includes(id) && (run?.seen.includes(FORMS[id].source) || save.discovered[FORMS[id].source]));
  if (met) {
    const def = SPECIES_BY_ID[FORMS[met].source];
    return { title: `You’ve met the ${def.name}`, text: 'Eat one and part of it will grow onto you. Nobody knows what yet.' };
  }
  const unknown = SPECIES.find((s) => !save.discovered[s.id]);
  if (unknown) return { title: 'Still undiscovered', text: `Field notes: “${unknown.hint}”` };
  const form = FORM_ORDER.find((id) => !save.forms.includes(id));
  if (form) return { title: 'An unworn form', text: FORMS[form].hint };
  return null;
}

/**
 * One line on why the run ended, phrased as something to try next time. Every burst is both
 * the jelly's escape and its sweep, so the lesson is usually about when it was spent.
 */
export function deathLesson(run: RunStats): string | null {
  const d = run.death;
  if (!d) return null;
  const chaser = d.behavior === 'stalk' || d.behavior === 'pack';
  if (d.burstReady) return chaser ? 'You had a burst ready. Burst away before it closes in.' : 'You had a burst ready. When the red line appears, burst across it.';
  if (d.lastSweep > 0 && d.sinceBurst < 3) {
    return `You spent your burst sweeping up ${d.lastSweep} just before it struck. Worth it?`;
  }
  return 'Your burst was still recharging. Keep one ready when red eyes are near.';
}
