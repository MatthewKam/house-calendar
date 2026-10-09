// All "day" strings are YYYY-MM-DD in the display's local time zone.

export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDayKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Start of the week containing d. weekStartsOn: 0 = Sunday, 1 = Monday. */
export function startOfWeek(d: Date, weekStartsOn = 0) {
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(d, -diff);
}

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Every day in a month grid: whole weeks, from the week holding the 1st to the week holding the last day. */
export function monthGridDays(d: Date, weekStartsOn = 0) {
  const first = startOfWeek(startOfMonth(d), weekStartsOn);
  const after = addDays(startOfWeek(new Date(d.getFullYear(), d.getMonth() + 1, 0), weekStartsOn), 7);
  // Round so a DST change inside the month doesn't drop or add a day.
  const count = Math.round((after.getTime() - first.getTime()) / 86_400_000);
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

/** "6:52 PM" (in the display's own style), from an instant or a Date. */
export const timeLabel = (when: string | Date) =>
  new Date(when).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * "9:00 – 10:30 AM": a start and end on the same day, with the AM or PM said once when both share it
 * ("11:00 AM – 12:30 PM" when not).
 */
export function rangeLabel(start: string | Date, end: string | Date) {
  const from = timeLabel(start);
  const to = timeLabel(end);
  const half = /\s?([AP]M)$/i;
  const a = from.match(half)?.[1];
  return a && a === to.match(half)?.[1] ? `${from.replace(half, '')} – ${to}` : `${from} – ${to}`;
}

/** "just now", "5 min ago", "2 h ago", then the date ("Oct 4"). */
export function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** HH:MM in local time, for <input type="time">. */
export const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Combine a local day and HH:MM into a UTC ISO instant. */
export const toInstant = (day: string, time: string) => {
  const [h, m] = time.split(':').map(Number);
  const d = fromDayKey(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/** "🚗 18 min", "🚗 1 hr 5 min": the drive to an event. */
export function driveLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `🚗 ${h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`}`;
}
