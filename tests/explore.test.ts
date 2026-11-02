import { describe, expect, it } from 'vitest';
import { EXPLORE, LASH, POD_LIGHT, World } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { LANDMARKS, TREASURES } from '../src/content/landmarks';
import { ZONES_BY_ID, zoneAt } from '../src/content/world';
import { applyRun, emptyRunStats } from '../src/core/progress';
import { defaultSave, sanitizeSave } from '../src/persistence/save';
import { mulberry32 } from '../src/core/math';
import { tentacleReach } from '../src/sim/rules';

const idle = { ax: 0, ay: 0, burst: false };

function makeWorld(seed = 7) {
  const w = new World({ seed, rng: mulberry32(42) });
  w.setView(220, 420);
  w.creatures.length = 0;
  w.player.invuln = 1e9;
  return w;
}

/** Moves the jelly into open water where nothing else is going on. */
function openWater(w: World, y = 600) {
  const p = w.player;
  p.x = w.width / 2;
  p.y = y;
  w.pods.length = 0;
  w.shelters.length = 0;
  w.pearls.length = 0;
  w.update(1 / 60, idle);
  w.events.length = 0;
}

describe('the lash', () => {
  it('strikes prey well beyond a casual snag and reels it in', () => {
    const w = makeWorld();
    openWater(w);
    const p = w.player;
    const snag = tentacleReach(p.r, 0);
    const c = w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x, p.y - snag * 1.45);
    c.stunned = 30;
    expect(w.lash(c.x, c.y, 10)).toBe('hit');
    expect(w.tentacles.some((t) => t.lash && t.target === c)).toBe(true);
    for (let i = 0; i < 240 && !c.dead; i++) w.update(1 / 60, idle);
    expect(c.dead).toBe(true);
    expect(w.run.lashes).toBe(1);
  });

  it('reports a target out of reach, and ignores taps on empty water', () => {
    const w = makeWorld();
    openWater(w);
    const p = w.player;
    const far = w.tentacleReach() * LASH.reach + p.r + 120;
    const c = w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + far, p.y);
    c.stunned = 30;
    expect(w.lash(c.x, c.y, 10)).toBe('far');
    expect(w.events.some((e) => e.type === 'lash' && !e.hit)).toBe(true);
    expect(w.lash(p.x - 90, p.y + 90, 5)).toBe('none');
  });

  it('can pluck a pearl and carries it back to the bell', () => {
    const w = makeWorld();
    openWater(w);
    const p = w.player;
    w.pearls.push({ x: p.x + w.tentacleReach() * 1.3, y: p.y - 10, taken: false, seed: 0 });
    expect(w.lash(w.pearls[0].x, w.pearls[0].y, 10)).toBe('hit');
    for (let i = 0; i < 240 && !w.pearls[0].taken; i++) w.update(1 / 60, idle);
    expect(w.pearls[0].taken).toBe(true);
    expect(w.run.pearls).toBe(1);
  });
});

describe('arms pluck pearls on their own', () => {
  it('reaches for a pearl within reach when there is no prey about', () => {
    const w = makeWorld();
    openWater(w);
    const p = w.player;
    w.pearls.push({ x: p.x, y: p.y - w.tentacleReach() * 0.8, taken: false, seed: 0 });
    for (let i = 0; i < 300 && !w.pearls[0].taken; i++) w.update(1 / 60, idle);
    expect(w.pearls[0].taken).toBe(true);
  });
});

describe('glow pods', () => {
  it('burst on touch, lend their light, and regrow', () => {
    const w = makeWorld();
    openWater(w, 3000);
    const p = w.player;
    const base = w.lightRadius();
    w.pods.push({ x: p.x, y: p.y, r: 9, regrow: 0, seed: 0, grove: false });
    w.update(1 / 60, idle);
    expect(w.pods[0].regrow).toBeGreaterThan(0);
    expect(p.glowT).toBeGreaterThan(POD_LIGHT - 0.1);
    expect(w.lightRadius()).toBeGreaterThan(base + 100);
    expect(w.events.some((e) => e.type === 'pod')).toBe(true);
    expect(w.run.pods).toBe(1);
  });
});

