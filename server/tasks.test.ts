import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

let app: ReturnType<typeof buildApp>;
let riley: string;
const json = <T = any>(res: { body: string }) => JSON.parse(res.body) as T;

beforeEach(async () => {
  app = buildApp(openDb(':memory:'));
  riley = json(await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Riley', color: '#2fa66a' } })).id;
});

describe('tasks', () => {
  it('adds, edits and removes a task', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: ' Feed the dog ', memberId: riley, days: [6, 0, 3, 3] } });
    expect(created.statusCode).toBe(201);
    const task = json(created);
    expect(task).toMatchObject({ title: 'Feed the dog', memberId: riley, days: [0, 3, 6] });
    expect(Date.parse(task.createdAt)).not.toBeNaN();

    const edited = json(await app.inject({ method: 'PATCH', url: `/api/tasks/${task.id}`, payload: { days: [1, 4] } }));
    expect(edited.days).toEqual([1, 4]);
    expect((await app.inject({ method: 'DELETE', url: `/api/tasks/${task.id}` })).statusCode).toBe(204);
    expect(json(await app.inject({ url: '/api/tasks' }))).toEqual([]);
  });

  it('rejects unknown kids and empty schedules', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'X', memberId: 'nope', days: [1] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'X', memberId: riley, days: [] } })).statusCode).toBe(400);
  });

  it('checks a task off for a day and back again', async () => {
    const { id } = json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Make bed', memberId: riley, days: [0, 1, 2, 3, 4, 5, 6] } }));
    const week = '/api/tasks/done?from=2026-10-04&to=2026-10-11';
    await app.inject({ method: 'PUT', url: `/api/tasks/${id}/done/${riley}/2026-10-06` });
    await app.inject({ method: 'PUT', url: `/api/tasks/${id}/done/${riley}/2026-10-06` }); // repeat is harmless
    await app.inject({ method: 'PUT', url: `/api/tasks/${id}/done/${riley}/2026-10-11` }); // next week
    expect(json(await app.inject({ url: week }))).toEqual([{ taskId: id, memberId: riley, day: '2026-10-06', points: 0 }]);
    await app.inject({ method: 'DELETE', url: `/api/tasks/${id}/done/${riley}/2026-10-06` });
    expect(json(await app.inject({ url: week }))).toEqual([]);
  });

  it('removes a kid\'s tasks and history with them', async () => {
    const { id } = json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Make bed', memberId: riley, days: [1] } }));
    await app.inject({ method: 'PUT', url: `/api/tasks/${id}/done/${riley}/2026-10-05` });
    await app.inject({ method: 'DELETE', url: `/api/members/${riley}` });
    expect(json(await app.inject({ url: '/api/tasks' }))).toEqual([]);
    expect(json(await app.inject({ url: '/api/tasks/done?from=2026-10-01&to=2026-11-01' }))).toEqual([]);
  });

  it('lets everyone do a shared task, each ticking off their own', async () => {
    const sam = json(await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Sam', color: '#2f7de1' } })).id;
    const shared = json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Brush teeth', memberId: null, days: [2] } }));
    expect(shared.memberId).toBeNull();
    await app.inject({ method: 'PUT', url: `/api/tasks/${shared.id}/done/${riley}/2026-10-06` });
    expect(json(await app.inject({ url: '/api/tasks/done?from=2026-10-04&to=2026-10-11' })))
      .toEqual([{ taskId: shared.id, memberId: riley, day: '2026-10-06', points: 0 }]);

    // Someone else's own task can't be ticked off for them.
    const mine = json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Make bed', memberId: riley, days: [2] } }));
    expect((await app.inject({ method: 'PUT', url: `/api/tasks/${mine.id}/done/${sam}/2026-10-06` })).statusCode).toBe(400);

    // Giving the shared task to Sam only drops Riley's ticks for it.
    await app.inject({ method: 'PUT', url: `/api/tasks/${shared.id}/done/${sam}/2026-10-06` });
    await app.inject({ method: 'PATCH', url: `/api/tasks/${shared.id}`, payload: { memberId: sam } });
    expect(json(await app.inject({ url: '/api/tasks/done?from=2026-10-04&to=2026-10-11' })))
      .toEqual([{ taskId: shared.id, memberId: sam, day: '2026-10-06', points: 0 }]);
  });

  it('stores time, category and required-or-extra, enforcing Daily and Bonus', async () => {
    const add = async (body: object) =>
      json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'X', memberId: riley, days: [2], ...body } }));
    // Daily is the default, and "everyday" is no longer accepted.
    expect(await add({})).toMatchObject({ time: null, category: 'non_negotiable', required: true, points: 0 });
    const old = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'X', memberId: riley, days: [2], category: 'everyday' } });
    expect(old.statusCode).toBe(400);
    // Daily ("non_negotiable") is always required, so its points are dropped.
    expect(await add({ category: 'non_negotiable', required: false, points: 5, time: 'morning' }))
      .toMatchObject({ category: 'non_negotiable', required: true, points: 0, time: 'morning' });
    // Bonus is always an extra.
    expect(await add({ category: 'bonus', required: true, points: 3 })).toMatchObject({ required: false, points: 3 });
    // Chores follow the switch.
    expect(await add({ category: 'chores', required: false, points: 2, time: 'evening' }))
      .toMatchObject({ required: false, points: 2, time: 'evening' });
    const bad = await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'X', memberId: riley, days: [2], time: 'noon' } });
    expect(bad.statusCode).toBe(400);
  });

  it('adds up points from extras for the week and the month, as they were when ticked', async () => {
    const extra = json(await app.inject({ method: 'POST', url: '/api/tasks',
      payload: { title: 'Wash car', memberId: riley, days: [0, 1, 2, 3, 4, 5, 6], category: 'bonus', points: 5 } }));
    const req = json(await app.inject({ method: 'POST', url: '/api/tasks',
      payload: { title: 'Make bed', memberId: riley, days: [0, 1, 2, 3, 4, 5, 6] } }));
    for (const day of ['2026-09-30', '2026-10-02', '2026-10-05']) {
      await app.inject({ method: 'PUT', url: `/api/tasks/${extra.id}/done/${riley}/${day}` });
      await app.inject({ method: 'PUT', url: `/api/tasks/${req.id}/done/${riley}/${day}` }); // required: no points
    }
    // Raising the value later doesn't change what was already earned.
    await app.inject({ method: 'PATCH', url: `/api/tasks/${extra.id}`, payload: { points: 50 } });
    await app.inject({ method: 'PUT', url: `/api/tasks/${extra.id}/done/${riley}/2026-10-06` });

    const totals = json(await app.inject({ url: '/api/tasks/points?week=2026-10-04&month=2026-10-01&to=2026-10-07' }));
    // Week (Oct 4-6): 5 + 50. Month (Oct 1-6): 5 + 5 + 50. Sep 30 is in neither.
    expect(totals).toEqual([{ memberId: riley, week: 55, month: 60 }]);
  });

  it('reorders tasks, keeping the rest after the ones given', async () => {
    const add = async (title: string) =>
      json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title, memberId: riley, days: [2] } })).id as string;
    const a = await add('A');
    const b = await add('B');
    const c = await add('C');
    const res = json(await app.inject({ method: 'PUT', url: '/api/tasks/order', payload: { ids: [c, a] } }));
    expect(res.map((t: any) => t.title)).toEqual(['C', 'A', 'B']);
    expect(json(await app.inject({ url: '/api/tasks' })).map((t: any) => t.id)).toEqual([c, a, b]);
  });

  it('includes the stars each tick earned', async () => {
    const { id } = json(await app.inject({ method: 'POST', url: '/api/tasks',
      payload: { title: 'Wash car', memberId: riley, days: [2], category: 'bonus', points: 4 } }));
    await app.inject({ method: 'PUT', url: `/api/tasks/${id}/done/${riley}/2026-10-06` });
    expect(json(await app.inject({ url: '/api/tasks/done?from=2026-10-04&to=2026-10-11' })))
      .toEqual([{ taskId: id, memberId: riley, day: '2026-10-06', points: 4 }]);
  });


  it('stores an optional icon for a task', async () => {
    const t = json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'Brush teeth', memberId: riley, days: [2], icon: '🦷' } }));
    expect(t.icon).toBe('🦷');
    const changed = json(await app.inject({ method: 'PATCH', url: `/api/tasks/${t.id}`, payload: { icon: '' } }));
    expect(changed.icon).toBeNull();
    const plain = json(await app.inject({ method: 'POST', url: '/api/tasks', payload: { title: 'X', memberId: riley, days: [2] } }));
    expect(plain.icon).toBeNull();
  });
});
