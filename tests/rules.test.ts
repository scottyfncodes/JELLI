import { describe, expect, it } from 'vitest';
import { canEat, escapeRate, isThreat, tentacleCount, tentaclePullSpeed, tentacleReach, threatContact } from '../src/sim/rules';
import { SPECIES_BY_ID } from '../src/content/species';

const krill = SPECIES_BY_ID['glimmer-krill'];
const needlefin = SPECIES_BY_ID['needlefin'];
const ray = SPECIES_BY_ID['ghost-ray'];
const minnow = SPECIES_BY_ID['ribbon-minnow'];

describe('feeding rules', () => {
  it('lets a jelly eat clearly smaller prey only', () => {
    expect(canEat(10, krill.radius, krill)).toBe(true);
    expect(canEat(10, 9.5, minnow)).toBe(false);
    expect(canEat(10, 8.8, minnow)).toBe(true);
  });

  it('never allows eating inedible species, whatever the size', () => {
    expect(canEat(1000, ray.radius, ray)).toBe(false);
  });

  it('treats hunters as threats only while clearly bigger', () => {
    expect(isThreat(10, needlefin.radius, needlefin)).toBe(true);
    expect(isThreat(24, 26, needlefin)).toBe(false);
    expect(isThreat(10, 40, minnow)).toBe(false);
  });

  it('a grown jelly can turn the tables on a hunter', () => {
    expect(canEat(32, needlefin.radius, needlefin)).toBe(true);
    expect(isThreat(32, needlefin.radius, needlefin)).toBe(false);
  });

  it('uses a forgiving bite', () => {
    // A hunter has to reach well inside its own outline to bite.
    expect(threatContact(26, 10, 26)).toBe(false);
    expect(threatContact(20, 10, 26)).toBe(true);
  });
});

describe('tentacle rules', () => {
  it('starts short and lengthens faster than the bell grows', () => {
    expect(tentacleReach(10)).toBeLessThan(40);
    expect(tentacleReach(10)).toBeGreaterThan(10 * 2.5);
    expect(tentacleReach(40) / 40).toBeGreaterThan(tentacleReach(10) / 10 * 1.3);
  });

  it('grows arms with size stages, capped at five', () => {
    expect(tentacleCount(1)).toBe(3);
    expect(tentacleCount(2)).toBe(4);
    expect(tentacleCount(4)).toBe(5);
    expect(tentacleCount(9)).toBe(5);
  });

  it('reels heavy prey in slower than light prey', () => {
    expect(tentaclePullSpeed(10, 8)).toBeLessThan(tentaclePullSpeed(10, 3));
  });

  it('only prey near the jelly size fights back', () => {
    expect(escapeRate(10, 3, false)).toBe(0);
    expect(escapeRate(10, 8.5, false)).toBeGreaterThan(0);
    expect(escapeRate(30, 26, true)).toBeGreaterThan(escapeRate(30, 26, false));
  });
});
