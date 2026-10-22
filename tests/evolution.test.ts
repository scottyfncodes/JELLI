import { describe, expect, it } from 'vitest';
import { BASE_STATS, PATHS, availablePaths, computeStats, emptyTiers } from '../src/content/evolutions';

describe('evolution paths', () => {
  it('base stats are unchanged with no evolutions', () => {
    expect(computeStats(emptyTiers())).toEqual(BASE_STATS);
  });

  it('Glow widens light, boosts rare odds and adds the compass at tier 2', () => {
    const t1 = computeStats({ glow: 1, surge: 0, sting: 0 });
    expect(t1.lightRadius).toBeGreaterThan(BASE_STATS.lightRadius);
    expect(t1.rareChance).toBeGreaterThan(1);
    expect(t1.rareCompass).toBe(0);
    const t2 = computeStats({ glow: 2, surge: 0, sting: 0 });
    expect(t2.rareCompass).toBe(1);
    const t3 = computeStats({ glow: 3, surge: 0, sting: 0 });
    expect(t3.detectMult).toBeLessThan(1);
    expect(t3.discoveryBonus).toBe(2);
  });

  it('Surge makes bursts cheaper and stronger, then adds a second charge', () => {
    const t1 = computeStats({ glow: 0, surge: 1, sting: 0 });
    expect(t1.burstCooldown).toBeLessThan(BASE_STATS.burstCooldown);
    expect(t1.burstPower).toBeGreaterThan(1);
    const t3 = computeStats({ glow: 0, surge: 3, sting: 0 });
    expect(t3.burstCharges).toBe(2);
    expect(t3.currentControl).toBe(1);
  });

  it('Sting grants a recharging sting that improves, then a nova', () => {
    expect(BASE_STATS.stingCooldown).toBe(0);
    const t1 = computeStats({ glow: 0, surge: 0, sting: 1 });
    expect(t1.stingCooldown).toBe(14);
    const t2 = computeStats({ glow: 0, surge: 0, sting: 2 });
    expect(t2.stingCooldown).toBeLessThan(t1.stingCooldown);
    expect(t2.stingStun).toBeGreaterThan(t1.stingStun);
    expect(computeStats({ glow: 0, surge: 0, sting: 3 }).stingNova).toBeGreaterThan(0);
  });

  it('clamps out-of-range tiers', () => {
    expect(computeStats({ glow: 9, surge: -2, sting: 0 })).toEqual(computeStats({ glow: 3, surge: 0, sting: 0 }));
  });

  it('every path defines exactly three tiers, and maxed paths drop out', () => {
    for (const p of Object.values(PATHS)) expect(p.tiers).toHaveLength(3);
    expect(availablePaths({ glow: 3, surge: 1, sting: 0 })).toEqual(['surge', 'sting']);
  });
});
