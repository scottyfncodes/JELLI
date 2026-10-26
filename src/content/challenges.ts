import type { UnlockId } from './unlocks';
import { ZONES_BY_ID } from './world';

/** Metrics a challenge can measure. `run.*` resets each run; `life.*` is lifetime. */
export type ChallengeMetric =
  | 'run.evolutions'
  | 'run.maxDepth'
  | 'run.eaten'
  | 'run.time'
  | 'run.predatorsEaten'
  | 'run.stage'
  | 'run.stings'
  | 'run.score'
  | 'run.powerups'
  | 'run.bestCombo'
  | 'run.chest'
  | 'run.forms'
  | 'life.forms'
  | 'life.phantom'
  | 'life.pearls'
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
  { id: 'deep-diver', title: 'Deep Diver', desc: 'Reach the Abyss.', metric: 'run.maxDepth', goal: ZONES_BY_ID.abyss.top, reward: 'trait:seed-glow' },
  { id: 'tide-rider', title: 'Tide Rider', desc: 'Survive for 3 minutes in a single run.', metric: 'run.time', goal: 180, reward: 'trait:seed-sting' },
  { id: 'stinger', title: 'Nettle Dance', desc: 'Sting 3 hunters in a single run.', metric: 'run.stings', goal: 3, reward: 'skin:nettle' },
  { id: 'naturalist', title: 'Naturalist', desc: 'Discover 10 species in the Field Guide.', metric: 'life.discovered', goal: 10, reward: 'skin:aurora' },
  { id: 'reversal', title: 'Turn the Tables', desc: 'Grow big enough to eat a hunter.', metric: 'run.predatorsEaten', goal: 1, reward: 'skin:abyssal' },
  { id: 'apex', title: 'Apex Jelli', desc: 'Reach Apex size in a single run.', metric: 'run.stage', goal: 4, reward: 'skin:gilded' },
  { id: 'rare-sighting', title: 'Rare Sighting', desc: 'Discover a rare species.', metric: 'life.rareDiscovered', goal: 1 },
  { id: 'legend', title: 'Living Legend', desc: 'Witness a legendary species.', metric: 'life.legendaryDiscovered', goal: 1 },
  { id: 'power-surge', title: 'Power Surge', desc: 'Collect 3 power-ups in a single run.', metric: 'run.powerups', goal: 3 },
  { id: 'high-tide', title: 'High Tide', desc: 'Score 12,000 in a single run.', metric: 'run.score', goal: 12000 },
  { id: 'chain', title: 'Chain Reaction', desc: 'Chain 6 catches, each within 3 seconds of the last.', metric: 'run.bestCombo', goal: 6, reward: 'skin:ember' },
  { id: 'pearl-diver', title: 'Pearl Diver', desc: 'Collect 30 pearls across your dives.', metric: 'life.pearls', goal: 30, reward: 'skin:pearl' },
  { id: 'pirate-gold', title: 'Pirate Gold', desc: 'Open the chest in the sunken pirate ship.', metric: 'run.chest', goal: 1, reward: 'skin:doubloon' },
  { id: 'chain-master', title: 'Unbroken', desc: 'Chain 12 catches without a break.', metric: 'run.bestCombo', goal: 12 },
  { id: 'first-form', title: 'What You Eat', desc: 'Take on a new form by eating a hunter or a rare creature.', metric: 'life.forms', goal: 1 },
  { id: 'chimera', title: 'Chimera', desc: 'Wear 3 forms in a single run.', metric: 'run.forms', goal: 3 },
  { id: 'phantom', title: 'Into the Light', desc: 'See the Phantom with your own light.', metric: 'life.phantom', goal: 1, reward: 'skin:phantom' },
];
