// The games' sound: animals' noises (a grown-up's own recording if there is one, Settings → Learning,
// or the built-in one in web/public/sounds, credited in CREDITS.md there), and Counting's numbers said
// out loud. Nothing else is spoken.

/** Animals with a built-in noise in web/public/sounds/animals (`<id>.m4a`). */
export const BUILT_IN = new Set<string>([
	"cow", "pig", "duck", "sheep", "horse", "chicken", "rooster", "goat", "dog", "cat", "frog", "owl", "bee", "seagull", "hawk",
	"lion", "leopard", "bear", "wolf", "elephant", "monkey",
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

/** Plays a sound file over anything before it; `onEnd` once it's finished (or stopped, or won't play). */
export function play(url: string, onEnd?: () => void) {
	hush();
	const audio = new Audio(url);
	playing = audio;
	let ended = false;
	const end = () => {
		if (ended) return;
		ended = true;
		onEnd?.();
	};
	audio.addEventListener("ended", end);
	audio.addEventListener("pause", end);
	audio.addEventListener("error", end);
	audio.play().catch(end);
}

/** Says a number in the device's voice (Counting's one exception to "no speech": counting out loud). */
export function sayNumber(n: number) {
	if (!("speechSynthesis" in window)) return;
	window.speechSynthesis.cancel();
	const words = new SpeechSynthesisUtterance(String(n));
	words.rate = 0.9;
	window.speechSynthesis.speak(words);
}

/** An animal's noise, over anything before it; `onEnd` once it's finished (straight away if it has none). */
export function noise(animal: { id: string }, onEnd?: () => void) {
	const url = noiseUrl(animal.id);
	if (url) play(url, onEnd);
	else onEnd?.();
}
