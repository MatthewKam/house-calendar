import { describe, expect, it } from 'vitest';
import { rangeLabel, timeLabel } from './dates';

const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m);

describe('rangeLabel', () => {
  it('says AM or PM once when both share it', () => {
    expect(rangeLabel(at(9), at(10, 30))).toBe(`${timeLabel(at(9)).replace(/\s?[AP]M$/i, '')} – ${timeLabel(at(10, 30))}`);
    expect(rangeLabel(at(9), at(10, 30))).not.toMatch(/AM.*AM/);
  });
  it('keeps both when they differ', () => {
    expect(rangeLabel(at(11), at(12, 30))).toBe(`${timeLabel(at(11))} – ${timeLabel(at(12, 30))}`);
  });
});
