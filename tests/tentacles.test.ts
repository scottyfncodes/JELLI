import { describe, expect, it } from 'vitest';
import { World, type Creature, type TentaclePhase } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { WORLD, ZONES, depthMeters } from '../src/content/world';
import { tentacleReach } from '../src/sim/rules';
import { radiusForMass } from '../src/content/progression';
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
    const krill = still(w, 'glimmer-krill', p.x, p.y - 19);
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
    const next = still(w, 'glimmer-krill', p.x - 12, p.y - 14);
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
    // Facing down into the deep, with a krill trailing above (an idle jelly sinks away from it).
    p.heading = Math.PI / 2;
    const reach = tentacleReach(p.r);
    const behind = still(w, 'glimmer-krill', p.x, p.y - reach * 0.85);
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(behind.claimed).toBe(false);
    // Turning to face it brings it into the arc.
    for (let i = 0; i < 90 && !behind.dead; i++) w.update(1 / 60, { ax: 0, ay: -0.5, burst: false });
    expect(behind.dead).toBe(true);
    const touching = still(w, 'glimmer-krill', p.x - Math.cos(p.heading) * p.r, p.y - Math.sin(p.heading) * p.r);
    for (let i = 0; i < 120 && !touching.dead; i++) w.update(1 / 60, idle);
    expect(touching.dead).toBe(true);
  });

  it('snags one fish at a time while young, two from Bloom', () => {
    const w = makeWorld();
    const p = w.player;
    const fish = [0, 1, 2, 3].map((i) => still(w, 'glimmer-krill', p.x - 12 + i * 8, p.y - 16));
    let most = 0;
    for (let f = 0; f < 240; f++) {
      w.update(1 / 60, idle);
      most = Math.max(most, w.tentacles.filter((t) => t.phase !== 'idle' && t.phase !== 'retract').length);
    }
    expect(most).toBe(1);
    expect(fish.filter((c) => c.dead).length).toBeGreaterThanOrEqual(2);
    p.stage = 3;
    const more = [0, 1, 2, 3].map((i) => still(w, 'glimmer-krill', p.x - 12 + i * 8, p.y - 16));
    most = 0;
    for (let f = 0; f < 120; f++) {
      w.update(1 / 60, idle);
      most = Math.max(most, w.tentacles.filter((t) => t.phase !== 'idle' && t.phase !== 'retract').length);
    }
    expect(most).toBe(2);
    expect(more.some((c) => c.dead)).toBe(true);
  });

  it('each meal lengthens the arms a little', () => {
    const w = makeWorld();
    const p = w.player;
    const before = w.tentacleReach();
    const krill = still(w, 'glimmer-krill', p.x, p.y - 15);
    for (let i = 0; i < 180 && !krill.dead; i++) w.update(1 / 60, idle);
    expect(krill.dead).toBe(true);
    const after = w.tentacleReach();
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(3);
  });

  it("Comet's burst-flung reach still lands after the burst ends", () => {
    const w = makeWorld({ tiers: { surge: 3 } });
    const p = w.player;
    // A grown jelly: its arms have further to travel, so the burst can end mid-reach.
    p.mass = 165;
    p.r = radiusForMass(p.mass);
    const base = tentacleReach(p.r, 0);
    // Beyond normal reach, inside Comet's flung reach, with the burst nearly spent.
    const krill = still(w, 'glimmer-krill', p.x, p.y - base * 1.3 - 2);
    p.burstT = 0.12;
    for (let i = 0; i < 150 && !krill.dead; i++) w.update(1 / 60, idle);
    expect(krill.dead).toBe(true);
  });

  it('never lets two tentacles claim the same fish', () => {
    const w = makeWorld();
    const p = w.player;
    const fish = [0, 1, 2, 3, 4, 5].map((i) => still(w, 'glimmer-krill', p.x + Math.cos(-0.4 - i * 0.45) * 17, p.y + Math.sin(-0.4 - i * 0.45) * 17));
    w.player.stage = 4;
    for (let f = 0; f < 240; f++) {
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
    const krill = still(w, 'glimmer-krill', p.x + 6, p.y - 19);
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
    const fish = still(w, 'sea-butterfly', p.x, p.y - 19);
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
    const krill = still(w, 'glimmer-krill', p.x, p.y - 19);
    for (let i = 0; i < 180 && !krill.dead; i++) w.update(1 / 60, idle);
    expect(krill.dead).toBe(true);
    expect(w.events.some((e) => e.type === 'escape')).toBe(false);
  });

  it('drops its catch if the jelly is caught', () => {
    const w = makeWorld();
    const p = w.player;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 19);
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
    const krill = still(w, 'glimmer-krill', p.x, p.y - 19);
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
    // A well-fed jelly, so its arms are long.
    w.run.eaten = 300;
    // The slimmest lone coral pillar, so prey behind it sits inside tentacle range.
    const c = w.corals
      .filter((cl) => cl.circles.length === 1 && cl.minY > 800)
      .map((cl) => cl.circles[0])
      .sort((a, b) => a.r - b.r)[0];
    p.x = c.x - c.r - p.r - 4;
    p.y = c.y;
    const hidden = still(w, 'glimmer-krill', c.x + c.r + 6, c.y);
    // In range, but the reef is in the way.
    expect(Math.hypot(hidden.x - p.x, hidden.y - p.y)).toBeLessThan(w.tentacleReach());
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(hidden.claimed).toBe(false);
    expect(hidden.dead).toBe(false);
    // Same distance in open water is fair game.
    const d = hidden.x - p.x;
    const clear = (a: number) => Array.from({ length: 16 }, (_, i) => (i + 1) / 16).every((k) => !w.insideCoral(p.x + Math.cos(a) * d * k, p.y + Math.sin(a) * d * k, 4));
    const dir = [-Math.PI / 2, -2.2, -0.9, Math.PI].find(clear)!;
    expect(dir).toBeDefined();
    const open = still(w, 'glimmer-krill', p.x + Math.cos(dir) * d, p.y + Math.sin(dir) * d);
    // Allow for an arm still resting after a blocked attempt.
    for (let i = 0; i < 70; i++) w.update(1 / 60, idle);
    expect(open.claimed || open.dead).toBe(true);
  });

  it('feeds the existing growth and evolution systems', () => {
    const w = makeWorld();
    const p = w.player;
    const mass = p.mass;
    const food = p.food;
    const krill = still(w, 'glimmer-krill', p.x, p.y - 19);
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
      expect(Math.hypot(t.x - p.x, t.y - p.y)).toBeLessThan(p.r * 2 + tentacleReach(p.r) * 1.4);
    }
  });
});

