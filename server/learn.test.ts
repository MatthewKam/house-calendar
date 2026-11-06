import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { skillFor } from './learn.ts';
import { bucket } from './rewards.ts';

function setup() {
  const db = openDb(':memory:');
  const year = Number(TODAY.slice(0, 4));
  db.prepare(`INSERT INTO members (id, name, color) VALUES ('alex', 'Alex', '#000000')`).run();
  db.prepare(`INSERT INTO members (id, name, color, birthdate, sort_order) VALUES ('nolan', 'Nolan', '#111111', ?, 1), ('tayen', 'Tayen', '#222222', ?, 2)`)
    .run(`${year - 2}-01-01`, `${year - 4}-01-01`);
  const app = buildApp(db);
  const call = async (method: string, url: string, payload?: object) => {
    const res = await app.inject({ method: method as 'GET', url, payload });
    return { status: res.statusCode, body: res.body ? res.json() : undefined };
  };
  return { db, call };
}

const TODAY = '2026-11-06';
const nextDay = (d: string, n = 1) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe('learning', () => {
  it('takes turns through the skills for the stage, a day at a time', () => {
    const week = Array.from({ length: 4 }, (_, i) => skillFor('early', nextDay(TODAY, i)));
    expect(new Set(week)).toEqual(new Set(['counting', 'letters', 'feelings', 'patterns']));
    expect(['animals', 'story']).toContain(skillFor('little', TODAY));
  });

  it('is off until a guardian turns it on, and leveling up waits for age 3', async () => {
    const { call } = setup();
    const kids = (await call('GET', `/api/learn?today=${TODAY}`)).body;
    expect(kids.map((k: { memberId: string }) => k.memberId)).toEqual(['nolan', 'tayen']);
    expect(kids[0]).toMatchObject({ enabled: false, levelUp: false, canLevelUp: false, today: { level: 1 } });
    expect(kids[1]).toMatchObject({ enabled: false, canLevelUp: true });
    expect((await call('POST', '/api/learn/tayen/done', { today: TODAY, skill: 'counting', level: 1, rounds: 3, firstTry: 3 })).status).toBe(409);

    expect((await call('PUT', '/api/learn/nolan', { today: TODAY, levelUp: true })).status).toBe(400);
    expect((await call('PUT', '/api/learn/alex', { today: TODAY, enabled: true })).status).toBe(400);
    expect((await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true })).body).toMatchObject({ enabled: true, levelUp: false });
  });

  it('gives one star a day for finishing, and none to the littlest', async () => {
    const { db, call } = setup();
    await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
    await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true });
    const done = (who: string, skill: string, day = TODAY) =>
      call('POST', `/api/learn/${who}/done`, { today: day, skill, level: 1, rounds: 3, firstTry: 1 });
    expect((await done('tayen', 'counting')).body).toMatchObject({ star: true, doneToday: true, starToday: true });
    // Playing again is free play.
    expect((await done('tayen', 'counting')).body.star).toBe(false);
    expect(bucket(db, 'tayen')).toBe(1);
    expect((await done('tayen', 'letters', nextDay(TODAY))).body.star).toBe(true);
    expect(bucket(db, 'tayen')).toBe(2);
    expect((await done('nolan', 'animals')).body).toMatchObject({ star: false, doneToday: true });
    expect(bucket(db, 'nolan')).toBe(0);
  });

  it('moves a skill up after three perfect days, only with leveling up on', async () => {
    const { call } = setup();
    await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
    const perfect = (day: string, level = 1) =>
      call('POST', '/api/learn/tayen/done', { today: day, skill: 'counting', level, rounds: 3, firstTry: 3 });
    // Off: perfect days don't move it.
    for (const i of [0, 1, 2]) expect((await perfect(nextDay(TODAY, i))).body.leveledUp).toBe(false);
    const on = (await call('PUT', '/api/learn/tayen', { today: TODAY, levelUp: true })).body;
    expect(on.levels.counting).toBe(1);
    // On: the next perfect day (with three already behind it) moves it up; then level 2 is the top.
    const up = (await perfect(nextDay(TODAY, 3))).body;
    expect(up).toMatchObject({ leveledUp: true, levels: { counting: 2, letters: 1 } });
    for (const i of [4, 5, 6]) expect((await perfect(nextDay(TODAY, i), 2)).body.leveledUp).toBe(false);
    // Turning it off plays level 1 again (the level is kept for when it's back on).
    expect((await call('PUT', '/api/learn/tayen', { today: TODAY, levelUp: false })).body.levels.counting).toBe(1);
    expect((await call('PUT', '/api/learn/tayen', { today: TODAY, levelUp: true })).body.levels.counting).toBe(2);
  });
});
