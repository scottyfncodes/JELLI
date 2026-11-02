import { mulberry32 } from '../core/math';

/**
 * Every octopus is somebody. Each one hatches with a name, a generation in its line, and a
 * seed that gives it looks of its own: where its spots fall, how big its eyes are, the shape
 * of its head and the color of its irises.
 */
export interface OctopusId {
  name: string;
  /** 1 for the first octopus ever hatched in this save, then one more each dive. */
  generation: number;
  seed: number;
}

export const OCTOPUS_NAMES = [
  'Olive', 'Pip', 'Marlowe', 'Bramble', 'Tuppence', 'Fennel', 'Juniper', 'Mungo', 'Clementine', 'Barnaby',
  'Percival', 'Noodle', 'Mabel', 'Ottoline', 'Pickles', 'Rosalind', 'Cuthbert', 'Saffron', 'Biscuit', 'Wendell',
  'Ophelia', 'Gus', 'Delphine', 'Nibs', 'Horatio', 'Plum', 'Sprocket', 'Maple', 'Thaddeus', 'Dot',
  'Winifred', 'Lumpkin', 'Ignatius', 'Marzipan', 'Cosmo', 'Hettie', 'Bartholomew', 'Quince', 'Ziggy', 'Agatha',
  'Pudding', 'Ferdinand', 'Wren', 'Albertine', 'Crumpet', 'Ludo', 'Peregrine', 'Tansy', 'Oswald', 'Figaro',
  'Henrietta', 'Moss', 'Archibald', 'Bunty', 'Leopold', 'Truffle', 'Esme', 'Rumpus', 'Gertrude', 'Waffles',
];

/** A fresh octopus. Names don't repeat back to back down a line. */
export function hatchOctopus(generation: number, seed: number, previous?: string): OctopusId {
  const rng = mulberry32(seed >>> 0);
  let name = OCTOPUS_NAMES[Math.floor(rng() * OCTOPUS_NAMES.length)];
  if (name === previous) name = OCTOPUS_NAMES[(OCTOPUS_NAMES.indexOf(name) + 7) % OCTOPUS_NAMES.length];
  return { name, generation: Math.max(1, Math.floor(generation)), seed: seed >>> 0 };
}

/** The octopus after this one: the next generation, with a new name and new looks. */
export function nextOctopus(current: OctopusId, seed = Math.floor(Math.random() * 2 ** 31)): OctopusId {
  return hatchOctopus(current.generation + 1, seed, current.name);
}

/** How this particular octopus looks, from its seed. */
export interface OctoVariant {
  /** Spot layout seed. */
  spots: number;
  /** Eye size and head height multipliers. */
  eye: number;
  mantle: number;
  /** Iris colors (inner, outer). */
  iris: [string, string];
  /** How many freckles round the eyes. */
  freckles: number;
}

const IRISES: [string, string][] = [
  ['#e8a050', '#8a4a20'],
  ['#ffd27a', '#b8661f'],
  ['#9fe0a0', '#3a7a4a'],
  ['#ffb08a', '#a0402a'],
  ['#c6a6ff', '#5a3a9a'],
];

export function variantFor(seed: number): OctoVariant {
  const rng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  return {
    spots: Math.floor(rng() * 1e6),
    eye: 0.92 + rng() * 0.2,
    mantle: 0.93 + rng() * 0.17,
    iris: IRISES[Math.floor(rng() * IRISES.length)],
    freckles: Math.floor(rng() * 4),
  };
}
