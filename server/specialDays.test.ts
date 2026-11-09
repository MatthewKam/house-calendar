import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

describe('special days', () => {
  it('adds, lists in date order and removes them', async () => {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO members (id, name, color, sort_order) VALUES ('k', 'Tayen', '#e8833a', 0)`).run();
    const app = buildApp(db);
    const add = (body: object) => app.inject({ method: 'POST', url: '/api/special-days', payload: body });
    expect((await add({ day: '2026-11-21', name: 'School play', picture: '🎭', memberId: 'k' })).statusCode).toBe(201);
    const res = await add({ day: '2026-11-14', name: 'Cousins visit', picture: '🚗', yearly: true });
    expect(res.json().map((d: { name: string }) => d.name)).toEqual(['Cousins visit', 'School play']);
    expect(res.json()[0]).toMatchObject({ memberId: null, yearly: true });
    expect(res.json()[1]).toMatchObject({ memberId: 'k', yearly: false });

    expect((await add({ day: 'soon', name: 'x', picture: '🎉' })).statusCode).toBe(400);
    expect((await add({ day: '2026-11-14', name: 'x', picture: '🎉', memberId: 'nobody' })).statusCode).toBe(404);

    const id = res.json()[0].id;
    expect((await app.inject({ method: 'DELETE', url: `/api/special-days/${id}` })).json()).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/api/special-days/${id}` })).statusCode).toBe(404);
  });
});
