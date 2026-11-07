// Sound for the games, since the kids can't read yet: animals' own recorded noises (web/public/sounds,
// free-to-use recordings, credited in CREDITS.md there), and words in the device's own voice.

/** Animals with a recording in web/public/sounds/animals (`<id>.mp3`). The rest are said aloud. */
export const RECORDED = new Set<string>([]);

let playing: HTMLAudioElement | null = null;

/** Stops whatever's playing or being said. */
export function hush() {
	playing?.pause();
	playing = null;
	if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

/** Says `text` in the device's voice, a little slowly, over anything before it. */
export function say(text: string) {
	if (!("speechSynthesis" in window)) return;
	hush();
	const words = new SpeechSynthesisUtterance(text);
	words.rate = 0.85;
	words.pitch = 1.1;
	const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("en") && v.localService);
	if (voice) words.voice = voice;
	window.speechSynthesis.speak(words);
}

/** An animal's noise: its recording, or the device saying it ("Moo moo!") if there isn't one or it won't play. */
export function noise(animal: { id: string; says: string }) {
	if (!RECORDED.has(animal.id)) return say(`${animal.says} ${animal.says}`);
	hush();
	const audio = new Audio(`/sounds/animals/${animal.id}.mp3`);
	playing = audio;
	audio.play().catch(() => playing === audio && say(`${animal.says} ${animal.says}`));
}
