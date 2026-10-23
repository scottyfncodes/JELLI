import { describe, expect, it } from 'vitest';
import { World, WRECK_HULL, type Creature } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { ZONES } from '../src/content/world';
import { CHEST_SCORE, COMBO_WINDOW, PEARL_SCORE, comboMult, pearlScore } from '../src/sim/rules';
import { applyRun, emptyRunStats } from '../src/core/progress';
import { defaultSave, sanitizeSave } from '../src/persistence/save';
import { mulberry32 } from '../src/core/math';

const idle = { ax: 0, ay: 0, burst: false };

function makeWorld() {
  const w = new World({ seed: 7, rng: mulberry32(42) });
  w.setView(220, 420);
  w.creatures.length = 0;
  w.player.invuln = 1e9;
  return w;
}

function feedOne(w: World): Creature {
  const p = w.player;
  const c = w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x, p.y - 16);
  c.stunned = 30;
  for (let i = 0; i < 180 && !c.dead; i++) w.update(1 / 60, idle);
  expect(c.dead).toBe(true);
  return c;
}

describe('catch chains', () => {
  it('multiplies score for quick catches and breaks after the window', () => {
    expect(comboMult(1)).toBe(1);
    expect(comboMult(3)).toBe(1.5);
    expect(comboMult(50)).toBe(3);
    const w = makeWorld();
    feedOne(w);
    expect(w.combo).toBe(1);
    const before = w.run.score;
    feedOne(w);
    expect(w.combo).toBe(2);
    expect(w.run.score - before).toBe(Math.round(SPECIES_BY_ID['glimmer-krill'].score * comboMult(2)));
    expect(w.run.bestCombo).toBe(2);
    for (let i = 0; i < 60 * (COMBO_WINDOW + 0.2); i++) w.update(1 / 60, idle);
    expect(w.combo).toBe(0);
    feedOne(w);
    expect(w.combo).toBe(1);
    expect(w.run.bestCombo).toBe(2);
  });
});

describe('pearls', () => {
  it('are scattered over the whole map and never inside reef', () => {
    const w = makeWorld();
    expect(w.pearls.length).toBeGreaterThan(80);
    expect(w.pearls.some((p) => p.y > ZONES[2].top)).toBe(true);
    expect(w.pearls.some((p) => p.x > w.width * 0.75)).toBe(true);
    for (const p of w.pearls) expect(w.insideCoral(p.x, p.y, 4)).toBe(false);
  });

  it('are collected by swimming through them and keep a chain alive', () => {
    const w = makeWorld();
    const p = w.player;
    feedOne(w);
    w.comboT = 0.5;
    const pearl = w.pearls[20];
    p.x = pearl.x;
    p.y = pearl.y;
    const score = w.run.score;
    w.update(1 / 60, idle);
    expect(pearl.taken).toBe(true);
    expect(w.run.pearls).toBe(1);
    expect(w.run.score - score).toBeGreaterThanOrEqual(PEARL_SCORE);
    expect(w.comboT).toBeGreaterThan(COMBO_WINDOW - 0.1);
    expect(w.events.some((e) => e.type === 'pearl')).toBe(true);
    // Collected once only.
    w.update(1 / 60, idle);
    expect(w.run.pearls).toBe(1);
  });

  it('are worth more the deeper they lie', () => {
    expect(pearlScore('twilight')).toBeGreaterThan(pearlScore('shallows'));
    expect(pearlScore('abyss')).toBeGreaterThan(pearlScore('twilight'));
    const w = makeWorld();
    const p = w.player;
    const deep = w.pearls.find((pr) => pr.y > ZONES[2].top + 200)!;
    p.x = deep.x;
    p.y = deep.y;
    const score = w.run.score;
    w.update(1 / 60, idle);
    expect(deep.taken).toBe(true);
    expect(w.run.score - score).toBeGreaterThanOrEqual(pearlScore('abyss'));
  });

  it('gather in bigger hoards in deeper water', () => {
    // Per unit of depth, the abyss holds at least as many pearls as the shallows.
    let shallow = 0;
    let deep = 0;
    for (let seed = 1; seed <= 5; seed++) {
      const w = new World({ seed, rng: mulberry32(seed) });
      for (const pr of w.pearls) {
        if (pr.y < ZONES[0].bottom) shallow++;
        else if (pr.y >= ZONES[2].top) deep++;
      }
    }
    const perDepth = (n: number, z: (typeof ZONES)[number]) => n / (z.bottom - z.top);
    expect(perDepth(deep, ZONES[2])).toBeGreaterThan(perDepth(shallow, ZONES[0]) * 0.9);
  });
});

