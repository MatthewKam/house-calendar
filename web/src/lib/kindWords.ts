// Kind words for kid mode's Today: a picture and one short line a grown-up reads aloud, a new one each day.

import { ofTheDay, type KidFact } from "./kidFacts";

const KIND_WORDS: KidFact[] = [
	{ picture: "🦁", text: "You are brave." },
	{ picture: "💛", text: "You are loved." },
	{ picture: "🤝", text: "You are a good friend." },
	{ picture: "💪", text: "You can do hard things." },
	{ picture: "🌱", text: "You are growing every day." },
	{ picture: "🎨", text: "Your ideas are wonderful." },
	{ picture: "😊", text: "Your smile makes us happy." },
	{ picture: "🌟", text: "You shine just by being you." },
	{ picture: "🐢", text: "It's okay to go slow. Keep trying." },
	{ picture: "🤗", text: "You give the best hugs." },
	{ picture: "👂", text: "You are a great listener." },
	{ picture: "🧩", text: "You are a good thinker." },
	{ picture: "🎈", text: "Today is going to be a great day." },
	{ picture: "🌻", text: "You are kind to others." },
	{ picture: "🦸", text: "You are strong." },
	{ picture: "🙌", text: "You are a great helper." },
	{ picture: "🐣", text: "Mistakes help you learn." },
	{ picture: "🎵", text: "You make our family happy." },
	{ picture: "🌈", text: "It's okay to have big feelings." },
	{ picture: "🚀", text: "You can do anything you try." },
	{ picture: "🐝", text: "You are a busy, busy learner." },
	{ picture: "🏡", text: "We are so glad you're ours." },
];

/** The day's kind words (YYYY-MM-DD): the same all day, new ones tomorrow. */
export const kindWordsFor = (day: string) => ofTheDay(KIND_WORDS, day);
