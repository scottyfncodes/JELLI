import { describe, expect, it } from 'vitest';
import { World, type Creature, type TentaclePhase } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { WORLD, ZONES } from '../src/content/world';
import { tentacleReach } from '../src/sim/rules';
import { mulberry32 } from '../src/core/math';

const idle = { ax: 0, ay: 0, burst: false };
const krillDef = SPECIES_BY_ID['glimmer-krill'];

function makeWorld(opts: ConstructorParameters<typeof World>[0] = {}) {
  const w = new World({ seed: 7, rng: mulberry32(42), ...opts });
  w.setView(220, 420);
  w.creatures.length = 0;
  return w;
}

/** Spawns prey that holds still (stunned) so tests measure the arms, not the chase. */
function still(w: World, id: string, x: number, y: number): Creature {
  const c = w.spawn(SPECIES_BY_ID[id], x, y);
  c.stunned = 30;
  return c;
}

const armOn = (w: World, c: Creature) => w.tentacles.find((t) => t.target === c);

describe('tentacle hunting', () => {
  it('runs the full detect, reach, grab, pull, eat, reset cycle', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 28);
    const phases: TentaclePhase[] = [];
    let arm: ReturnType<typeof armOn>;
    for (let i = 0; i < 180 && !krill.dead; i++) {
      w.update(1 / 60, idle);
      arm ??= armOn(w, krill);
      if (arm && phases[phases.length - 1] !== arm.phase) phases.push(arm.phase);
      if (krill.held && !krill.dead) {
        // While held, the fish goes exactly where the tentacle tip goes.
        expect(krill.x).toBe(arm!.x);
        expect(krill.y).toBe(arm!.y);
      }
    }
    expect(phases.slice(0, 5)).toEqual(['reach', 'grab', 'pull', 'eat', 'idle']);
    expect(krill.dead).toBe(true);
    expect(w.run.eaten).toBe(1);
    expect(w.events.some((e) => e.type === 'grab')).toBe(true);
    expect(arm!.target).toBeNull();
    // Reset: the arm can hunt again.
    const next = still(w, 'glimmer-krill', p.x - 22, p.y - 10);
    for (let i = 0; i < 180 && !next.dead; i++) w.update(1 / 60, idle);
    expect(next.dead).toBe(true);
    expect(w.run.eaten).toBe(2);
  });

  it('never eats by touch: food overlapping the bell still has to be caught', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x + 2, p.y);
    w.update(1 / 60, idle);
    expect(krill.dead).toBe(false);
    expect(armOn(w, krill)?.phase).toBe('reach');
    for (let i = 0; i < 120 && !krill.dead; i++) w.update(1 / 60, idle);
    expect(krill.dead).toBe(true);
  });

  it('reaches prey ahead of the bell, but not beyond its range', () => {
    const w = makeWorld();
    const p = w.player;
    const reach = tentacleReach(p.r);
    // The jelly starts heading up (-y).
    const near = still(w, 'glimmer-krill', p.x, p.y - reach * 0.9);
    const far = still(w, 'glimmer-krill', p.x + reach * 1.6, p.y);
    for (let i = 0; i < 180 && !near.dead; i++) w.update(1 / 60, idle);
    expect(near.dead).toBe(true);
    expect(far.claimed).toBe(false);
    expect(far.dead).toBe(false);
  });

  it('strikes forward: prey trailing behind is left alone unless it brushes the bell', () => {
    const w = makeWorld();
    const p = w.player;
    const reach = tentacleReach(p.r);
    const behind = still(w, 'glimmer-krill', p.x, p.y + reach * 0.85);
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(behind.claimed).toBe(false);
    // Turning to face it brings it into the arc.
    for (let i = 0; i < 90 && !behind.dead; i++) w.update(1 / 60, { ax: 0, ay: 0.5, burst: false });
    expect(behind.dead).toBe(true);
    const touching = still(w, 'glimmer-krill', p.x - Math.cos(p.heading) * p.r, p.y - Math.sin(p.heading) * p.r);
    for (let i = 0; i < 120 && !touching.dead; i++) w.update(1 / 60, idle);
    expect(touching.dead).toBe(true);
  });

  it('never lets two tentacles claim the same fish', () => {
    const w = makeWorld();
    const p = w.player;
    const fish = [0, 1, 2, 3, 4, 5].map((i) => still(w, 'glimmer-krill', p.x + Math.cos(-0.4 - i * 0.45) * 24, p.y + Math.sin(-0.4 - i * 0.45) * 24));
    for (let f = 0; f < 120; f++) {
      w.update(1 / 60, idle);
      const targets = w.tentacles.map((t) => t.target).filter(Boolean);
      expect(new Set(targets).size).toBe(targets.length);
      for (const c of fish) if (c.claimed && !c.dead) expect(targets).toContain(c);
    }
    expect(w.run.eaten).toBeGreaterThanOrEqual(3);
    expect(w.run.eaten).toBe(fish.filter((c) => c.dead).length);
  });

  it('lets go when the target darts out of range mid-reach', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x + 6, p.y - 28);
    w.update(1 / 60, idle);
    const arm = armOn(w, krill)!;
    expect(arm.phase).toBe('reach');
    krill.x = p.x + 600;
    w.update(1 / 60, idle);
    expect(arm.phase).toBe('retract');
    expect(arm.target).toBeNull();
    expect(krill.claimed).toBe(false);
    expect(krill.held).toBe(false);
    for (let i = 0; i < 60; i++) w.update(1 / 60, idle);
    expect(arm.phase).toBe('idle');
    expect(krill.dead).toBe(false);
  });

  it('heavy prey can wriggle free and swims off on its own', () => {
    // An rng of 0 makes every escape roll succeed.
    const w = makeWorld({ rng: () => 0 });
    const p = w.player;
    const fish = still(w, 'sea-butterfly', p.x, p.y - 26);
    fish.r = fish.baseR = p.r * 0.85;
    let escaped = false;
    for (let i = 0; i < 120 && !escaped; i++) {
      w.update(1 / 60, idle);
      escaped = w.events.some((e) => e.type === 'escape');
    }
    expect(escaped).toBe(true);
    expect(fish.dead).toBe(false);
    expect(fish.held).toBe(false);
    expect(fish.claimed).toBe(false);
    expect(fish.slip).toBeGreaterThan(0);
    expect(w.run.eaten).toBe(0);
  });

  it('small prey never escapes once caught', () => {
    const w = makeWorld({ rng: () => 0 });
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 26);
    for (let i = 0; i < 180 && !krill.dead; i++) w.update(1 / 60, idle);
    expect(krill.dead).toBe(true);
    expect(w.events.some((e) => e.type === 'escape')).toBe(false);
  });

  it('drops its catch if the jelly is caught', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 28);
    for (let i = 0; i < 60 && !krill.held; i++) w.update(1 / 60, idle);
    expect(krill.held).toBe(true);
    p.invuln = 0;
    w.spawn(SPECIES_BY_ID['needlefin'], p.x + 5, p.y);
    w.update(1 / 60, idle);
    expect(p.alive).toBe(false);
    expect(krill.held).toBe(false);
    expect(krill.claimed).toBe(false);
    for (let i = 0; i < 60; i++) w.update(1 / 60, idle);
    expect(krill.dead).toBe(false);
    expect(w.run.eaten).toBe(0);
  });

  it('recovers when its catch vanishes from the world mid-pull', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 28);
    let arm: ReturnType<typeof armOn>;
    for (let i = 0; i < 60 && !krill.held; i++) {
      w.update(1 / 60, idle);
      arm ??= armOn(w, krill);
    }
    w.creatures.length = 0;
    w.update(1 / 60, idle);
    expect(arm!.target).toBeNull();
    expect(w.run.eaten).toBe(0);
  });

  it('cannot reach through coral', () => {
    const w = makeWorld();
    const p = w.player;
    p.r = 30;
    // The slimmest lone coral pillar, so prey behind it sits inside tentacle range.
    const c = w.corals
      .filter((cl) => cl.circles.length === 1 && cl.minY > 800)
      .map((cl) => cl.circles[0])
      .sort((a, b) => a.r - b.r)[0];
    p.x = c.x - c.r - p.r - 4;
    p.y = c.y;
    const hidden = still(w, 'glimmer-krill', c.x + c.r + 6, c.y);
    // In range, but the reef is in the way.
    expect(Math.hypot(hidden.x - p.x, hidden.y - p.y)).toBeLessThan(tentacleReach(p.r));
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(hidden.claimed).toBe(false);
    expect(hidden.dead).toBe(false);
    // Same distance in open water is fair game.
    const d = hidden.x - p.x;
    const clear = (a: number) => [0.25, 0.5, 0.75, 1].every((k) => !w.insideCoral(p.x + Math.cos(a) * d * k, p.y + Math.sin(a) * d * k, 2));
    const dir = [-Math.PI / 2, -2.2, -0.9, Math.PI].find(clear)!;
    expect(dir).toBeDefined();
    const open = still(w, 'glimmer-krill', p.x + Math.cos(dir) * d, p.y + Math.sin(dir) * d);
    for (let i = 0; i < 10; i++) w.update(1 / 60, idle);
    expect(open.claimed || open.dead).toBe(true);
  });

  it('feeds the existing growth and evolution systems', () => {
    const w = makeWorld();
    const p = w.player;
    const mass = p.mass;
    const food = p.food;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 24);
    for (let i = 0; i < 180 && !krill.dead; i++) w.update(1 / 60, idle);
    expect(p.mass).toBeGreaterThan(mass);
    expect(p.food).toBe(food + krillDef.growth);
    expect(w.run.eatenBySpecies['glimmer-krill']).toBe(1);
  });

  it('grows more arms as the jelly reaches new stages', () => {
    const w = makeWorld();
    expect(w.tentacles.length).toBe(3);
    w.player.stage = 4;
    w.update(1 / 60, idle);
    expect(w.tentacles.length).toBe(5);
  });

  it('idle arms trail close to the bell instead of stretching out', () => {
    const w = makeWorld();
    const p = w.player;
    for (let i = 0; i < 120; i++) w.update(1 / 60, { ax: 1, ay: 0, burst: i === 10 });
    for (const t of w.tentacles) {
      expect(t.phase).toBe('idle');
      expect(Math.hypot(t.x - p.x, t.y - p.y)).toBeLessThan(p.r + tentacleReach(p.r));
    }
  });
});

