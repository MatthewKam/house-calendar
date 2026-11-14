// Shapes the server and the web app share, so the two can't drift apart (imported by both). The requests
// are zod, as the server checks them; what comes back is plain types. The web app imports types only, so
// zod stays out of its bundle.

import { z } from 'zod';

/** The weather at a place (GET /api/weather): where you are, else home. */
export const WeatherQuery = z
	.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
	.partial();
/** Where a place typed in is, for its weather (GET /api/weather/place). */
export const PlaceQuery = z.object({ q: z.string().min(2).max(300) });
/** The forecast at events' places (GET /api/weather/events): their ids, comma-separated. */
export const EventWeatherQuery = z.object({ ids: z.string().max(2000) });

/** Today's weather at home, as the wall shows it under the month. */
export interface Weather {
	/** Now, in °F, and how warm it feels (the wind and humidity counted in). */
	temp: number;
	feels: number;
	high: number;
	low: number;
	/** Relative humidity now, in %. */
	humidity: number;
	/** WMO weather code (0 clear ... 99 thunderstorm), which picks the icon. */
	code: number;
	isDay: boolean;
	/** Today's sunrise and sunset, as instants. */
	sunrise: string;
	sunset: string;
	/** Today and the next seven days: each one's highest chance of rain (%), strongest wind (mph), and how warm it feels at most and least too. */
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
	/** The hours around now (six gone by, this one, and eighteen ahead): when (an instant), °F, how warm it feels, chance of rain (%). */
	hours: { time: string; temp: number; feels: number; rain: number; code: number }[];
	/** Today's highest chance of rain (%), average cloud cover (%) and strongest wind (mph). */
	rainChance: number;
	cloudCover: number;
	wind: number;
	/** What to wear today (see wearFor): long pants, a jacket, rain gear (boots, rain jacket, umbrella). */
	wear: Wear;
}

/** What to wear today: long pants, a jacket, rain gear (boots, rain jacket, umbrella). */
export interface Wear {
	pants: boolean;
	jacket: boolean;
	rain: boolean;
}

/** A far-away event's forecast (GET /api/weather/events): at its place, on its days. */
export interface EventWeather {
	/** How far from home, in miles. */
	miles: number;
	/** Its days within the forecast (up to a week): the place's own dates. */
	days: { date: string; high: number; low: number; code: number; rain: number; feelsHigh: number; feelsLow: number }[];
	/** A timed event: the hour it starts. */
	at?: { temp: number; feels: number; rain: number; code: number };
	/** What to pack for it (see wearFor); null with no days in the forecast yet. */
	wear: Wear | null;
	/** Too far ahead: the forecast doesn't reach it yet. */
	later: boolean;
}
