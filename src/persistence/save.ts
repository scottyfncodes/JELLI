import { DEFAULT_UNLOCKS, SKINS_BY_ID, TRAITS_BY_ID, type UnlockId } from '../content/unlocks';
import { SPECIES_BY_ID } from '../content/species';
import { CHALLENGES } from '../content/challenges';

export const SAVE_KEY = 'jelli.save.v1';
export const SAVE_VERSION = 1;

export interface DiscoveryRecord {
  seen: number;
  eaten: number;
  firstSeen: number;
}

export interface Settings {
  volume: number;
  muted: boolean;
  /** null = follow the OS preference. */
  reducedMotion: boolean | null;
}

export interface SaveData {
  version: number;
  discovered: Record<string, DiscoveryRecord>;
  challenges: Record<string, number>;
  unlocks: UnlockId[];
  best: { score: number; mass: number; combo: number };
  stats: { runs: number; eaten: number; longest: number; pearls: number; chests: number };
  selected: { skin: string; trait: string | null };
  settings: Settings;
  tutorialDone: boolean;
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    discovered: {},
    challenges: {},
    unlocks: [...DEFAULT_UNLOCKS],
    best: { score: 0, mass: 0, combo: 0 },
    stats: { runs: 0, eaten: 0, longest: 0, pearls: 0, chests: 0 },
    selected: { skin: 'moon', trait: null },
    settings: { volume: 0.7, muted: false, reducedMotion: null },
    tutorialDone: false,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function isUnlockId(v: unknown): v is UnlockId {
  if (typeof v !== 'string') return false;
  if (v.startsWith('skin:')) return v.slice(5) in SKINS_BY_ID;
  if (v.startsWith('trait:')) return v.slice(6) in TRAITS_BY_ID;
  return false;
}

/** Turns anything (old, partial, corrupted) into a valid SaveData, keeping what is salvageable. */
export function sanitizeSave(raw: unknown): SaveData {
  const save = defaultSave();
  if (!isObj(raw)) return save;

  if (isObj(raw.discovered)) {
    for (const [id, rec] of Object.entries(raw.discovered)) {
      if (!(id in SPECIES_BY_ID) || !isObj(rec)) continue;
      save.discovered[id] = {
        seen: Math.floor(num(rec.seen, 1, 1)),
        eaten: Math.floor(num(rec.eaten, 0)),
        firstSeen: num(rec.firstSeen, 0),
      };
    }
  }

  if (isObj(raw.challenges)) {
    const valid = new Set(CHALLENGES.map((c) => c.id));
    for (const [id, at] of Object.entries(raw.challenges)) {
      if (valid.has(id)) save.challenges[id] = num(at, 0);
    }
  }

  if (Array.isArray(raw.unlocks)) {
    const set = new Set<UnlockId>(DEFAULT_UNLOCKS);
    for (const u of raw.unlocks) if (isUnlockId(u)) set.add(u);
    save.unlocks = [...set];
  }

  if (isObj(raw.best)) {
    save.best.score = Math.floor(num(raw.best.score, 0));
    save.best.mass = num(raw.best.mass, 0);
    save.best.combo = Math.floor(num(raw.best.combo, 0));
  }

  if (isObj(raw.stats)) {
    save.stats.runs = Math.floor(num(raw.stats.runs, 0));
    save.stats.eaten = Math.floor(num(raw.stats.eaten, 0));
    save.stats.longest = num(raw.stats.longest, 0);
    save.stats.pearls = Math.floor(num(raw.stats.pearls, 0));
    save.stats.chests = Math.floor(num(raw.stats.chests, 0));
  }

  if (isObj(raw.selected)) {
    const skin = raw.selected.skin;
    if (typeof skin === 'string' && save.unlocks.includes(`skin:${skin}`)) save.selected.skin = skin;
    const trait = raw.selected.trait;
    if (typeof trait === 'string' && save.unlocks.includes(`trait:${trait}`)) save.selected.trait = trait;
  }

  if (isObj(raw.settings)) {
    save.settings.volume = num(raw.settings.volume, 0.7, 0, 1);
    save.settings.muted = raw.settings.muted === true;
    const rm = raw.settings.reducedMotion;
    save.settings.reducedMotion = typeof rm === 'boolean' ? rm : null;
  }

  save.tutorialDone = raw.tutorialDone === true;
  return save;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Wraps a storage backend; falls back to memory when storage is missing or throws (private mode, quota). */
export class SaveStore {
  private memory: string | null = null;
  persistent: boolean;

  constructor(private kv: KeyValueStore | null) {
    this.persistent = kv !== null;
  }

  static fromBrowser(): SaveStore {
    try {
      const ls = globalThis.localStorage;
      const probe = '__jelli_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return new SaveStore(ls);
    } catch {
      return new SaveStore(null);
    }
  }

  load(): SaveData {
    let text: string | null = null;
    try {
      text = this.kv ? this.kv.getItem(SAVE_KEY) : this.memory;
    } catch {
      text = this.memory;
    }
    if (!text) return defaultSave();
    try {
      return sanitizeSave(JSON.parse(text));
    } catch {
      return defaultSave();
    }
  }

  save(data: SaveData): void {
    const text = JSON.stringify(data);
    this.memory = text;
    if (!this.kv) return;
    try {
      this.kv.setItem(SAVE_KEY, text);
    } catch {
      this.persistent = false;
    }
  }
}
