import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveStore, defaultSave, sanitizeSave, type KeyValueStore } from '../src/persistence/save';

class MemoryKV implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe('save data', () => {
  it('round-trips through storage', () => {
    const kv = new MemoryKV();
    const store = new SaveStore(kv);
    const save = defaultSave();
    save.best.score = 1234;
    save.discovered['glimmer-krill'] = { seen: 3, eaten: 9, firstSeen: 1 };
    save.unlocks.push('skin:coral');
    save.selected.skin = 'coral';
    store.save(save);
    const loaded = new SaveStore(kv).load();
    expect(loaded.best.score).toBe(1234);
    expect(loaded.discovered['glimmer-krill'].eaten).toBe(9);
    expect(loaded.selected.skin).toBe('coral');
  });

  it('returns defaults for missing or corrupted data', () => {
    const kv = new MemoryKV();
    expect(new SaveStore(kv).load()).toEqual(defaultSave());
    kv.setItem(SAVE_KEY, '{not json');
    expect(new SaveStore(kv).load()).toEqual(defaultSave());
    kv.setItem(SAVE_KEY, '"a string"');
    expect(new SaveStore(kv).load()).toEqual(defaultSave());
  });

  it('drops unknown species, challenges, unlocks and bad numbers', () => {
    const s = sanitizeSave({
      discovered: { 'glimmer-krill': { seen: 'x', eaten: -5 }, dragon: { seen: 1 } },
      challenges: { 'first-bloom': 5, fake: 1 },
      unlocks: ['skin:coral', 'skin:rainbow', 'trait:seed-glow', 42],
      best: { score: Infinity, mass: 50 },
      settings: { volume: 4, muted: 'yes', reducedMotion: true },
      selected: { skin: 'gilded', trait: 'seed-glow' },
    });
    expect(Object.keys(s.discovered)).toEqual(['glimmer-krill']);
    expect(s.discovered['glimmer-krill']).toEqual({ seen: 1, eaten: 0, firstSeen: 0 });
    expect(Object.keys(s.challenges)).toEqual(['first-bloom']);
    expect(s.unlocks.sort()).toEqual(['skin:coral', 'skin:moon', 'trait:seed-glow']);
    expect(s.best.score).toBe(0);
    expect(s.settings.volume).toBe(1);
    expect(s.settings.muted).toBe(false);
    expect(s.settings.reducedMotion).toBe(true);
    // Gilded is not unlocked, so the selection falls back to default.
    expect(s.selected.skin).toBe('moon');
    expect(s.selected.trait).toBe('seed-glow');
  });

  it('keeps working in memory when storage throws', () => {
    const broken: KeyValueStore = {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('quota');
      },
    };
    const store = new SaveStore(broken);
    const save = defaultSave();
    save.best.score = 77;
    store.save(save);
    expect(store.persistent).toBe(false);
    expect(store.load().best.score).toBe(77);
  });
});
