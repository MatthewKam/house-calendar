import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';

const DAY = '2026-11-04';

function setup() {
  const db = openDb(':memory:');
  // Mia is 2 (Little), Sam is 5 (Early): points are the same for every age.
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
    expect(lib.find((g: { key: string }) => g.key === 'bike')).toMatchObject({ title: 'Rides a bike', kind: 'bravery', stages: ['early'], hidden: false });

    const bike = await start(app, { memberId: 'sam', libraryKey: 'bike' });
    expect(bike.statusCode).toBe(201);
    expect(bike.json()).toMatchObject({ memberId: 'sam', libraryKey: 'bike', title: 'Rides a bike', emoji: '🚲', startedDay: DAY, doneDay: null });
    const own = await start(app, { memberId: 'sam', title: ' Ties shoelaces ', emoji: '👞', kind: 'self_care' });
    expect(own.json()).toMatchObject({ title: 'Ties shoelaces' });
    expect((await app.inject({ url: '/api/goals' })).json()).toHaveLength(2);
  });

  it('keeps a parent\'s own goal in the library for every kid, until it\'s hidden', async () => {
    const { app } = setup();
    const own = (await start(app, { memberId: 'sam', title: 'Ties shoelaces', emoji: '👞', kind: 'self_care' })).json();
    expect(own.libraryKey).toMatch(/^own:/);
    const library = async () => (await app.inject({ url: '/api/goals/library' })).json() as { key: string; own: boolean; hidden: boolean; stages: string[] }[];
    expect((await library()).find((g) => g.key === own.libraryKey)).toMatchObject({ title: 'Ties shoelaces', own: true, stages: [], hidden: false });
    // Mia can start it from the library too; the same name again doesn't make a second one.
    expect((await start(app, { memberId: 'mia', libraryKey: own.libraryKey })).statusCode).toBe(201);
    await app.inject({ method: 'DELETE', url: `/api/goals/${own.id}` });
    await start(app, { memberId: 'sam', title: 'ties shoelaces', emoji: '👞', kind: 'self_care' });
    expect((await library()).filter((g) => g.own)).toHaveLength(1);

    // Into the list without starting it for anyone.
    const saved = await app.inject({ method: 'POST', url: '/api/goals/library', payload: { title: 'Feeds the fish', emoji: '🐟', kind: 'helpful' } });
    expect(saved.statusCode).toBe(201);
    expect((await library()).filter((g) => g.own)).toHaveLength(2);

    await app.inject({ method: 'PUT', url: `/api/goals/library/${encodeURIComponent(own.libraryKey)}`, payload: { hidden: true } });
    expect((await library()).find((g) => g.key === own.libraryKey)?.hidden).toBe(true);
  });

  it('works on three at most, and not the same one twice', async () => {
    const { app } = setup();
    for (const key of ['bike', 'swim', 'hop']) expect((await start(app, { memberId: 'sam', libraryKey: key })).statusCode).toBe(201);
    expect((await start(app, { memberId: 'sam', libraryKey: 'letters' })).statusCode).toBe(409);
    expect((await start(app, { memberId: 'mia', libraryKey: 'spoon' })).statusCode).toBe(201);
    expect((await start(app, { memberId: 'mia', libraryKey: 'spoon' })).statusCode).toBe(409);
  });

  it('earns the points picked when it was added, five unless changed', async () => {
    const { db, app } = setup();
    const bike = (await start(app, { memberId: 'sam', libraryKey: 'bike' })).json();
    expect(bike).toMatchObject({ points: 5, stars: 0 });
    expect((await done(app, bike.id, ' No training wheels! ')).json()).toMatchObject({ doneDay: '2026-11-20', note: 'No training wheels!', stars: 5 });
    // Twice is the same as once.
    await done(app, bike.id);
    expect(bucket(db, 'sam')).toBe(5);

    const spoon = (await app.inject({ method: 'POST', url: '/api/goals', payload: { day: DAY, memberId: 'mia', libraryKey: 'spoon', points: 2 } })).json();
    expect((await done(app, spoon.id)).json().stars).toBe(2);
    expect(bucket(db, 'mia')).toBe(2);
    // Done ones don't count toward the three.
    for (const key of ['swim', 'hop', 'letters']) expect((await start(app, { memberId: 'sam', libraryKey: key })).statusCode).toBe(201);
  });

  it('hides starter goals the family won\'t use, and shows them again', async () => {
    const { app } = setup();
    const hide = (key: string, hidden: boolean) => app.inject({ method: 'PUT', url: `/api/goals/library/${key}`, payload: { hidden } });
    expect((await hide('feed-pet', true)).statusCode).toBe(204);
    await hide('feed-pet', true);
    const pet = async () => (await app.inject({ url: '/api/goals/library' })).json().find((g: { key: string }) => g.key === 'feed-pet');
    expect((await pet()).hidden).toBe(true);
    await hide('feed-pet', false);
    expect((await pet()).hidden).toBe(false);
    expect((await hide('fly', true)).statusCode).toBe(404);

    // All at once.
    const all = (hidden: boolean) => app.inject({ method: 'PUT', url: '/api/goals/library', payload: { hidden } });
    await all(true);
    expect((await app.inject({ url: '/api/goals/library' })).json().every((g: { hidden: boolean }) => g.hidden)).toBe(true);
    await all(false);
    expect((await app.inject({ url: '/api/goals/library' })).json().some((g: { hidden: boolean }) => g.hidden)).toBe(false);
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