describe('shelters', () => {
  it('hide the jelly: a hunter that has noticed it loses track', () => {
    const w = makeWorld();
    openWater(w, 900);
    const p = w.player;
    const h = w.spawn(SPECIES_BY_ID.needlefin, p.x + 120, p.y);
    h.r = h.baseR = p.r * 3;
    h.state = 'notice';
    h.stateT = 5;
    w.shelters.push({ x: p.x, y: p.y, r: 140, kind: 'kelp', seed: 1 });
    w.update(1 / 60, idle);
    expect(p.hidden).toBe(true);
    expect(h.state).toBe('rest');
    expect(w.events.some((e) => e.type === 'hidden' && e.on)).toBe(true);
  });
});

describe('landmarks', () => {
  it('every biome has one, each resting in its own biome with a treasure', () => {
    const w = makeWorld();
    expect(w.landmarks.map((l) => l.def.id).sort()).toEqual(LANDMARKS.map((l) => l.id).sort());
    for (const lm of w.landmarks) expect(zoneAt(lm.y).id, lm.def.id).toBe(lm.def.zone);
    for (const t of TREASURES) expect(LANDMARKS.some((l) => l.treasure === t.id)).toBe(true);
  });

  it('places differ between dives', () => {
    const a = makeWorld(1).landmarks.find((l) => l.def.id === 'whale-fall')!;
    const b = makeWorld(2).landmarks.find((l) => l.def.id === 'whale-fall')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1);
  });

  it('are found by swimming near, and pay out their treasure once', () => {
    const w = makeWorld();
    const lm = w.landmarks.find((l) => l.def.id === 'crystal-heart')!;
    const p = w.player;
    w.ensureGenerated(lm.y + 2000);
    p.x = lm.x;
    p.y = lm.y - 300;
    w.update(1 / 60, idle);
    expect(lm.found).toBe(true);
    expect(w.run.places).toContain('crystal-heart');
    p.x = lm.x;
    p.y = lm.y - 92 - p.r - 2;
    const score = w.run.score;
    w.update(1 / 60, idle);
    expect(lm.taken).toBe(true);
    expect(w.run.treasures).toEqual(['dream-shard']);
    expect(w.run.score - score).toBeGreaterThanOrEqual(TREASURES.find((t) => t.id === 'dream-shard')!.score);
    w.update(1 / 60, idle);
    expect(w.run.treasures).toHaveLength(1);
  });

  it('the Drowned Gate wakes when swum through, revealing its tablet', () => {
    const w = makeWorld();
    const lm = w.landmarks.find((l) => l.def.id === 'drowned-gate')!;
    const p = w.player;
    w.ensureGenerated(lm.y + 2000);
    p.x = lm.x - 400;
    p.y = lm.y - 150;
    w.update(1 / 60, idle);
    expect(lm.revealed).toBe(false);
    p.x = lm.x;
    w.update(1 / 60, idle);
    expect(lm.revealed).toBe(true);
    expect(w.events.some((e) => e.type === 'reveal' && e.id === 'glyph-tablet')).toBe(true);
  });

  it('the Lantern Grove gives up its seed once three of its pods are lit', () => {
    const w = makeWorld();
    const lm = w.landmarks.find((l) => l.def.id === 'lantern-grove')!;
    const ring = w.pods.filter((pd) => pd.grove);
    expect(ring.length).toBeGreaterThanOrEqual(3);
    w.player.x = lm.x;
    w.player.y = lm.y - 600;
    w.burstPod(ring[0]);
    w.burstPod(ring[1]);
    w.update(1 / 60, idle);
    expect(lm.revealed).toBe(false);
    w.burstPod(ring[2]);
    w.update(1 / 60, idle);
    expect(lm.revealed).toBe(true);
  });
});

