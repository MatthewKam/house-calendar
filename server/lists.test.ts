import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.ts';
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
		expect(
			(await call('POST', `/api/lists/${list.id}/items`, { title: 'Call the dentist', due: 'Friday' })).status,
		).toBe(400);
		expect(
			(await call('POST', `/api/lists/${list.id}/items`, { title: 'Call the dentist', memberId: 'nobody' })).status,
		).toBe(400);
		const added = await call('POST', `/api/lists/${list.id}/items`, {
			title: 'Call the dentist',
			due: '2099-01-02T17:00:00.000Z',
			memberId: 'alex',
		});
		expect(added.body[0].items).toMatchObject([
			{ title: '🥛 Milk', done: false, due: null, memberId: null },
			{ title: 'Call the dentist', due: '2099-01-02T17:00:00.000Z', memberId: 'alex' },
		]);

		// Done ones go after the open ones, and Clear done takes them off.
		const milk = added.body[0].items[0];
		const ticked = await call('PATCH', `/api/lists/items/${milk.id}`, { done: true });
		expect(ticked.body[0].items.map((i: { title: string; done: boolean }) => [i.title, i.done])).toEqual([
			['Call the dentist', false],
			['🥛 Milk', true],
		]);
		expect(ticked.body[0].items[1].doneAt).toEqual(expect.any(String));
		const cleared = await call('DELETE', `/api/lists/${list.id}/done`);
		expect(cleared.body[0].items.map((i: { title: string }) => i.title)).toEqual(['Call the dentist']);

		// A day works as a when too; null takes it off.
		const dentist = cleared.body[0].items[0];
		expect((await call('PATCH', `/api/lists/items/${dentist.id}`, { due: '2099-01-03' })).body[0].items[0].due).toBe(
			'2099-01-03',
		);
		expect(
			(await call('PATCH', `/api/lists/items/${dentist.id}`, { due: null, memberId: null })).body[0].items[0],
		).toMatchObject({ due: null, memberId: null });

		// An edit changes only what it sends (shared/lists.ts), and has to send something.
		await call('PATCH', `/api/lists/items/${dentist.id}`, { due: '2099-01-04', memberId: 'alex' });
		expect(
			(await call('PATCH', `/api/lists/items/${dentist.id}`, { title: 'Call the vet' })).body[0].items[0],
		).toMatchObject({ title: 'Call the vet', done: false, due: '2099-01-04', memberId: 'alex' });
		expect((await call('PATCH', `/api/lists/items/${dentist.id}`, {})).status).toBe(400);
	});

	it('puts the last ticked at the very bottom, and an unticked one at the end of the open ones', async () => {
		const { call } = setup();
		const list = (await call('POST', '/api/lists', { title: 'Groceries' })).body[0];
		for (const title of ['Milk', 'Eggs', 'Bread', 'Rice']) await call('POST', `/api/lists/${list.id}/items`, { title });
		const id = async (title: string) =>
			(await call('GET', '/api/lists')).body[0].items.find((i: { title: string }) => i.title === title).id;
		const titles = (res: { body: { items: { title: string; done: boolean }[] }[] }) =>
			res.body[0].items.map((i) => `${i.title}${i.done ? ' ✓' : ''}`);
		await call('PATCH', `/api/lists/items/${await id('Milk')}`, { done: true });
		await new Promise((done) => setTimeout(done, 5));
		expect(titles(await call('PATCH', `/api/lists/items/${await id('Eggs')}`, { done: true }))).toEqual([
			'Bread',
			'Rice',
			'Milk ✓',
			'Eggs ✓',
		]);
		await new Promise((done) => setTimeout(done, 5));
		expect(titles(await call('PATCH', `/api/lists/items/${await id('Milk')}`, { done: false }))).toEqual([
			'Bread',
			'Rice',
			'Milk',
			'Eggs ✓',
		]);
	});

	it("keeps an item's section: the recipe it was added for", async () => {
		const { call } = setup();
		const list = (await call('POST', '/api/lists', { title: 'Groceries' })).body[0];
		await call('POST', `/api/lists/${list.id}/items`, { title: 'Milk' });
		const added = await call('POST', `/api/lists/${list.id}/items`, {
			title: '2 onions',
			section: ' Spaghetti  bolognese ',
		});
		expect(added.body[0].items).toMatchObject([
			{ title: 'Milk', section: null },
			{ title: '2 onions', section: 'Spaghetti bolognese' },
		]);
		const onions = added.body[0].items[1];
		// A tick keeps it there; an empty section takes it out.
		expect((await call('PATCH', `/api/lists/items/${onions.id}`, { done: true })).body[0].items[1].section).toBe(
			'Spaghetti bolognese',
		);
		expect((await call('PATCH', `/api/lists/items/${onions.id}`, { section: ' ' })).body[0].items[1].section).toBe(
			null,
		);
	});

	it('moves lines sent from a recipe before sections ("· for Tacos") under that section', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'sprig-')), 'old.db');
		const before = openDb(file, 64);
		before.prepare(`INSERT INTO lists (id, title) VALUES ('g', 'Groceries')`).run();
		before
			.prepare(
				`INSERT INTO list_items (id, list_id, title) VALUES
      ('a', 'g', '1 lb beef · for Tacos'), ('b', 'g', 'Milk'), ('c', 'g', '2 limes · for Fish · for two')`,
			)
			.run();
		before.close();
		const db = openDb(file);
		expect(db.prepare('SELECT id, title, section FROM list_items ORDER BY id').all()).toEqual([
			{ id: 'a', title: '1 lb beef', section: 'Tacos' },
			{ id: 'b', title: 'Milk', section: null },
			{ id: 'c', title: '2 limes', section: 'Fish · for two' },
		]);
		db.close();
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

	it('keeps who ticked an item, for the dot beside it', async () => {
		const { app, call } = household([
			{ id: 'mom', name: 'Mom' },
			{ id: 'dad', name: 'Dad' },
		]);
		let viewer: object | undefined = undefined;
		app.addHook('onRequest', async (req) => {
			req.raw.viewer = viewer as never;
		});
		const list = (await call('POST', '/api/lists', { title: 'Groceries' })).body[0];
		const milk = (await call('POST', `/api/lists/${list.id}/items`, { title: 'Milk' })).body[0].items[0];
		viewer = {
			role: 'guardian',
			memberId: 'mom',
			parent: true,
			holder: true,
			actor: 'mom',
			guardians: [],
			stillParent() {},
		};
		expect((await call('PATCH', `/api/lists/items/${milk.id}`, { done: true })).body[0].items[0].doneBy).toBe('mom');
		// Ticking it again keeps who did it first; unticking forgets.
		viewer = {
			role: 'guardian',
			memberId: 'dad',
			parent: true,
			holder: false,
			actor: 'dad',
			guardians: [],
			stillParent() {},
		};
		expect((await call('PATCH', `/api/lists/items/${milk.id}`, { done: true })).body[0].items[0].doneBy).toBe('mom');
		expect((await call('PATCH', `/api/lists/items/${milk.id}`, { done: false })).body[0].items[0].doneBy).toBe(null);
		// The wall, with no one signed in: not known.
		viewer = {
			role: 'wall',
			memberId: null,
			parent: false,
			holder: false,
			actor: 'wall',
			guardians: [],
			stillParent() {},
		};
		expect((await call('PATCH', `/api/lists/items/${milk.id}`, { done: true })).body[0].items[0].doneBy).toBe(null);
	});

	it('shops together: says who is, and answers live as soon as the lists change', async () => {
		const { app, call } = household([{ id: 'mom', name: 'Mom' }], { liveLists: { waitMs: 300, lookMs: 20 } });
		app.addHook('onRequest', async (req) => {
			req.raw.viewer = {
				role: 'guardian',
				memberId: 'mom',
				parent: true,
				holder: true,
				actor: 'mom',
				guardians: [],
				stillParent() {},
			} as never;
		});
		const list = (await call('POST', '/api/lists', { title: 'Groceries' })).body[0];
		expect(list.shopping).toEqual([]);
		expect((await call('PUT', `/api/lists/${list.id}/shopping`, { on: true })).body[0].shopping).toEqual(['mom']);
		expect((await call('PUT', '/api/lists/nope/shopping', { on: true })).status).toBe(404);

		// No stamp yet: straight away. The same stamp: waits, and answers the change as soon as it's made.
		const first = (await call('GET', '/api/lists/live')).body;
		expect(first.lists[0].shopping).toEqual(['mom']);
		const asked = Date.now();
		const waiting = call('GET', `/api/lists/live?stamp=${first.stamp}`);
		await new Promise((done) => setTimeout(done, 50));
		await call('POST', `/api/lists/${list.id}/items`, { title: 'Eggs' });
		const changed = (await waiting).body;
		expect(changed.stamp).not.toBe(first.stamp);
		expect(changed.lists[0].items.map((i: { title: string }) => i.title)).toEqual(['Eggs']);
		expect(Date.now() - asked).toBeLessThan(300);
		// Nothing changes: the same stamp back after the wait.
		expect((await call('GET', `/api/lists/live?stamp=${changed.stamp}`)).body.stamp).toBe(changed.stamp);

		expect((await call('PUT', `/api/lists/${list.id}/shopping`, { on: false })).body[0].shopping).toEqual([]);
	});
});
