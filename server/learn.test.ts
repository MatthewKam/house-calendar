import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
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

describe('learning', () => {
  it('gives each stage its four games, off until a guardian turns it on', async () => {
    const { call } = setup();
    const kids = (await call('GET', `/api/learn?today=${TODAY}`)).body;
    expect(kids.map((k: { memberId: string }) => k.memberId)).toEqual(['nolan', 'tayen']);
    expect(kids[0]).toMatchObject({ enabled: false });
    expect(kids[0].games.map((g: { game: string }) => g.game)).toEqual(['sounds', 'peekaboo', 'findIt', 'apples']);
    expect(kids[1].games.map((g: { game: string }) => g.game)).toEqual(['adding', 'maze', 'letters', 'memory']);
    expect(kids[1].games[0]).toEqual({ game: 'adding', level: 1, maxLevel: 6 });
    expect((await call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'adding', level: 1, rounds: 3, firstTry: 3 })).status).toBe(409);

    expect((await call('PUT', '/api/learn/alex', { today: TODAY, enabled: true })).status).toBe(400);
    expect((await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true })).body).toMatchObject({ enabled: true });
    // Only their own stage's games.
    expect((await call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'sounds', level: 1, rounds: 3, firstTry: 3 })).status).toBe(400);
  });

  it('earns no stars', async () => {
    const { db, call } = setup();
    await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
    const done = await call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'maze', level: 1, rounds: 1, firstTry: 1 });
    expect(done.body).toMatchObject({ leveledUp: false });
    expect(bucket(db, 'tayen')).toBe(0);
  });

  it('moves a game up after three perfect plays in a row, at any age, and a guardian can move it', async () => {
    const { call } = setup();
    await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true });
    const play = (firstTry: number, level = 1) =>
      call('POST', '/api/learn/nolan/done', { today: TODAY, game: 'apples', level, rounds: 3, firstTry });
    expect((await play(3)).body.leveledUp).toBe(false);
    expect((await play(2)).body.leveledUp).toBe(false);
    expect((await play(3)).body.leveledUp).toBe(false);
    expect((await play(3)).body.leveledUp).toBe(false);
    const up = (await play(3)).body;
    expect(up.leveledUp).toBe(true);
    expect(up.games.find((g: { game: string }) => g.game === 'apples').level).toBe(2);

    // A guardian moves it back down: only plays from then on count.
    expect((await call('PUT', '/api/learn/nolan', { today: TODAY, levels: { apples: 7 } })).status).toBe(400);
    expect((await call('PUT', '/api/learn/nolan', { today: TODAY, levels: { maze: 2 } })).status).toBe(400);
    const down = (await call('PUT', '/api/learn/nolan', { today: TODAY, levels: { apples: 1 } })).body;
    expect(down).toMatchObject({ enabled: true });
    expect(down.games.find((g: { game: string }) => g.game === 'apples').level).toBe(1);
    expect((await play(3)).body.leveledUp).toBe(false);
    expect((await play(3)).body.leveledUp).toBe(false);
    expect((await play(3)).body.leveledUp).toBe(true);
    // Never past the top.
    await call('PUT', '/api/learn/nolan', { today: TODAY, levels: { apples: 6 } });
    for (let i = 0; i < 3; i++) expect((await play(3, 6)).body.leveledUp).toBe(false);
  });

  it("keeps a grown-up's recorded animal noises", async () => {
    const { db } = setup();
    const app = buildApp(db);
    const put = (animal: string, body: Buffer, type = 'audio/webm;codecs=opus') =>
      app.inject({ method: 'PUT', url: `/api/learn/sounds/${animal}`, payload: body, headers: { 'content-type': type } });
    const moo = Buffer.from('moo moo');
    expect((await put('dragon', moo)).statusCode).toBe(404);
    expect((await put('cow', moo, 'text/plain')).statusCode).toBe(400);
    const saved = await put('cow', moo);
    expect(saved.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/learn/sounds' })).json()).toEqual([{ animal: 'cow', version: saved.json().version }]);
    const got = await app.inject({ method: 'GET', url: '/api/learn/sounds/cow' });
    expect(got.headers['content-type']).toBe('audio/webm');
    expect(got.rawPayload.equals(moo)).toBe(true);
    expect((await app.inject({ method: 'DELETE', url: '/api/learn/sounds/cow' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/learn/sounds/cow' })).statusCode).toBe(404);
  });

  it('moves Math and Maze up after 20 plays at a level, perfect or not', async () => {
    const { call } = setup();
    await call('PUT', '/api/learn/tayen', { today: TODAY, enabled: true });
    const play = () => call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'adding', level: 1, rounds: 3, firstTry: 1 });
    for (let i = 0; i < 19; i++) expect((await play()).body.leveledUp).toBe(false);
    expect((await play()).body).toMatchObject({ leveledUp: true });
    // Other games don't.
    const letters = () => call('POST', '/api/learn/tayen/done', { today: TODAY, game: 'letters', level: 1, rounds: 4, firstTry: 0 });
    for (let i = 0; i < 20; i++) expect((await letters()).body.leveledUp).toBe(false);
  });
});
