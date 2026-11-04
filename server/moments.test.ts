import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';

const DAY = '2026-11-04';

function setup() {
  const db = openDb(':memory:');
  // Mia is 2 (Little), Sam is 5 (Early), Kai has no birthday.
  db.prepare(`INSERT INTO members (id, name, color, birthdate) VALUES ('mia', 'Mia', '#000000', '2024-05-01'),
    ('sam', 'Sam', '#000000', '2021-03-01'), ('kai', 'Kai', '#000000', NULL)`).run();
  return { db, app: buildApp(db) };
}

const catchMoment = (app: ReturnType<typeof buildApp>, memberId: string, kind = 'helping', note?: string) =>
  app.inject({ method: 'POST', url: '/api/moments', payload: { memberId, kind, day: DAY, ...(note ? { note } : {}) } });

describe('moments', () => {
  it('gives a Little kid a sticker, and everyone else a star too', async () => {
    const { db, app } = setup();
    const mia = await catchMoment(app, 'mia', 'feelings', '  Said she was sad instead of hitting ');
    expect(mia.statusCode).toBe(201);
    expect(mia.json()).toMatchObject({ memberId: 'mia', kind: 'feelings', note: 'Said she was sad instead of hitting', stars: 0, day: DAY });
    expect((await catchMoment(app, 'sam')).json().stars).toBe(1);
    expect((await catchMoment(app, 'kai')).json().stars).toBe(1);
    expect([bucket(db, 'mia'), bucket(db, 'sam'), bucket(db, 'kai')]).toEqual([0, 1, 1]);

    const list = (await app.inject({ url: `/api/moments?from=${DAY}&to=2026-11-05` })).json();
    expect(list.map((m: { memberId: string }) => m.memberId)).toEqual(['mia', 'sam', 'kai']);
  });

  it('keeps what a moment earned when the stage changes later', async () => {
    const { db, app } = setup();
    await catchMoment(app, 'mia');
    await app.inject({ method: 'PATCH', url: '/api/members/mia', payload: { stage: 'early' } });
    await catchMoment(app, 'mia');
    expect(bucket(db, 'mia')).toBe(1);
  });

  it('takes one back, but not once its star is in a jar', async () => {
    const { db, app } = setup();
    const a = (await catchMoment(app, 'sam')).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/moments/${a.id}` })).statusCode).toBe(204);
    expect(bucket(db, 'sam')).toBe(0);

    const b = (await catchMoment(app, 'sam')).json();
    db.prepare(`INSERT INTO jar_stars (id, reward_id, member_id, stars) VALUES ('j', 'park', 'sam', 1)`).run();
    expect((await app.inject({ method: 'DELETE', url: `/api/moments/${b.id}` })).statusCode).toBe(409);
  });

  it('turns down unknown kids and kinds', async () => {
    const { app } = setup();
    expect((await catchMoment(app, 'nobody')).statusCode).toBe(400);
    expect((await catchMoment(app, 'sam', 'chores')).statusCode).toBe(400);
  });
});
