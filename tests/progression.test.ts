import { describe, expect, it } from 'vitest';
import { MAX_MASS, STAGES, START_MASS, detectionScale, growthGain, radiusForMass, stageForMass, stageProgress } from '../src/content/progression';
import { SPECIES } from '../src/content/species';
import { CHALLENGES } from '../src/content/challenges';
import { applyRun, emptyRunStats, metricValue, nextChallenge } from '../src/core/progress';
import { defaultSave } from '../src/persistence/save';

describe('growth and stages', () => {
  it('radius grows with the square root of mass', () => {
    expect(radiusForMass(START_MASS)).toBeCloseTo(10);
    expect(radiusForMass(START_MASS * 4)).toBeCloseTo(20);
  });

  it('maps mass to stages and progress', () => {
    expect(stageForMass(START_MASS)).toBe(1);
    expect(stageForMass(STAGES[1].mass)).toBe(2);
    expect(stageForMass(MAX_MASS)).toBe(STAGES.length);
    expect(stageProgress(STAGES[1].mass)).toBe(0);
    expect(stageProgress((STAGES[1].mass + STAGES[2].mass) / 2)).toBeCloseTo(0.5);
  });

  it('food is worth a little less as the jelly grows', () => {
    expect(growthGain(10, START_MASS)).toBeCloseTo(10);
    expect(growthGain(10, 200)).toBeLessThan(10);
  });

  it('bigger jellies are noticed from further away', () => {
    expect(detectionScale(30)).toBeGreaterThan(detectionScale(10));
  });
});

describe('content data', () => {
  it('has 12–16 species with unique ids, including the player', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(12);
    expect(SPECIES.length).toBeLessThanOrEqual(16);
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
    expect(SPECIES.some((s) => s.role === 'player')).toBe(true);
  });

  it('has at least three prey sizes and two regular predator types', () => {
    const prey = new Set(SPECIES.filter((s) => s.role === 'prey' && s.weight > 0).map((s) => s.radius));
    expect(prey.size).toBeGreaterThanOrEqual(3);
    expect(SPECIES.filter((s) => s.role === 'predator' && s.weight > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('every hunter has hunting data and every rare has rules', () => {
    for (const s of SPECIES) {
      if (s.role === 'predator') expect(s.hunter).toBeDefined();
      if (s.rarity === 'rare' || s.rarity === 'legendary') expect(s.rare).toBeDefined();
    }
  });
});

describe('run outcome and challenges', () => {
  it('records best score, stats and completes challenges with rewards', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), score: 5000, mass: 120, stage: 3, eaten: 50, evolutions: 2, maxDepth: 4000, time: 140 };
    const out = applyRun(save, run, 1000);
    expect(out.newBest).toBe(true);
    expect(save.best.score).toBe(5000);
    expect(save.stats.runs).toBe(1);
    const ids = out.completed.map((c) => c.id);
    expect(ids).toContain('first-bloom');
    expect(ids).toContain('feast');
    expect(ids).toContain('deep-diver');
    expect(ids).not.toContain('tide-rider');
    expect(save.unlocks).toContain('skin:coral');
    expect(save.unlocks).toContain('trait:seed-glow');
  });

  it('does not complete a challenge twice', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), evolutions: 1 };
    expect(applyRun(save, run).completed.map((c) => c.id)).toContain('first-bloom');
    expect(applyRun(save, run).completed.map((c) => c.id)).not.toContain('first-bloom');
  });

  it('records discoveries and lifetime challenges', () => {
    const save = defaultSave();
    const run = { ...emptyRunStats(), seen: ['moon-jelli', 'glimmer-krill', 'prism-seahorse'], eatenBySpecies: { 'glimmer-krill': 4 } };
    const out = applyRun(save, run);
    expect(out.newDiscoveries).toEqual(['moon-jelli', 'glimmer-krill', 'prism-seahorse']);
    expect(save.discovered['glimmer-krill'].eaten).toBe(4);
    expect(metricValue('life.rareDiscovered', null, save)).toBe(1);
    expect(out.completed.map((c) => c.id)).toContain('rare-sighting');
    const again = applyRun(save, run);
    expect(again.newDiscoveries).toEqual([]);
    expect(save.discovered['glimmer-krill'].seen).toBe(2);
  });

  it('points at the first unfinished challenge', () => {
    const save = defaultSave();
    expect(nextChallenge(save)?.id).toBe(CHALLENGES[0].id);
  });
});
