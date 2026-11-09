import { useEffect, useRef, useState } from "react";
import { noise } from "./learn/sound";
import s from "../styles/KidMode.module.css";

/**
 * The animals that can sit on a little one's Today: each one's noise (an animal in Learn's sounds) and
 * its pictures in /today/<id>/, all on the same square canvas, the side views facing right.
 */
const ANIMALS = [
	{ id: "puppy", name: "Puppy", sound: "dog" },
	{ id: "duck", name: "Duck", sound: "duck" },
];

/** The poses, one picture each. */
type Pose = "sitting" | "noise" | "standing" | "side" | "walk-a" | "walk-b";
const POSES: Pose[] = ["sitting", "noise", "standing", "side", "walk-a", "walk-b"];

/**
 * The shortest and longest the noise shows before it gets up (it waits for the sound to finish), how long
 * each step lasts, and each walk (off, or back in).
 */
const NOISE = 900;
const LONGEST = 6000;
const STEP = 170;
const WALK = 1800;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * An animal sitting on a little one's Today, picked at random each time it shows. Tap it: it makes its
 * noise, gets up, walks off to the right, comes back in from the left, and sits down again. Taps while
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
		POSES.forEach((p) => (new Image().src = src(p)));
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
		await walk(0, out);
		if (gone.current) return;
		await walk(-out, 0);
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
		<div ref={stage} className={s.animalStage}>
			<button ref={walker} type="button" className={s.animal} aria-label={`${animal.name}: tap to hear it`}
				onPointerDown={tap} onClick={(e) => e.detail === 0 && tap()}>
				<img src={src(pose)} alt="" draggable={false}
					className={`${s.animalPic} ${pose.startsWith("walk") ? s.animalWalking : pose === "sitting" ? s.animalSat : ""}`} />
			</button>
		</div>
	);
}
