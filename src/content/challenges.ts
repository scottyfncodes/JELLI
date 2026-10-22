import type { UnlockId } from './unlocks';

/** Metrics a challenge can measure. `run.*` resets each run; `life.*` is lifetime. */
export type ChallengeMetric =
  | 'run.evolutions'
  | 'run.maxDepth'
  | 'run.eaten'
  | 'run.survived'
  | 'run.predatorsEaten'
  | 'run.stage'
  | 'run.stings'
  | 'run.score'
  | 'life.discovered'
  | 'life.rareDiscovered'
  | 'life.legendaryDiscovered';

export interface ChallengeDef {
  id: string;
  title: string;
  desc: string;
  metric: ChallengeMetric;
  goal: number;
  reward?: UnlockId;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'first-bloom', title: 'First Bloom', desc: 'Evolve for the first time.', metric: 'run.evolutions', goal: 1, reward: 'skin:coral' },
  { id: 'feast', title: 'Feeding Frenzy', desc: 'Eat 45 creatures in a single run.', metric: 'run.eaten', goal: 45, reward: 'trait:seed-surge' },
  { id: 'deep-diver', title: 'Deep Diver', desc: 'Reach the Abyss.', metric: 'run.maxDepth', goal: 3800, reward: 'trait:seed-glow' },
  { id: 'tide-rider', title: 'Tide Rider', desc: 'Survive until the night tide turns.', metric: 'run.survived', goal: 1, reward: 'trait:seed-sting' },
  { id: 'stinger', title: 'Nettle Dance', desc: 'Sting 3 hunters in a single run.', metric: 'run.stings', goal: 3, reward: 'skin:nettle' },
  { id: 'naturalist', title: 'Naturalist', desc: 'Discover 10 species in the Field Guide.', metric: 'life.discovered', goal: 10, reward: 'skin:aurora' },
  { id: 'reversal', title: 'Turn the Tables', desc: 'Grow big enough to eat a hunter.', metric: 'run.predatorsEaten', goal: 1, reward: 'skin:abyssal' },
  { id: 'apex', title: 'Apex Jelli', desc: 'Reach Apex size in a single run.', metric: 'run.stage', goal: 4, reward: 'skin:gilded' },
  { id: 'rare-sighting', title: 'Rare Sighting', desc: 'Discover a rare species.', metric: 'life.rareDiscovered', goal: 1 },
  { id: 'legend', title: 'Living Legend', desc: 'Witness a legendary species.', metric: 'life.legendaryDiscovered', goal: 1 },
  { id: 'high-tide', title: 'High Tide', desc: 'Score 12,000 in a single run.', metric: 'run.score', goal: 12000 },
];
