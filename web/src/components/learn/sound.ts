// The games' only sound: animals' own recorded noises (web/public/sounds, free-to-use recordings,
// credited in CREDITS.md there). Nothing is ever spoken.

/** Animals with a recording in web/public/sounds/animals (`<id>.mp3`). The rest are silent. */
export const RECORDED = new Set<string>([]);

let playing: HTMLAudioElement | null = null;

/** Stops whatever's playing. */
export function hush() {
	playing?.pause();
	playing = null;
}

/** An animal's noise, over anything before it (nothing if it has no recording yet). */
export function noise(animal: { id: string }) {
	if (!RECORDED.has(animal.id)) return;
	hush();
	playing = new Audio(`/sounds/animals/${animal.id}.mp3`);
	playing.play().catch(() => {});
}
