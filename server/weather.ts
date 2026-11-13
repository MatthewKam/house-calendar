import type { FastifyInstance } from 'fastify';
import type { DB } from './db.ts';
import type { EventWeather, Wear, Weather } from '../shared/weather.ts';
import { eventAccess } from './privacy.ts';

/**
 * The hours graph: a whole day, starting a 3-hour mark before the last one at or before now (at 7:40, the
 * last mark is 6 AM, so it starts at 3 AM and runs to 3 AM tomorrow), so it moves through the day and
 * shows a little of what's gone by. Hours asked for from before now: enough for the earliest start.
 */
const GRAPH_HOURS = 24;
const PAST_HOURS = 6;

/**
 * The hours that count for dressing (home's clock): out the door to the end of the school day, or once
 * that's over, the evening. Only the hours still ahead count, so a cold morning that's turned warm
 * doesn't still ask for a jacket.
 */
const OUT_FROM = 7;
const OUT_TO = 15;
const EVENING_TO = 20;

/** The first and last hour that count for dressing, `now` being the hour of the day it is. */
export function dressingHours(now: number): [number, number] {
	if (now < OUT_TO) return [Math.max(now, OUT_FROM), OUT_TO];
	if (now < EVENING_TO) return [now, EVENING_TO];
	return [now, 23];
}

/** Pants when it never feels warmer than this while out (°F); a jacket when it feels colder than this at any point. */
const PANTS_BELOW = 70;
const JACKET_BELOW = 58;
/** Rain gear at this chance of rain (%) while out, or a jacket for wind this strong (mph). */
const RAIN_FROM = 40;
const WINDY = 20;

/**
 * What to wear, from how warm it feels (the wind's chill counted in) and the chance of rain while
 * they're out: long pants on a day that never gets warm, a jacket for a cold moment or a cold wind,
 * rain gear when rain's likely.
 */
export function wearFor(hours: { feels: number; rain: number }[], wind: number): Wear {
	const most = Math.max(...hours.map((h) => h.feels));
	const least = Math.min(...hours.map((h) => h.feels));
	return {
		pants: most < PANTS_BELOW,
		jacket: least < JACKET_BELOW || (wind >= WINDY && most < PANTS_BELOW),
		rain: Math.max(...hours.map((h) => h.rain)) >= RAIN_FROM,
	};
}

interface Place {
	lat: number;
	lon: number;
}

const CACHE_MS = 10 * 60_000;
/** The days ahead change slowly: looked up again after an hour. */
const OUTLOOK_MS = 60 * 60_000;

/**
 * Finds the home address on a map. US street addresses go to the Census Bureau's free geocoder; if it
 * finds nothing (or the address isn't in the US), Open-Meteo's place search tries the town instead.
 */
export async function geocode(address: string, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
	const census = await fetchImpl(
		'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' +
			encodeURIComponent(address),
	).then(
		(r) => (r.ok ? r.json() : null),
		() => null,
	);
	const match = census?.result?.addressMatches?.[0]?.coordinates;
	if (match) return { lat: match.y, lon: match.x };
	// "1 Main St, Irvine, CA 92618" → try "Irvine", then the other parts (not a state or country code:
	// "HI" or "USA" would find some other place by that name).
	const parts = address
		.split(',')
		.map((p) => p.trim().replace(/\s+\d{5}(-\d{4})?$/, ''))
		.filter((p, i) => p && (i === 0 || p.length > 3));
	for (const name of [...parts.slice(1), parts[0]]) {
		const found = await fetchImpl(
			`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(name)}`,
		).then(
			(r) => (r.ok ? r.json() : null),
			() => null,
		);
		const place = found?.results?.[0];
		if (place) return { lat: place.latitude, lon: place.longitude };
	}
	return null;
}

