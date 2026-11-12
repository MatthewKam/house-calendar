// The weather at home or here, at events, and the day's joke and quote.

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { useWeatherHere } from '../useWeatherHere';
import { eventWeatherIn, useTempUnit, weatherIn } from '../units';

/**
 * Today's weather at home, or where this device is when it's on Here (useWeatherHere); the server asks
 * for fresh numbers every 10 minutes. In this device's °F or °C (units.ts).
 */
export function useWeather() {
	const here = useWeatherHere();
	const [unit] = useTempUnit();
	return useQuery({
		queryKey: ['weather', here ? `${here.lat},${here.lon}` : 'home'],
		queryFn: () => api.weather(here),
		refetchInterval: 10 * 60_000,
		retry: false,
		placeholderData: keepPreviousData,
		select: (w) => weatherIn(w, unit),
	});
}

/** Forecasts for far-away events (by id); nearby ones and ones with no address aren't in it. */
export function useEventWeather(ids: string[]) {
	const sorted = [...new Set(ids)].sort();
	const [unit] = useTempUnit();
	return useQuery({
		queryKey: ['weather', 'events', sorted.join(',')],
		queryFn: () => api.eventWeather(sorted),
		enabled: sorted.length > 0,
		staleTime: 30 * 60_000,
		retry: false,
		select: (all) => eventWeatherIn(all, unit),
	});
}

/** The day's joke, quote and "on this day" (fetched once a day by the server). */
export function useDaily(day: string) {
	return useQuery({
		queryKey: ['daily', day],
		queryFn: () => api.daily(day),
		refetchInterval: 30 * 60_000,
		retry: false,
	});
}
