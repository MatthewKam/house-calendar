import { useState, type ComponentType } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { keys } from "../../lib/queries";
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
import { hush } from "./sound";
import s from "../../styles/Learn.module.css";

/** Each game: its name, its picture, and how to play it (for a grown-up to explain). */
export const GAMES: Record<Game, { title: string; picture: string; how: string[]; Play: ComponentType<GameProps> }> = {
	sounds: { title: "Who says that?", picture: "cow", Play: Sounds, how: [
		"An animal makes its noise. Tap the play button to hear it again.",
		"Tap the animal that made it. Every animal tapped makes its own noise.",
		"Higher levels: more animals to choose from, then pets and wild animals too.",
	] },
	peekaboo: { title: "Peekaboo farm", picture: "bush", Play: Peekaboo, how: [
		"Tap a bush and an animal pops out, making its noise. Tap it again to hear it again.",
		"Once everyone's out, the farm goes to sleep.",
		"From level 4: listen to the noise (the play button plays it again), then find the bush hiding that animal.",
	] },
	findIt: { title: "Find it!", picture: "teddy", Play: FindIt, how: [
		"The pictures at the top show what to find, and how many.",
		"Tap each one in the room. The pictures at the top fill in as they're found.",
		"From level 3, some are hiding under other things: tap a toy to lift it and look underneath.",
	] },
	apples: { title: "Count the apples", picture: "apple", Play: Apples, how: [
		"Tap each fruit to count it, and its number shows under it. Count out loud together.",
		"From level 3, pick how many there are. A wrong number clears the count, so you count again together.",
		"Higher levels: more fruit to count.",
	] },
	adding: { title: "Math", picture: "math", Play: Adding, how: [
		"Each plate has a number on its sign. Tap the basket under a plate to put a fruit on it; tap a fruit to take it off.",
		"When both plates match their signs, pick how many there are in all.",
		"From level 4, type the total on the number pad. Higher levels: bigger numbers.",
	] },
	maze: { title: "Maze", picture: "maze", Play: Maze, how: [
		"Tap the square next to Bear to take a step. Find the way to his house.",
		"Water, bushes and snow can't be crossed, so a dead end means turning back.",
		"From level 3, a locked gate is in the way: find the key first. Higher levels: bigger maps and two gates.",
	] },
	letters: { title: "Letters", picture: "letters", Play: Letters, how: [
		"A picture and its word, with the first letter missing. Say the word together.",
		"Tap the letter that goes in the gap.",
		"Higher levels: letters that look alike (b, d, p), small letters, then longer words.",
	] },
	memory: { title: "Pairs", picture: "pairs", Play: Memory, how: [
		"All the cards are face down. Tap two to turn them over.",
		"Two the same stay face up. Two different ones turn back over, so remember where they were.",
		"Higher levels: more cards.",
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
				<h2 className={s.startTitle}>{result.leveledUp ? "New level!" : "You did it!"}</h2>
				{result.leveledUp && <p className={s.note}>It gets a little trickier next time.</p>}
				{done.isError && <p className={s.note}>Couldn't save that: {done.error.message}</p>}
				<div className={s.startButtons}>
					<button type="button" className={s.go} onClick={() => start(result.game)}>Play again</button>
					<button type="button" className={s.quiet} onClick={() => setResult(null)}>Other games</button>
				</div>
			</section>
		);
	}

	return (
		<section className={s.menu} aria-label="Games">
			{learn.games.map(({ game, level }) => (
				<button key={game} type="button" className={s.gameTile} onClick={() => start(game)}>
					<Pic id={GAMES[game].picture} className={s.gamePic} />
					<span className={s.gameName}>{GAMES[game].title}</span>
					<span className={s.gameLevel} aria-label={`Level ${level}`}>
						{Array.from({ length: level }, (_, i) => <span key={i} className={s.levelDot} />)}
					</span>
				</button>
			))}
		</section>
	);
}
