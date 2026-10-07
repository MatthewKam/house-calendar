import { describe, expect, it } from 'vitest';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { macRemindersSync, type MacReminders } from './macReminders.ts';

/** A pretend Reminders app holding lists of open titles. */
function fakeReminders(lists: Record<string, string[]>) {
  const calls: unknown[] = [];
  const r: MacReminders = {
    read: async () => Object.entries(lists).map(([name, open]) => ({ name, open: [...open] })),
    apply: async (changes) => {
      calls.push(...changes);
      for (const c of changes) {
        if (c.op === 'add') lists[c.list].push(c.title);
        if (c.op === 'complete') lists[c.list] = lists[c.list].filter((t) => t !== c.title);
        if (c.op === 'rename') lists[c.list] = lists[c.list].map((t) => (t === c.title ? c.newTitle! : t));
      }
      return changes.map((c) => c.id);
    },
  };
  return { r, calls };
}

describe('macRemindersSync', () => {
  it('shows every list, empty ones too, and sends wall changes to Reminders', async () => {
    const db = openDb(':memory:');
    const app = buildApp(db, { remindersToken: 't' });
    const wall = async () => (await app.inject({ url: '/api/reminders' })).json().lists as { title: string; items: { id: string; title: string; pending: boolean }[] }[];
    const { r, calls } = fakeReminders({ Groceries: ['Milk'], Target: [] });
    const sync = macRemindersSync(db, 'Mac', r);

    await sync();
    expect((await wall()).map((l) => [l.title, l.items.map((i) => i.title)])).toEqual([['Groceries', ['Milk']], ['Target', []]]);

    // Added and ticked on the wall: waiting until the next sync, then done in Reminders.
    await app.inject({ method: 'POST', url: '/api/reminders', payload: { list: 'Target', title: 'Socks' } });
    const milk = (await wall())[0].items[0];
    await app.inject({ method: 'PATCH', url: `/api/reminders/${milk.id}`, payload: { done: true } });
    await sync();
    expect(calls).toMatchObject([{ op: 'add', list: 'Target', title: 'Socks' }, { op: 'complete', list: 'Groceries', title: 'Milk' }]);
    expect((await wall()).map((l) => [l.title, l.items.map((i) => [i.title, i.pending])])).toEqual([['Groceries', []], ['Target', [['Socks', false]]]]);
  });
});
