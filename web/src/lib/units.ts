import { useEffect, useState } from 'react';
import type { EventWeather, Weather } from './types';

/**
 * °F or °C (with mph or km/h) for this device (Settings, Appearance), like light or dark. The server's
 * weather is always °F and mph (what to wear is worked out from those); the app turns it to °C and km/h
 * as it arrives, so everything that shows the weather shows it in the device's own.
 */
export type TempUnit = 'F' | 'C';
const KEY = 'sprig:temp-unit';

function load(): TempUnit {
  try {
    return localStorage.getItem(KEY) === 'C' ? 'C' : 'F';
  } catch {
    return 'F';
  }
}

/** This device's pick, and changing it. */
export function useTempUnit() {
  const [unit, setUnit] = useState(load);
  useEffect(() => {
    const update = () => setUnit(load());
    window.addEventListener(KEY, update);
    return () => window.removeEventListener(KEY, update);
  }, []);
  const set = (next: TempUnit) => {
    try {
      if (next === 'F') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Private browsing or storage blocked: just this visit.
    }
    setUnit(next);
    window.dispatchEvent(new Event(KEY));
  };
  return [unit, set] as const;
}

/** Wind's unit, for the words beside it. */
export const windUnit = (unit: TempUnit) => (unit === 'C' ? 'km/h' : 'mph');

const c = (f: number) => Math.round(((f - 32) * 5) / 9);
const kmh = (mph: number) => Math.round(mph * 1.609);

/** Today's weather in this device's unit. */
export function weatherIn(w: Weather, unit: TempUnit): Weather {
  if (unit === 'F') return w;
  return {
    ...w, temp: c(w.temp), feels: c(w.feels), high: c(w.high), low: c(w.low), wind: kmh(w.wind),
    days: w.days.map((d) => ({ ...d, high: c(d.high), low: c(d.low), feelsHigh: c(d.feelsHigh), feelsLow: c(d.feelsLow), wind: kmh(d.wind) })),
    hours: w.hours.map((h) => ({ ...h, temp: c(h.temp), feels: c(h.feels) })),
  };
}

/** Far-away events' forecasts in this device's unit. */
export function eventWeatherIn(all: Record<string, EventWeather>, unit: TempUnit): Record<string, EventWeather> {
  if (unit === 'F') return all;
  return Object.fromEntries(Object.entries(all).map(([id, e]) => [id, {
    ...e,
    days: e.days.map((d) => ({ ...d, high: c(d.high), low: c(d.low), feelsHigh: c(d.feelsHigh), feelsLow: c(d.feelsLow) })),
    ...(e.at ? { at: { ...e.at, temp: c(e.at.temp), feels: c(e.at.feels) } } : {}),
  }]));
}
