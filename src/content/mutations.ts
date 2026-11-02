import type { PathId, PlayerStats } from './types';

/**
 * Mutations: what the octopus becomes. Each time the growth meter fills, three are offered and
 * one is chosen. Every mutation changes how the octopus plays, most carry a cost, and every one
 * changes how it looks. What it has been eating, and the personality it is growing into, decide
 * which ones turn up.
 */
export type MutationId =
  | 'jet-siphon'
  | 'webbed-arms'
  | 'twin-jet'
  | 'long-arms'
  | 'strong-suckers'
  | 'hooked-suckers'
  | 'crushing-beak'
  | 'ink-sac'
  | 'venom'
  | 'blue-rings'
  | 'chromatophores'
  | 'regrowth'
  | 'keen-eyes'
  | 'lateral-line'
  | 'bioluminescence'
  | 'deep-body'
  | 'abyssal-heart'
  | 'gigantism';

export type MutationCategory = 'movement' | 'hunting' | 'defense' | 'sensory' | 'special';

export interface MutationDef {
  id: MutationId;
  name: string;
  category: MutationCategory;
  /** The kind of food that tends to bring it on; null for plain food (or none). */
  affinity: PathId | null;
  /** What it does. */
  desc: string;
  /** What it costs, if anything. */
  cost?: string;
  /** How it shows on the body, for the Journal. */
  look: string;
  add?: Partial<PlayerStats>;
  mul?: Partial<PlayerStats>;
  requires?: MutationId;
  excludes?: MutationId[];
}

export const CATEGORY: Record<MutationCategory, { name: string; color: string }> = {
  movement: { name: 'Movement', color: '#5ee0d0' },
  hunting: { name: 'Hunting', color: '#ff9a76' },
  defense: { name: 'Defense', color: '#c59bff' },
  sensory: { name: 'Senses', color: '#ffd27a' },
  special: { name: 'Specialization', color: '#7fe3ff' },
};