/** Current conditions and today's high and low from Open-Meteo (free, no key). */
export async function forecast(place: Place, fetchImpl: typeof fetch = fetch): Promise<Weather> {
	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(3)}&longitude=${place.lon.toFixed(3)}` +
		'&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day' +
		'&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,weather_code,sunrise,sunset,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max' +
		'&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code' +
		`&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=8&past_hours=${PAST_HOURS}`;
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
	const w = await res.json();
	// Sunrise and sunset come as home's local clock time ("2026-10-07T06:50"); make them instants.
	const instant = (local: string) => new Date(Date.parse(`${local}:00Z`) - w.utc_offset_seconds * 1000).toISOString();
	// Today's hours still ahead while they're out ("2026-10-07T08:00", home's clock).
	const today = w.daily.time[0] as string;
	const [from, to] = dressingHours(w.current.time ? Number((w.current.time as string).slice(11, 13)) : 0);
	const out = (w.hourly.time as string[]).flatMap((t, i) => {
		const hour = Number(t.slice(11, 13));
		return t.startsWith(today) && hour >= from && hour <= to
			? [
					{
						feels: w.hourly.apparent_temperature[i] as number,
						rain: (w.hourly.precipitation_probability[i] ?? 0) as number,
					},
				]
			: [];
	});
	const wind = Math.round(w.daily.wind_speed_10m_max[0] ?? 0);
	// The hours graph (home's clock): from a 3-hour mark before the last one at or before now, a whole day
	// (both ends: 3 AM to 3 AM).
	const thisHour = w.current.time ? (w.current.time as string).slice(0, 13) : '';
	const at = Math.max(
		0,
		(w.hourly.time as string[]).findIndex((t) => t.slice(0, 13) >= thisHour),
	);
	const hourNow = thisHour ? Number(thisHour.slice(11, 13)) : 0;
	const first = Math.max(0, at - (hourNow % 3) - 3);
	const hours = (w.hourly.time as string[]).slice(first, first + GRAPH_HOURS + 1).map((t, j) => {
		const i = first + j;
		return {
			time: instant(t),
			temp: Math.round(w.hourly.temperature_2m?.[i] ?? w.hourly.apparent_temperature[i]),
			feels: Math.round(w.hourly.apparent_temperature[i]),
			rain: Math.round(w.hourly.precipitation_probability[i] ?? 0),
			code: w.hourly.weather_code?.[i] ?? w.current.weather_code,
		};
	});
	return {
		temp: Math.round(w.current.temperature_2m),
		feels: Math.round(w.current.apparent_temperature ?? w.current.temperature_2m),
		high: Math.round(w.daily.temperature_2m_max[0]),
		low: Math.round(w.daily.temperature_2m_min[0]),
		humidity: Math.round(w.current.relative_humidity_2m),
		code: w.current.weather_code,
		isDay: w.current.is_day === 1,
		sunrise: instant(w.daily.sunrise[0]),
		sunset: instant(w.daily.sunset[0]),
		days: (w.daily.time as string[]).map((date, i) => ({
			date,
			high: Math.round(w.daily.temperature_2m_max[i]),
			low: Math.round(w.daily.temperature_2m_min[i]),
			code: w.daily.weather_code[i],
			rain: Math.round(w.daily.precipitation_probability_max[i] ?? 0),
			wind: Math.round(w.daily.wind_speed_10m_max[i] ?? 0),
			feelsHigh: Math.round(w.daily.apparent_temperature_max?.[i] ?? w.daily.temperature_2m_max[i]),
			feelsLow: Math.round(w.daily.apparent_temperature_min?.[i] ?? w.daily.temperature_2m_min[i]),
		})),
		hours,
		rainChance: Math.round(w.daily.precipitation_probability_max[0] ?? 0),
		cloudCover: Math.round(w.daily.cloud_cover_mean[0] ?? 0),
		wind,
		// No hours (the forecast came without them): judged by the day's high and low instead.
		wear: wearFor(
			out.length
				? out
				: [
						{ feels: w.daily.temperature_2m_max[0], rain: w.daily.precipitation_probability_max[0] ?? 0 },
						{ feels: w.daily.temperature_2m_min[0], rain: 0 },
					],
			wind,
		),
	};
}

/** Rounded to about a kilometre: close enough for a forecast, and no closer than it needs to be. */
const near = (p: Place): Place => ({ lat: Math.round(p.lat * 100) / 100, lon: Math.round(p.lon * 100) / 100 });

/** Miles between two places (as the crow flies). */
export function milesBetween(a: Place, b: Place) {
	const rad = Math.PI / 180;
	const h =
		Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
	return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** An event at least this far from home (miles) gets its own forecast. */
export const AWAY_MILES = 15;
/** How far ahead forecasts go (days, today counted). */
const AHEAD_DAYS = 16;
/** An event's forecast over this many days at most (a long trip: its first days). */
const MAX_DAYS = 7;

/** The days ahead at a place, and its hours, both on its own clock, and how far off UTC that clock is. */
interface Outlook {
	offset: number;
	days: {
		date: string;
		high: number;
		low: number;
		code: number;
		rain: number;
		wind: number;
		feelsHigh: number;
		feelsLow: number;
	}[];
	hours: Map<string, { temp: number; feels: number; rain: number; code: number }>;
}

async function outlook(place: Place, fetchImpl: typeof fetch): Promise<Outlook> {
	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(2)}&longitude=${place.lon.toFixed(2)}` +
		'&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,weather_code,precipitation_probability_max,wind_speed_10m_max' +
		'&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code' +
		`&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=${AHEAD_DAYS}`;
	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
	const w = await res.json();
	return {
		offset: w.utc_offset_seconds ?? 0,
		days: (w.daily.time as string[]).map((date, i) => ({
			date,
			high: Math.round(w.daily.temperature_2m_max[i]),
			low: Math.round(w.daily.temperature_2m_min[i]),
			code: w.daily.weather_code[i],
			rain: Math.round(w.daily.precipitation_probability_max[i] ?? 0),
			wind: Math.round(w.daily.wind_speed_10m_max[i] ?? 0),
			feelsHigh: Math.round(w.daily.apparent_temperature_max?.[i] ?? w.daily.temperature_2m_max[i]),
			feelsLow: Math.round(w.daily.apparent_temperature_min?.[i] ?? w.daily.temperature_2m_min[i]),
		})),
		hours: new Map(
			(w.hourly.time as string[]).map((t, i) => [
				t.slice(0, 13),
				{
					temp: Math.round(w.hourly.temperature_2m[i]),
					feels: Math.round(w.hourly.apparent_temperature[i]),
					rain: Math.round(w.hourly.precipitation_probability[i] ?? 0),
					code: w.hourly.weather_code[i],
				},
			]),
		),
	};
}

