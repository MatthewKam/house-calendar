/** An icon and a word for how sunny it is, from a WMO weather code (as Open-Meteo reports it). */
export function sky(code: number, isDay: boolean): { icon: string; label: string } {
  if (code === 0) return isDay ? { icon: '☀️', label: 'Sunny' } : { icon: '🌙', label: 'Clear' };
  if (code === 1) return isDay ? { icon: '🌤️', label: 'Mostly sunny' } : { icon: '🌙', label: 'Mostly clear' };
  if (code === 2) return { icon: isDay ? '⛅' : '☁️', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Cloudy' };
  // Apple draws the fog emoji as a grey square; a cloud reads better.
  if (code === 45 || code === 48) return { icon: '☁️', label: 'Fog' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: '🌨️', label: 'Snow' };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorms' };
  return { icon: '🌡️', label: 'Weather' };
}
