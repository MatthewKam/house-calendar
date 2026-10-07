import { beforeEach, describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';

const TOKEN = 'secret-token';
let app: ReturnType<typeof buildApp>;
const json = <T = any>(res: { body: string }) => JSON.parse(res.body) as T;
const auth = { authorization: `Bearer ${TOKEN}` };

const sync = (device: string, items: object[] | string, applied: number[] = []) =>
  app.inject({ method: 'POST', url: '/api/reminders/phone/sync', headers: auth, payload: { device, items, applied } });
const pending = async (device: string) =>
  json<{ changes: { id: number; op: string; list: string; title: string }[] }>(
    await app.inject({ url: `/api/reminders/phone/pending?device=${device}`, headers: auth })).changes;
const wall = async () => json<{ lists: any[] }>(await app.inject({ url: '/api/reminders' })).lists;
const list = async (title: string) => (await wall()).find((l) => l.title === title);

beforeEach(() => {
  app = buildApp(openDb(':memory:'), { remindersToken: TOKEN });
});

describe('reminders sync', () => {
  it('shows what the phones send, with shared lists from either phone', async () => {
    await sync('Alex', [
      { list: 'Groceries', title: 'Milk', done: false },
      { list: 'Groceries', title: 'Eggs', done: 'Yes' },
      { list: 'Work', title: 'Expenses', done: 0 },
    ]);
    await sync('Jordan', JSON.stringify([{ list: 'groceries', title: 'Bread', done: false }]));

    const lists = await wall();
    expect(lists.map((l) => l.title)).toEqual(['Groceries', 'Work']);
    // Jordan's newer snapshot of the shared list replaced Alex's.
    expect((await list('Groceries')).items.map((i: any) => i.title)).toEqual(['Bread']);
    expect((await list('Groceries')).syncedBy.map((s: any) => s.device).sort()).toEqual(['Alex', 'Jordan']);
  });

  it('lists not-done items first', async () => {
    await sync('Alex', [{ list: 'To do', title: 'A', done: true }, { list: 'To do', title: 'B', done: false }]);
    expect((await list('To do')).items.map((i: any) => [i.title, i.done])).toEqual([['B', false], ['A', true]]);
  });

  it('queues items added on the wall for a phone that has the list, once', async () => {
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }]);
    await sync('Jordan', [{ list: 'Private', title: 'Gift idea' }]);
    await app.inject({ method: 'POST', url: '/api/reminders', payload: { list: 'groceries', title: '  Apples ' } });

    // Shown straight away, marked as waiting for a phone.
    expect((await list('Groceries')).items.find((i: any) => i.title === 'Apples')).toMatchObject({ pending: true, done: false });
    // Jordan's phone doesn't have Groceries, so it isn't asked.
    expect(await pending('Jordan')).toEqual([]);
    const [change] = await pending('Alex');
    expect(change).toMatchObject({ op: 'add', list: 'Groceries', title: 'Apples' });

    // Alex's phone applies it and confirms; the snapshot now includes it, no longer pending.
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }, { list: 'Groceries', title: 'Apples' }], [change.id]);
    expect(await pending('Alex')).toEqual([]);
    expect((await list('Groceries')).items.map((i: any) => [i.title, i.pending])).toEqual([['Milk', false], ['Apples', false]]);
  });

  it('ticks items off on the wall, and unticking before a phone runs cancels it', async () => {
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }]);
    const milk = (await list('Groceries')).items[0];
    await app.inject({ method: 'PATCH', url: `/api/reminders/${milk.id}`, payload: { done: true } });
    expect((await list('Groceries')).items[0]).toMatchObject({ done: true, pending: true });
    expect((await pending('Alex')).map((c) => c.op)).toEqual(['complete']);

    await app.inject({ method: 'PATCH', url: `/api/reminders/${milk.id}`, payload: { done: false } });
    expect(await pending('Alex')).toEqual([]);
  });

  it("doesn't repeat a change the phone already made when its confirmation was lost", async () => {
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }]);
    await app.inject({ method: 'POST', url: '/api/reminders', payload: { list: 'Groceries', title: 'Apples' } });
    await pending('Alex');
    // The phone added Apples but the sync without `applied` is all that arrived.
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }, { list: 'Groceries', title: 'Apples' }]);
    expect(await pending('Alex')).toEqual([]);
  });

  it('removes lists a phone stops sending', async () => {
    await sync('Alex', [{ list: 'Old', title: 'X' }, { list: 'Keep', title: 'Y' }]);
    await sync('Alex', [{ list: 'Keep', title: 'Y' }]);
    expect((await wall()).map((l) => l.title)).toEqual(['Keep']);
  });

  it('reads items sent as text, the way a Shortcut Text field sends them', async () => {
    // One dictionary per line, not a JSON array.
    const text = '{\n  "list" : "Groceries",\n  "title" : "Milk"\n}\n{\n  "list" : "Groceries",\n  "title" : "Eggs"\n}';
    expect(json(await sync('Mac', text))).toEqual({ ok: true, lists: 1 });
    expect((await list('Groceries')).items.map((i: any) => i.title)).toEqual(['Milk', 'Eggs']);
    // A single reminder arrives as a lone dictionary.
    await sync('Mac', '{"list":"Groceries","title":"Bread"}');
    expect((await list('Groceries')).items.map((i: any) => i.title)).toEqual(['Bread']);
  });

  it('explains items it can\'t read instead of failing', async () => {
    const res = await sync('Mac', 'Groceries Milk');
    expect(res.statusCode).toBe(400);
    expect(json(res).error).toMatch(/Couldn't read items; it starts: Groceries Milk/);
  });

  it('renames an item from the wall (an icon added to its name), after any ticks', async () => {
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }]);
    const milk = (await list('Groceries')).items[0];
    await app.inject({ method: 'PATCH', url: `/api/reminders/${milk.id}`, payload: { done: true } });
    await app.inject({ method: 'PATCH', url: `/api/reminders/${milk.id}`, payload: { title: '🥛 Milk' } });
    expect((await list('Groceries')).items).toMatchObject([{ title: '🥛 Milk', done: true, pending: true }]);
    // The tick is handed over first, under the name the phone knows.
    expect(await pending('Alex')).toMatchObject([
      { op: 'complete', title: 'Milk' }, { op: 'rename', title: 'Milk', newTitle: '🥛 Milk' }]);
    // Renaming again replaces the waiting rename; once the phone has the new name, it's done.
    await app.inject({ method: 'PATCH', url: `/api/reminders/${milk.id}`, payload: { title: '🧀 Milk' } });
    const changes = await pending('Alex');
    expect(changes.filter((c: any) => c.op === 'rename')).toMatchObject([{ newTitle: '🧀 Milk' }]);
    await sync('Alex', [{ list: 'Groceries', title: '🧀 Milk', done: true }], changes.map((c: any) => c.id));
    expect(await pending('Alex')).toEqual([]);
  });

  it('renames an item added on the wall before any phone has it', async () => {
    await sync('Alex', [{ list: 'Groceries', title: 'Milk' }]);
    await app.inject({ method: 'POST', url: '/api/reminders', payload: { list: 'Groceries', title: 'Eggs' } });
    const eggs = (await list('Groceries')).items.find((i: any) => i.title === 'Eggs');
    await app.inject({ method: 'PATCH', url: `/api/reminders/${eggs.id}`, payload: { title: '🥚 Eggs' } });
    expect(await pending('Alex')).toMatchObject([{ op: 'add', title: '🥚 Eggs' }]);
  });

  it('shows empty lists a phone names', async () => {
    await app.inject({ method: 'POST', url: '/api/reminders/phone/sync', headers: auth,
      payload: { device: 'Mac', items: [{ list: 'Groceries', title: 'Milk' }], lists: 'Groceries\nTarget' } });
    expect((await wall()).map((l) => [l.title, l.items.length])).toEqual([['Groceries', 1], ['Target', 0]]);
  });

  it('only lets phones with the token sync', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/reminders/phone/sync', payload: { device: 'X', items: [] } });
    expect(res.statusCode).toBe(401);
    const off = buildApp(openDb(':memory:'));
    expect((await off.inject({ url: '/api/reminders/phone/pending?device=X', headers: auth })).statusCode).toBe(503);
    expect(json(await off.inject({ url: '/api/reminders' }))).toEqual({ enabled: false, lists: [] });
  });

  it('rejects adding to a list no phone has', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/reminders', payload: { list: 'Nope', title: 'X' } });
    expect(res.statusCode).toBe(400);
  });
});
