import { describe, expect, it } from 'vitest';
import { household } from './testing.ts';

const setup = () => household([{ id: 'alex', name: 'Alex' }]);

describe('lists', () => {
  it('makes lists, adds items with a when and a who, and ticks them off', async () => {
    const { call } = setup();
    const made = await call('POST', '/api/lists', { title: '  Groceries ' });
    expect(made.status).toBe(201);
    const list = made.body[0];
    expect(list).toMatchObject({ title: 'Groceries', items: [] });
    expect((await call('POST', '/api/lists', { title: 'groceries' })).status).toBe(409);

    await call('POST', `/api/lists/${list.id}/items`, { title: '🥛 Milk' });
    expect((await call('POST', `/api/lists/${list.id}/items`, { title: 'Call the dentist', due: 'Friday' })).status).toBe(400);
    expect((await call('POST', `/api/lists/${list.id}/items`, { title: 'Call the dentist', memberId: 'nobody' })).status).toBe(400);
    const added = await call('POST', `/api/lists/${list.id}/items`, { title: 'Call the dentist', due: '2099-01-02T17:00:00.000Z', memberId: 'alex' });
    expect(added.body[0].items).toMatchObject([
      { title: '🥛 Milk', done: false, due: null, memberId: null },
      { title: 'Call the dentist', due: '2099-01-02T17:00:00.000Z', memberId: 'alex' },
    ]);

    // Done ones go after the open ones, and Clear done takes them off.
    const milk = added.body[0].items[0];
    const ticked = await call('PATCH', `/api/lists/items/${milk.id}`, { done: true });
    expect(ticked.body[0].items.map((i: { title: string; done: boolean }) => [i.title, i.done])).toEqual([['Call the dentist', false], ['🥛 Milk', true]]);
    expect(ticked.body[0].items[1].doneAt).toEqual(expect.any(String));
    const cleared = await call('DELETE', `/api/lists/${list.id}/done`);
    expect(cleared.body[0].items.map((i: { title: string }) => i.title)).toEqual(['Call the dentist']);

    // A day works as a when too; null takes it off.
    const dentist = cleared.body[0].items[0];
    expect((await call('PATCH', `/api/lists/items/${dentist.id}`, { due: '2099-01-03' })).body[0].items[0].due).toBe('2099-01-03');
    expect((await call('PATCH', `/api/lists/items/${dentist.id}`, { due: null, memberId: null })).body[0].items[0]).toMatchObject({ due: null, memberId: null });
  });

  it('renames and deletes a list with its items', async () => {
    const { db, call } = setup();
    const a = (await call('POST', '/api/lists', { title: 'Packing' })).body[0];
    await call('POST', '/api/lists', { title: 'To do' });
    await call('POST', `/api/lists/${a.id}/items`, { title: 'Socks' });
    expect((await call('PATCH', `/api/lists/${a.id}`, { title: 'to DO' })).status).toBe(409);
    expect((await call('PATCH', `/api/lists/${a.id}`, { title: 'Beach trip' })).body[0].title).toBe('Beach trip');
    expect((await call('DELETE', `/api/lists/${a.id}`)).body.map((l: { title: string }) => l.title)).toEqual(['To do']);
    expect(db.prepare('SELECT COUNT(*) n FROM list_items').get()).toEqual({ n: 0 });
  });
});
