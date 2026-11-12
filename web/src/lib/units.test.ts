import { describe, expect, it } from 'vitest';
import { eventWeatherIn, weatherIn } from './units';
import type { Weather } from './types';

const W: Weather = {
	temp: 68,
	feels: 65,
	high: 77,
	low: 32,
	humidity: 50,
	code: 2,
	isDay: true,
	sunrise: '',
	sunset: '',
	days: [{ date: '2026-11-13', high: 70, low: 54, code: 3, rain: 10, wind: 15, feelsHigh: 67, feelsLow: 50 }],
	hours: [{ time: '', temp: 212, feels: -40, rain: 0, code: 0 }],
	rainChance: 10,
	cloudCover: 30,
	wind: 10,
	wear: { pants: true, jacket: false, rain: false },
};

describe('°F or °C', () => {
	it('leaves °F as it comes, and turns everything to °C and km/h', () => {
		expect(weatherIn(W, 'F')).toBe(W);
		const c = weatherIn(W, 'C');
		expect([c.temp, c.feels, c.high, c.low, c.wind]).toEqual([20, 18, 25, 0, 16]);
		expect(c.days[0]).toMatchObject({ high: 21, low: 12, feelsHigh: 19, feelsLow: 10, wind: 24, rain: 10 });
		expect(c.hours[0]).toMatchObject({ temp: 100, feels: -40 });
		// What to wear was worked out in °F on the server: unchanged.
		expect(c.wear).toEqual(W.wear);
	});

	it("turns far-away events' forecasts too", () => {
		const e = eventWeatherIn(
			{
				x: {
					miles: 2581,
					days: [{ date: 'd', high: 84, low: 72, code: 1, rain: 10, feelsHigh: 88, feelsLow: 74 }],
					at: { temp: 80, feels: 84, rain: 30, code: 2 },
					wear: null,
					later: false,
				},
			},
			'C',
		);
		expect(e.x.days[0]).toMatchObject({ high: 29, low: 22 });
		expect(e.x.at).toMatchObject({ temp: 27, feels: 29 });
	});
});
