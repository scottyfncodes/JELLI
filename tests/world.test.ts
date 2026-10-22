import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { SPECIES_BY_ID } from '../src/content/species';
import { STAGES, hunterScale } from '../src/content/progression';
import { mulberry32 } from '../src/core/math';

const idle = { ax: 0, ay: 0, burst: false };

function makeWorld(opts: ConstructorParameters<typeof World>[0] = {}) {
  const w = new World({ seed: 7, rng: mulberry32(42), ...opts });
  w.setView(220, 420);
  return w;
}

describe('world simulation', () => {
  it('eating prey grows the jelly, scores and records the species', () => {
    const w = makeWorld();
    const p = w.player;
    w.creatures.length = 0;
    w.spawn(SPECIES_BY_ID['glimmer-krill'], p.x + 3, p.y);
    const mass = p.mass;
    w.update(1 / 60, idle);
    expect(p.mass).toBeGreaterThan(mass);
    expect(w.run.eaten).toBe(1);
    expect(w.run.score).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'eat')).toBe(true);
    expect(w.hasSeen('glimmer-krill')).toBe(true);
  });

  it('crossing a stage threshold queues an evolution choice', () => {
    const w = makeWorld();
    const p = w.player;
    p.mass = STAGES[1].mass - 0.1;
    w.creatures.length = 0;
    w.spawn(SPECIES_BY_ID['sea-butterfly'], p.x + 2, p.y);
    w.update(1 / 60, idle);
    expect(p.stage).toBe(2);
    expect(w.pendingEvolutions).toBe(1);
    w.applyEvolution('surge');
    expect(p.tiers.surge).toBe(1);
    expect(p.stats.burstCooldown).toBeLessThan(3);
    expect(w.pendingEvolutions).toBe(0);
    expect(w.run.evolutions).toBe(1);
  });

  it('a hunter catches an unprotected jelly', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 0;
    w.creatures.length = 0;
    w.spawn(SPECIES_BY_ID['needlefin'], p.x + 5, p.y);
    w.update(1 / 60, idle);
    expect(p.alive).toBe(false);
    expect(w.run.caughtBy).toBe('needlefin');
    for (let i = 0; i < 120; i++) w.update(1 / 60, idle);
    expect(w.ended).toBe('caught');
  });

  it('Sting stuns the hunter instead, then needs to recharge', () => {
    const w = makeWorld({ tiers: { sting: 1 } });
    const p = w.player;
    p.invuln = 0;
    w.creatures.length = 0;
    const hunter = w.spawn(SPECIES_BY_ID['needlefin'], p.x + 5, p.y);
    expect(w.stingReady()).toBe(true);
    w.update(1 / 60, idle);
    expect(p.alive).toBe(true);
    expect(hunter.stunned).toBeGreaterThan(0);
    expect(w.stingReady()).toBe(false);
    expect(w.run.stings).toBe(1);
    expect(w.events.some((e) => e.type === 'sting')).toBe(true);
  });

  it('spawn grace protects the jelly at the very start', () => {
    const w = makeWorld();
    const p = w.player;
    w.creatures.length = 0;
    w.spawn(SPECIES_BY_ID['needlefin'], p.x + 5, p.y);
    w.update(1 / 60, idle);
    expect(p.alive).toBe(true);
  });

  it('burst spends a charge, speeds the jelly up, and recharges', () => {
    const w = makeWorld();
    const p = w.player;
    w.creatures.length = 0;
    w.update(1 / 60, { ax: 1, ay: 0, burst: true });
    expect(p.charges).toBe(0);
    expect(p.vx).toBeGreaterThan(200);
    for (let i = 0; i < 60 * 3.2; i++) w.update(1 / 60, idle);
    expect(p.charges).toBe(1);
  });

  it('Titan lets the jelly eat bigger prey and turns hunters into food', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 0;
    w.creatures.length = 0;
    const minnow = w.spawn(SPECIES_BY_ID['ribbon-minnow'], p.x + 8, p.y);
    w.update(1 / 60, idle);
    expect(minnow.dead).toBe(false);
    w.grantPower('titan');
    // A razorfin pack hunter is no longer a threat at Titan size.
    w.creatures.length = 0;
    w.spawn(SPECIES_BY_ID['razorfin'], p.x + 30, p.y);
    p.mass = 20;
    p.r = 10 * Math.sqrt(2);
    const fish = w.spawn(SPECIES_BY_ID['ribbon-minnow'], p.x + 4, p.y);
    w.update(1 / 60, idle);
    expect(fish.dead).toBe(true);
    expect(p.alive).toBe(true);
  });

  it('eating a power fish grants its power for a while', () => {
    const w = makeWorld();
    const p = w.player;
    w.creatures.length = 0;
    w.spawn(SPECIES_BY_ID['spark-minnow'], p.x + 3, p.y);
    w.update(1 / 60, idle);
    expect(p.powers.overcharge).toBeGreaterThan(7);
    expect(w.run.powerups).toBe(1);
    expect(w.events.some((e) => e.type === 'power' && e.id === 'overcharge')).toBe(true);
    for (let i = 0; i < 60 * 9; i++) w.update(1 / 60, idle);
    expect(p.powers.overcharge).toBe(0);
  });

  it('Overcharge refills bursts much faster', () => {
    const w = makeWorld();
    const p = w.player;
    w.creatures.length = 0;
    w.grantPower('overcharge');
    w.update(1 / 60, { ax: 1, ay: 0, burst: true });
    expect(p.charges).toBe(0);
    for (let i = 0; i < 45; i++) w.update(1 / 60, idle);
    expect(p.charges).toBe(1);
  });

  it('Shell Shield blocks one bite, then is gone', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 0;
    w.creatures.length = 0;
    w.grantPower('shield');
    const h = w.spawn(SPECIES_BY_ID['needlefin'], p.x + 5, p.y);
    w.update(1 / 60, idle);
    expect(p.alive).toBe(true);
    expect(p.powers.shield).toBe(0);
    expect(h.stunned).toBeGreaterThan(0);
    expect(w.run.stings).toBe(0);
  });

  it('Aurora Veil stops hunters noticing the jelly', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 0;
    w.creatures.length = 0;
    w.grantPower('veil');
    const h = w.spawn(SPECIES_BY_ID['needlefin'], p.x + 120, p.y);
    for (let i = 0; i < 30; i++) w.update(1 / 60, idle);
    expect(h.state).not.toBe('notice');
    expect(h.state).not.toBe('chase');
    p.powers.veil = 0;
    h.x = p.x + 120;
    h.y = p.y;
    for (let i = 0; i < 10; i++) w.update(1 / 60, idle);
    expect(['notice', 'chase']).toContain(h.state);
  });

  it('Lanternsharks circle before they telegraph and dash', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 0;
    p.y = 2600;
    w.creatures.length = 0;
    const s = w.spawn(SPECIES_BY_ID['lanternshark'], p.x + 160, p.y);
    w.update(1 / 60, idle);
    expect(s.state).toBe('orbit');
    let sawNotice = false;
    for (let i = 0; i < 60 * 4 && p.alive; i++) {
      w.update(1 / 60, idle);
      if (s.state === 'notice') sawNotice = true;
    }
    expect(sawNotice).toBe(true);
  });

  it('Morays strike from their coral and return home', () => {
    const w = makeWorld();
    const p = w.player;
    p.invuln = 0;
    w.creatures.length = 0;
    const m = w.spawn(SPECIES_BY_ID['coral-moray'], p.x + 200, p.y);
    m.homeX = m.x;
    m.homeY = m.y;
    for (let i = 0; i < 60; i++) w.update(1 / 60, idle);
    // Out of range: it waits at home.
    expect(Math.hypot(m.x - m.homeX, m.y - m.homeY)).toBeLessThan(20);
    p.x = m.x - 90;
    p.y = m.y;
    let struck = false;
    for (let i = 0; i < 60 && p.alive; i++) {
      w.update(1 / 60, idle);
      if (m.state === 'chase') struck = true;
    }
    expect(struck).toBe(true);
  });

  it('runs never time out; only being caught ends them', () => {
    const w = makeWorld();
    w.player.invuln = 1e9;
    w.time = 10 * 60;
    w.creatures.length = 0;
    w.update(1 / 60, idle);
    expect(w.ended).toBeNull();
  });

  it('hunters spawned late in a run are bigger', () => {
    const w = makeWorld();
    const early = w.spawn(SPECIES_BY_ID['gulper-eel'], 0, 0).r / SPECIES_BY_ID['gulper-eel'].radius;
    w.time = 20 * 60;
    const late = w.spawn(SPECIES_BY_ID['gulper-eel'], 0, 0).r / SPECIES_BY_ID['gulper-eel'].radius;
    expect(late).toBeGreaterThan(early * 1.4);
    expect(hunterScale(0)).toBe(1);
    // An apex-size jelly is still prey for a late-run gulper.
    expect(late * SPECIES_BY_ID['gulper-eel'].radius).toBeGreaterThan(60);
  });

  it('rare species respect their conditions', () => {
    const w = makeWorld();
    const p = w.player;
    // Shallows at the start: the seahorse is eligible; aurora needs Glow 2.
    let ids = w.eligibleRares().map((d) => d.id);
    expect(ids).toContain('prism-seahorse');
    expect(ids).not.toContain('aurora-jelly');
    p.tiers.glow = 2;
    ids = w.eligibleRares().map((d) => d.id);
    expect(ids).toContain('aurora-jelly');
    // Nautilus only appears in the twilight after some time.
    p.y = 2600;
    expect(w.eligibleRares().map((d) => d.id)).not.toContain('golden-nautilus');
    w.time = 60;
    expect(w.eligibleRares().map((d) => d.id)).toContain('golden-nautilus');
    // Ghost Ray needs the abyss, stage 2 and a current.
    p.y = 4300;
    p.stage = 2;
    p.inCurrent = false;
    expect(w.eligibleRares().map((d) => d.id)).not.toContain('ghost-ray');
    p.inCurrent = true;
    expect(w.eligibleRares().map((d) => d.id)).toContain('ghost-ray');
  });

  it('populates the world and keeps creatures out of coral over a long run', () => {
    const w = makeWorld();
    for (let i = 0; i < 60 * 20; i++) w.update(1 / 60, { ax: Math.sin(i / 90), ay: 0.4, burst: i % 200 === 0 });
    expect(w.creatures.length).toBeGreaterThan(10);
    for (const c of w.creatures) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    }
    expect(Number.isFinite(w.player.x)).toBe(true);
  });

  it('coral blocks a big jelly from tight gaps', () => {
    const w = makeWorld();
    const p = w.player;
    const cl = w.corals.find((c) => c.circles.length === 1 && c.minY > 800);
    expect(cl).toBeDefined();
    const c = cl!.circles[0];
    p.x = c.x;
    p.y = c.y;
    p.invuln = 99;
    w.creatures.length = 0;
    w.update(1 / 60, idle);
    expect(Math.hypot(p.x - c.x, p.y - c.y)).toBeGreaterThanOrEqual(c.r);
  });
});
