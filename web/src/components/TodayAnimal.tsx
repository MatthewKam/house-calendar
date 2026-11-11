import { useEffect, useRef, useState } from "react";
import { noise } from "./learn/sound";
import g from "../styles/TodayAnimal.module.css";

/**
 * The animals that can sit on a little one's Today: each one's noise (an animal in Learn's sounds) and
 * its pictures in /today/<id>/, all on the same square canvas, the side views facing right; and whether
 * it gets about by walking or hopping.
 */
const ANIMALS: { id: string; name: string; sound: string; gait: Gait }[] = [
	{ id: "puppy", name: "Puppy", sound: "dog", gait: "walk" },
	{ id: "cat", name: "Cat", sound: "cat", gait: "walk" },
	{ id: "frog", name: "Frog", sound: "frog", gait: "hop" },
];

/** The poses, one picture each: the same few for every animal, then two steps (walking) or three (hopping). */
type Gait = "walk" | "hop";
type Pose = "sitting" | "noise" | "standing" | "side" | "walk-a" | "walk-b" | "crouch" | "jump-a" | "jump-b";
const POSES: Record<Gait, Pose[]> = {
	walk: ["sitting", "noise", "standing", "side", "walk-a", "walk-b"],
	hop: ["sitting", "noise", "standing", "side", "crouch", "jump-a", "jump-b"],
};

/**
 * The shortest and longest the noise shows before it gets up (it waits for the sound to finish), how long
 * each step lasts, and each walk (off, or back in).
 */
const NOISE = 900;
const LONGEST = 6000;
const STEP = 170;
const WALK = 1800;
/** Hopping: down in a crouch, up in the air, then landed. */
const CROUCH = 150;
const AIR = 440;
const LAND = 100;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * An animal sitting on a little one's Today, picked at random each time it shows. Tap it: it makes its
 * noise, gets up, walks (or hops) off to the right, comes back in from the left, and sits down again. Taps while
 * it's out walking do nothing, so it always finishes the trip.
 */
export default function TodayAnimal() {
	const [animal] = useState(() => ANIMALS[Math.floor(Math.random() * ANIMALS.length)]);
	const [pose, setPose] = useState<Pose>("sitting");
	const stage = useRef<HTMLDivElement>(null);
	const walker = useRef<HTMLButtonElement>(null);
	const busy = useRef(false);
	const gone = useRef(false);
	const src = (p: Pose) => `/today/${animal.id}/${p}.webp`;

	// Every pose loaded up front, so nothing blinks mid-walk.
	// (Here again on every mount: React's development mode mounts it twice, gone in between.)
	useEffect(() => {
		gone.current = false;
		POSES[animal.gait].forEach((p) => (new Image().src = src(p)));
		return () => void (gone.current = true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [animal.id]);

	/** Walks from one spot to another (in px from the middle), stepping as it goes. */
	async function walk(from: number, to: number) {
		const el = walker.current;
		if (!el) return;
		let step = 0;
		setPose("walk-a");
		const steps = setInterval(() => setPose(++step % 2 ? "walk-b" : "walk-a"), STEP);
		// The last walk let go of (each one holds where it ended until the next takes over).
		el.getAnimations().forEach((a) => a.cancel());
		await el.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: WALK, easing: "linear", fill: "forwards" }).finished.catch(() => {});
		clearInterval(steps);
	}

	/** Hops from one spot to another, a few hops on the way: crouch, up and over in an arc, land. */
	async function hop(from: number, to: number) {
		const el = walker.current;
		if (!el) return;
		const hops = Math.max(2, Math.round(Math.abs(to - from) / (el.clientWidth * 0.5)));
		const high = el.clientHeight * 0.3;
		for (let i = 0; i < hops; i++) {
			const a = from + ((to - from) * i) / hops;
			const b = from + ((to - from) * (i + 1)) / hops;
			setPose("crouch");
			await wait(CROUCH);
			if (gone.current) return;
			// Taking off on the way up, stretched out over the top.
			setPose("jump-a");
			const top = setTimeout(() => setPose("jump-b"), AIR * 0.3);
			el.getAnimations().forEach((x) => x.cancel());
			await el.animate([
				{ transform: `translate(${a}px, 0)`, easing: "ease-out" },
				{ transform: `translate(${(a + b) / 2}px, ${-high}px)`, easing: "ease-in" },
				{ transform: `translate(${b}px, 0)` },
			], { duration: AIR, fill: "forwards" }).finished.catch(() => {});
			clearTimeout(top);
			setPose("side");
			await wait(LAND);
			if (gone.current) return;
		}
	}

	async function tap() {
		if (busy.current) return;
		busy.current = true;
		// The noise all the way through before it gets up (at least NOISE, at most LONGEST if it never says it's done).
		const heard = new Promise<void>((done) => noise({ id: animal.sound }, done));
		setPose("noise");
		await Promise.race([Promise.all([heard, wait(NOISE)]), wait(LONGEST)]);
		// Just the noise when motion is turned down.
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			if (!gone.current) setPose("sitting");
			busy.current = false;
			return;
		}
		if (gone.current) return;
		setPose("standing");
		await wait(350);
		if (gone.current) return;
		setPose("side");
		await wait(250);
		// Far enough that it's all the way off the side (the stage's edge) before it comes back.
		const width = stage.current?.clientWidth ?? 400;
		const out = width / 2 + (walker.current?.clientWidth ?? 200) / 2 + 8;
		const go = animal.gait === "hop" ? hop : walk;
		await go(0, out);
		if (gone.current) return;
		await go(-out, 0);
		if (gone.current) return;
		setPose("side");
		await wait(200);
		if (gone.current) return;
		setPose("standing");
		await wait(300);
		if (gone.current) return;
		setPose("sitting");
		busy.current = false;
	}

	return (
		<div ref={stage} className={g.animalStage}>
			<button ref={walker} type="button" className={g.animal} aria-label={`${animal.name}: tap to hear it`}
				onPointerDown={tap} onClick={(e) => e.detail === 0 && tap()}>
				<img src={src(pose)} alt="" draggable={false}
					className={`${g.animalPic} ${pose.startsWith("walk") ? g.animalWalking : pose === "sitting" ? g.animalSat : ""}`} />
			</button>
		</div>
	);
}