/** One event's place on its days, as an event's forecast (shared/weather.ts) has it. */
export function eventForecast(
	o: Outlook,
	ev: { all_day: number; start: string; end: string },
	miles: number,
): EventWeather {
	// Its days, on the place's own clock: an all-day event's dates, a timed one's from start to end.
	const local = (iso: string) => new Date(Date.parse(iso) + o.offset * 1000).toISOString();
	const first = ev.all_day ? ev.start : local(ev.start).slice(0, 10);
	const last = ev.all_day
		? new Date(Date.parse(`${ev.end}T00:00:00Z`) - 864e5).toISOString().slice(0, 10)
		: local(ev.end).slice(0, 10);
	const days = o.days.filter((d) => d.date >= first && d.date <= last).slice(0, MAX_DAYS);
	const at = ev.all_day ? undefined : o.hours.get(local(ev.start).slice(0, 13));
	// Packing for the warmest and coolest it feels over its days, and the likeliest rain.
	const wear = days.length
		? wearFor(
				days.flatMap((d) => [
					{ feels: d.feelsHigh, rain: d.rain },
					{ feels: d.feelsLow, rain: 0 },
				]),
				Math.max(...days.map((d) => d.wind)),
			)
		: null;
	return {
		miles: Math.round(miles),
		days: days.map(({ wind: _w, ...d }) => d),
		...(at ? { at } : {}),
		wear,
		later: !days.length && first > (o.days.at(-1)?.date ?? ''),
	};
}

/**
 * GET /api/weather: the weather at the home address set in Settings, refreshed every 10 minutes; or,
 * with ?lat=&lon=, where this device is (Today's Here). GET /api/weather/events?ids=: a forecast for each
 * of these events that's far from home.
 */
