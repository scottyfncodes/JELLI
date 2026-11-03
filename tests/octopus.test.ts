import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { ZONES_BY_ID } from '../src/content/world';
import { emptyPersonality } from '../src/content/personality';
import { mulberry32 } from '../src/core/math';

const idle = { ax: 0, ay: 0, burst: false };

function makeWorld(opts: ConstructorParameters<typeof World>[0] = {}) {
  const w = new World({ seed: 7, rng: mulberry32(42), ...opts });
  w.setView(220, 420);
  w.creatures.length = 0;
  w.pods.length = 0;
  w.shelters.length = 0;
  w.pearls.length = 0;
  const p = w.player;
  p.x = w.width / 2;
  p.y = 900;
  p.invuln = 0;
  w.update(1 / 60, idle);
  w.events.length = 0;
  return w;
}

/** A hunter much bigger than the octopus, already locked on. */
function hunter(w: World, dist = 130, size = 3) {
  const p = w.player;
  const h = w.spawn(SPECIES_BY_ID.needlefin, p.x + dist, p.y);
  h.r = h.baseR = p.r * size;
  h.state = 'notice';
  h.stateT = 5;
  return h;
}

describe('defensive mutations', () => {
  it('Ink Sac: a jet leaves ink, and a hunter that had noticed loses track', () => {
    const w = makeWorld({ mutations: ['ink-sac'] });
    const h = hunter(w);
    w.update(1 / 60, { ax: -1, ay: 0, burst: true });
    expect(w.inks.length).toBe(1);
    expect(h.state).toBe('rest');
    expect(w.events.some((e) => e.type === 'ink')).toBe(true);
  });

  it('Chromatophores: holding still turns to camouflage and hides the octopus', () => {
    const w = makeWorld({ mutations: ['chromatophores'] });
    for (let i = 0; i < 60; i++) {
      w.player.vx = w.player.vy = 0;
      w.update(1 / 60, idle);
    }
    expect(w.player.camo).toBe(true);
    expect(w.player.hidden).toBe(true);
    const plain = makeWorld();
    for (let i = 0; i < 60; i++) plain.update(1 / 60, idle);
    expect(plain.player.camo).toBe(false);
  });

  it('Blue Rings: a hunter not much bigger leaves it alone; a giant still attacks', () => {
    const w = makeWorld({ mutations: ['blue-rings'] });
    const small = hunter(w, 140, 1.5);
    w.update(1 / 60, idle);
    expect(small.state === 'rest' || small.state === 'wander').toBe(true);
    const plain = makeWorld();
    const h2 = hunter(plain, 140, 1.5);
    plain.update(1 / 60, idle);
    expect(h2.state).toBe('notice');
  });

  it('Regrowth: a bite takes an arm instead, once, and the arm grows back', () => {
    const w = makeWorld({ mutations: ['regrowth'] });
    const p = w.player;
    w.spawn(SPECIES_BY_ID.needlefin, p.x + 4, p.y).r = p.r * 3;
    w.update(1 / 60, idle);
    expect(p.alive).toBe(true);
    expect(p.armsLost).toBe(1);
    expect(w.events.some((e) => e.type === 'autotomy')).toBe(true);
    for (let i = 0; i < 60 * 26; i++) {
      w.creatures.length = 0;
      p.invuln = 1;
      w.update(1 / 60, idle);
    }
    expect(p.armsLost).toBe(0);
  });
});

describe('depth and the body', () => {
  it('below the depth the body can stand, the water presses back', () => {
    const w = makeWorld();
    const p = w.player;
    p.y = ZONES_BY_ID.twilight.bottom + 100;
    const y0 = p.y;
    for (let i = 0; i < 60; i++) w.update(1 / 60, { ax: 0, ay: 1, burst: false });
    expect(p.y).toBeLessThan(y0);
    expect(p.pressure).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'pressure')).toBe(true);
  });

  it('a Deep Body opens the way down, and pressing the limit makes sure it is offered', () => {
    const deep = makeWorld({ mutations: ['deep-body'] });
    const p = deep.player;
    p.y = ZONES_BY_ID.twilight.bottom + 100;
    const y0 = p.y;
    for (let i = 0; i < 60; i++) deep.update(1 / 60, { ax: 0, ay: 1, burst: false });
    expect(p.y).toBeGreaterThan(y0);
    const w = makeWorld();
    w.player.y = ZONES_BY_ID.twilight.bottom;
    for (let i = 0; i < 240; i++) w.update(1 / 60, { ax: 0, ay: 1, burst: false });
    expect(w.offerMutations()).toContain('deep-body');
  });
});

