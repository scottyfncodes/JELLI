import { describe, expect, it } from 'vitest';
import { canEat, eatContact, isThreat, threatContact } from '../src/sim/rules';
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

  it('uses a generous mouth and a forgiving bite', () => {
    // Eating triggers once the bell overlaps roughly half the prey.
    expect(eatContact(11, 10, 4)).toBe(true);
    expect(eatContact(13, 10, 4)).toBe(false);
    // A hunter has to reach well inside its own outline to bite.
    expect(threatContact(26, 10, 26)).toBe(false);
    expect(threatContact(20, 10, 26)).toBe(true);
  });

  it('wider maw (Surge: Comet) reaches further during bursts', () => {
    expect(eatContact(13, 10, 4, 1)).toBe(false);
    expect(eatContact(13, 10, 4, 1.35)).toBe(true);
  });
});