export function registerWeather(app: FastifyInstance, db: DB, fetchImpl: typeof fetch = fetch) {
	// Addresses found on a map (or not), each looked up once.
	const places = new Map<string, Place | null>();
	const find = async (address: string) => {
		if (!places.has(address)) places.set(address, await geocode(address, fetchImpl));
		return places.get(address)!;
	};
	// Forecasts by place: today's weather, and the days ahead for events.
	const cached = new Map<string, { weather: Weather; at: number }>();
	const outlooks = new Map<string, { outlook: Outlook; at: number }>();
	const homeAddress = () => {
		const row = db.prepare(`SELECT value FROM settings WHERE key = 'homeAddress'`).get() as
			{ value: string } | undefined;
		return row ? (JSON.parse(row.value) as string).trim() : '';
	};
	/** Today's weather at a place, from the cache when it's fresh (or the lookup failed). */
	async function weatherAt(place: Place) {
		const key = `${place.lat},${place.lon}`;
		const was = cached.get(key);
		if (was && Date.now() - was.at < CACHE_MS) return was.weather;
		try {
			const weather = await forecast(place, fetchImpl);
			// A few places at most (home, and where the family's phones are).
			if (cached.size > 20) cached.clear();
			cached.set(key, { weather, at: Date.now() });
			return weather;
		} catch (err) {
			app.log.warn({ err }, 'weather lookup failed');
			// An older answer beats none.
			if (was) return was.weather;
			throw err;
		}
	}

	app.get<{ Querystring: { lat?: number; lon?: number } }>(
		'/api/weather',
		{
			schema: {
				querystring: {
					type: 'object',
					properties: {
						lat: { type: 'number', minimum: -90, maximum: 90 },
						lon: { type: 'number', minimum: -180, maximum: 180 },
					},
				},
			},
		},
		async (req, reply) => {
			const { lat, lon } = req.query;
			let place: Place | null;
			if (lat !== undefined && lon !== undefined) place = near({ lat, lon });
			else {
				const address = homeAddress();
				if (!address) return reply.code(404).send({ error: 'Set your home address in Settings to see the weather' });
				try {
					place = await find(address);
				} catch {
					place = null;
				}
				if (!place) return reply.code(404).send({ error: "Couldn't find the home address on a map" });
			}
			try {
				return await weatherAt(place);
			} catch {
				return reply.code(502).send({ error: "Couldn't get the weather" });
			}
		},
	);

	// A place typed in (Today's third choice, after Home and Here): where it is, rounded like Here.
	app.get<{ Querystring: { q: string } }>(
		'/api/weather/place',
		{
			schema: {
				querystring: {
					type: 'object',
					required: ['q'],
					properties: { q: { type: 'string', minLength: 2, maxLength: 300 } },
				},
			},
		},
		async (req, reply) => {
			const at = await find(req.query.q.trim()).catch(() => null);
			if (!at) return reply.code(404).send({ error: "Couldn't find that place" });
			return near(at);
		},
	);

	app.get<{ Querystring: { ids: string } }>(
		'/api/weather/events',
		{
			schema: {
				querystring: { type: 'object', required: ['ids'], properties: { ids: { type: 'string', maxLength: 2000 } } },
			},
		},
		async (req) => {
			const address = homeAddress();
			const home = address ? await find(address).catch(() => null) : null;
			const out: Record<string, EventWeather> = {};
			if (!home) return out;
			const ids = [...new Set(req.query.ids.split(',').filter(Boolean))].slice(0, 40);
			for (const id of ids) {
				// Only events this viewer sees in full (a Busy one's place stays hidden).
				if (eventAccess(db, req.raw.viewer, id) !== 'full') continue;
				const ev = db.prepare('SELECT location, all_day, start, end FROM events WHERE id = ?').get(id) as
					{ location: string | null; all_day: number; start: string; end: string } | undefined;
				const where = ev?.location?.trim();
				if (!ev || !where) continue;
				try {
					const at = await find(where);
					if (!at) continue;
					const miles = milesBetween(home, at);
					if (miles < AWAY_MILES) continue;
					const key = `${near(at).lat},${near(at).lon}`;
					let o = outlooks.get(key);
					if (!o || Date.now() - o.at > OUTLOOK_MS) {
						o = { outlook: await outlook(near(at), fetchImpl), at: Date.now() };
						if (outlooks.size > 50) outlooks.clear();
						outlooks.set(key, o);
					}
					out[id] = eventForecast(o.outlook, ev, miles);
				} catch (err) {
					app.log.warn({ err }, 'event weather lookup failed');
				}
			}
			return out;
		},
	);
}
