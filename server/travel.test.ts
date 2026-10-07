import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { googleRoutes, planTrip, type Estimator } from './travel.ts';

const now = new Date('2026-10-06T20:00:00Z');
const start = new Date('2026-10-06T22:00:00Z'); // 3 PM Pacific

/** Rush hour from 21:00 to 22:00 UTC: 40 minutes, otherwise 20. */
const traffic = (calls: Date[] = []): Estimator => async (_o, _d, departAt) => {
  calls.push(departAt);
  const h = departAt.getUTCHours();
  return { seconds: (h === 21 ? 40 : 20) * 60, meters: 16_000 };
};

describe('planTrip', () => {
  it('works back from the arrival time using the traffic when you would leave', async () => {
    const calls: Date[] = [];
    const trip = await planTrip(traffic(calls), 'Home', 'Dentist', start, now);
    // Leaving 30 min before (21:30) is rush hour: 40 min. Leaving at 21:20 is still rush hour: 40 min.
    expect(calls.map((d) => d.toISOString())).toEqual(['2026-10-06T21:30:00.000Z', '2026-10-06T21:20:00.000Z']);
    expect(trip).toEqual({ minutes: 40, meters: 16_000, leaveAt: '2026-10-06T21:20:00.000Z', late: false });
  });

  it('says it is late when the leave time has passed, and just times the drive for all-day events', async () => {
    const soon = await planTrip(traffic(), 'Home', 'Dentist', new Date('2026-10-06T20:10:00Z'), now);
    expect(soon.late).toBe(true);
    const allDay = await planTrip(traffic(), 'Home', 'Camp', null, now);
    expect(allDay).toMatchObject({ minutes: 20, leaveAt: null, late: false });
  });
});

describe('googleRoutes', () => {
  it('asks the Routes API for a traffic-aware drive and reads the answer', async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify({ routes: [{ duration: '1520s', distanceMeters: 12345 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const later = new Date(Date.now() + 3_600_000);
    expect(await googleRoutes('KEY', fake)('Home', 'Dentist', later)).toEqual({ seconds: 1520, meters: 12345 });
    expect(sent!.url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    const headers = sent!.init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe('KEY');
    expect(JSON.parse(sent!.init.body as string)).toMatchObject({
      origin: { address: 'Home' }, destination: { address: 'Dentist' }, travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL', departureTime: later.toISOString(),
    });
  });

  it('reports Google errors plainly', async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 })) as unknown as typeof fetch;
    await expect(googleRoutes('BAD', fake)('a', 'b', new Date())).rejects.toThrow('API key not valid');
  });
});

