import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';

const DAY = '2026-11-04';

function setup() {
  const db = openDb(':memory:');
  // Mia is 2 (Little), Sam is 5 (Early).
  db.prepare(`INSERT INTO members (id, name, color, birthdate) VALUES ('mia', 'Mia', '#000000', '2024-05-01'),
    ('sam', 'Sam', '#000000', '2021-03-01')`).run();
  return { db, app: buildApp(db) };
}
type App = ReturnType<typeof buildApp>;
const start = (app: App, body: Record<string, string>) =>
  app.inject({ method: 'POST', url: '/api/goals', payload: { day: DAY, ...body } });
const done = (app: App, id: string, note?: string) =>
  app.inject({ method: 'POST', url: `/api/goals/${id}/done`, payload: { day: '2026-11-20', ...(note ? { note } : {}) } });

describe('goals', () => {
  it('starts a goal from the library or a parent\'s own, and lists them', async () => {
    const { app } = setup();
    const lib = (await app.inject({ url: '/api/goals/library' })).json();
    expect(lib.find((g: { key: string }) => g.key === 'bike')).toMatchObject({ title: 'Rides a bike', kind: 'body', stages: ['early'] });

    const bike = await start(app, { memberId: 'sam', libraryKey: 'bike' });
    expect(bike.statusCode).toBe(201);
    expect(bike.json()).toMatchObject({ memberId: 'sam', libraryKey: 'bike', title: 'Rides a bike', emoji: '🚲', startedDay: DAY, doneDay: null });
    const own = await start(app, { memberId: 'sam', title: ' Ties shoelaces ', emoji: '👞', kind: 'myself' });
    expect(own.json()).toMatchObject({ libraryKey: null, title: 'Ties shoelaces' });
    expect((await app.inject({ url: '/api/goals' })).json()).toHaveLength(2);
  });

  it('works on three at most, and not the same one twice', async () => {
    const { app } = setup();
    for (const key of ['bike', 'swim', 'hop']) expect((await start(app, { memberId: 'sam', libraryKey: key })).statusCode).toBe(201);
    expect((await start(app, { memberId: 'sam', libraryKey: 'letters' })).statusCode).toBe(409);
    expect((await start(app, { memberId: 'mia', libraryKey: 'spoon' })).statusCode).toBe(201);
    expect((await start(app, { memberId: 'mia', libraryKey: 'spoon' })).statusCode).toBe(409);
  });

  it('gives five stars when done, or a sticker for a Little kid', async () => {
    const { db, app } = setup();
    const bike = (await start(app, { memberId: 'sam', libraryKey: 'bike' })).json();
    expect((await done(app, bike.id, ' No training wheels! ')).json()).toMatchObject({ doneDay: '2026-11-20', note: 'No training wheels!', stars: 5 });
    // Twice is the same as once.
    await done(app, bike.id);
    expect(bucket(db, 'sam')).toBe(5);

    const spoon = (await start(app, { memberId: 'mia', libraryKey: 'spoon' })).json();
    expect((await done(app, spoon.id)).json().stars).toBe(0);
    expect(bucket(db, 'mia')).toBe(0);
    // Done ones don't count toward the three.
    for (const key of ['swim', 'hop', 'letters']) expect((await start(app, { memberId: 'sam', libraryKey: key })).statusCode).toBe(201);
  });

  it('removes one, but not once its stars are in a jar', async () => {
    const { db, app } = setup();
    const swim = (await start(app, { memberId: 'sam', libraryKey: 'swim' })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/goals/${swim.id}` })).statusCode).toBe(204);
    const bike = (await start(app, { memberId: 'sam', libraryKey: 'bike' })).json();
    await done(app, bike.id);
    db.prepare(`INSERT INTO jar_stars (id, reward_id, member_id, stars) VALUES ('j', 'park', 'sam', 3)`).run();
    expect((await app.inject({ method: 'DELETE', url: `/api/goals/${bike.id}` })).statusCode).toBe(409);
  });

  it('turns down unknown kids, goals and incomplete own goals', async () => {
    const { app } = setup();
    expect((await start(app, { memberId: 'nobody', libraryKey: 'bike' })).statusCode).toBe(400);
    expect((await start(app, { memberId: 'sam', libraryKey: 'fly' })).statusCode).toBe(400);
    expect((await start(app, { memberId: 'sam', title: 'Something' })).statusCode).toBe(400);
  });
});
