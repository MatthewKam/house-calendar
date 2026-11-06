import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { bucket } from './rewards.ts';
import { ROW_PUNCHES, STEPS } from './potty.ts';

function setup() {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO members (id, name, color, birthdate) VALUES ('mia', 'Mia', '#000000', '2024-05-01')`).run();
  return { db, app: buildApp(db) };
}

type App = ReturnType<typeof buildApp>;
const punch = (app: App, step: string, kind?: string) =>
  app.inject({ method: 'POST', url: '/api/potty/mia', payload: { step, ...(kind ? { kind } : {}) } });
const start = (app: App) => app.inject({ method: 'PUT', url: '/api/potty/mia', payload: { on: true } });
const chart = async (app: App) => (await app.inject({ url: '/api/potty' })).json()[0];

describe('potty charts', () => {
  it('punches a row, and a full row is a star', async () => {
    const { db, app } = setup();
    expect((await punch(app, 'sit')).statusCode).toBe(404);
    expect((await start(app)).statusCode).toBe(204);
    expect((await chart(app)).card.rows).toEqual({ ask: [], sit: [], go: [], wipe: [], wash: [] });

    // The go row says which; the others don't.
    expect((await punch(app, 'go')).statusCode).toBe(400);
    expect((await punch(app, 'sit', 'pee')).statusCode).toBe(400);
    expect((await punch(app, 'go', 'poo')).json()).toMatchObject({ rowFull: false, cardFull: false });
    expect((await chart(app)).card.rows.go).toEqual(['poo']);

    for (let i = 0; i < ROW_PUNCHES; i++) expect((await punch(app, 'wash')).json().rowFull).toBe(i === ROW_PUNCHES - 1);
    expect(bucket(db, 'mia')).toBe(1);
    expect((await punch(app, 'wash')).statusCode).toBe(409);
  });

  it('starts a fresh card once every row is full, keeping the stars', async () => {
    const { db, app } = setup();
    await start(app);
    let last;
    for (const step of STEPS) for (let i = 0; i < ROW_PUNCHES; i++) last = (await punch(app, step, step === 'go' ? 'pee' : undefined)).json();
    expect(last).toMatchObject({ rowFull: true, cardFull: true });
    const now = await chart(app);
    expect(now.card.rows.ask).toEqual([]);
    expect(now.filled).toHaveLength(1);
    expect(bucket(db, 'mia')).toBe(STEPS.length);
  });

  it("takes back a row's last punch, but not a star that's in a jar", async () => {
    const { db, app } = setup();
    await start(app);
    expect((await app.inject({ method: 'DELETE', url: '/api/potty/mia/sit' })).statusCode).toBe(404);
    await punch(app, 'go', 'pee');
    await punch(app, 'go', 'poo');
    expect((await app.inject({ method: 'DELETE', url: '/api/potty/mia/go' })).statusCode).toBe(204);
    expect((await chart(app)).card.rows.go).toEqual(['pee']);

    for (let i = 0; i < ROW_PUNCHES; i++) await punch(app, 'ask');
    // The row's star went in a jar.
    db.prepare(`INSERT INTO jar_stars (id, reward_id, member_id, stars) VALUES ('j', 'r', 'mia', 1)`).run();
    expect((await app.inject({ method: 'DELETE', url: '/api/potty/mia/ask' })).statusCode).toBe(409);
  });

  it('stops and picks up again with the same card', async () => {
    const { app } = setup();
    await start(app);
    await punch(app, 'sit');
    await app.inject({ method: 'PUT', url: '/api/potty/mia', payload: { on: false } });
    expect((await app.inject({ url: '/api/potty' })).json()).toEqual([]);
    await start(app);
    expect((await chart(app)).card.rows.sit).toHaveLength(1);
  });
});
