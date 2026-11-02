import type { PlayerStats, ZoneId } from './types';

/**
 * Places worth finding: one landmark per biome, each set off the straight line down so it
 * takes a detour to see, and each guarding a treasure that asks something of the player.
 */
export type LandmarkId = 'galleon' | 'kelp-cathedral' | 'lantern-grove' | 'whale-fall' | 'drowned-gate' | 'vent-field' | 'crystal-heart';
export type TreasureId = 'captains-compass' | 'mother-pearl' | 'lantern-seed' | 'whalebone-flute' | 'glyph-tablet' | 'vent-opal' | 'dream-shard';

export interface LandmarkDef {
  id: LandmarkId;
  name: string;
  zone: ZoneId;
  /** World depth range it can rest in (the galleon places itself). */
  minY: number;
  maxY: number;
  /** How close the jelly must come to count it as found. */
  findRadius: number;
  color: string;
  /** Field notes once found. */
  blurb: string;
  /** Field notes before it has ever been found. */
  hint: string;
  treasure: TreasureId;
}

export interface TreasureDef {
  id: TreasureId;
  name: string;
  landmark: LandmarkId;
  score: number;
  color: string;
  blurb: string;
  /** How it is won, for the Field Guide before it has been. */
  hint: string;
  /** Carried as a relic, what it lends every Jelli after. */
  relic: { desc: string; add?: Partial<PlayerStats>; mul?: Partial<PlayerStats> };
}

/** How many relics a Jelli can carry into a dive. */
export const RELIC_SLOTS = 2;

export const LANDMARKS: LandmarkDef[] = [
  {
    id: 'galleon',
    name: 'The Sunken Galleon',
    zone: 'shallows',
    minY: 1150,
    maxY: 1400,
    findRadius: 520,
    color: '#ffd27a',
    blurb: 'A pirate ship settled on a ledge in the sunlight, its chest spilled onto the sand beside the bow.',
    hint: 'Something wooden rests on a ledge in the lower shallows.',
    treasure: 'captains-compass',
  },
  {
    id: 'kelp-cathedral',
    name: 'The Kelp Cathedral',
    zone: 'shallows',
    minY: 650,
    maxY: 1500,
    findRadius: 420,
    color: '#9df2c0',
    blurb: 'Kelp grown so tall and close it makes a hall of green light. Hunters lose you among the stalks.',
    hint: 'Near one wall of the shallows, the kelp grows into something like a building.',
    treasure: 'mother-pearl',
  },
  {
    id: 'lantern-grove',
    name: 'The Lantern Grove',
    zone: 'gardens',
    minY: 2300,
    maxY: 4000,
    findRadius: 460,
    color: '#7dffb9',
    blurb: 'A ring of giant glow pods around a hollow. Light enough of them and the grove gives something back.',
    hint: 'Somewhere in the Glow Gardens, the pods grow in a circle.',
    treasure: 'lantern-seed',
  },
  {
    id: 'whale-fall',
    name: 'The Whale Fall',
    zone: 'twilight',
    minY: 5000,
    maxY: 6900,
    findRadius: 520,
    color: '#cfd8ff',
    blurb: 'The bones of a whale on a ledge in the blue, picked clean and glowing with the small life that lives on them.',
    hint: 'Something enormous died in the Twilight Drop. Its bones are still there.',
    treasure: 'whalebone-flute',
  },
  {
    id: 'drowned-gate',
    name: 'The Drowned Gate',
    zone: 'forgotten',
    minY: 8000,
    maxY: 10200,
    findRadius: 520,
    color: '#5ee0b0',
    blurb: 'Two carved columns and a lintel, standing in open water. The glyphs wake when something swims between them.',
    hint: 'Among the ruins stands a gate to nowhere. What happens if you pass through?',
    treasure: 'glyph-tablet',
  },
  {
    id: 'vent-field',
    name: 'The Vent Field',
    zone: 'abyss',
    minY: 11400,
    maxY: 14000,
    findRadius: 560,
    color: '#ff9a5a',
    blurb: 'Black smokers breathing heat into the Abyss. Their plumes throw you upward; the treasure lies at their roots.',
    hint: 'Warm water rises from somewhere in the Abyss.',
    treasure: 'vent-opal',
  },
  {
    id: 'crystal-heart',
    name: 'The Crystal Heart',
    zone: 'hadal',
    minY: 15400,
    maxY: 17600,
    findRadius: 600,
    color: '#ff6fae',
    blurb: 'A crystal the size of a reef, beating slowly with red light. Touching it is like hearing a very old song.',
    hint: 'Below six thousand meters, something is beating.',
    treasure: 'dream-shard',
  },
];

