// The games' only sound: animals' noises. A grown-up's own recording if there is one (Settings →
// Learning), or the built-in one (web/public/sounds, free-to-use recordings, credited in CREDITS.md
// there). Nothing is ever spoken.

/** Animals with a built-in noise in web/public/sounds/animals (`<id>.m4a`). */
export const BUILT_IN = new Set<string>([
	"cow", "pig", "duck", "sheep", "horse", "chicken", "goat", "dog", "cat", "mouse", "frog", "owl", "bee", "lion", "elephant", "monkey",
]);

/** A grown-up's recordings: animal → when (set from the server's list as it loads). */
let recorded = new Map<string, string>();
export function setRecorded(list: { animal: string; version: string }[]) {
	recorded = new Map(list.map((s) => [s.animal, s.version]));
}

/** Where an animal's noise is: a grown-up's recording, the built-in one, or none. */
export function noiseUrl(id: string, own = true) {
	const version = recorded.get(id);
	if (own && version) return `/api/learn/sounds/${id}?v=${encodeURIComponent(version)}`;
	return BUILT_IN.has(id) ? `/sounds/animals/${id}.m4a` : null;
}

let playing: HTMLAudioElement | null = null;

/** Stops whatever's playing. */
export function hush() {
	playing?.pause();
	playing = null;
}

/** Plays a sound file over anything before it. */
export function play(url: string) {
	hush();
	playing = new Audio(url);
	playing.play().catch(() => {});
}

/** An animal's noise, over anything before it (nothing if it has none). */
export function noise(animal: { id: string }) {
	const url = noiseUrl(animal.id);
	if (url) play(url);
}
