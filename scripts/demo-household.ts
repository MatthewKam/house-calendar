// App Review's demo household (docs/app-store.md): signs in as REVIEW_EMAIL with REVIEW_CODE and fills a
// made-up family through the app's own API, as someone using the app would. Only ever that account.
//
//   npx tsx scripts/demo-household.ts [https://sprig-family.com] [--fresh]
//
// --fresh deletes the reviewer's account and household first (Settings → Delete my account), so the demo
// can be made again before a review with this week's dates. Without it, an account that already has a
// household is left alone.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? 'https://sprig-family.com').replace(/\/$/, '');
const fresh = args.includes('--fresh');
const env = Object.fromEntries(
	readFileSync(new URL('../.env', import.meta.url), 'utf8')
		.split('\n')
		.filter((l) => /^[A-Z_]+=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const email = env.REVIEW_EMAIL;
const code = env.REVIEW_CODE;
if (!email || !code) throw new Error('REVIEW_EMAIL and REVIEW_CODE must be in .env');

// The reviewers are most likely in California; the family's week is laid out there.
const ZONE = 'America/Los_Angeles';
const PIN = '1234';

let cookie = '';
async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(base + path, {
		method,
		headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const set = res.headers.get('set-cookie');
	if (set) cookie = set.split(';')[0];
	if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
	return (res.status === 204 ? undefined : await res.json()) as T;
}

/** A day in the family's zone, `offset` days from today, as YYYY-MM-DD. */
function day(offset = 0) {
	const now = new Date(Date.now() + offset * 86_400_000);
	return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
		now,
	);
}
/** A local time on a day (`offset` days from today, h:m in the family's zone) as a UTC instant. */
function at(offset: number, h: number, m = 0) {
	const d = day(offset);
	const guess = new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
	// The zone's offset then: how far its wall clock is from UTC at that moment.
	const shown = new Date(guess.toLocaleString('en-US', { timeZone: ZONE }));
	const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
	return new Date(guess.getTime() + (utc.getTime() - shown.getTime())).toISOString();
}
/** A birthday `years` ago, `daysAgo` days further back. */
const born = (years: number, daysAgo: number) => {
	const d = new Date(`${day(-daysAgo)}T12:00:00Z`);
	d.setUTCFullYear(d.getUTCFullYear() - years);
	return d.toISOString().slice(0, 10);
};

interface Status {
	signedIn: boolean;
	households?: { id: string }[];
	memberId?: string | null;
}
interface Member {
	id: string;
	name: string;
}

await call('POST', '/api/account/email/start', { email });
const before = await call<Status>('POST', '/api/account/email/verify', { email, code });
if (before.households?.length) {
	if (!fresh) {
		console.log(`${email} already has a household; run with --fresh to make it again.`);
		process.exit(0);
	}
	await call('DELETE', '/api/account/delete');
	console.log('Deleted the old demo.');
	cookie = '';
	await new Promise((r) => setTimeout(r, 31_000)); // a code can be asked for every 30 seconds
	await call('POST', '/api/account/email/start', { email });
	await call('POST', '/api/account/email/verify', { email, code });
}

const status = await call<Status>('POST', '/api/account/households', { name: 'The Rivera family', yourName: 'Alex' });
const alexId = status.memberId!;
await call('PUT', '/api/account/pin', { pin: PIN });
await call('PUT', '/api/settings/homeAddress', { value: 'Golden Gate Park, San Francisco, CA' });

// The family: the grown-up signed in, the other parent, and kids of 4 and 2.
const add = (name: string, color: string) => call<Member>('POST', '/api/members', { name, color });
const sam = await add('Sam', '#2f9e8f');
const mia = await add('Mia', '#e8590c');
const leo = await add('Leo', '#7048e8');
await call('PATCH', `/api/members/${mia.id}`, { birthdate: born(4, 75) });
await call('PATCH', `/api/members/${leo.id}`, { birthdate: born(2, 140), allergies: ['peanuts'] });
const kids = [mia, leo];

// This week's calendar.
const event = (e: Record<string, unknown>) => call<{ id: string }>('POST', '/api/events', e);
const timed = (title: string, offset: number, h: number, m: number, minutes: number, who: string[], more = {}) =>
	event({
		title,
		allDay: false,
		start: at(offset, h, m),
		end: new Date(Date.parse(at(offset, h, m)) + minutes * 60_000).toISOString(),
		memberIds: who,
		...more,
	});
await timed('Swim lesson', 0, 16, 0, 45, [mia.id], { location: 'Hamilton Pool, 1900 Geary Blvd, San Francisco' });
await timed('Story time at the library', 1, 10, 30, 45, [leo.id, sam.id]);
const jiujitsu = await timed('Kids jiu jitsu', 2, 17, 30, 60, [mia.id]);
await call('PUT', `/api/events/${jiujitsu.id}/checklist`, {
	items: [
		{ title: 'Gi', picture: '🥋' },
		{ title: 'Water bottle', picture: '💧' },
		{ title: 'Snack', picture: '🍎' },
	],
});
await timed('Dentist', 3, 9, 0, 30, [mia.id, alexId], { location: '450 Sutter St, San Francisco' });
await timed('Grandma visits', 4, 15, 0, 180, []);
const party = await event({
	title: "Noah's birthday party",
	allDay: true,
	start: day(5),
	end: day(6),
	memberIds: [mia.id, leo.id],
});
await call('PUT', `/api/events/${party.id}/special`, { special: true });
await timed('Farmers market', 6, 9, 0, 90, []);
await timed('Date night', 2, 19, 0, 150, [alexId, sam.id]);

// Each kid's own tasks, with pictures, and the last few days done.
const every = [0, 1, 2, 3, 4, 5, 6];
const task = (memberId: string, t: Record<string, unknown>) =>
	call<{ id: string }>('POST', '/api/tasks', { memberId, days: every, ...t });
const done = (id: string, kid: Member, back: number) => call('PUT', `/api/tasks/${id}/done/${kid.id}/${day(-back)}`);
for (const kid of kids) {
	const daily = [];
	for (const [title, icon, time] of [
		['Brush teeth', '🪥', 'morning'],
		['Get dressed', '👕', 'morning'],
		['Tidy toys', '🧸', 'evening'],
		['Brush teeth', '🪥', 'evening'],
	] as const) {
		daily.push(await task(kid.id, { title, icon, time }));
	}
	const extras = [
		await task(kid.id, { title: 'Help set the table', icon: '🍽️', category: 'bonus', required: false, points: 1 }),
	];
	if (kid === mia) {
		extras.push(
			await task(kid.id, { title: 'Feed the cat', icon: '🐱', category: 'chores', required: false, points: 2 }),
		);
	}
	for (let back = 6; back >= 1; back--) {
		for (const t of [...daily, ...extras]) {
			if (kid === leo && back === 3 && t !== daily[0]) continue; // a toddler's day
			await done(t.id, kid, back);
		}
	}
	// This morning so far.
	await done(daily[0].id, kid, 0);
	if (kid === mia) await done(daily[1].id, kid, 0);
}

// Good moments a parent caught, with stars.
for (const [kid, kind, note, back, stars] of [
	[mia, 'helpful', 'Helped Leo with his shoes', 1, 3],
	[mia, 'problem_solving', 'Built the whole puzzle', 3, 3],
	[mia, 'attitude', 'Shared her snack', 5, 2],
	[leo, 'bravery', 'Tried the big slide', 2, 3],
	[leo, 'self_care', 'Washed his hands by himself', 4, 3],
	[leo, 'helpful', 'Put his cup in the sink', 1, 2],
] as const) {
	await call('POST', '/api/moments', { memberId: kid.id, kind, note, day: day(-back), stars });
}

// Jars to save stars up for, partly filled.
const today = day(0);
const zoo = await call<{ id: string }>('POST', '/api/rewards', {
	title: 'Trip to the zoo',
	goal: 40,
	memberIds: [mia.id, leo.id],
	today,
});
const sticker = await call<{ id: string }>('POST', '/api/rewards', {
	title: 'Pick a sticker book',
	goal: 15,
	memberIds: [mia.id],
	today,
});
// Stars come from extras and moments; most go in jars, a couple are left to place.
const buckets = await call<{ memberId: string; stars: number }[]>('GET', '/api/rewards/buckets');
const has = (kid: Member) => buckets.find((b) => b.memberId === kid.id)?.stars ?? 0;
const miaStars = has(mia) - 2;
await call('POST', '/api/rewards/place', {
	memberId: mia.id,
	today,
	places: [
		{ rewardId: zoo.id, stars: Math.ceil(miaStars / 2) },
		{ rewardId: sticker.id, stars: Math.floor(miaStars / 2) },
	],
});
await call('POST', '/api/rewards/place', {
	memberId: leo.id,
	today,
	places: [{ rewardId: zoo.id, stars: has(leo) - 1 }],
});

// Recipes, dinner tonight and tomorrow, and the groceries.
const ing = (amount: number | null, unit: string | null, item: string) => ({ group: null, amount, unit, item });
const recipe = (r: Record<string, unknown>) =>
	call<{ id: string }>('POST', '/api/recipes', {
		recipe: { notes: null, prepAhead: [], sourceUrl: null, meal: 'dinner', vegetables: [], ...r },
		images: [],
		cover: null,
	});
const soup = await recipe({
	title: 'Chicken noodle soup',
	servings: 4,
	totalMinutes: 45,
	activeMinutes: 20,
	proteins: ['chicken'],
	vegetables: ['carrots', 'celery', 'onion'],
	types: ['soup'],
	ingredients: [
		ing(1, 'lb', 'chicken thighs, boneless'),
		ing(2, null, 'carrots, sliced'),
		ing(2, 'stalk', 'celery, sliced'),
		ing(1, null, 'onion, diced'),
		ing(8, 'cup', 'chicken broth'),
		ing(2, 'cup', 'egg noodles'),
		ing(null, null, 'salt and pepper'),
	],
	steps: [
		'Soften the onion, carrots and celery in a little oil, about 5 minutes.',
		'Add the broth and the chicken. Simmer until the chicken is cooked, about 20 minutes.',
		'Lift out the chicken, shred it, and put it back.',
		'Add the noodles and cook until tender, about 7 minutes. Season and serve.',
	],
});
const tacos = await recipe({
	title: 'Sheet pan fish tacos',
	servings: 4,
	totalMinutes: 30,
	activeMinutes: 15,
	proteins: ['fish'],
	vegetables: ['cabbage', 'avocado'],
	types: ['sheet pan', 'Mexican'],
	ingredients: [
		ing(1.5, 'lb', 'cod fillets'),
		ing(1, 'tbsp', 'olive oil'),
		ing(2, 'tsp', 'chili powder'),
		ing(8, null, 'small tortillas'),
		ing(2, 'cup', 'shredded cabbage'),
		ing(1, null, 'avocado'),
		ing(1, null, 'lime'),
	],
	steps: [
		'Heat the oven to 425°F.',
		'Rub the fish with oil and chili powder and bake on a sheet pan for 10 to 12 minutes.',
		'Warm the tortillas, flake the fish, and fill with cabbage, avocado and a squeeze of lime.',
	],
});
await recipe({
	title: 'Banana pancakes',
	meal: 'breakfast',
	servings: 4,
	totalMinutes: 20,
	activeMinutes: 20,
	proteins: ['eggs'],
	types: ['pancakes'],
	ingredients: [ing(2, null, 'ripe bananas'), ing(2, null, 'eggs'), ing(1, 'cup', 'flour'), ing(1, 'cup', 'milk')],
	steps: ['Mash the bananas and whisk in the eggs and milk.', 'Stir in the flour.', 'Cook small pancakes in a pan.'],
});
await call('POST', '/api/meals', { day: day(0), meal: 'dinner', recipeId: soup.id, timeZone: ZONE });
await call('POST', '/api/meals', { day: day(1), meal: 'dinner', recipeId: tacos.id, timeZone: ZONE });

const lists = await call<{ id: string; title: string }[]>('POST', '/api/lists', { title: 'Groceries' });
const groceries = lists.find((l) => l.title === 'Groceries')!;
for (const title of ['Milk', 'Bananas', 'Bread', 'Yogurt', 'Apples', 'Diapers']) {
	await call('POST', `/api/lists/${groceries.id}/items`, { title });
}

console.log(`Demo household made at ${base} for ${email}, the week from ${today}. Kid mode's PIN: ${PIN}.`);
