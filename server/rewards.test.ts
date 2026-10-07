import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

let app: ReturnType<typeof buildApp>;
let riley: string;
let bonus: string;
const json = <T = any>(res: { body: string }) => JSON.parse(res.body) as T;
const add = (body: object) => app.inject({ method: 'POST', url: '/api/rewards',
  payload: { memberId: riley, title: 'Movie night', goal: 10, mode: 'monthly', startDay: '2026-09-20', ...body } });
const list = async (today = '2026-10-06') => json<any[]>(await app.inject({ url: `/api/rewards?today=${today}` }));
const tick = (day: string) => app.inject({ method: 'PUT', url: `/api/tasks/${bonus}/done/${riley}/${day}` });

beforeEach(async () => {
  app = buildApp(openDb(':memory:'));
  riley = json(await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Riley', color: '#2fa66a' } })).id;
  bonus = json(await app.inject({ method: 'POST', url: '/api/tasks',
    payload: { title: 'Wash car', memberId: riley, days: [0, 1, 2, 3, 4, 5, 6], category: 'bonus', points: 4 } })).id;
  // 4 stars on Sep 25, Oct 2 and Oct 5.
  for (const day of ['2026-09-25', '2026-10-02', '2026-10-05']) await tick(day);
});

describe('rewards', () => {
  it('counts a monthly reward from the 1st, and an until-earned one from when it was set', async () => {
    await add({});
    await add({ title: 'Lego set', goal: 12, mode: 'until_reached' });
    const [monthly, until] = await list();
    expect(monthly).toMatchObject({ title: 'Movie night', mode: 'monthly', stars: 8 }); // Oct only
    expect(until).toMatchObject({ title: 'Lego set', mode: 'until_reached', stars: 12 }); // since Sep 20
    // Next month the monthly one starts over; the other keeps counting.
    const nov = await list('2026-11-03');
    expect(nov.map((r) => r.stars)).toEqual([0, 12]);
  });

  it('drops a reward once it is marked as given, and can edit or delete', async () => {
    const r = json(await add({ mode: 'until_reached' }));
    await app.inject({ method: 'PATCH', url: `/api/rewards/${r.id}`, payload: { title: 'Pizza night', goal: 20 } });
    expect((await list())[0]).toMatchObject({ title: 'Pizza night', goal: 20 });
    expect((await app.inject({ method: 'POST', url: `/api/rewards/${r.id}/given` })).statusCode).toBe(204);
    expect(await list()).toEqual([]);
    const other = json(await add({}));
    expect((await app.inject({ method: 'DELETE', url: `/api/rewards/${other.id}` })).statusCode).toBe(204);
    expect(await list()).toEqual([]);
  });

  it('rejects bad rewards and removes them with the person', async () => {
    expect((await add({ goal: 0 })).statusCode).toBe(400);
    expect((await add({ mode: 'weekly' })).statusCode).toBe(400);
    expect((await add({ memberId: 'nope' })).statusCode).toBe(400);
    await add({});
    await app.inject({ method: 'DELETE', url: `/api/members/${riley}` });
    expect(await list()).toEqual([]);
  });
});
