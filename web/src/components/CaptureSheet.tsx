import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { textOn } from "../lib/color";
import { addDays, dayKey, fromDayKey, hhmm, toInstant } from "../lib/dates";
import { isDay } from "../lib/lists";
import { flyerImage, uploadFlyer } from "../lib/photos";
import { useLists } from "../lib/queries";
import type { Member, Proposal } from "../lib/types";
import DateInput from "./DateInput";
import { CalendarPick, useNewEventCalendar } from "./CalendarPick";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Capture.module.css";

/** A card being checked: the proposal, in the shape the fields edit. */
interface Card {
	id: number;
	kind: Proposal["kind"];
	title: string;
	/** Item: its list. */
	list: string;
	/** YYYY-MM-DD; empty: none (an item with no when). */
	day: string;
	/** HH:MM; empty: any time that day (an item), all day (an event). */
	time: string;
	endDay: string;
	endTime: string;
	who: string[];
	location: string | null;
	/** Event: other details, from the flyer or what was said. */
	notes: string;
}

const nextDay = (d: string) => dayKey(addDays(fromDayKey(d), 1));
const prevDay = (d: string) => dayKey(addDays(fromDayKey(d), -1));

function toCard(p: Proposal, id: number): Card {
	const base = { id, kind: p.kind, title: p.title, list: "", day: "", time: "", endDay: "", endTime: "", who: [] as string[], location: null, notes: "" };
	if (p.kind === "item") {
		const due = p.due;
		return { ...base, list: p.list, who: p.memberId ? [p.memberId] : [],
			day: due ? (isDay(due) ? due : dayKey(new Date(due))) : "", time: due && !isDay(due) ? hhmm(due) : "" };
	}
	if (p.kind === "event") {
		return p.allDay
			? { ...base, who: p.memberIds, location: p.location, notes: p.notes ?? "", day: p.start, endDay: prevDay(p.end) }
			: { ...base, who: p.memberIds, location: p.location, notes: p.notes ?? "", day: dayKey(new Date(p.start)), time: hhmm(p.start),
				endDay: dayKey(new Date(p.end)), endTime: hhmm(p.end) };
	}
	return { ...base, who: [p.memberId], day: p.day };
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/**
 * Adds one card through the usual routes (the server checks it like any other add). flyer: the
 * flyer's photo id, uploaded the first time an event needs it.
 */
async function addCard(c: Card, lists: { id: string; title: string }[], flyer?: () => Promise<string>, calendar: { calendarId?: string } = {}) {
	const title = c.title.trim();
	if (c.kind === "item") {
		let list = lists.find((l) => l.title.toLowerCase() === c.list.trim().toLowerCase());
		if (!list) list = (await api.addList(c.list.trim() || "To do")).find((l) => l.title.toLowerCase() === (c.list.trim() || "To do").toLowerCase());
		if (!list) throw new Error(`Couldn't make the list ${c.list}`);
		await api.addListItem(list.id, { title, due: c.day ? (c.time ? toInstant(c.day, c.time) : c.day) : null, memberId: c.who[0] ?? null });
	} else if (c.kind === "event") {
		const endDay = c.endDay && c.endDay >= c.day ? c.endDay : c.day;
		// In the calendar picked (as the event form remembers it), so it reaches the phones.
		const extra = { location: c.location, notes: c.notes.trim() || null, photoId: flyer ? await flyer() : null, ...calendar };
		if (!c.time) {
			await api.addEvent({ title, memberIds: c.who, allDay: true, start: c.day, end: nextDay(endDay), ...extra });
		} else {
			const start = toInstant(c.day, c.time);
			const end = c.endTime ? toInstant(endDay, c.endTime) : "";
			await api.addEvent({ title, memberIds: c.who, allDay: false, start, ...extra,
				end: end > start ? end : new Date(Date.parse(start) + 3_600_000).toISOString() });
		}
	} else {
		await api.addTask({ title, memberId: c.who[0], days: EVERY_DAY, time: null, category: "chores", required: true, points: 0, icon: null, dueBy: c.day });
	}
}

/** The browser's speech recognition, where there is one (Chrome, Safari). */
type Recognition = {
	continuous: boolean; interimResults: boolean; lang: string;
	onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
	onend: (() => void) | null; onerror: (() => void) | null;
	start(): void; stop(): void; abort(): void;
};
const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition })
	.SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

const MicIcon = () => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
	</svg>
);

const KIND: Record<Proposal["kind"], { icon: string; word: string }> = {
	item: { icon: "📝", word: "List" },
	event: { icon: "📅", word: "Event" },
	task: { icon: "⭐", word: "Kid task" },
};

interface Props {
	/** A flyer's photo to read; without it, Say it. */
	photo?: File;
	members: Member[];
	onClose: () => void;
	/** After adding: what to tell them. */
	onAdded: (text: string) => void;
}

