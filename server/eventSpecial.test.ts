import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

describe('special events', () => {
  it('marks an event special when added, and on or off after', async () => {
    const app = buildApp(openDb(':memory:'));
    const add = (special?: boolean) => app.inject({ method: 'POST', url: '/api/events',
      payload: { title: 'Cousins visit', allDay: true, start: '2026-11-14', end: '2026-11-15', ...(special === undefined ? {} : { special }) } });
    const plain = (await add()).json();
    expect(plain.special).toBe(false);
    const visit = (await add(true)).json();
    expect(visit.special).toBe(true);

    const off = await app.inject({ method: 'PUT', url: `/api/events/${visit.id}/special`, payload: { special: false } });
    expect(off.json().special).toBe(false);
    const on = await app.inject({ method: 'PUT', url: `/api/events/${plain.id}/special`, payload: { special: true } });
    expect(on.json().special).toBe(true);
    expect((await app.inject({ method: 'PUT', url: '/api/events/nope/special', payload: { special: true } })).statusCode).toBe(404);
  });
});
