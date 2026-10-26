import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { sweepBonus } from '../src/sim/rules';
import { applyRun, deathLesson, emptyRunStats } from '../src/core/progress';
import { defaultSave, sanitizeSave } from '../src/persistence/save';
import { mulberry32 } from '../src/core/math';

const idle = { ax: 0, ay: 0, burst: false };

/** A jelly facing right with nothing else around. */
function makeWorld() {
  const w = new World({ seed: 7, rng: mulberry32(42) });
  w.setView(220, 420);
  w.creatures.length = 0;
  w.player.heading = 0;
  w.player.invuln = 99;
  return w;
}

function burst(w: World) {
  w.update(1 / 60, { ax: 1, ay: 0, burst: true });
}

function step(w: World, seconds: number, input = idle) {
  for (let i = 0; i < seconds * 60; i++) w.update(1 / 60, input);
}

describe('the sweep', () => {
  it('a burst through a cluster snags all of it at once, and the net holds firm', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = [0, 1, 2, 3].map((i) => w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 22 + i * 4, p.y - 6 + i * 4));
    for (const k of krill) k.slip = 0;
    burst(w);
    expect(krill.every((k) => k.held)).toBe(true);
    expect(w.tentacles.filter((t) => t.sweep)).toHaveLength(4);
    step(w, 3);
    expect(krill.every((k) => k.dead)).toBe(true);
    expect(w.run.eaten).toBe(4);
    expect(w.run.bestSweep).toBe(4);
    expect(w.combo).toBeGreaterThanOrEqual(4);
  });

  it('pays a bonus that climbs with the square of the haul', () => {
    expect(sweepBonus(1)).toBe(0);
    expect(sweepBonus(2)).toBe(10);
    expect(sweepBonus(6)).toBeGreaterThan(sweepBonus(3) * 4);
    const w = makeWorld();
    const p = w.player;
    for (let i = 0; i < 3; i++) w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 22, p.y - 8 + i * 8);
    burst(w);
    const score = w.run.score;
    step(w, 0.3, { ax: 1, ay: 0, burst: false });
    const ev = w.events.find((e) => e.type === 'sweep');
    expect(ev && ev.type === 'sweep' && ev.n).toBe(3);
    expect(w.run.score - score).toBeGreaterThanOrEqual(sweepBonus(3));
  });

  it('only catches what lies ahead: aim matters', () => {
    const w = makeWorld();
    const p = w.player;
    const behind = w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x - 40, p.y);
    const above = w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x, p.y - 40);
    burst(w);
    step(w, 0.3, { ax: 1, ay: 0, burst: false });
    expect(behind.held || behind.dead).toBe(false);
    expect(above.held || above.dead).toBe(false);
    expect(w.run.bestSweep).toBe(0);
  });

  it('cannot sweep prey that is too big to eat', () => {
    const w = makeWorld();
    const p = w.player;
    const puffer = w.spawn(SPECIES_BY_ID['puffer-pebble'], p.x + 24, p.y);
    burst(w);
    expect(puffer.held).toBe(false);
  });

  it('sweep arms are gone once their catch is eaten; the jelly keeps its own arms', () => {
    const w = makeWorld();
    const p = w.player;
    const arms = w.tentacles.length;
    for (let i = 0; i < 3; i++) w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 22, p.y - 8 + i * 8);
    burst(w);
    expect(w.tentacles.length).toBe(arms + 3);
    step(w, 3);
    expect(w.tentacles.length).toBe(arms);
    expect(w.tentacles.every((t) => !t.sweep)).toBe(true);
  });

  it('startles the prey it missed, so a careless sweep scatters the school behind it', () => {
    const w = makeWorld();
    const p = w.player;
    w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 22, p.y);
    const missed = w.spawn(SPECIES_BY_ID['ribbon-minnow'], p.x - 150, p.y + 60);
    const far = w.spawn(SPECIES_BY_ID['ribbon-minnow'], p.x - 900, p.y);
    burst(w);
    step(w, 0.3);
    expect(missed.spooked).toBeGreaterThan(0);
    expect(far.spooked).toBe(0);
    // A startled fish flees from much further away than a calm one.
    const before = Math.hypot(missed.x - p.x, missed.y - p.y);
    step(w, 0.5);
    expect(Math.hypot(missed.x - p.x, missed.y - p.y)).toBeGreaterThan(before);
  });

  it('the burst it spends is the burst it no longer has to escape with', () => {
    const w = makeWorld();
    const p = w.player;
    w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 22, p.y);
    w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 26, p.y + 6);
    burst(w);
    step(w, 0.5);
    expect(p.charges).toBe(0);
    p.invuln = 0;
    w.spawn(SPECIES_BY_ID['needlefin'], p.x + 3, p.y);
    step(w, 0.2);
    expect(w.run.death).toEqual(expect.objectContaining({ burstReady: false, lastSweep: 2 }));
  });
});

describe('learning from a run', () => {
  const caught = (death: NonNullable<ReturnType<typeof emptyRunStats>['death']>) => ({ ...emptyRunStats(), caughtBy: 'needlefin', death });

  it('says when a burst was there to escape with', () => {
    expect(deathLesson(caught({ burstReady: true, sinceBurst: 9, lastSweep: 0, behavior: 'lunge' }))).toContain('red line');
    expect(deathLesson(caught({ burstReady: true, sinceBurst: 9, lastSweep: 0, behavior: 'pack' }))).toContain('closes in');
  });

  it('names the sweep that spent it', () => {
    expect(deathLesson(caught({ burstReady: false, sinceBurst: 1.2, lastSweep: 5, behavior: 'lunge' }))).toContain('sweeping up 5');
  });

  it('otherwise points at the recharge', () => {
    expect(deathLesson(caught({ burstReady: false, sinceBurst: 6, lastSweep: 5, behavior: 'lunge' }))).toContain('recharging');
    expect(deathLesson(emptyRunStats())).toBeNull();
  });

  it('keeps the biggest sweep on record', () => {
    const save = defaultSave();
    const out = applyRun(save, { ...emptyRunStats(), bestSweep: 7 });
    expect(out.prevBestSweep).toBe(0);
    expect(save.best.sweep).toBe(7);
    expect(applyRun(save, { ...emptyRunStats(), bestSweep: 4 }).prevBestSweep).toBe(7);
    expect(save.best.sweep).toBe(7);
    expect(sanitizeSave({ best: { sweep: 5 } }).best.sweep).toBe(5);
    expect(sanitizeSave({ best: { score: 3 } }).best.sweep).toBe(0);
  });
});