describe('the endless shaft', () => {
  it('is a few screens wide and has no floor, with biomes covering every depth', () => {
    expect(WORLD.width).toBeGreaterThanOrEqual(2400);
    expect(WORLD.height).toBe(Number.POSITIVE_INFINITY);
    expect(ZONES[0].top).toBe(0);
    for (let i = 1; i < ZONES.length; i++) expect(ZONES[i].top).toBe(ZONES[i - 1].bottom);
    expect(ZONES[ZONES.length - 1].bottom).toBe(Number.POSITIVE_INFINITY);
    expect(depthMeters(ZONES[ZONES.length - 1].top)).toBe(6000);
    expect(depthMeters(40000)).toBeGreaterThan(depthMeters(30000));
  });

  it('generates reef and currents ahead of the jelly as it sinks, inside the walls', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 1e9;
    const deepest = () => Math.max(...w.corals.map((c) => c.maxY));
    expect(deepest()).toBeLessThan(6000);
    p.y = 20000;
    w.update(1 / 60, idle);
    expect(deepest()).toBeGreaterThan(22000);
    const open = w.corals.filter((c) => c.minX > 200 && c.maxX < w.width - 200);
    expect(open.some((c) => c.minX > w.width * 0.7)).toBe(true);
    expect(open.some((c) => c.maxX < w.width * 0.3)).toBe(true);
    expect(w.currents.some((c) => c.fy > 100)).toBe(true);
    for (const cur of w.currents) {
      expect(cur.x).toBeGreaterThanOrEqual(0);
      expect(cur.x + cur.w).toBeLessThanOrEqual(w.width);
    }
    // Each biome's reef knows where it grew, so it can look the part.
    expect(new Set(w.corals.map((c) => c.zone))).toContain('hadal');
  });

  it('is the same ocean every time for the same seed', () => {
    const a = makeWorld();
    const b = makeWorld();
    a.ensureGenerated(9000);
    b.ensureGenerated(9000);
    expect(a.corals.length).toBe(b.corals.length);
    expect(a.corals[a.corals.length - 1].minY).toBe(b.corals[b.corals.length - 1].minY);
  });

  it('keeps the jelly inside the walls and below the surface', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 1e9;
    for (const [x, y, ax, ay] of [
      [w.width - 20, 3000, 1, 0],
      [20, 3000, -1, 0],
      [1500, 10, 0, -1],
    ]) {
      p.x = x;
      p.y = y;
      for (let i = 0; i < 90; i++) w.update(1 / 60, { ax, ay, burst: false });
      expect(p.x).toBeGreaterThanOrEqual(p.r);
      expect(p.x).toBeLessThanOrEqual(w.width - p.r);
      expect(p.y).toBeGreaterThanOrEqual(p.r);
    }
  });

  it('sinks fast and rises slow', () => {
    const run = (ay: number) => {
      const w = makeWorld();
      const p = w.player;
      p.invuln = 1e9;
      w.creatures.length = 0;
      // Open water: no reef or currents in the way (generated first, so none appears mid-test).
      w.ensureGenerated(12000);
      w.coralGrid.clear();
      w.currents.length = 0;
      p.y = 6000;
      const y0 = p.y;
      for (let i = 0; i < 120; i++) w.update(1 / 60, { ax: 0, ay, burst: false });
      return p.y - y0;
    };
    const down = run(1);
    const up = -run(-1);
    expect(down).toBeGreaterThan(up * 1.4);
    // Left alone, a jelly drifts slowly down.
    expect(run(0)).toBeGreaterThan(5);
  });

  it('spawns life around the jelly anywhere in the deep', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 1e9;
    p.x = w.width - 600;
    p.y = 18000;
    for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, idle);
    expect(w.creatures.length).toBeGreaterThan(8);
    expect(w.creatures.some((c) => c.def.zones.includes('hadal'))).toBe(true);
    for (const c of w.creatures) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(w.width);
    }
  });
});
