import { describe, expect, it, beforeEach } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  app = buildApp(openDb(':memory:'));
});

const json = <T = any>(res: { body: string }) => JSON.parse(res.body) as T;

describe('members', () => {
  it('adds, recolors and removes a member', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'Alex', color: '#2F7DE1' } });
    expect(created.statusCode).toBe(201);
    const m = json(created);
    expect(m.color).toBe('#2f7de1');

    const patched = await app.inject({ method: 'PATCH', url: `/api/members/${m.id}`, payload: { color: '#e0457b' } });
    expect(json(patched).color).toBe('#e0457b');

    expect((await app.inject({ method: 'DELETE', url: `/api/members/${m.id}` })).statusCode).toBe(204);
    expect(json(await app.inject({ method: 'GET', url: '/api/members' }))).toEqual([]);
  });

  it('rejects colors that are not #rrggbb', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/members', payload: { name: 'X', color: 'red' } });
    expect(res.statusCode).toBe(400);
  });
});

describe('events', () => {
  const week = { from: '2026-10-04T07:00:00.000Z', to: '2026-10-11T07:00:00.000Z', fromDay: '2026-10-04', toDay: '2026-10-11' };
  const list = async () => json<any[]>(await app.inject({ method: 'GET', url: `/api/events?${new URLSearchParams(week)}` }));

  it('returns timed and all-day events that overlap the week', async () => {
    await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Dentist', allDay: false, start: '2026-10-06T16:00:00.000Z', end: '2026-10-06T17:00:00.000Z' } });
    await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Trip', allDay: true, start: '2026-10-10', end: '2026-10-13' } });
    await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Next month', allDay: true, start: '2026-11-01', end: '2026-11-02' } });

    expect((await list()).map((e) => e.title)).toEqual(['Trip', 'Dentist']);
  });

  it('rejects an end before the start', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Bad', allDay: false, start: '2026-10-06T17:00:00Z', end: '2026-10-06T16:00:00Z' } });
    expect(res.statusCode).toBe(400);
  });

  it('keeps events when their member is removed, for whoever else they were for', async () => {
    const add = async (name: string) =>
      json(await app.inject({ method: 'POST', url: '/api/members', payload: { name, color: '#2fa66a' } })).id as string;
    const sam = await add('Sam');
    const ana = await add('Ana');
    await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Soccer', memberIds: [sam], allDay: true, start: '2026-10-07', end: '2026-10-08' } });
    await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Swim', memberIds: [sam, ana], allDay: true, start: '2026-10-07', end: '2026-10-08' } });
    await app.inject({ method: 'DELETE', url: `/api/members/${sam}` });
    const evs = await list();
    expect(evs.find((e: any) => e.title === 'Soccer').memberIds).toEqual([]);
    expect(evs.find((e: any) => e.title === 'Swim').memberIds).toEqual([ana]);
  });

  it('lets an event be for several people, listed in family order', async () => {
    const add = async (name: string) =>
      json(await app.inject({ method: 'POST', url: '/api/members', payload: { name, color: '#2fa66a' } })).id as string;
    const riley = await add('Riley');
    const sam = await add('Sam');
    const ev = json(await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Swim', memberIds: [sam, riley, sam], allDay: true, start: '2026-10-07', end: '2026-10-08' } }));
    expect(ev.memberIds).toEqual([riley, sam]);
    const edited = json(await app.inject({ method: 'PATCH', url: `/api/events/${ev.id}`, payload: { memberIds: [sam] } }));
    expect(edited.memberIds).toEqual([sam]);
    const bad = await app.inject({ method: 'PATCH', url: `/api/events/${ev.id}`, payload: { memberIds: [sam, 'nope'] } });
    expect(bad.statusCode).toBe(400);
  });

  it('edits and deletes an event', async () => {
    const ev = json(await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Dinner', allDay: true, start: '2026-10-08', end: '2026-10-09' } }));
    await app.inject({ method: 'PATCH', url: `/api/events/${ev.id}`, payload: { title: 'Dinner out' } });
    expect((await list())[0].title).toBe('Dinner out');
    await app.inject({ method: 'DELETE', url: `/api/events/${ev.id}` });
    expect(await list()).toEqual([]);
  });
});

describe('settings', () => {
  it('stores and returns JSON values', async () => {
    await app.inject({ method: 'PUT', url: '/api/settings/uiScale', payload: { value: 1.25 } });
    expect(json(await app.inject({ method: 'GET', url: '/api/settings' }))).toEqual({ uiScale: 1.25 });
  });
});