/**
 * Say it (talk, or type) or Snap a flyer: Sprig works out what to add, then shows each as a card to
 * change or leave out. Nothing is added until Add.
 */
export default function CaptureSheet({ photo, members, onClose, onAdded }: Props) {
	const qc = useQueryClient();
	const lists = useLists().data ?? [];
	const kids = members.filter((m) => m.stage !== null && m.stage !== "adult");
	const [text, setText] = useState("");
	const [listening, setListening] = useState(false);
	const [working, setWorking] = useState(!!photo);
	const [error, setError] = useState<string | null>(null);
	const [cards, setCards] = useState<Card[] | null>(null);
	const [adding, setAdding] = useState(false);
	const rec = useRef<Recognition | null>(null);
	// The flyer's photo, uploaded once for all its events (and kept if one fails, for trying again).
	const flyerId = useRef<Promise<string> | null>(null);
	// Made here rather than in a memo, so a remount (React's dev mode) never keeps a revoked one.
	const [preview, setPreview] = useState<string | null>(null);
	useEffect(() => {
		if (!photo) return;
		const url = URL.createObjectURL(photo);
		setPreview(url);
		return () => URL.revokeObjectURL(url);
	}, [photo]);
	function flyer() {
		flyerId.current ??= uploadFlyer(photo!).then((p) => p.id, (e) => {
			flyerId.current = null;
			throw e;
		});
		return flyerId.current;
	}

	async function understand(input: Parameters<typeof api.capture>[0]) {
		setWorking(true);
		setError(null);
		try {
			const { proposals } = await api.capture(input);
			setCards(proposals.map(toCard));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setWorking(false);
		}
	}

	// A flyer: read straight away.
	useEffect(() => {
		if (!photo) return;
		let live = true;
		flyerImage(photo).then((image) => {
			if (live) void understand({ image });
		}, (e) => {
			setWorking(false);
			setError(e instanceof Error ? e.message : String(e));
		});
		return () => { live = false; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [photo]);

	useEffect(() => () => rec.current?.abort(), []);

	function listen() {
		if (!Speech) return;
		if (listening) {
			rec.current?.stop();
			return;
		}
		const r = new Speech();
		r.continuous = true;
		r.interimResults = true;
		r.lang = navigator.language;
		const before = text ? `${text.trim()} ` : "";
		r.onresult = (e) => setText(before + Array.from(e.results, (x) => x[0].transcript).join(""));
		r.onend = () => setListening(false);
		r.onerror = () => setListening(false);
		rec.current = r;
		r.start();
		setListening(true);
	}

	const set = (id: number, patch: Partial<Card>) => setCards((cs) => cs?.map((c) => (c.id === id ? { ...c, ...patch } : c)) ?? null);
	// Where its events go: the same calendar the event form uses.
	const target = useNewEventCalendar();
	const ready = (cards ?? []).filter((c) => c.title.trim() && (c.kind === "item" || c.day) && (c.kind !== "task" || c.who.length));

	async function addAll() {
		if (!cards) return;
		setAdding(true);
		setError(null);
		const left: Card[] = [];
		let added = 0;
		const calendar = ready.some((c) => c.kind === "event") ? target.forSave() : {};
		for (const c of ready) {
			try {
				await addCard(c, lists, photo ? flyer : undefined, calendar);
				added++;
			} catch (e) {
				left.push(c);
				setError(e instanceof Error ? e.message : String(e));
			}
		}
		await qc.invalidateQueries();
		setAdding(false);
		if (left.length) setCards(left);
		else {
			onAdded(added === 1 ? "Added 1 thing" : `Added ${added} things`);
			onClose();
		}
	}

	const whoPick = (c: Card, people: Member[], one: boolean) => (
		<div className={s.who} role="group" aria-label="Who it's for">
			{people.map((m) => {
				const on = c.who.includes(m.id);
				return (
					<button key={m.id} type="button" className={s.person} aria-pressed={on}
						style={on ? { background: m.color, borderColor: m.color, color: textOn(m.color) } : undefined}
						onClick={() => set(c.id, { who: one ? (on ? [] : [m.id]) : on ? c.who.filter((w) => w !== m.id) : [...c.who, m.id] })}>
						{m.name.split(" ")[0]}
					</button>
				);
			})}
		</div>
	);

	return (
		<>
			<div className={sheet.scrim} onClick={onClose} role="presentation" />
			<div className={`${sheet.sheet} ${s.capture}`} role="dialog" aria-label={photo ? "Snap a flyer" : "Say it"}>
				<header className={sheet.head}>
					<h2 className={sheet.heading}>{cards ? "Add these?" : photo ? "Snap a flyer" : "Say it"}</h2>
					<button type="button" className={sheet.close} onClick={onClose} aria-label="Close">×</button>
				</header>

				{!cards && !photo && (
					<form className={s.say} onSubmit={(e) => { e.preventDefault(); rec.current?.stop(); if (text.trim()) void understand({ text }); }}>
						{Speech && (
							<button type="button" className={`${s.mic} ${listening ? s.listening : ""}`} onClick={listen}
								aria-label={listening ? "Stop listening" : "Tap to talk"} aria-pressed={listening}>
								<MicIcon />
							</button>
						)}
						<p className={s.hint}>
							{listening ? "Listening… tap again when you're done." : Speech ? "Tap to talk, or type." : "Type, or use the 🎤 on your keyboard."}
						</p>
						<textarea className={s.text} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
							placeholder={'"Remind me to call the dentist Friday at 10"\n"Add milk and eggs to Groceries"'} aria-label="What to add" />
						<div className={sheet.actions}>
							<span className={sheet.spacer} />
							<button type="submit" className={sheet.primary} disabled={!text.trim() || working}>{working ? "Working it out…" : "Go"}</button>
						</div>
					</form>
				)}

				{!cards && photo && working && <p className={s.hint}>Reading the flyer…</p>}
				{error && <p className={s.error}>{error}</p>}

				{cards && cards.length === 0 && (
					<p className={s.hint}>
						{photo ? "Sprig didn't find any dates or things to add on that photo." : 'Sprig didn\'t catch anything to add. Try "Add milk to Groceries".'}
					</p>
				)}
				{cards && cards.some((c) => c.kind === "event") && preview && (
					<p className={s.kept}>
						<img src={preview} alt="" />
						The photo is saved with the events, in their notes.
					</p>
				)}
				{cards && cards.length > 0 && (
					<ul className={s.cards}>
						{cards.map((c) => (
							<li key={c.id} className={s.card}>
								<div className={s.cardHead}>
									<span className={s.kind}><span aria-hidden="true">{KIND[c.kind].icon}</span> {c.kind === "item" && c.day ? "Reminder" : KIND[c.kind].word}</span>
									<button type="button" className={s.drop} onClick={() => setCards(cards.filter((x) => x.id !== c.id))} aria-label={`Leave out ${c.title}`}>×</button>
								</div>
								<input className={s.title} value={c.title} onChange={(e) => set(c.id, { title: e.target.value })} maxLength={300} aria-label="Title" />
								{c.kind === "item" && (
									<label className={s.field}>
										<span>List</span>
										<input list="capture-lists" value={c.list} onChange={(e) => set(c.id, { list: e.target.value })} maxLength={100} />
										{!lists.some((l) => l.title.toLowerCase() === c.list.trim().toLowerCase()) && <span className={s.new}>new list</span>}
									</label>
								)}
								<div className={s.when}>
									<DateInput className={s.date} value={c.day} aria-label="Day"
										onChange={(e) => set(c.id, { day: e.target.value, endDay: c.endDay && c.endDay < e.target.value ? e.target.value : c.endDay })} />
									{c.kind !== "task" && (
										<input type="time" className={s.time} value={c.time} aria-label={c.kind === "event" ? "Starts" : "Time"}
											onChange={(e) => set(c.id, { time: e.target.value })} />
									)}
									{c.kind === "event" && c.time && (
										<>
											<span aria-hidden="true">–</span>
											<input type="time" className={s.time} value={c.endTime} aria-label="Ends" onChange={(e) => set(c.id, { endTime: e.target.value })} />
										</>
									)}
									{c.kind === "event" && !c.time && <span className={s.note}>All day</span>}
									{c.kind === "item" && !c.day && <span className={s.note}>No day: just on the list</span>}
								</div>
								{c.kind === "task" ? whoPick(c, kids, true) : whoPick(c, members, c.kind === "item")}
								{c.kind === "event" && (
									<textarea className={s.notes} value={c.notes} onChange={(e) => set(c.id, { notes: e.target.value })}
										rows={Math.min(5, Math.max(2, c.notes.split("\n").length))} maxLength={4000} placeholder="Notes" aria-label="Notes" />
								)}
							</li>
						))}
					</ul>
				)}
				<datalist id="capture-lists">{lists.map((l) => <option key={l.id} value={l.title} />)}</datalist>

				{cards?.some((c) => c.kind === "event") && <CalendarPick target={target} className={s.calendarPick} />}
				{cards && (
					<div className={sheet.actions}>
						<button type="button" className={sheet.secondary} onClick={() => { setCards(null); setError(null); }} hidden={!!photo}>Back</button>
						<span className={sheet.spacer} />
						<button type="button" className={sheet.secondary} onClick={onClose}>Cancel</button>
						<button type="button" className={sheet.primary} disabled={!ready.length || adding} onClick={() => void addAll()}>
							{adding ? "Adding…" : "Add"}
						</button>
					</div>
				)}
			</div>
		</>
	);
}
