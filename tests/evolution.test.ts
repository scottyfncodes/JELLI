import { describe, expect, it } from 'vitest';
import { BASE_STATS, computeStats, tiersFor } from '../src/content/evolutions';
import { CATEGORY, MUTATIONS, MUTATIONS_BY_ID, canTake, type MutationCategory } from '../src/content/mutations';
import { PERSONALITIES, carryPersonality, dominant, emptyPersonality } from '../src/content/personality';

describe('mutations', () => {
  it('base stats are unchanged with no mutations', () => {
    expect(computeStats([])).toEqual(BASE_STATS);
  });

  it('every mutation changes the octopus and says how it looks', () => {
    for (const m of MUTATIONS) {
      expect(computeStats([m.id]), m.id).not.toEqual(BASE_STATS);
      expect(m.look.length, m.id).toBeGreaterThan(5);
      expect(m.desc.length, m.id).toBeGreaterThan(5);
    }
  });

  it('every category offers real choices', () => {
    for (const cat of Object.keys(CATEGORY) as MutationCategory[]) {
      expect(MUTATIONS.filter((m) => m.category === cat).length, cat).toBeGreaterThanOrEqual(2);
    }
  });

  it('costs are real: a mutation with a cost makes something worse', () => {
    const worse = (a: number, b: number, higherIsBetter: boolean) => (higherIsBetter ? a < b : a > b);
    const lowerIsBetter = new Set(['burstCooldown', 'detectMult', 'grip', 'preyWary', 'stingCooldown']);
    for (const m of MUTATIONS.filter((x) => x.cost)) {
      const s = computeStats([m.id]);
      const hurt = (Object.keys(BASE_STATS) as (keyof typeof BASE_STATS)[]).some((k) => worse(s[k], BASE_STATS[k], !lowerIsBetter.has(k)));
      expect(hurt, m.id).toBe(true);
    }
  });

  it('respects what a mutation grows from, and what it rules out', () => {
    expect(canTake('twin-jet', [])).toBe(false);
    expect(canTake('twin-jet', ['jet-siphon'])).toBe(true);
    expect(canTake('hooked-suckers', ['strong-suckers'])).toBe(false);
    expect(canTake('strong-suckers', ['hooked-suckers'])).toBe(false);
    expect(canTake('jet-siphon', ['jet-siphon'])).toBe(false);
  });

  it('a body built for depth lets the octopus go deeper, all the way with an abyssal heart', () => {
    expect(computeStats(['deep-body']).depthTolerance).toBe(BASE_STATS.depthTolerance + 2);
    expect(computeStats(['deep-body', 'abyssal-heart']).depthTolerance).toBe(BASE_STATS.depthTolerance + 4);
  });

  it('counts mutations by the kind of food that brings them on', () => {
    expect(tiersFor(['keen-eyes', 'bioluminescence', 'jet-siphon'])).toEqual({ glow: 2, surge: 1, sting: 0 });
    expect(MUTATIONS_BY_ID['deep-body'].affinity).toBeNull();
  });
});

describe('personality', () => {
  it('only emerges once one trait clearly leads', () => {
    const p = emptyPersonality();
    expect(dominant(p)).toBeNull();
    p.curious = 20;
    p.playful = 18;
    expect(dominant(p)).toBeNull();
    p.curious = 30;
    expect(dominant(p)).toBe('curious');
  });

  it('fades across dives, so a new way of playing changes the octopus', () => {
    let life = { ...emptyPersonality(), cautious: 40 };
    for (let i = 0; i < 4; i++) life = carryPersonality(life, { ...emptyPersonality(), aggressive: 20 });
    expect(dominant(life)).toBe('aggressive');
  });

  it('lends a small edge', () => {
    expect(computeStats([], BASE_STATS, [], [], 'curious').rareChance).toBeGreaterThan(BASE_STATS.rareChance);
    for (const d of Object.values(PERSONALITIES)) expect(computeStats([], BASE_STATS, [], [], d.id), d.id).not.toEqual(BASE_STATS);
  });
});
