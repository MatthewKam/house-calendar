// Shapes the server and the web app share, so the two can't drift apart (imported by both).

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
  days: { date: string; high: number; low: number; code: number; rain: number; wind: number; feelsHigh: number; feelsLow: number }[];
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
export interface Wear { pants: boolean; jacket: boolean; rain: boolean }
