import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';
import { household } from './testing.ts';

const DAY = '2026-11-04';

// Mia is 2 (Little), Sam is 5 (Early), Kai has no birthday.
const setup = () => household([{ id: 'mia', name: 'Mia', birthdate: '2024-05-01' }, { id: 'sam', name: 'Sam', birthdate: '2021-03-01' },
  { id: 'kai', name: 'Kai' }]);

const catchMoment = (app: ReturnType<typeof buildApp>, memberId: string, kind = 'helpful', note?: string) =>
  app.inject({ method: 'POST', url: '/api/moments', payload: { memberId, kind, day: DAY, ...(note ? { note } : {}) } });

describe('moments', () => {
  it('saves the kid, activity and points the parent picked', async () => {
    const { db, app } = setup();
    const mia = await app.inject({ method: 'POST', url: '/api/moments',
      payload: { memberId: 'mia', kind: 'attitude', day: DAY, stars: 2, note: '  Said she was sad instead of hitting ' } });
    expect(mia.statusCode).toBe(201);
    expect(mia.json()).toMatchObject({ memberId: 'mia', kind: 'attitude', note: 'Said she was sad instead of hitting', stars: 2, day: DAY });
    // One star unless they say otherwise; 0 is just a sticker.
    expect((await catchMoment(app, 'sam')).json().stars).toBe(1);
    await app.inject({ method: 'POST', url: '/api/moments', payload: { memberId: 'kai', kind: 'bravery', day: DAY, stars: 0 } });
    expect([bucket(db, 'mia'), bucket(db, 'sam'), bucket(db, 'kai')]).toEqual([2, 1, 0]);

    const list = (await app.inject({ url: `/api/moments?from=${DAY}&to=2026-11-05` })).json();
    expect(list.map((m: { memberId: string }) => m.memberId)).toEqual(['mia', 'sam', 'kai']);
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

  it('turns down unknown kids, activities and points out of range', async () => {
    const { app } = setup();
    expect((await catchMoment(app, 'nobody')).statusCode).toBe(400);
    expect((await catchMoment(app, 'sam', 'chores')).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/moments', payload: { memberId: 'sam', kind: 'helpful', day: DAY, stars: -1 } })).statusCode).toBe(400);
  });

  it('moves moments saved before to the closest of the six activities', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sprig-')), 'old.db');
    // Built just before the six activities came in.
    const old = openDb(file, 32);
    old.prepare(`INSERT INTO members (id, name, color) VALUES ('sam', 'Sam', '#000000')`).run();
    const add = old.prepare(`INSERT INTO moments (id, member_id, kind, stars, day) VALUES (?, 'sam', ?, 1, '${DAY}')`);
    for (const k of ['helping', 'feelings', 'body', 'thinking', 'myself']) add.run(k, k);
    old.close();
    const db = openDb(file);
    expect(db.prepare('SELECT id, kind FROM moments ORDER BY id').all()).toEqual([
      { id: 'body', kind: 'bravery' }, { id: 'feelings', kind: 'attitude' }, { id: 'helping', kind: 'helpful' },
      { id: 'myself', kind: 'self_care' }, { id: 'thinking', kind: 'problem_solving' },
    ]);
    db.close();
  });
});
