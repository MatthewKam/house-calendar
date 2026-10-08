import { describe, expect, it } from 'vitest';
import { placeDay } from './timegrid';
import type { CalEvent } from './types';

const day = new Date(2026, 9, 8); // local midnight, Oct 8
const at = (h: number) => new Date(2026, 9, 8, Math.floor(h), Math.round((h % 1) * 60)).toISOString();
const ev = (id: string, from: number, to: number, allDay = false) =>
  ({ id, title: id, allDay, start: allDay ? '2026-10-08' : at(from), end: allDay ? '2026-10-09' : at(to), memberIds: [] }) as unknown as CalEvent;

describe('placeDay', () => {
  it('places events by their time, and side by side where they overlap', () => {
    const placed = placeDay([ev('a', 9, 10), ev('b', 9.5, 11), ev('c', 10, 10.5), ev('d', 12, 13), ev('all', 0, 0, true)], day, 6, 23);
    const by = Object.fromEntries(placed.map((p) => [p.ev.id, p]));
    expect(Object.keys(by).sort()).toEqual(['a', 'b', 'c', 'd']); // all-day ones aren't in the timeline
    expect(by.a).toMatchObject({ top: 3 / 17, height: 1 / 17, col: 0, cols: 2 });
    expect(by.b).toMatchObject({ col: 1, cols: 2 });
    // c starts when a ends, so it takes a's column.
    expect(by.c).toMatchObject({ col: 0, cols: 2, hours: 0.5 });
    expect(by.d).toMatchObject({ col: 0, cols: 1, top: 6 / 17 });
  });
});