describe('sunken pirate ship', () => {
  it('rests in the sunlit shallows, a real swim from the start', () => {
    const w = makeWorld();
    const wr = w.wreck;
    expect(wr.y).toBeLessThan(ZONES[0].bottom);
    expect(Math.hypot(wr.x - w.player.x, wr.y - w.player.y)).toBeGreaterThan(2000);
  });

  it('has a solid hull', () => {
    const w = makeWorld();
    const wr = w.wreck;
    const [lx, ly] = WRECK_HULL[3];
    const x = wr.x + lx * Math.cos(wr.tilt) - ly * Math.sin(wr.tilt);
    const y = wr.y + lx * Math.sin(wr.tilt) + ly * Math.cos(wr.tilt);
    expect(w.insideCoral(x, y, 0)).toBe(true);
    const p = w.player;
    p.x = x;
    p.y = y;
    w.update(1 / 60, idle);
    expect(w.insideCoral(p.x, p.y, 0)).toBe(false);
  });

  it('announces itself once, and its chest pays out once and spills pearls', () => {
    const w = makeWorld();
    const p = w.player;
    const wr = w.wreck;
    p.x = wr.chestX;
    p.y = wr.chestY - 30;
    const pearls = w.pearls.length;
    const score = w.run.score;
    for (let i = 0; i < 20 && !wr.chestOpen; i++) {
      p.x = wr.chestX;
      p.y = wr.chestY - 20;
      w.update(1 / 60, idle);
    }
    expect(wr.found).toBe(true);
    expect(wr.chestOpen).toBe(true);
    expect(w.run.chest).toBe(1);
    expect(w.run.score - score).toBeGreaterThanOrEqual(CHEST_SCORE);
    expect(w.pearls.length).toBeGreaterThan(pearls);
    expect(w.events.filter((e) => e.type === 'chest')).toHaveLength(1);
    expect(w.events.filter((e) => e.type === 'wreck')).toHaveLength(1);
    w.events.length = 0;
    for (let i = 0; i < 10; i++) w.update(1 / 60, idle);
    expect(w.events.some((e) => e.type === 'chest' || e.type === 'wreck')).toBe(false);
  });
});

describe('treasure progress', () => {
  it('banks pearls, the chest and the best chain, and unlocks their rewards', () => {
    const save = defaultSave();
    const out = applyRun(save, { ...emptyRunStats(), pearls: 18, chest: 1, bestCombo: 7 });
    expect(save.stats.pearls).toBe(18);
    expect(save.stats.chests).toBe(1);
    expect(save.best.combo).toBe(7);
    const ids = out.completed.map((c) => c.id);
    expect(ids).toContain('pirate-gold');
    expect(ids).toContain('chain');
    expect(ids).not.toContain('pearl-diver');
    expect(save.unlocks).toContain('skin:doubloon');
    expect(save.unlocks).toContain('skin:ember');
    const second = applyRun(save, { ...emptyRunStats(), pearls: 12 });
    expect(second.completed.map((c) => c.id)).toContain('pearl-diver');
    expect(save.unlocks).toContain('skin:pearl');
  });

  it('loads older saves without the new fields, and keeps them once saved', () => {
    const old = sanitizeSave({ best: { score: 10, mass: 3 }, stats: { runs: 2, eaten: 5, longest: 9 } });
    expect(old.stats.pearls).toBe(0);
    expect(old.best.combo).toBe(0);
    const kept = sanitizeSave({ best: { score: 1, mass: 1, combo: 9 }, stats: { pearls: 41, chests: 2 }, unlocks: ['skin:pearl'] });
    expect(kept.stats.pearls).toBe(41);
    expect(kept.stats.chests).toBe(2);
    expect(kept.best.combo).toBe(9);
    expect(kept.unlocks).toContain('skin:pearl');
  });
});
