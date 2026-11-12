import { useEffect, useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { keys, useLearnSounds } from "../../lib/queries";
import type { Game, LearnDayChange, LearnState, LearnToday, Member } from "../../lib/types";
import { GAME_NAMES } from "../../../../shared/learn.ts";
import { Pic, preloadAnimals } from "./art";
import Adding from "./Adding";
import Apples from "./Apples";
import FindIt from "./FindIt";
import Letters from "./Letters";
import Maze from "./Maze";
import Memory from "./Memory";
import Peekaboo from "./Peekaboo";
import Pop from "./Pop";
import Sounds from "./Sounds";
import Chomp, { ChompPic, pickAnimal } from "./Chomp";
import { HowTo, Over } from "./parts";
import type { GameProps } from "./rounds";
import { hush, setRecorded } from "./sound";
import GrownUpPin from "../account/GrownUpPin";
import s from "./Learn.module.css";

/** How to play Chomp! (a game for two), for a grown-up to explain. */
const CHOMP_HOW = {
	title: "Chomp!",
	how: [
		"Take turns, Player 1 and Player 2: the one lit up says whose turn it is. Tap a tooth to press it down.",
		"One tooth makes the mouth snap shut: Chomp! Whoever didn't get chomped wins.",
		"A few seconds later it grins again: tap Ready! for another go. The back arrow goes back to the games.",
	],
};

/** Levels as Roman numerals, for the game tiles' corners. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** Each game: its picture, and how to play it (for a grown-up to explain). Its name is GAME_NAMES (shared). */
const GAMES: Record<Game, { picture: string; how: string[]; Play: ComponentType<GameProps> }> = {
	sounds: { picture: "cow", Play: Sounds, how: [
		"An animal's noise is written at the top (\"Moo!\"). Read it together, or tap the play button beside it to hear it.",
		"Tap the animal that made it. Every animal tapped makes its own noise.",
		"Higher levels: more animals to choose from, then pets and wild animals too.",
	] },
	peekaboo: { picture: "tractor", Play: Peekaboo, how: [
		"Not a game to win, just fun: three hiding places (haystacks on the farm, tractors in the field, bushes in the forest, flower pots in the garden, rocks on the safari: a new scene each time). Tap one and an animal pops up with its name, making its noise. Tap it again to hear it again.",
		"A couple of seconds later it ducks back down, and someone new is hiding there.",
		"When every animal has had its turn, there's a cheer and it's the end. A new set of animals each time; higher levels, more animals.",
	] },
	findIt: { picture: "teddy", Play: FindIt, how: [
		"The index shows each kind of thing in the room and how many there are: socks 2, teddy bears 3.",
		"Tap any of them: it flies to its place by the index, and the number goes down. Nothing is wrong to tap. The room's done when everything's collected.",
		"From level 3, some things hide under others: collect the teddy and there's the sock. Higher levels: more kinds of things, and more of each.",
	] },
	pop: { picture: "pop", Play: Pop, how: [
		"Sprig blows bubbles, a burst to start, then a steady stream. Tap one to pop it.",
		"Level 1: any bubble. Level 2: the ones with an animal inside (it jumps out); it starts with one on its own, big and glowing, to show what counts. Level 3: the animal on the sign at the top (\"Pop 🐄\"), with others mixed in. Level 4: the colour on the sign. Levels 5 and 6: the same again, more bubbles and a little faster.",
		"The others still pop, quietly, but only those count: nothing's ever wrong. When enough have popped, there's a cheer.",
	] },
	apples: { picture: "apple", Play: Apples, how: [
		"Tap each one to count it: the count so far shows big at the top and is said out loud.",
		"From level 3, pick how many there are. A wrong number clears the count, so you count again together.",
		"Higher levels: more to count.",
	] },
	adding: { picture: "math", Play: Adding, how: [
		"Each plate has a number on its sign. Tap the basket under a plate to put a fruit on it; tap a fruit to take it off.",
		"When both plates match their signs, pick how many there are in all.",
		"From level 4, some are take-away: tap fruit on the plate to move them to the bowl until it has its number, then pick how many are left. From level 5, type the answer on the number pad. Higher levels: bigger numbers. It moves up a level after 5 perfect games in a row, or after 20 games at a level.",
	] },
	maze: { picture: "maze", Play: Maze, how: [
		"An animal wants something: the bee the flower, the monkey the banana. Tap a square in a straight line from the animal and it walks there.",
		"It can't go through the walls, so a dead end means turning back. Three mazes a game, a new animal each time.",
		"From level 3, a locked gate is in the way: find the key first. Higher levels: bigger mazes and two gates. It moves up a level after 20 games at a level.",
	] },
	letters: { picture: "letters", Play: Letters, how: [
		"A picture and its word, with the first letter missing. Say the word together.",
		"Tap the letter that goes in the gap.",
		"A new few words each game, things a 4-year-old knows. Higher levels: more letters to choose from, letters that look alike (b, d, p), then small letters.",
	] },
	memory: { picture: "pairs", Play: Memory, how: [
		"All the cards are face down. Tap two to turn them over.",
		"Two the same stay face up. Two different ones turn back over, so remember where they were.",
		"Higher levels: more cards. It moves up a level after 5 perfect games in a row, or after 20 games at a level.",
	] },
};

/** Time played is sent this often while a game's going (and when it's left), for a time limit. */
const TIME_EVERY_MS = 30_000;

/** Why the games are resting, as a kid hears it (a grown-up reads it out), and what a grown-up can give. */
const RESTING: Record<NonNullable<LearnToday["why"]>, { title: string; text: string; ask: LearnDayChange; askLabel: string }> = {
	tasks: { title: "Tasks first!", text: "Finish your Daily tasks, then come back to play.", ask: { open: true }, askLabel: "Play now" },
	locked: { title: "Games are resting", text: "A grown-up put the games away for today.", ask: { open: true }, askLabel: "Play now" },
	games: { title: "All done for today!", text: "See you tomorrow.", ask: { moreGames: true }, askLabel: "2 more games" },
	time: { title: "All done for today!", text: "See you tomorrow.", ask: { moreMinutes: true }, askLabel: "15 more minutes" },
};

/**
 * Kid mode's Learn tab: this kid's games as big pictures. Pick one and play; each play is a new version
 * of it. At the end: a cheer, play again, or back to the games. A few perfect plays move a game up a
 * level (the server decides), and that gets a cheer of its own. No stars: it's for learning.
 *
 * Each day the games open once the Daily tasks are done (or a grown-up says), for so many games (and
 * minutes) a day; then they rest, with a grown-up able to give more. A game started always finishes.
 * The games for two (Chomp!) are always free.
 */
export default function LearnTab({ kid, today, learn, together, askPin }: {
	kid: Member;
	today: string;
	learn: LearnState;
	/** The Both switch is on: show the games for two instead of the kid's own. */
	together: boolean;
	/** A grown-up types their PIN for more (on the wall or a kid's device). */
	askPin?: boolean;
}) {
	const qc = useQueryClient();
	// A learning game, or one of the games for two ("chomp"), which have no levels and aren't saved.
	const [playing, setPlaying] = useState<Game | "chomp" | null>(null);
	const [plays, setPlays] = useState(0);
	// Chomp!'s animal this time (picked as it starts).
	const [chomper, setChomper] = useState("shark");
	// A game just finished: the pop-up over it, whether it moved up a level, and whether there's another today.
	const [result, setResult] = useState<{ game: Game; leveledUp: boolean; more: boolean } | null>(null);
	const day = learn.today;
	const done = useMutation({
		mutationFn: ({ game, level, rounds, firstTry }: { game: Game; level: number; rounds: number; firstTry: number }) =>
			api.learnDone(kid.id, { today, game, level, rounds, firstTry }),
		// Only while its pop-up's up (not once they've gone back, or on to the next play).
		onSuccess: (r, { game }) => setResult((now) => (now?.game === game ? { game, leveledUp: r.leveledUp, more: r.today.why === null } : now)),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.learn(today) }),
	});
	// A grown-up giving more, or unlocking today: with their PIN first when it's asked for.
	const [asking, setAsking] = useState<LearnDayChange | null>(null);
	async function give(change: LearnDayChange, unlocked: boolean) {
		await api.changeLearnDay(kid.id, today, change);
		// The device was unlocked just for this.
		if (unlocked) await api.lockParent().catch(() => {});
		setAsking(null);
		await qc.invalidateQueries({ queryKey: keys.learn(today) });
		await qc.invalidateQueries({ queryKey: keys.auth });
	}

	// The time in a game (not the games for two), sent as they play and when they leave it.
	useEffect(() => {
		if (!playing || playing === "chomp") return;
		let since = Date.now();
		const send = () => {
			const seconds = Math.min(600, Math.round((Date.now() - since) / 1000));
			since = Date.now();
			if (seconds > 0) void api.learnTime(kid.id, today, seconds).catch(() => {});
		};
		const timer = setInterval(send, TIME_EVERY_MS);
		return () => {
			clearInterval(timer);
			send();
			void qc.invalidateQueries({ queryKey: keys.learn(today) });
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [playing, plays]);
	// A grown-up's own animal noises, played instead of the built-in ones.
	const sounds = useLearnSounds().data;
	useEffect(() => setRecorded(sounds ?? []), [sounds]);
	useEffect(preloadAnimals, []);
	const levelOf = (game: Game) => learn.games.find((g) => g.game === game)?.level ?? 1;

	function start(game: Game | "chomp") {
		hush();
		setResult(null);
		setPlays((n) => n + 1);
		if (game === "chomp") setChomper(pickAnimal());
		setPlaying(game);
	}

	function back() {
		hush();
		setResult(null);
		setPlaying(null);
	}

	if (playing === "chomp") {
		return (
			<HowTo.Provider value={CHOMP_HOW}>
				<Chomp key={plays} animal={chomper} onBack={() => setPlaying(null)} />
			</HowTo.Provider>
		);
	}

	if (playing) {
		const { Play, how } = GAMES[playing];
		const title = GAME_NAMES[playing];
		const level = levelOf(playing);
		return (
			<HowTo.Provider value={{ title, how }}>
			{/* A new key each play, so it starts fresh with new pictures. */}
			<Play key={plays} level={level}
				onBack={back}
				onDone={(rounds, firstTry) => {
					// Another today, by what's known now (the server's answer settles it).
					const more = day.played + 1 < day.games && (day.minutes === null || day.seconds < day.minutes * 60);
					setResult({ game: playing, leveledUp: false, more });
					done.mutate({ game: playing, level, rounds, firstTry });
				}} />
			{/* Done: the pop-up over the finished game. */}
			{result && (
				<Over title={result.leveledUp ? "New level!" : "You did it!"}
					note={done.isError ? `Couldn't save that: ${done.error.message}`
						: !result.more ? "That's all the games for today. See you tomorrow!"
						: result.leveledUp ? "It gets a little trickier next time." : undefined}
					onAgain={result.more ? () => start(playing) : undefined} onBack={back} />
			)}
			</HowTo.Provider>
		);
	}

	return (
		// The space for the games (the cards size themselves to it), then the games, two by two: the kid's
		// own, or with Both on, the games for two (just for fun, no levels).
		<section className={s.menuArea} aria-label={together ? "Games for two" : "Games"}>
			<div className={s.menu}>
				{together ? (
					<button type="button" className={s.gameTile} onClick={() => start("chomp")}>
						<ChompPic className={s.gamePic} />
						<span className={s.gameName}>Chomp!</span>
					</button>
				) : (
					learn.games.map(({ game, level }) => (
						<button key={game} type="button" className={`${s.gameTile} ${day.why ? s.gameTileResting : ""}`}
							disabled={!!day.why} onClick={() => start(game)}>
							<Pic id={GAMES[game].picture} className={s.gamePic} />
							<span className={s.gameName}>{GAME_NAMES[game]}</span>
							<span className={s.gameLevel} aria-label={`Level ${level}`}>{ROMAN[level - 1] ?? level}</span>
						</button>
					))
				)}
			</div>
			{!together && (day.why ? (
				// Resting: why, over the games, and a grown-up can give more.
				<div className={s.rest} role="status">
					<img className={s.restMascot} src="/mascot/sprig.webp" alt="" />
					<h2 className={s.restTitle}>{RESTING[day.why].title}</h2>
					<p className={s.restText}>{RESTING[day.why].text}</p>
					<button type="button" className={s.askGrownUp}
						onClick={() => (askPin ? setAsking(RESTING[day.why!].ask) : void give(RESTING[day.why!].ask, false))}>
						Ask a grown-up
					</button>
				</div>
			) : (
				// Games left today, as dots (and minutes, with a time limit).
				<p className={s.gamesLeft} aria-label={`${day.games - day.played} ${day.games - day.played === 1 ? "game" : "games"} left today`}>
					{Array.from({ length: Math.min(day.games, 10) }, (_, i) => (
						<span key={i} className={`${s.gameDot} ${i < day.played ? s.gameDotUsed : ""}`} />
					))}
					{day.minutes !== null && <span className={s.minutesLeft}>{Math.max(0, Math.ceil(day.minutes - day.seconds / 60))} min</span>}
				</p>
			))}
			{asking && day.why && (
				<GrownUpPin title="Ask a grown-up" unlock okLabel={RESTING[day.why].askLabel}
					body={`A grown-up types their PIN for ${RESTING[day.why].askLabel.toLowerCase()}.`}
					onClose={() => setAsking(null)} onOk={() => give(asking, true)} />
			)}
		</section>
	);
}
