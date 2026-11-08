import { useEffect, useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { keys, useLearnSounds } from "../../lib/queries";
import type { Game, LearnState, Member } from "../../lib/types";
import { Pic } from "./art";
import Adding from "./Adding";
import Apples from "./Apples";
import FindIt from "./FindIt";
import Letters from "./Letters";
import Maze from "./Maze";
import Memory from "./Memory";
import Peekaboo from "./Peekaboo";
import Sounds from "./Sounds";
import { HowTo } from "./parts";
import type { GameProps } from "./rounds";
import { hush, setRecorded } from "./sound";
import s from "../../styles/Learn.module.css";

/** Levels as Roman numerals, for the game tiles' corners. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** Each game: its name, its picture, and how to play it (for a grown-up to explain). */
export const GAMES: Record<Game, { title: string; picture: string; how: string[]; Play: ComponentType<GameProps> }> = {
	sounds: { title: "Who says that?", picture: "cow", Play: Sounds, how: [
		"An animal's noise is written at the top (\"Moo!\"). Read it together, or tap the play button beside it to hear it.",
		"Tap the animal that made it. Every animal tapped makes its own noise.",
		"Higher levels: more animals to choose from, then pets and wild animals too.",
	] },
	peekaboo: { title: "Peekaboo farm", picture: "bush", Play: Peekaboo, how: [
		"Not a game to win, just fun: tap a bush (or haystack, tractor or barn window: a new place each time) and an animal pops up with its name, making its noise. Tap it again to hear it again.",
		"A couple of seconds later it ducks back down, and someone new is hiding there.",
		"When every animal has had its turn, there's a cheer and it's the end. A new set of animals each time.",
	] },
	findIt: { title: "Find it!", picture: "teddy", Play: FindIt, how: [
		"The index shows each kind of thing in the room and how many there are: socks 2, teddy bears 3.",
		"Tap any of them: it flies to its place by the index, and the number goes down. Nothing is wrong to tap. The room's done when everything's collected.",
		"From level 3, some things hide under others: collect the teddy and there's the sock. Higher levels: more kinds of things, and more of each.",
	] },
	apples: { title: "Counting", picture: "apple", Play: Apples, how: [
		"Tap each one to count it: the count so far shows big at the top and is said out loud.",
		"From level 3, pick how many there are. A wrong number clears the count, so you count again together.",
		"Higher levels: more to count.",
	] },
	adding: { title: "Math", picture: "math", Play: Adding, how: [
		"Each plate has a number on its sign. Tap the basket under a plate to put a fruit on it; tap a fruit to take it off.",
		"When both plates match their signs, pick how many there are in all.",
		"From level 4, some are take-away: tap fruit on the plate to move them to the bowl until it has its number, then pick how many are left. From level 5, type the answer on the number pad. Higher levels: bigger numbers. It moves up a level after 5 perfect games in a row, or after 20 games at a level.",
	] },
	maze: { title: "Maze", picture: "maze", Play: Maze, how: [
		"An animal wants something: the bee the flower, the monkey the banana. Tap a square in a straight line from the animal and it walks there.",
		"It can't go through the walls, so a dead end means turning back. Three mazes a game, a new animal each time.",
		"From level 3, a locked gate is in the way: find the key first. Higher levels: bigger mazes and two gates. It moves up a level after 20 games at a level.",
	] },
	letters: { title: "Letters", picture: "letters", Play: Letters, how: [
		"A picture and its word, with the first letter missing. Say the word together.",
		"Tap the letter that goes in the gap.",
		"A new few words each game, things a 4-year-old knows. Higher levels: more letters to choose from, letters that look alike (b, d, p), then small letters.",
	] },
	memory: { title: "Pairs", picture: "pairs", Play: Memory, how: [
		"All the cards are face down. Tap two to turn them over.",
		"Two the same stay face up. Two different ones turn back over, so remember where they were.",
		"Higher levels: more cards. It moves up a level after 5 perfect games in a row, or after 20 games at a level.",
	] },
};

/**
 * Kid mode's Learn tab: this kid's games as big pictures. Pick one and play; each play is a new version
 * of it. At the end: a cheer, play again, or back to the games. A few perfect plays move a game up a
 * level (the server decides), and that gets a cheer of its own. No stars: it's for learning.
 */
export default function LearnTab({ kid, today, learn }: { kid: Member; today: string; learn: LearnState }) {
	const qc = useQueryClient();
	const [playing, setPlaying] = useState<Game | null>(null);
	const [plays, setPlays] = useState(0);
	const [result, setResult] = useState<{ game: Game; leveledUp: boolean } | null>(null);
	const done = useMutation({
		mutationFn: ({ game, level, rounds, firstTry }: { game: Game; level: number; rounds: number; firstTry: number }) =>
			api.learnDone(kid.id, { today, game, level, rounds, firstTry }),
		onSuccess: (r, { game }) => setResult({ game, leveledUp: r.leveledUp }),
		onSettled: () => qc.invalidateQueries({ queryKey: keys.learn(today) }),
	});
	// A grown-up's own animal noises, played instead of the built-in ones.
	const sounds = useLearnSounds().data;
	useEffect(() => setRecorded(sounds ?? []), [sounds]);
	const levelOf = (game: Game) => learn.games.find((g) => g.game === game)?.level ?? 1;

	function start(game: Game) {
		hush();
		setResult(null);
		setPlays((n) => n + 1);
		setPlaying(game);
	}

	if (playing) {
		const { Play, title, how } = GAMES[playing];
		const level = levelOf(playing);
		return (
			<HowTo.Provider value={{ title, how }}>
			{/* A new key each play, so it starts fresh with new pictures. */}
			<Play key={plays} level={level}
				onBack={() => {
					hush();
					setPlaying(null);
				}}
				onDone={(rounds, firstTry) => {
					setPlaying(null);
					setResult({ game: playing, leveledUp: false });
					done.mutate({ game: playing, level, rounds, firstTry });
				}} />
			</HowTo.Provider>
		);
	}

	if (result) {
		return (
			<section className={s.start} aria-label="Well done">
				<img className={`${s.mascot} ${s.hop}`} src="/mascot/sprig.png" alt="" />
				{/* The words and buttons: beside the mascot on a short screen, under it otherwise. */}
				<div className={s.startText}>
					<h2 className={s.startTitle}>{result.leveledUp ? "New level!" : "You did it!"}</h2>
					{result.leveledUp && <p className={s.note}>It gets a little trickier next time.</p>}
					{done.isError && <p className={s.note}>Couldn't save that: {done.error.message}</p>}
					<div className={s.startButtons}>
						<button type="button" className={s.go} onClick={() => start(result.game)}>Play again</button>
						<button type="button" className={s.quiet} onClick={() => setResult(null)}>Other games</button>
					</div>
				</div>
			</section>
		);
	}

	return (
		// The space for the games (the cards size themselves to it), then the games, two by two.
		<section className={s.menuArea} aria-label="Games">
			<div className={s.menu}>
				{learn.games.map(({ game, level }) => (
					<button key={game} type="button" className={s.gameTile} onClick={() => start(game)}>
						<Pic id={GAMES[game].picture} className={s.gamePic} />
						<span className={s.gameName}>{GAMES[game].title}</span>
						<span className={s.gameLevel} aria-label={`Level ${level}`}>{ROMAN[level - 1] ?? level}</span>
					</button>
				))}
			</div>
		</section>
	);
}
