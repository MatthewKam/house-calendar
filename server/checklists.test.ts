import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';

describe('what to bring', () => {
  it('keeps a list on an event, ticked for that time only', async () => {
    const { db, call } = household();
    const ev = (await call('POST', '/api/events', { title: 'Jiu jitsu', allDay: false,
      start: '2026-11-13T23:00:00.000Z', end: '2026-11-14T00:00:00.000Z' })).body;
    expect(ev.checklist).toEqual([]);

    const set = await call('PUT', `/api/events/${ev.id}/checklist`, { items: [
      { title: 'Belt', picture: '🥋' }, { title: ' Snack ', picture: null }, { title: '   ', picture: null }] });
    expect(set.body.checklist).toEqual([
      { id: expect.any(String), title: 'Belt', picture: '🥋', done: false },
      { id: expect.any(String), title: 'Snack', picture: null, done: false }]);
    const [belt, snack] = set.body.checklist;

    const ticked = await call('PUT', `/api/events/${ev.id}/checklist/${belt.id}`, { done: true });
    expect(ticked.body.checklist.map((x: { done: boolean }) => x.done)).toEqual([true, false]);

    // Reordered and renamed: the belt keeps its tick; the snack goes, a water bottle comes.
    const changed = await call('PUT', `/api/events/${ev.id}/checklist`, { items: [
      { title: 'Water bottle', picture: '💧' }, { id: belt.id, title: 'Black belt', picture: '🥋' }] });
    expect(changed.body.checklist).toEqual([
      { id: expect.any(String), title: 'Water bottle', picture: '💧', done: false },
      { id: belt.id, title: 'Black belt', picture: '🥋', done: true }]);
    expect((await call('PUT', `/api/events/${ev.id}/checklist/${snack.id}`, { done: true })).status).toBe(404);

    // Next week (the event moved on a day): the same list, nothing ticked.
    db.prepare('UPDATE events SET start = ?, end = ? WHERE id = ?').run('2026-11-20T23:00:00.000Z', '2026-11-21T00:00:00.000Z', ev.id);
    const next = (await call('GET', '/api/events?from=2026-11-20T00:00:00.000Z&to=2026-11-22T00:00:00.000Z&fromDay=2026-11-20&toDay=2026-11-22')).body;
    expect(next[0].checklist.map((x: { title: string; done: boolean }) => [x.title, x.done])).toEqual([['Water bottle', false], ['Black belt', false]]);

    // Deleting the event takes its list with it.
    await call('DELETE', `/api/events/${ev.id}`);
    expect(db.prepare('SELECT COUNT(*) AS n FROM event_checklist').get()).toEqual({ n: 0 });
  });

  it('keeps one list for every repeat of a synced event', async () => {
    const { db, call } = household();
    db.prepare(`INSERT INTO calendars (id, provider, remote_id, name) VALUES ('ic', 'icloud', 'r', 'Family')`).run();
    const add = db.prepare(`INSERT INTO events (id, calendar_id, title, start, end, remote_id, series_id) VALUES (?, 'ic', 'Jiu jitsu', ?, ?, ?, 'series-1')`);
    add.run('a', '2026-11-13T23:00:00.000Z', '2026-11-14T00:00:00.000Z', 'x#1');
    add.run('b', '2026-11-20T23:00:00.000Z', '2026-11-21T00:00:00.000Z', 'x#2');
    const [gi] = (await call('PUT', '/api/events/a/checklist', { items: [{ title: 'Gi', picture: '🥋' }] })).body.checklist;
    await call('PUT', `/api/events/a/checklist/${gi.id}`, { done: true });
    const week = (await call('GET', '/api/events?from=2026-11-13T00:00:00.000Z&to=2026-11-22T00:00:00.000Z&fromDay=2026-11-13&toDay=2026-11-22')).body;
    expect(week.map((e: { id: string; checklist: { done: boolean }[] }) => [e.id, e.checklist[0].done])).toEqual([['a', true], ['b', false]]);
    expect((await call('PUT', '/api/events/nope/checklist', { items: [] })).status).toBe(404);
  });
});
