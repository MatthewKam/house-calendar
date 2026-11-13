import type { Ingredient, Meal, Recipe } from './types';

// Recipes: amounts as a cook writes them (1 ½ cups, scaled ×½ or ×2), ingredient lines typed back
// into amounts, minutes in words, and pictures made ready to keep (JPEG, the dish cut out for the cover).

const FRACTIONS: [number, string][] = [
	[1 / 8, '⅛'],
	[1 / 4, '¼'],
	[1 / 3, '⅓'],
	[1 / 2, '½'],
	[2 / 3, '⅔'],
	[3 / 4, '¾'],
];

/** 1.5 → "1 ½", 0.333 → "⅓", 2.4 → "2.4": the nearest kitchen fraction when it's close, else a short decimal. */
export function amountText(n: number) {
	const whole = Math.floor(n + 1e-9);
	const rest = n - whole;
	if (rest < 0.03) return String(whole);
	if (rest > 0.97) return String(whole + 1);
	const near = FRACTIONS.find(([f]) => Math.abs(f - rest) < 0.03);
	if (near) return whole ? `${whole} ${near[1]}` : near[1];
	return String(Math.round(n * 10) / 10);
}

/** One ingredient as a line, its amount scaled ("1 ½ cup soy sauce"); without an amount, just the words ("salt"). */
export function ingredientLine(i: Ingredient, scale = 1) {
	return [i.amount ? amountText(i.amount * scale) : null, i.unit, i.item].filter(Boolean).join(' ');
}

const UNITS =
	/^(cups?|c|tbsps?|tablespoons?|tsps?|teaspoons?|g|grams?|kg|ml|l|liters?|oz|ounces?|lbs?|pounds?|cloves?|cans?|pinch(es)?|slices?|sticks?|bunch(es)?|heads?|packages?|pkgs?|stalks?|sprigs?|handfuls?|quarts?|pints?)$/i;
const UNICODE: Record<string, number> = { '⅛': 1 / 8, '¼': 1 / 4, '⅓': 1 / 3, '½': 1 / 2, '⅔': 2 / 3, '¾': 3 / 4 };

/** "1", "1.5", "1/2", "½", "1 ½", "1½": its value, or null. */
function parseAmount(words: string[]): [number | null, number] {
	let total = 0;
	let used = 0;
	for (const w of words.slice(0, 2)) {
		const m = /^(\d+(?:\.\d+)?)?([⅛¼⅓½⅔¾])?$/.exec(w) ?? null;
		const frac = /^(\d+)\/(\d+)$/.exec(w);
		if (frac && Number(frac[2])) total += Number(frac[1]) / Number(frac[2]);
		else if (m && (m[1] || m[2])) total += (m[1] ? Number(m[1]) : 0) + (m[2] ? UNICODE[m[2]] : 0);
		else break;
		used++;
	}
	// "0" is no amount, as is none.
	return used ? [total || null, used] : [null, 0];
}

/**
 * Ingredient lines as typed (one a line) back into amounts. A line ending in ":" ("For the marinade:")
 * is a heading for the lines after it.
 */
export function parseIngredients(text: string): Ingredient[] {
	let group: string | null = null;
	const out: Ingredient[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		if (line.endsWith(':')) {
			group = line.slice(0, -1).trim() || null;
			continue;
		}
		const words = line.split(/\s+/);
		const [amount, used] = parseAmount(words);
		const unit = used && words[used] && UNITS.test(words[used]) ? words[used] : null;
		const item = words.slice(used + (unit ? 1 : 0)).join(' ') || line;
		out.push({ group, amount, unit, item });
	}
	return out;
}

/** The ingredients as lines to edit: headings ("For the marinade:") where the group changes. */
export function ingredientsText(list: Ingredient[]) {
	const lines: string[] = [];
	let group: string | null = null;
	for (const i of list) {
		if (i.group !== group && i.group) lines.push(`${i.group}:`);
		group = i.group;
		lines.push(ingredientLine(i));
	}
	return lines.join('\n');
}

/** 25 → "25 min", 90 → "1 hr 30 min", 120 → "2 hr". */
export function minutesText(m: number) {
	if (m < 60) return `${m} min`;
	const h = Math.floor(m / 60);
	return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}

/** A picture as base64 JPEG, shrunk (from any image, or a box of it: fractions of its width and height). */
export async function toJpeg(
	source: Blob,
	box?: { x: number; y: number; width: number; height: number },
	longest = 1600,
): Promise<{ mediaType: 'image/jpeg'; data: string }> {
	const image = await createImageBitmap(source, { imageOrientation: 'from-image' });
	try {
		const sx = box ? Math.round(box.x * image.width) : 0;
		const sy = box ? Math.round(box.y * image.height) : 0;
		const sw = box ? Math.max(1, Math.round(box.width * image.width)) : image.width;
		const sh = box ? Math.max(1, Math.round(box.height * image.height)) : image.height;
		const scale = Math.min(1, longest / Math.max(sw, sh));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(sw * scale);
		canvas.height = Math.round(sh * scale);
		canvas.getContext('2d')!.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob>((done, fail) =>
			canvas.toBlob((b) => (b ? done(b) : fail(new Error("Couldn't make a JPEG"))), 'image/jpeg', 0.85),
		);
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let raw = '';
		for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		return { mediaType: 'image/jpeg', data: btoa(raw) };
	} finally {
		image.close();
	}
}

/** Base64 (as sent and read back) as a picture again. */
export const fromBase64 = (img: { mediaType: string; data: string }) =>
	new Blob([Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0))], { type: img.mediaType });

/** A recipe's default picture, by its meal: shown when it has no main photo. */
export const mealPicture = (meal: Meal) =>
	({ dinner: '🍲', breakfast: '🥞', lunch: '🥗', side: '🥦', dessert: '🍰', snack: '🥨' })[meal] ?? '🍲';

/** Its main photo: the one picked, else the first of its own (never a step's); none when it's picked to have none. */
export const coverOf = (r: Recipe) =>
	r.noCover ? undefined : (r.images.find((i) => i.id === r.coverId) ?? r.images.find((i) => i.step === null));
