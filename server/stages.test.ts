import { describe, expect, it } from 'vitest';
import { ageOn, stageForAge, stageOf } from './stages.ts';

describe('stages', () => {
  it('counts whole years, turning a year older on the birthday', () => {
    expect(ageOn('2022-11-05', '2026-11-04')).toBe(3);
    expect(ageOn('2022-11-04', '2026-11-04')).toBe(4);
    expect(ageOn('2020-02-29', '2026-02-28')).toBe(5);
  });

  it('gives each age its stage', () => {
    expect([0, 2, 3, 4, 6, 7, 10, 11, 14, 15, 17, 18, 40].map(stageForAge)).toEqual([
      'little', 'little', 'little', 'early', 'early', 'middle', 'middle', 'tween', 'tween', 'teen', 'teen', 'adult', 'adult',
    ]);
  });

  it('prefers the stage a guardian chose, and has none without a birthday', () => {
    expect(stageOf({ birthdate: '2022-06-01', stage: null }, '2026-11-04')).toBe('early');
    expect(stageOf({ birthdate: '2022-06-01', stage: 'little' }, '2026-11-04')).toBe('little');
    expect(stageOf({ birthdate: null, stage: null }, '2026-11-04')).toBeNull();
  });
});