export const MUTATIONS: MutationDef[] = [
  {
    id: 'jet-siphon',
    name: 'Jet Siphon',
    category: 'movement',
    affinity: 'surge',
    desc: 'Jets push a third harder and recharge faster.',
    look: 'A broad siphon funnel at the side of the mantle.',
    mul: { burstPower: 1.3, burstCooldown: 0.78 },
  },
  {
    id: 'webbed-arms',
    name: 'Webbed Arms',
    category: 'movement',
    affinity: 'surge',
    desc: 'Swim faster and ride currents instead of fighting them.',
    cost: 'Webbing shortens your lash.',
    look: 'A translucent web between the arms.',
    add: { currentControl: 0.6 },
    mul: { speed: 1.13, lashReach: 0.88 },
  },
  {
    id: 'twin-jet',
    name: 'Twin Jet',
    category: 'movement',
    affinity: 'surge',
    desc: 'Store a second jet.',
    cost: 'The extra siphon weighs you down a little.',
    look: 'A second siphon.',
    requires: 'jet-siphon',
    add: { burstCharges: 1 },
    mul: { speed: 0.95 },
  },
  {
    id: 'long-arms',
    name: 'Long Arms',
    category: 'hunting',
    affinity: null,
    desc: 'Arms reach a third further, and so does the lash.',
    cost: 'More arm to move: jets recharge slower.',
    look: 'Long, slender arms.',
    mul: { armReach: 1.3, lashReach: 1.15, burstCooldown: 1.15 },
  },
  {
    id: 'strong-suckers',
    name: 'Strong Suckers',
    category: 'hunting',
    affinity: null,
    desc: 'Prey can barely wriggle free, and one more arm hunts at once.',
    look: 'Big, rimmed suckers.',
    excludes: ['hooked-suckers'],
    add: { extraArms: 1 },
    mul: { grip: 0.35 },
  },
  {
    id: 'hooked-suckers',
    name: 'Hooked Suckers',
    category: 'hunting',
    affinity: 'sting',
    desc: 'Hooks in every sucker: the lash strikes much faster and holds well.',
    cost: 'Hooks shred some of each meal.',
    look: 'Curved hooks inside the suckers.',
    excludes: ['strong-suckers'],
    mul: { lashSpeed: 1.45, grip: 0.55, foodMult: 0.9 },
  },
  {
    id: 'crushing-beak',
    name: 'Crushing Beak',
    category: 'hunting',
    affinity: 'sting',
    desc: 'Meals feed you more, and clams can be cracked even when shut.',
    look: 'A heavy beak at the heart of the arms.',
    add: { crack: 1 },
    mul: { foodMult: 1.3 },
  },
  {
    id: 'ink-sac',
    name: 'Ink Sac',
    category: 'defense',
    affinity: 'sting',
    desc: 'Every jet leaves a cloud of ink. Hunters lose you inside it.',
    look: 'A dark ink sac glimpsed through the mantle.',
    add: { ink: 1 },
  },
  {
    id: 'venom',
    name: 'Venom',
    category: 'defense',
    affinity: 'sting',
    desc: 'The first hunter that bites is stunned. Recharges over time.',
    look: 'Violet-tipped arms.',
    add: { stingCooldown: 11, stingStun: 2.2 },
  },
  {
    id: 'blue-rings',
    name: 'Blue Rings',
    category: 'defense',
    affinity: 'sting',
    desc: 'Warning colors: hunters not much bigger than you leave you alone.',
    cost: 'Prey see you coming from further away.',
    look: 'Electric blue rings across the skin.',
    add: { warning: 1 },
    mul: { preyWary: 1.5 },
  },
  {
    id: 'chromatophores',
    name: 'Chromatophores',
    category: 'defense',
    affinity: 'glow',
    desc: 'Hold almost still and your skin matches your surroundings: hunters can’t see you.',
    look: 'Skin that shifts color and texture.',
    add: { camo: 1 },
  },
  {
    id: 'regrowth',
    name: 'Regrowth',
    category: 'defense',
    affinity: null,
    desc: 'Once in a while, a bite takes an arm instead of you. It grows back.',
    look: 'A stub that regrows after a close call.',
    add: { regrow: 1 },
  },
  {
    id: 'keen-eyes',
    name: 'Keen Eyes',
    category: 'sensory',
    affinity: 'glow',
    desc: 'See further in the dark, and spot rare life more often.',
    look: 'Bigger eyes with golden irises.',
    add: { lightRadius: 110 },
    mul: { rareChance: 1.5 },
  },
  {
    id: 'lateral-line',
    name: 'Feeler Skin',
    category: 'sensory',
    affinity: 'glow',
    desc: 'Sense rare creatures nearby, and learn more from every discovery.',
    look: 'Fine sensory papillae over the mantle.',
    add: { rareCompass: 1 },
    mul: { discoveryBonus: 1.6 },
  },
  {
    id: 'bioluminescence',
    name: 'Bioluminescence',
    category: 'special',
    affinity: 'glow',
    desc: 'Your own light: brighter in the dark, and small prey drift toward it.',
    cost: 'Hunters notice you from further away.',
    look: 'Glowing photophores along the arms.',
    add: { lightRadius: 150, magnet: 70 },
    mul: { detectMult: 1.2 },
  },
  {
    id: 'deep-body',
    name: 'Deep Body',
    category: 'special',
    affinity: null,
    desc: 'A body built for pressure: swim two biomes deeper.',
    cost: 'A denser body swims a little slower.',
    look: 'A thicker, darker mantle.',
    add: { depthTolerance: 2 },
    mul: { speed: 0.94 },
  },
  {
    id: 'abyssal-heart',
    name: 'Abyssal Heart',
    category: 'special',
    affinity: null,
    desc: 'Nothing is too deep: no pressure limit at all, and a little light of your own.',
    look: 'A heart that glows through the mantle.',
    requires: 'deep-body',
    add: { depthTolerance: 2, lightRadius: 60 },
  },
  {
    id: 'gigantism',
    name: 'Gigantism',
    category: 'special',
    affinity: null,
    desc: 'Grow a quarter bigger: eat bigger prey, and fewer hunters can threaten you.',
    cost: 'Slower, easier to spot, and too big for tight gaps.',
    look: 'A bigger body overall.',
    mul: { sizeMult: 1.25, speed: 0.9, detectMult: 1.25 },
  },
];

export const MUTATIONS_BY_ID = Object.fromEntries(MUTATIONS.map((m) => [m.id, m])) as Record<MutationId, MutationDef>;

export function isMutationId(v: unknown): v is MutationId {
  return typeof v === 'string' && v in MUTATIONS_BY_ID;
}

/** Whether a mutation can still be offered to an octopus that already has `owned`. */
export function canTake(id: MutationId, owned: readonly MutationId[]): boolean {
  const m = MUTATIONS_BY_ID[id];
  if (owned.includes(id)) return false;
  if (m.requires && !owned.includes(m.requires)) return false;
  if (m.excludes?.some((x) => owned.includes(x))) return false;
  return owned.every((o) => !MUTATIONS_BY_ID[o].excludes?.includes(id));
}
