// Days as YYYY-MM-DD strings, in the local time zone, shared by the app and the server.

export const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDayKey = (k: string) => {
	const [y, m, d] = k.split('-').map(Number);
	return new Date(y, m - 1, d);
};
/** A day `n` days on (or back, with n < 0). */
export const addDayKey = (k: string, n: number) => {
	const d = fromDayKey(k);
	return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
/** The day an instant falls on in a time zone (YYYY-MM-DD). */
export const dayIn = (timeZone: string) => (iso: string) =>
	new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
		new Date(iso),
	);
