import { describe, expect, it } from 'vitest';
import { World, type Creature } from '../src/sim/world';
import { SPECIES, SPECIES_BY_ID } from '../src/content/species';
import { BASE_STATS, computeStats, dietPath, emptyDiet, emptyTiers } from '../src/content/evolutions';
import { FORMS, FORM_BY_SOURCE, FORM_ORDER } from '../src/content/forms';
import { EVOLUTION_FOOD } from '../src/content/progression';
import { applyRun, emptyRunStats, mystery } from '../src/core/progress';
import { defaultSave, sanitizeSave } from '../src/persistence/save';
import { mulberry32 } from '../src/core/math';

const idle = { ax: 0, ay: 0, burst: false };

function makeWorld(opts: ConstructorParameters<typeof World>[0] = {}) {
  const w = new World({ seed: 7, rng: mulberry32(42), ...opts });
  w.setView(220, 420);
  return w;
}

function feed(w: World, c: Creature, seconds = 3) {
  for (let i = 0; i < seconds * 60 && !c.dead; i++) w.update(1 / 60, idle);
}

/** Feeds one of a species right under the bell, grown big enough to eat it. */
function eatOne(w: World, id: string) {
  const p = w.player;
  const def = SPECIES_BY_ID[id];
  p.mass = 320;
  p.r = Math.max(p.r, def.radius * 1.4);
  const c = w.spawn(def, p.x + 2, p.y);
  c.r = c.baseR = def.radius;
  feed(w, c);
  return c;
}

describe('diet steers evolution', () => {
  it('evolves along whichever path the jelly ate most of', () => {
    expect(dietPath({ glow: 4, surge: 9, sting: 2 }, emptyTiers())).toBe('surge');
    expect(dietPath({ glow: 4, surge: 9, sting: 2 }, { glow: 0, surge: 3, sting: 0 })).toBe('glow');
  });

  it('plain plankton rounds out the least-grown path, and a maxed jelly has nowhere to go', () => {
    expect(dietPath(emptyDiet(), { glow: 2, surge: 0, sting: 1 })).toBe('surge');
    expect(dietPath(emptyDiet(), { glow: 3, surge: 3, sting: 3 })).toBeNull();
  });

  it('a meal of puffers turns into a Sting evolution', () => {
    const w = makeWorld();
    const p = w.player;
    w.creatures.length = 0;
    p.food = EVOLUTION_FOOD[0] - 1;
    p.r = 30;
    feed(w, w.spawn(SPECIES_BY_ID['puffer-pebble'], p.x + 2, p.y));
    expect(p.tiers).toEqual({ glow: 0, surge: 0, sting: 1 });
  });

  it('plain krill fills the meter without tipping the scales', () => {
    const w = makeWorld();
    w.creatures.length = 0;
    feed(w, w.spawn(SPECIES_BY_ID['glimmer-krill'], w.player.x + 2, w.player.y));
    expect(w.player.diet).toEqual(emptyDiet());
    expect(w.player.food).toBeGreaterThan(0);
    expect(w.dietLead()).toBeNull();
  });

  it('every path can be fed in every zone', () => {
    for (const zone of ['shallows', 'gardens', 'twilight', 'forgotten', 'abyss', 'hadal'] as const) {
      const diets = new Set(SPECIES.filter((s) => s.zones.includes(zone) && s.weight > 0 && s.diet).map((s) => s.diet));
      expect([...diets].sort(), zone).toEqual(['glow', 'sting', 'surge']);
    }
  });
});

describe('forms', () => {
  it('every form comes from a real species, and only one form per species', () => {
    for (const id of FORM_ORDER) {
      expect(SPECIES_BY_ID[FORMS[id].source], id).toBeDefined();
      expect(FORM_BY_SOURCE[FORMS[id].source]).toBe(id);
    }
  });

  it('eating a Lure Angler grows its lure: small prey are drawn in', () => {
    const w = makeWorld();
    w.creatures.length = 0;
    const before = w.player.stats.magnet;
    eatOne(w, 'lure-angler');
    expect(w.player.forms).toEqual(['lure']);
    expect(w.run.forms).toEqual(['lure']);
    expect(w.player.stats.magnet).toBeGreaterThan(before);
    expect(w.events.some((e) => e.type === 'form' && e.id === 'lure')).toBe(true);
    // A second angler doesn't stack the same form.
    eatOne(w, 'lure-angler');
    expect(w.player.forms).toEqual(['lure']);
  });

  it('forms stack on top of evolutions', () => {
    const stats = computeStats({ glow: 1, surge: 0, sting: 0 }, BASE_STATS, ['lantern', 'razor']);
    expect(stats.lightRadius).toBe(BASE_STATS.lightRadius + 120 + 110);
    expect(stats.extraArms).toBe(1);
  });

  it('the Razor Fringe lets one more arm hunt at once', () => {
    const w = makeWorld({ forms: ['razor'] });
    const p = w.player;
    w.creatures.length = 0;
    for (let i = 0; i < 3; i++) w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x - 12 + i * 12, p.y - 22).slip = 0;
    let busy = 0;
    for (let i = 0; i < 20; i++) {
      w.update(1 / 60, idle);
      busy = Math.max(busy, w.tentacles.filter((t) => t.phase === 'reach' || t.phase === 'grab' || t.phase === 'pull' || t.phase === 'eat').length);
    }
    expect(busy).toBe(2);
  });

  it('the Gulper Maw makes every meal feed more', () => {
    const plain = makeWorld();
    const maw = makeWorld({ forms: ['maw'] });
    for (const w of [plain, maw]) {
      w.creatures.length = 0;
      feed(w, w.spawn(SPECIES_BY_ID['sea-butterfly'], w.player.x + 2, w.player.y));
    }
    expect(maw.player.food).toBeCloseTo(plain.player.food * 1.3);
  });

  it('the Gilded Spiral draws pearls in from a distance', () => {
    const w = makeWorld({ forms: ['gilded'] });
    const p = w.player;
    w.creatures.length = 0;
    w.pearls.length = 0;
    w.pearls.push({ x: p.x + 120, y: p.y, taken: false, seed: 0 });
    for (let i = 0; i < 120; i++) w.update(1 / 60, idle);
    expect(w.pearls[0].taken).toBe(true);
  });

  it('an inherited form is worn from the first moment of a run', () => {
    const w = makeWorld({ forms: ['lantern'] });
    expect(w.player.forms).toEqual(['lantern']);
    expect(w.run.forms).toEqual(['lantern']);
    expect(w.player.stats.lightRadius).toBe(BASE_STATS.lightRadius + 110);
  });

  it('the title-screen jelly never takes on forms or evolves', () => {
    const w = makeWorld({ demo: true });
    eatOne(w, 'razorfin');
    expect(w.player.forms).toEqual([]);
    expect(w.run.evolutions).toBe(0);
  });
});