describe('GET /api/events/:id/travel', () => {
  async function setup(travel?: Estimator) {
    const app = buildApp(openDb(':memory:'), { travel });
    const ev = JSON.parse((await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Dentist', allDay: false, start: '2099-01-01T10:00:00.000Z', end: '2099-01-01T11:00:00.000Z', location: '123 Main St' } })).body);
    return { app, ev };
  }

  it('needs a key, an address and a home address', async () => {
    const off = await setup();
    expect((await off.app.inject({ url: `/api/events/${off.ev.id}/travel` })).statusCode).toBe(503);
    const { app, ev } = await setup(traffic());
    const noHome = await app.inject({ url: `/api/events/${ev.id}/travel` });
    expect([noHome.statusCode, JSON.parse(noHome.body).error]).toEqual([400, 'Set your home address in Settings first']);
    await app.inject({ method: 'PUT', url: '/api/settings/homeAddress', payload: { value: '1 Home Rd' } });
    const ok = JSON.parse((await app.inject({ url: `/api/events/${ev.id}/travel` })).body);
    expect(ok).toMatchObject({ minutes: 20, origin: '1 Home Rd', destination: '123 Main St', late: false });
    expect(Date.parse(ok.leaveAt)).toBe(Date.parse('2099-01-01T09:40:00.000Z'));
  });

  it('reuses a recent answer instead of asking again', async () => {
    const calls: Date[] = [];
    const { app, ev } = await setup(traffic(calls));
    await app.inject({ method: 'PUT', url: '/api/settings/homeAddress', payload: { value: '1 Home Rd' } });
    await app.inject({ url: `/api/events/${ev.id}/travel` });
    await app.inject({ url: `/api/events/${ev.id}/travel` });
    expect(calls).toHaveLength(2); // two lookups for the first tap, none for the second
  });
});

describe('leave alerts', () => {
  async function setup(estimator: Estimator) {
    const db = openDb(':memory:');
    const app = buildApp(db, { travel: estimator });
    await app.inject({ method: 'PUT', url: '/api/settings/homeAddress', payload: { value: '1 Home Rd' } });
    const ev = JSON.parse((await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Dentist', allDay: false, start: '2099-01-01T10:00:00.000Z', end: '2099-01-01T11:00:00.000Z', location: '123 Main St' } })).body);
    return { db, app, ev };
  }

  it('sets an alert a chosen time before leaving, one per event, until dismissed', async () => {
    const { app, ev } = await setup(traffic());
    const alert = JSON.parse((await app.inject({ method: 'POST', url: '/api/alerts', payload: { eventId: ev.id, minutesBefore: 10 } })).body);
    expect(alert).toMatchObject({ title: 'Dentist', driveMinutes: 20, leaveAt: '2099-01-01T09:40:00.000Z', remindAt: '2099-01-01T09:30:00.000Z' });
    // Setting another replaces it.
    await app.inject({ method: 'POST', url: '/api/alerts', payload: { eventId: ev.id, minutesBefore: 0 } });
    const list = JSON.parse((await app.inject({ url: '/api/alerts' })).body);
    expect(list.map((a: any) => a.remindAt)).toEqual(['2099-01-01T09:40:00.000Z']);
    await app.inject({ method: 'POST', url: `/api/alerts/${list[0].id}/dismiss` });
    expect(JSON.parse((await app.inject({ url: '/api/alerts' })).body)).toEqual([]);
  });

  it('needs a timed event with an address', async () => {
    const { app } = await setup(traffic());
    const allDay = JSON.parse((await app.inject({ method: 'POST', url: '/api/events', payload: {
      title: 'Camp', allDay: true, start: '2099-01-01', end: '2099-01-02', location: 'Camp Rd' } })).body);
    expect((await app.inject({ method: 'POST', url: '/api/alerts', payload: { eventId: allDay.id, minutesBefore: 0 } })).statusCode).toBe(400);
  });

  it('re-checks traffic once, shortly before leaving, and moves the alert', async () => {
    let slow = false;
    const changing: Estimator = async () => ({ seconds: (slow ? 35 : 20) * 60, meters: 1000 });
    const db = openDb(':memory:');
    const { registerTravel } = await import('./travel.ts');
    const Fastify = (await import('fastify')).default;
    const app = Fastify();
    const travel = registerTravel(app, db, changing);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('homeAddress', '"1 Home Rd"')`).run();
    db.prepare(`INSERT INTO leave_alerts (id, event_id, title, destination, arrive_by, minutes_before, drive_minutes, leave_at, remind_at)
      VALUES ('a', 'e', 'Dentist', '123 Main St', '2099-01-01T10:00:00.000Z', 5, 20, '2099-01-01T09:40:00.000Z', '2099-01-01T09:35:00.000Z')`).run();
    slow = true;
    // 50 minutes before leaving: too early to re-check.
    await travel.refreshSoon(new Date('2099-01-01T08:50:00.000Z'));
    expect(db.prepare('SELECT drive_minutes FROM leave_alerts').get()).toEqual({ drive_minutes: 20 });
    // 20 minutes before: traffic got worse, so leave and remind earlier.
    await travel.refreshSoon(new Date('2099-01-01T09:20:00.000Z'));
    expect(db.prepare('SELECT drive_minutes, leave_at, remind_at FROM leave_alerts').get())
      .toEqual({ drive_minutes: 35, leave_at: '2099-01-01T09:25:00.000Z', remind_at: '2099-01-01T09:20:00.000Z' });
    await app.close();
  });
});
