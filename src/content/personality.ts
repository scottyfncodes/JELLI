import type { PlayerStats } from './types';
import type { MutationCategory } from './mutations';

/**
 * Personality: nobody picks it. It grows out of how you play, a little in every dive and a little
 * across all of them, until the octopus has a character of its own. It shows in how the octopus
 * idles and looks about, lends a small edge, and leans the mutations it is offered.
 */
export type PersonalityId = 'curious' | 'aggressive' | 'cautious' | 'playful' | 'resourceful';

export interface PersonalityDef {
  id: PersonalityId;
  name: string;
  /** How it shows, said about the octopus. */
  line: string;
  color: string;
  /** The small edge it lends. */
  perk: string;
  add?: Partial<PlayerStats>;
  mul?: Partial<PlayerStats>;
  /** The kind of mutation it leans toward. */
  leans: MutationCategory;
}

export const PERSONALITIES: Record<PersonalityId, PersonalityDef> = {
  curious: {
    id: 'curious',
    name: 'Curious',
    line: 'It wants to see everything.',
    color: '#ffd27a',
    perk: 'Rare life turns up more often.',
    mul: { rareChance: 1.25 },
    leans: 'sensory',
  },
  aggressive: {
    id: 'aggressive',
    name: 'Bold',
    line: 'It hunts first and wonders later.',
    color: '#ff8a6a',
    perk: 'The lash strikes a little faster.',
    mul: { lashSpeed: 1.12 },
    leans: 'hunting',
  },
  cautious: {
    id: 'cautious',
    name: 'Cautious',
    line: 'It keeps to cover and watches.',
    color: '#9fb4ff',
    perk: 'Hunters notice it a little later.',
    mul: { detectMult: 0.88 },
    leans: 'defense',
  },
  playful: {
    id: 'playful',
    name: 'Playful',
    line: 'It turns everything into a game.',
    color: '#ff9fd8',
    perk: 'Pearls drift toward it.',
    add: { pearlMagnet: 60 },
    leans: 'movement',
  },
  resourceful: {
    id: 'resourceful',
    name: 'Resourceful',
    line: 'It finds a use for everything.',
    color: '#7dffb9',
    perk: 'Every meal feeds it a little more.',
    mul: { foodMult: 1.1 },
    leans: 'special',
  },
};

export const PERSONALITY_ORDER: PersonalityId[] = ['curious', 'aggressive', 'cautious', 'playful', 'resourceful'];

export type Personality = Record<PersonalityId, number>;

export function emptyPersonality(): Personality {
  return { curious: 0, aggressive: 0, cautious: 0, playful: 0, resourceful: 0 };
}

/** How much a trait must lead by before it counts as the octopus's character. */
export const PERSONALITY_MIN = 14;
export const PERSONALITY_LEAD = 1.25;

/** The trait that has clearly emerged from these scores, or null while it is still forming. */
export function dominant(p: Personality): PersonalityId | null {
  const sorted = [...PERSONALITY_ORDER].sort((a, b) => p[b] - p[a]);
  const [top, next] = sorted;
  if (p[top] < PERSONALITY_MIN) return null;
  if (p[top] < p[next] * PERSONALITY_LEAD) return null;
  return top;
}

/** Lifetime scores fade a little each dive, so a changed playstyle changes the octopus. */
export function carryPersonality(lifetime: Personality, run: Personality): Personality {
  const out = emptyPersonality();
  for (const id of PERSONALITY_ORDER) out[id] = Math.round((lifetime[id] * 0.7 + run[id]) * 10) / 10;
  return out;
}