describe('the Phantom', () => {
  function phantomWorld(glow: number) {
    const w = makeWorld({ tiers: { glow } });
    const p = w.player;
    p.y = 12400;
    p.invuln = 99;
    w.creatures.length = 0;
    const ph = w.spawn(SPECIES_BY_ID.phantom, p.x + 200, p.y + 150);
    return { w, ph };
  }

  it('only appears deep in the Abyss', () => {
    const w = makeWorld();
    w.player.y = 11000;
    expect(w.eligibleRares().some((d) => d.id === 'phantom')).toBe(false);
    w.player.y = 12500;
    expect(w.eligibleRares().some((d) => d.id === 'phantom')).toBe(true);
  });

  it('a dim jelly only glimpses it, once per dive', () => {
    const { w } = phantomWorld(0);
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(w.hasSeen('phantom')).toBe(false);
    expect(w.run.glimpsed).toEqual(['phantom']);
    expect(w.events.filter((e) => e.type === 'glimpse')).toHaveLength(1);
  });

  it('a bright enough jelly sees it and discovers it', () => {
    const { w } = phantomWorld(2);
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(w.hasSeen('phantom')).toBe(true);
  });

  it('a Lantern Belt can supply the light that Glow alone lacks', () => {
    const { w } = phantomWorld(1);
    for (let i = 0; i < 10; i++) w.update(1 / 60, idle);
    expect(w.hasSeen('phantom')).toBe(false);
    w.grantForm('lantern');
    for (let i = 0; i < 10; i++) w.update(1 / 60, idle);
    expect(w.hasSeen('phantom')).toBe(true);
  });

  it('cannot be eaten and is not despawned while its body is still near', () => {
    const { w, ph } = phantomWorld(0);
    w.player.r = 400;
    for (let i = 0; i < 60; i++) w.update(1 / 60, idle);
    expect(ph.dead).toBe(false);
    expect(w.creatures.includes(ph)).toBe(true);
  });
});

describe('lineage persistence', () => {
  it('the newest form passes on by default, and forms join the collection', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), forms: ['lantern' as const, 'razor' as const] };
    applyRun(save, run);
    expect(save.heirloom).toBe('razor');
    expect(save.forms.sort()).toEqual(['lantern', 'razor']);
  });

  it('a run without forms leaves nothing to inherit', () => {
    const save = defaultSave();
    save.heirloom = 'lure';
    applyRun(save, emptyRunStats());
    expect(save.heirloom).toBeNull();
  });

  it('counts wearing three forms in one run as Chimera', () => {
    const save = defaultSave();
    const out = applyRun(save, { ...emptyRunStats(), forms: ['lantern', 'razor', 'prism'] });
    expect(out.completed.some((c) => c.id === 'chimera')).toBe(true);
    expect(out.completed.some((c) => c.id === 'first-form')).toBe(true);
  });

  it('sanitizes forms, heirloom and glimpses', () => {
    const s = sanitizeSave({ forms: ['lure', 'nope', 'lure', 3], heirloom: 'ghost', glimpses: { phantom: 2, fake: 9, 'glass-squid': 'x' } });
    expect(s.forms).toEqual(['lure']);
    expect(s.heirloom).toBeNull();
    expect(s.glimpses).toEqual({ phantom: 2, 'glass-squid': 0 });
    expect(sanitizeSave({ heirloom: 'maw' }).heirloom).toBe('maw');
  });

  it('an old save without the new fields still loads', () => {
    const s = sanitizeSave({ best: { score: 10 } });
    expect(s.forms).toEqual([]);
    expect(s.heirloom).toBeNull();
    expect(s.glimpses).toEqual({});
  });
});

describe('something to wonder about', () => {
  it('a glimpse this run leads the results', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), glimpsed: ['phantom'] };
    expect(mystery(save, run)?.title).toBe('Something vast drifted past');
  });

  it('a past glimpse still haunts later runs until the Phantom is seen', () => {
    const save = defaultSave();
    save.glimpses.phantom = 3;
    expect(mystery(save, emptyRunStats())?.text).toContain('3 dives');
    save.discovered.phantom = { seen: 1, eaten: 0, firstSeen: 0 };
    expect(mystery(save, emptyRunStats())?.title).not.toContain('vast');
  });

  it('a hunter you met but never ate is the next thing to wonder about', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), seen: ['needlefin'] };
    expect(mystery(save, run)?.title).toBe('You’ve met the Needlefin');
  });
});