describe('expanded world', () => {
  it('is far wider and deeper, with zones covering the full depth', () => {
    expect(WORLD.width).toBeGreaterThanOrEqual(6000);
    expect(WORLD.height).toBeGreaterThanOrEqual(12000);
    expect(ZONES[0].top).toBe(0);
    for (let i = 1; i < ZONES.length; i++) expect(ZONES[i].top).toBe(ZONES[i - 1].bottom);
    expect(ZONES[ZONES.length - 1].bottom).toBe(WORLD.height);
  });

  it('spreads reef and currents across the whole map, inside its bounds', () => {
    const w = makeWorld();
    const open = w.corals.filter((c) => c.minX > 200 && c.maxX < w.width - 200);
    expect(open.some((c) => c.minX > w.width * 0.8)).toBe(true);
    expect(open.some((c) => c.maxX < w.width * 0.2)).toBe(true);
    expect(open.some((c) => c.minY > w.height * 0.85)).toBe(true);
    for (const cur of w.currents) {
      expect(cur.x).toBeGreaterThanOrEqual(0);
      expect(cur.x + cur.w).toBeLessThanOrEqual(w.width);
      expect(cur.y + cur.h).toBeLessThanOrEqual(w.height);
    }
  });

  it('keeps the jelly inside the map at every edge', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 1e9;
    for (const [x, y, ax, ay] of [
      [w.width - 20, 3000, 1, 0],
      [20, 3000, -1, 0],
      [3000, w.height - 20, 0, 1],
      [3000, 10, 0, -1],
    ]) {
      p.x = x;
      p.y = y;
      for (let i = 0; i < 90; i++) w.update(1 / 60, { ax, ay, burst: false });
      expect(p.x).toBeGreaterThanOrEqual(p.r);
      expect(p.x).toBeLessThanOrEqual(w.width - p.r);
      expect(p.y).toBeGreaterThanOrEqual(p.r);
      expect(p.y).toBeLessThanOrEqual(w.height - p.r);
    }
  });

  it('spawns life around the jelly anywhere in the deep, far corners', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 1e9;
    p.x = w.width - 900;
    p.y = w.height - 900;
    for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, idle);
    expect(w.creatures.length).toBeGreaterThan(8);
    for (const c of w.creatures) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(w.width);
      expect(c.y).toBeLessThan(w.height);
    }
  });
});
