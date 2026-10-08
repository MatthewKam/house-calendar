import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

let app: ReturnType<typeof buildApp>;
let riley: string;
let sam: string;
let bonus: string;
const TODAY = '2026-10-06';
const json = <T = any>(res: { body: string }) => JSON.parse(res.body) as T;
const add = async (body: object) => json(await app.inject({ method: 'POST', url: '/api/rewards',
  payload: { memberIds: [riley], title: 'Movie night', goal: 10, today: TODAY, ...body } }));
const list = async (today = TODAY) => json<any[]>(await app.inject({ url: `/api/rewards?today=${today}` }));
const history = async () => json<any[]>(await app.inject({ url: '/api/rewards/history' }));
const buckets = async () => Object.fromEntries(json<any[]>(await app.inject({ url: '/api/rewards/buckets' })).map((b) => [b.memberId, b.stars]));
const place = (memberId: string, places: { rewardId: string; stars: number }[], extra: object = {}) =>
  app.inject({ method: 'POST', url: '/api/rewards/place', payload: { memberId, today: TODAY, places, ...extra } });
const redeem = (winId: string) => app.inject({ method: 'POST', url: `/api/rewards/wins/${winId}/given` });

beforeEach(async () => {
  app = buildApp(openDb(':memory:'));
  const member = async (name: string) => json(await app.inject({ method: 'POST', url: '/api/members', payload: { name, color: '#2fa66a' } })).id;
  riley = await member('Riley');
  sam = await member('Sam');
  const extra = async (memberId: string, points: number) => json(await app.inject({ method: 'POST', url: '/api/tasks',
    payload: { title: 'Extra', memberId, days: [0, 1, 2, 3, 4, 5, 6], category: 'bonus', points } })).id;
  bonus = await extra(riley, 4);
  const samBonus = await extra(sam, 3);
  // Riley: 12 stars. Sam: 6.
  for (const day of ['2026-09-25', '2026-10-02', '2026-10-05']) await app.inject({ method: 'PUT', url: `/api/tasks/${bonus}/done/${riley}/${day}` });
  for (const day of ['2026-10-03', '2026-10-04']) await app.inject({ method: 'PUT', url: `/api/tasks/${samBonus}/done/${sam}/${day}` });
});

