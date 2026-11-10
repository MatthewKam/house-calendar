// Random order, for the photo slideshow, the screen saver and the Learn games.

/** A new list in random order (Fisher–Yates); the list given is left as it was. */
export function shuffle<T>(list: readonly T[]): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
