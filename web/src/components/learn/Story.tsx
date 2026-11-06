import { useMemo, useState } from "react";
import { Dots } from "./parts";
import type { ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

/** Picture stories (Little): a picture and one line a page, and a question for the grown-up to ask. */
const STORIES = [
	{ title: "Bath time", pages: [
		{ picture: "🛁", line: "Time for a bath!", ask: "What do we need for a bath?" },
		{ picture: "🧼", line: "Soap on your tummy. Rub, rub, rub!", ask: "Can you rub your tummy?" },
		{ picture: "🦆", line: "Ducky floats. Splash, splash!", ask: "What does the duck say?" },
		{ picture: "🫧", line: "Bubbles go pop!", ask: "Pop the bubbles with a finger." },
		{ picture: "🧸", line: "All clean and cozy. Night night!", ask: "What comes after bath time?" },
	] },
	{ title: "To the park", pages: [
		{ picture: "👟", line: "Shoes on. Let's go to the park!", ask: "Where are your shoes?" },
		{ picture: "🛝", line: "Up the steps, down the slide. Wheee!", ask: "Can you say wheee?" },
		{ picture: "🐦", line: "A bird says tweet, tweet!", ask: "What color is the bird?" },
		{ picture: "🌳", line: "A big, big tree.", ask: "Can you be tall like a tree?" },
		{ picture: "🏠", line: "Time to go home. Bye, park!", ask: "Wave bye-bye!" },
	] },
	{ title: "Breakfast", pages: [
		{ picture: "🌅", line: "Good morning! The sun is up.", ask: "Can you stretch up high?" },
		{ picture: "🥣", line: "A bowl for breakfast.", ask: "What do you like for breakfast?" },
		{ picture: "🍌", line: "Peel the banana. Yum!", ask: "What color is a banana?" },
		{ picture: "🥛", line: "A big glass of milk. Gulp, gulp!", ask: "Pretend to drink it all up." },
		{ picture: "😊", line: "All done. Thank you, breakfast!", ask: "Say thank you!" },
	] },
	{ title: "Bedtime", pages: [
		{ picture: "🌙", line: "The moon is up. It's night.", ask: "Where's the moon?" },
		{ picture: "🪥", line: "Brush, brush, brush your teeth.", ask: "Show me how you brush." },
		{ picture: "📖", line: "One more story in bed.", ask: "What's your favorite story?" },
		{ picture: "🧸", line: "A big hug for teddy.", ask: "Give teddy a hug." },
		{ picture: "😴", line: "Eyes closed. Night night!", ask: "Can you whisper night night?" },
	] },
];

const Arrow = ({ d }: { d: string }) => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d={d} />
	</svg>
);

export default function Story({ onDone }: ActivityProps) {
	const story = useMemo(() => STORIES[Math.floor(Math.random() * STORIES.length)], []);
	const [page, setPage] = useState(0);
	// Each tap on the picture bounces it again.
	const [bounce, setBounce] = useState(0);
	const p = story.pages[page];
	const last = page === story.pages.length - 1;
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span className={s.hint}>{story.title}</span>
				<Dots total={story.pages.length} done={page + 1} />
			</div>
			<div className={s.page}>
				<button type="button" className={s.arrow} disabled={page === 0} aria-label="Back a page"
					onClick={() => setPage(page - 1)}>
					<Arrow d="M15 5l-7 7 7 7" />
				</button>
				<div className={s.pageBody}>
					<button key={`${page}-${bounce}`} type="button" className={`${s.pagePicture} ${bounce ? s.yes : ""}`}
						aria-label="Tap the picture" onClick={() => setBounce(bounce + 1)}>{p.picture}</button>
					<p className={s.pageLine}>{p.line}</p>
					<p className={s.note}>{p.ask}</p>
				</div>
				<button type="button" className={`${s.arrow} ${s.arrowGo}`} aria-label={last ? "The end" : "Next page"}
					onClick={() => {
						setBounce(0);
						if (last) onDone(1, 1);
						else setPage(page + 1);
					}}>
					<Arrow d={last ? "M5 12.5l4.5 4.5L19 7.5" : "M9 5l7 7-7 7"} />
				</button>
			</div>
		</div>
	);
}