describe('the ecosystem', () => {
  it('a sea nettle is not food: touching it stings, numbs and spends the jet', () => {
    const w = makeWorld();
    const p = w.player;
    const n = w.spawn(SPECIES_BY_ID['sea-nettle'], p.x + 10, p.y);
    n.r = 20;
    expect(p.charges).toBe(1);
    w.update(1 / 60, idle);
    expect(p.alive).toBe(true);
    expect(p.stungT).toBeGreaterThan(0);
    expect(p.charges).toBe(0);
    expect(w.events.some((e) => e.type === 'nettle')).toBe(true);
    expect(w.lash(n.x, n.y, 5)).toBe('none');
  });

  it('a clam shut tight cannot be taken, unless a crushing beak cracks it; it holds a pearl', () => {
    for (const beak of [false, true]) {
      const w = makeWorld({ mutations: beak ? ['crushing-beak'] : [] });
      const p = w.player;
      p.r = 20;
      const c = w.spawn(SPECIES_BY_ID['reef-clam'], p.x, p.y - 30);
      c.shell = 30;
      c.timer = 99;
      expect(w.lash(c.x, c.y, 5)).toBe(beak ? 'hit' : 'none');
      if (beak) {
        for (let i = 0; i < 300 && !c.dead; i++) w.update(1 / 60, idle);
        expect(c.dead).toBe(true);
        expect(w.run.pearls).toBe(1);
      }
    }
  });

  it('a startled hermit crab pulls into its shell', () => {
    const w = makeWorld();
    const p = w.player;
    p.r = 20;
    const c = w.spawn(SPECIES_BY_ID['hermit-crab'], p.x + 40, p.y);
    c.homeX = c.x - 40;
    c.homeY = c.y;
    c.lockX = 30;
    c.lockY = 1;
    c.timer = 0;
    w.update(1 / 60, idle);
    expect(c.shell).toBeGreaterThan(0);
  });

  it('a smaller rival octopus inks and escapes into its cloud', () => {
    const w = makeWorld();
    const p = w.player;
    p.r = 30;
    const c = w.spawn(SPECIES_BY_ID['rival-octopus'], p.x + 80, p.y);
    c.r = c.baseR = 12;
    c.timer = 0;
    w.update(1 / 60, idle);
    expect(w.inks.some((k) => k.rival)).toBe(true);
    expect(w.lash(c.x, c.y, 5)).not.toBe('hit');
  });
});

describe('personality', () => {
  it('emerges from play and announces itself', () => {
    const w = makeWorld();
    for (let i = 0; i < 20; i++) w.nudge('playful', 1);
    expect(w.player.personality).toBe('playful');
    expect(w.events.some((e) => e.type === 'personality' && e.id === 'playful')).toBe(true);
  });

  it('carries over from earlier dives, with its edge', () => {
    const w = makeWorld({ personality: { ...emptyPersonality(), curious: 40 } });
    expect(w.player.personality).toBe('curious');
    expect(w.player.stats.rareChance).toBeGreaterThan(1);
  });
});

describe('arm fan', () => {
  it('points every arm down and away from the middle, so no two arms cross under the face', async () => {
    const { armRestAngle, armRoot, ARM_COUNT } = await import('../src/render/octopus');
    const root = { x: 0, y: 0 };
    for (let i = 0; i < ARM_COUNT; i++) {
      const a = armRestAngle(i, 1);
      armRoot(i, 10, root);
      expect(Math.sin(a)).toBeGreaterThan(0); // downward
      expect(Math.sign(Math.cos(a))).toBe(Math.sign(root.x)); // the same side as its root
    }
  });
});