describe('exploring awakens instincts', () => {
  it('discoveries, places and new depth all count, alongside food', () => {
    const w = makeWorld();
    openWater(w);
    const before = w.instinctPoints();
    w.spawn(SPECIES_BY_ID['sea-butterfly'], w.player.x + 30, w.player.y);
    w.update(1 / 60, idle);
    expect(w.instinctPoints() - before).toBeCloseTo(EXPLORE.discovery);
    // Swimming 200 m deeper, a little at a time.
    const p = w.player;
    const start = w.instinctPoints();
    for (let i = 0; i < 40; i++) {
      p.y += 50;
      w.update(1 / 60, idle);
    }
    expect(w.instinctPoints()).toBeGreaterThan(start);
  });

  it('enough exploring alone awakens an instinct', () => {
    const w = makeWorld();
    openWater(w);
    w.addExplore(40);
    expect(w.run.evolutions).toBeGreaterThanOrEqual(1);
  });
});

describe('encounters', () => {
  it('a bloom lends light while the jelly is inside it', () => {
    const w = makeWorld();
    openWater(w, ZONES_BY_ID.twilight.top + 500);
    w.startEncounter('bloom');
    w.update(1 / 60, idle);
    expect(w.player.glowT).toBeGreaterThan(0);
    expect(w.run.encounters).toEqual(['bloom']);
  });

  it('a migration streams a great school across the jelly’s path', () => {
    const w = makeWorld();
    openWater(w, 900);
    w.startEncounter('migration');
    const school = w.creatures.filter((c) => c.def.id === 'ribbon-minnow');
    expect(school.length).toBeGreaterThan(20);
    const lead = school.find((c) => c.travelT > 0)!;
    const x0 = lead.x;
    for (let i = 0; i < 120; i++) w.update(1 / 60, idle);
    expect(Math.abs(lead.x - x0)).toBeGreaterThan(60);
  });
});

describe('creature behavior', () => {
  it('light-drawn creatures approach the jelly in dark water; light-shy ones flee', () => {
    const w = makeWorld();
    openWater(w, ZONES_BY_ID.abyss.top + 800);
    const p = w.player;
    w.player.r = 4; // too small to threaten anything, so only the light matters
    const drawn = w.spawn(SPECIES_BY_ID['comb-jelly'], p.x + 200, p.y);
    const shy = w.spawn(SPECIES_BY_ID['glass-squid'], p.x - 150, p.y);
    const d0 = Math.hypot(drawn.x - p.x, drawn.y - p.y);
    const s0 = Math.hypot(shy.x - p.x, shy.y - p.y);
    for (let i = 0; i < 90; i++) {
      p.x = w.width / 2;
      p.vx = p.vy = 0;
      w.update(1 / 60, idle);
    }
    expect(Math.hypot(drawn.x - p.x, drawn.y - p.y)).toBeLessThan(d0);
    expect(Math.hypot(shy.x - p.x, shy.y - p.y)).toBeGreaterThan(s0);
  });
});

describe('saving places and treasures', () => {
  it('records them in the save and survives a reload', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), places: ['whale-fall' as const], treasures: ['whalebone-flute' as const], encounters: ['whale' as const] };
    const out = applyRun(save, run);
    expect(out.newPlaces).toEqual(['whale-fall']);
    expect(out.newTreasures).toEqual(['whalebone-flute']);
    const again = applyRun(save, run);
    expect(again.newPlaces).toEqual([]);
    const loaded = sanitizeSave(JSON.parse(JSON.stringify(save)));
    expect(loaded.places['whale-fall']).toBeGreaterThan(0);
    expect(loaded.treasures['whalebone-flute']).toBeGreaterThan(0);
    expect(loaded.encounters.whale).toBe(2);
  });

  it('old saves load with empty places and treasures, and junk is dropped', () => {
    const old = sanitizeSave({ version: 1, best: { depth: 5000 }, places: { atlantis: 1, 'vent-field': 'x' }, treasures: { nope: 3 }, tips: [4, 'lash'] });
    expect(old.best.depth).toBe(5000);
    expect(old.places).toEqual({ 'vent-field': 0 });
    expect(old.treasures).toEqual({});
    expect(old.tips).toEqual(['lash']);
  });
});