export const TREASURES: TreasureDef[] = [
  {
    id: 'captains-compass',
    name: 'Captain’s Compass',
    landmark: 'galleon',
    score: 0,
    color: '#ffd27a',
    blurb: 'Brass gone green. It still points, but never north.',
    hint: 'Open the galleon’s chest.',
    relic: { desc: 'Places glint at the screen edge from twice as far.', mul: { placeSense: 2 } },
  },
  {
    id: 'mother-pearl',
    name: 'Mother Pearl',
    landmark: 'kelp-cathedral',
    score: 900,
    color: '#fff0fa',
    blurb: 'A pearl the size of a fist, grown slowly in the green dark at the heart of the kelp.',
    hint: 'Find the heart of the Kelp Cathedral.',
    relic: { desc: 'Pearls drift to you from nearby.', add: { pearlMagnet: 90 } },
  },
  {
    id: 'lantern-seed',
    name: 'Lantern Seed',
    landmark: 'lantern-grove',
    score: 1100,
    color: '#7dffb9',
    blurb: 'A seed that glows on its own. Whatever grows from it will be bright.',
    hint: 'Light three of the Lantern Grove’s pods.',
    relic: { desc: 'Your own light reaches further in the dark.', add: { lightRadius: 70 } },
  },
  {
    id: 'whalebone-flute',
    name: 'Whalebone Flute',
    landmark: 'whale-fall',
    score: 1400,
    color: '#e6ecff',
    blurb: 'A hollow bone that hums when water runs through it, in a note only whales would know.',
    hint: 'Slip inside the whale’s ribs.',
    relic: { desc: 'Your lash reaches a fifth further.', mul: { lashReach: 1.2 } },
  },
  {
    id: 'glyph-tablet',
    name: 'Glyph Tablet',
    landmark: 'drowned-gate',
    score: 1800,
    color: '#5ee0b0',
    blurb: 'Carved stone that lights up at a touch. The same glyphs are on the gate. Nobody can read them.',
    hint: 'Swim through the Drowned Gate.',
    relic: { desc: 'Your lash strikes a third faster.', mul: { lashSpeed: 1.35 } },
  },
  {
    id: 'vent-opal',
    name: 'Vent Opal',
    landmark: 'vent-field',
    score: 2400,
    color: '#ff9a5a',
    blurb: 'A stone that formed in water hot enough to glow. It is still warm.',
    hint: 'Reach the roots of the tallest smoker.',
    relic: { desc: 'Ride currents faster, and fight them better.', add: { currentControl: 0.5 } },
  },
  {
    id: 'dream-shard',
    name: 'Dream Shard',
    landmark: 'crystal-heart',
    score: 3200,
    color: '#ff6fae',
    blurb: 'A splinter of the Crystal Heart. It beats in time with yours.',
    hint: 'Touch the Crystal Heart.',
    relic: { desc: 'Your burst recharges faster.', mul: { burstCooldown: 0.82 } },
  },
];

export const LANDMARKS_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l])) as Record<LandmarkId, LandmarkDef>;
export const TREASURES_BY_ID = Object.fromEntries(TREASURES.map((t) => [t.id, t])) as Record<TreasureId, TreasureDef>;

export function isLandmarkId(v: unknown): v is LandmarkId {
  return typeof v === 'string' && v in LANDMARKS_BY_ID;
}

export function isTreasureId(v: unknown): v is TreasureId {
  return typeof v === 'string' && v in TREASURES_BY_ID;
}

/** Rare moments a dive can bring. */
export type EncounterId = 'bloom' | 'migration' | 'whale';

export const ENCOUNTERS: Record<EncounterId, { name: string; line: string; color: string }> = {
  bloom: { name: 'A bloom', line: 'The water lights up around you', color: '#9dff8a' },
  migration: { name: 'A migration', line: 'A great school is passing through', color: '#9fd8ff' },
  whale: { name: 'The Lantern Whale', line: 'Something enormous is passing', color: '#7fe3ff' },
};

export function isEncounterId(v: unknown): v is EncounterId {
  return typeof v === 'string' && v in ENCOUNTERS;
}
