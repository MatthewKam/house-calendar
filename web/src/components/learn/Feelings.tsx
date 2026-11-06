import { useMemo, useState, type CSSProperties } from "react";
import { Dots, Next } from "./parts";
import { pick, useRounds, type ActivityProps } from "./rounds";
import s from "../../styles/Learn.module.css";

const FACES = [
	{ id: "happy", name: "Happy", picture: "😊" },
	{ id: "sad", name: "Sad", picture: "😢" },
	{ id: "mad", name: "Mad", picture: "😠" },
	{ id: "scared", name: "Scared", picture: "😨" },
] as const;
type Feeling = (typeof FACES)[number]["id"];

/** A little story about Bear, the feeling most kids would name, and two things that could help. */
const STORIES: { picture: string; text: string; feel: Feeling; helps: [string, string][] }[] = [
	{ picture: "🍦", text: "Bear's ice cream fell on the ground.", feel: "sad", helps: [["A big hug", "🤗"], ["Share a snack", "🍪"]] },
	{ picture: "🎈", text: "Bear is going to a birthday party!", feel: "happy", helps: [["A happy dance", "💃"], ["Make a card", "🎁"]] },
	{ picture: "⛈️", text: "A loud thunder BOOM wakes Bear up.", feel: "scared", helps: [["Hold a grown-up's hand", "🤝"], ["Cuddle a teddy", "🧸"]] },
	{ picture: "🧱", text: "Someone knocked over Bear's tower.", feel: "mad", helps: [["Take big breaths", "🌬️"], ["Build it again", "🏗️"]] },
	{ picture: "🐶", text: "Bear got a new puppy!", feel: "happy", helps: [["Give the puppy a name", "🏷️"], ["Play fetch", "🎾"]] },
	{ picture: "🎈", text: "Bear's balloon floated away.", feel: "sad", helps: [["Wave bye-bye to it", "👋"], ["Draw a new balloon", "🖍️"]] },
	{ picture: "🌑", text: "It's very dark in Bear's room.", feel: "scared", helps: [["Turn on a night light", "💡"], ["Call for a grown-up", "🗣️"]] },
	{ picture: "🧸", text: "Bear's friend won't share the toys.", feel: "mad", helps: [["Use your words", "💬"], ["Take turns", "🔄"]] },
];
const ROUNDS = 3;

/**
 * Feelings: how does Bear feel? Another feeling is a "maybe", never wrong; then, what could help.
 * Right on the first try: Bear's usual feeling first.
 */
export default function Feelings({ onDone }: ActivityProps) {
	const rounds = useMemo(() => pick(STORIES, ROUNDS), []);
	const r = useRounds(ROUNDS, onDone);
	const [felt, setFelt] = useState<Feeling | null>(null);
	const [helped, setHelped] = useState<string | null>(null);
	const story = rounds[r.round];
	const name = (id: Feeling) => FACES.find((f) => f.id === id)!.name.toLowerCase();
	return (
		<div className={s.board}>
			<div className={s.top}>
				<span />
				<Dots total={ROUNDS} done={r.round + (r.got ? 1 : 0)} />
			</div>
			<div className={s.things}>
				<span className={s.tilePicture} aria-hidden="true">{story.picture}</span>
				<span className={s.pageLine}>{story.text}</span>
			</div>
			<p className={s.prompt}>
				{!felt ? "How does Bear feel?"
					: helped ? "Good idea! That would help."
					: `${felt === story.feel ? `Yes! Bear feels ${name(felt)}.` : `Maybe! Some bears feel ${name(felt)}. Lots feel ${name(story.feel)}.`} ${story.feel === "happy" ? "What could Bear do?" : "What could help Bear?"}`}
			</p>
			{!felt ? (
				<div className={s.tiles} style={{ "--cols": 4 } as CSSProperties}>
					{FACES.map((f) => (
						<button key={f.id} type="button" className={s.tile} onClick={() => {
							setFelt(f.id);
							// No wrong answers: the round goes on either way; Bear's usual feeling counts as the first try.
							if (f.id !== story.feel) r.tap(false);
						}}>
							<span className={s.tilePicture} aria-hidden="true">{f.picture}</span>
							{f.name}
						</button>
					))}
				</div>
			) : (
				<div className={s.tiles} style={{ "--cols": 2 } as CSSProperties}>
					{story.helps.map(([label, picture]) => (
						<button key={label} type="button" className={`${s.tile} ${helped === label ? `${s.tileRight} ${s.yes}` : ""}`}
							onClick={() => {
								if (helped) return;
								setHelped(label);
								r.tap(true);
							}}>
							<span className={s.tilePicture} aria-hidden="true">{picture}</span>
							{label}
						</button>
					))}
				</div>
			)}
			<Next show={r.got} last={r.round + 1 === ROUNDS} onNext={() => {
				setFelt(null);
				setHelped(null);
				r.next();
			}} />
		</div>
	);
}
