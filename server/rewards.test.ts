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

describe('rewards together, earned and given', () => {
  let sam: string;
  let samBonus: string;
  const samTick = (day: string) => app.inject({ method: 'PUT', url: `/api/tasks/${samBonus}/done/${sam}/${day}` });
  const history = async () => json<any[]>(await app.inject({ url: '/api/rewards/history' }));
  beforeEach(async () => {
    sam = json(await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Sam', color: '#2f7de1' } })).id;
    samBonus = json(await app.inject({ method: 'POST', url: '/api/tasks',
      payload: { title: 'Rake leaves', memberId: sam, days: [0, 1, 2, 3, 4, 5, 6], category: 'bonus', points: 3 } })).id;
    await samTick('2026-10-03'); // Sam: 3 stars in October.
  });

  it('pools stars for a team reward, showing what each kid added', async () => {
    await add({ memberIds: [riley, sam], memberId: undefined, title: 'Trampoline park', goal: 11 });
    const [r] = await list();
    expect(r).toMatchObject({ memberIds: [riley, sam], teamMode: 'pooled', stars: 11, memberStars: { [riley]: 8, [sam]: 3 },
      status: 'earned', earnedDay: '2026-10-05' });
  });

  it('with "each", every kid has to reach the goal', async () => {
    await add({ memberIds: [riley, sam], memberId: undefined, title: 'Ice cream', goal: 6, teamMode: 'each' });
    expect((await list())[0]).toMatchObject({ status: 'in_progress' }); // Sam has 3 of 6
    await samTick('2026-10-04');
    // Riley reaches 6 on Oct 5, so that's when both have it.
    expect((await list())[0]).toMatchObject({ status: 'earned', earnedDay: '2026-10-05' });
  });

  it('takes an earning back if ticks are undone before it is given', async () => {
    await add({ goal: 8 });
    expect((await list())[0].status).toBe('earned');
    await app.inject({ method: 'DELETE', url: `/api/tasks/${bonus}/done/${riley}/2026-10-05` });
    expect((await list())[0].status).toBe('in_progress');
    expect(await history()).toEqual([]);
  });

  it('keeps a history of what was earned and given, and who earned it', async () => {
    const r = json(await add({ goal: 8 }));
    await list();
    expect(await history()).toMatchObject([{ title: 'Movie night', memberIds: [riley], earnedDay: '2026-10-05', givenAt: null }]);
    await app.inject({ method: 'POST', url: `/api/rewards/${r.id}/given?today=2026-10-06` });
    // A monthly reward stays (given for October); the history has it given.
    expect((await list())[0]).toMatchObject({ status: 'given' });
    expect((await history())[0].givenAt).toBeTruthy();
    // Renaming the reward later doesn't rewrite history; next month counts afresh.
    await app.inject({ method: 'PATCH', url: `/api/rewards/${r.id}`, payload: { title: 'Pizza night' } });
    expect((await history())[0].title).toBe('Movie night');
    expect((await list('2026-11-02'))[0]).toMatchObject({ status: 'in_progress', stars: 0 });
  });

  it('starts a repeating until-earned reward again after it is given', async () => {
    const r = json(await add({ mode: 'until_reached', goal: 8, repeats: true }));
    expect((await list())[0].status).toBe('earned');
    await app.inject({ method: 'POST', url: `/api/rewards/${r.id}/given?today=2026-10-06` });
    expect((await list('2026-10-08'))[0]).toMatchObject({ status: 'in_progress', stars: 0, startDay: '2026-10-07' });
    // Undo the hand-over: it's waiting again, counting from before.
    const [win] = await history();
    await app.inject({ method: 'POST', url: `/api/rewards/wins/${win.id}/undo` });
    expect((await list())[0]).toMatchObject({ status: 'earned', startDay: '2026-09-20' });
  });
});
