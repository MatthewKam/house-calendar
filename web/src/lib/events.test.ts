import { describe, expect, it } from 'vitest';
import { isOver } from './events';
import type { CalEvent } from './types';

const ev = (allDay: boolean, end: string) => ({ allDay, end }) as CalEvent;

describe('isOver', () => {
  const now = new Date(2026, 9, 8, 17, 0); // Oct 8, 5 PM local
  it('counts a timed event over once it has ended', () => {
    expect(isOver(ev(false, new Date(2026, 9, 8, 16, 59).toISOString()), now)).toBe(true);
    expect(isOver(ev(false, new Date(2026, 9, 8, 17, 30).toISOString()), now)).toBe(false);
  });
  it('counts an all-day event over only once its day has passed (by the local date)', () => {
    expect(isOver(ev(true, '2026-10-09'), now)).toBe(false); // today's all-day event (ends the 9th, exclusive)
    expect(isOver(ev(true, '2026-10-08'), now)).toBe(true); // yesterday's
  });
});