describe('reward jars', () => {
  it('fills from the bucket, is earned when full, and empties again once redeemed', async () => {
    const jar = await add({});
    expect(await buckets()).toEqual({ [riley]: 12, [sam]: 6 });
    expect((await place(riley, [{ rewardId: jar.id, stars: 6 }])).statusCode).toBe(204);
    expect((await list())[0]).toMatchObject({ status: 'filling', stars: 6, memberStars: { [riley]: 6 } });
    // No more than the jar still needs.
    expect(json((await place(riley, [{ rewardId: jar.id, stars: 5 }]))).error).toBe('Movie night only has room for 4 more');
    await place(riley, [{ rewardId: jar.id, stars: 4 }]);
    expect((await list())[0]).toMatchObject({ status: 'earned', stars: 0 });
    expect(await buckets()).toMatchObject({ [riley]: 2 });
    const [win] = await history();
    expect(win).toMatchObject({ title: 'Movie night', stars: 10, memberStars: { [riley]: 10 }, earnedDay: TODAY, givenAt: null });
    // Full: nothing more goes in until it's redeemed.
    expect((await place(riley, [{ rewardId: jar.id, stars: 1 }])).statusCode).toBe(400);
    await redeem(win.id);
    expect((await list())[0]).toMatchObject({ status: 'filling', stars: 0 });
    expect((await history())[0].givenAt).toBeTruthy();
    expect(await buckets()).toMatchObject({ [riley]: 2 });
    // Undo: it's waiting to be redeemed again.
    await app.inject({ method: 'POST', url: `/api/rewards/wins/${win.id}/undo` });
    expect((await list())[0].status).toBe('earned');
  });

  it("never spends more than the bucket, and stars in a jar can't be un-ticked", async () => {
    const jar = await add({ goal: 50 });
    expect(json(await place(riley, [{ rewardId: jar.id, stars: 13 }])).error).toBe("There aren't that many stars in the bucket");
    await place(riley, [{ rewardId: jar.id, stars: 10 }]);
    // 2 left: undoing a 4-star tick would go below zero.
    expect((await app.inject({ method: 'DELETE', url: `/api/tasks/${bonus}/done/${riley}/2026-10-05` })).statusCode).toBe(409);
    // Deleting the task takes its stars back out of the jar instead.
    await app.inject({ method: 'DELETE', url: `/api/tasks/${bonus}` });
    expect(await buckets()).toMatchObject({ [riley]: 0 });
    expect((await list())[0].stars).toBe(0);
  });

  it('shares a jar: stars added together, or each kid the full amount', async () => {
    const pooled = await add({ memberIds: [riley, sam], title: 'Trampoline park', goal: 10 });
    await place(riley, [{ rewardId: pooled.id, stars: 6 }]);
    await place(sam, [{ rewardId: pooled.id, stars: 4 }]);
    expect((await history())[0]).toMatchObject({ memberStars: { [riley]: 6, [sam]: 4 }, givenAt: null });
    const each = await add({ memberIds: [riley, sam], title: 'Ice cream', goal: 2, teamMode: 'each' });
    await place(riley, [{ rewardId: each.id, stars: 2 }]);
    expect((await place(riley, [{ rewardId: each.id, stars: 1 }])).statusCode).toBe(400); // Riley's part is full
    expect((await list()).find((r) => r.id === each.id).status).toBe('filling');
    await place(sam, [{ rewardId: each.id, stars: 2 }]);
    expect((await list()).find((r) => r.id === each.id).status).toBe('earned');
    // Only kids on a jar can put stars in it.
    const mine = await add({ title: 'Lego' });
    expect((await place(sam, [{ rewardId: mine.id, stars: 1 }])).statusCode).toBe(400);
  });

  it('gives stars back when a jar is deleted, made smaller, or a kid is taken off it', async () => {
    const jar = await add({ memberIds: [riley, sam], goal: 20 });
    await place(riley, [{ rewardId: jar.id, stars: 3 }]);
    await place(riley, [{ rewardId: jar.id, stars: 5 }]);
    await place(sam, [{ rewardId: jar.id, stars: 4 }]);
    // Smaller than what's in it (12): the newest stars over 10 go back, and it's full.
    await app.inject({ method: 'PATCH', url: `/api/rewards/${jar.id}?today=${TODAY}`, payload: { goal: 10 } });
    expect(await buckets()).toEqual({ [riley]: 4, [sam]: 4 });
    expect((await list())[0].status).toBe('earned');
    // Deleted before it's redeemed: everything goes back.
    await app.inject({ method: 'DELETE', url: `/api/rewards/${jar.id}` });
    expect(await buckets()).toEqual({ [riley]: 12, [sam]: 6 });
    expect(await history()).toEqual([]);

    const other = await add({ memberIds: [riley, sam], goal: 20 });
    await place(sam, [{ rewardId: other.id, stars: 5 }]);
    await app.inject({ method: 'PATCH', url: `/api/rewards/${other.id}`, payload: { memberIds: [riley] } });
    expect(await buckets()).toMatchObject({ [sam]: 6 });
  });

  it('misses a jar past its deadline; kids move their stars, then a parent adds it back', async () => {
    const zoo = await add({ title: 'Zoo', goal: 30, deadline: '2026-10-08' });
    const lego = await add({ title: 'Lego', goal: 20 });
    await place(riley, [{ rewardId: zoo.id, stars: 8 }]);
    expect((await list('2026-10-08'))[0].status).toBe('filling'); // the deadline day still counts
    expect((await list('2026-10-09'))[0]).toMatchObject({ status: 'missed', stars: 8 });
    expect(await history()).toMatchObject([{ title: 'Zoo', missedOn: '2026-10-08', givenAt: null }]);
    // Missed: nothing more goes in. Riley moves 5 to Lego; the other 3 go back to the bucket.
    expect((await place(riley, [{ rewardId: zoo.id, stars: 1 }], { today: '2026-10-09' })).statusCode).toBe(400);
    await place(riley, [{ rewardId: lego.id, stars: 5 }], { from: zoo.id, today: '2026-10-09' });
    expect(await buckets()).toMatchObject({ [riley]: 7 });
    expect(await list('2026-10-09')).toMatchObject([{ status: 'missed', stars: 0 }, { stars: 5 }]);
    // Added back, with no deadline this time.
    await app.inject({ method: 'POST', url: `/api/rewards/${zoo.id}/restore`, payload: { deadline: null, today: '2026-10-09' } });
    expect((await list('2026-10-20'))[0]).toMatchObject({ status: 'filling', deadline: null });
  });

  it('misses a full jar not redeemed in time, and finishes one with a deadline once redeemed', async () => {
    const zoo = await add({ title: 'Zoo', goal: 5, deadline: '2026-10-08' });
    await place(riley, [{ rewardId: zoo.id, stars: 5 }]);
    expect((await list())[0].status).toBe('earned');
    // Not redeemed in time: the stars are back in the jar for Riley to move.
    expect((await list('2026-10-10'))[0]).toMatchObject({ status: 'missed', stars: 5 });
    await place(riley, [], { from: zoo.id, today: '2026-10-10' });
    expect(await buckets()).toMatchObject({ [riley]: 12 });

    const pizza = await add({ title: 'Pizza', goal: 5, deadline: '2026-10-08' });
    await place(riley, [{ rewardId: pizza.id, stars: 5 }]);
    await redeem((await history()).find((w) => w.title === 'Pizza').id);
    expect((await list()).map((r) => r.title)).toEqual(['Zoo']);
  });

  it('lets a parent take stars back out of a jar with the PIN', async () => {
    const jar = await add({ goal: 10 });
    await place(riley, [{ rewardId: jar.id, stars: 4 }]);
    await place(riley, [{ rewardId: jar.id, stars: 6 }]);
    expect((await list())[0].status).toBe('earned');
    // Once a PIN is set, it's needed (and the device signs in with the cookie).
    const res = await app.inject({ method: 'POST', url: '/api/auth/pin', payload: { pin: '4321' } });
    const cookie = String(res.headers['set-cookie']).split(';')[0];
    const takeBack = (pin: string, stars: number) => app.inject({ method: 'POST', url: `/api/rewards/${jar.id}/take-back`,
      headers: { cookie }, payload: { memberId: riley, stars, pin } });
    expect(json(await takeBack('0000', 1))).toEqual({ error: 'Wrong PIN' });
    expect((await takeBack('4321', 11)).statusCode).toBe(400);
    // From the full jar: the newest stars come out, and it's filling again.
    expect((await takeBack('4321', 7)).statusCode).toBe(204);
    const get = (url: string) => app.inject({ url, headers: { cookie } }).then(json<any>);
    expect((await get(`/api/rewards?today=${TODAY}`))[0]).toMatchObject({ status: 'filling', stars: 3 });
    expect(await get('/api/rewards/history')).toEqual([]);
    expect((await get('/api/rewards/buckets')).find((b: any) => b.memberId === riley).stars).toBe(9);
  });

  it('rejects bad jars and removes them with the person', async () => {
    const status = async (body: object) => (await app.inject({ method: 'POST', url: '/api/rewards',
      payload: { memberIds: [riley], title: 'X', goal: 10, today: TODAY, ...body } })).statusCode;
    expect(await status({ goal: 0 })).toBe(400);
    expect(await status({ memberIds: ['nope'] })).toBe(400);
    expect(await status({ deadline: '2026-10-01' })).toBe(400);
    await add({});
    await app.inject({ method: 'DELETE', url: `/api/members/${riley}` });
    expect(await list()).toEqual([]);
  });
});
