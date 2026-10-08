import { useEffect, useRef, useState, type DragEvent } from "react";
import { usePhotoActions, usePhotos } from "../lib/queries";
import { isVideo, preparePhoto, uploadPhoto, uploadVideo } from "../lib/photos";
import type { Photo } from "../lib/types";
import { useMediaQuery } from "../lib/useMediaQuery";
import ConfirmDialog from "./ConfirmDialog";
import Fab from "./Fab";
import ScreenSaverSettings from "./ScreenSaverSettings";
import sheet from "../styles/Sheet.module.css";
import s from "../styles/Photos.module.css";

interface Props {
	/** Starts the screen saver now (to see how it looks). */
	onPreview: () => void;
}

interface Upload {
	key: string;
	name: string;
	/** 0 to 1; done at 1. */
	progress: number;
	error?: string;
	/** A video, once uploaded: it stays in the list while the server converts it. */
	videoId?: string;
}

/** Which photos the grid shows. */
type Show = "all" | "in";

const taken = (iso: string | null) =>
	iso
		? new Date(iso).toLocaleDateString([], {
				month: "long",
				day: "numeric",
				year: "numeric",
			})
		: "Date unknown";

/** The family photo album: upload, browse, and pick which photos the screen saver shows. */
/** A video's length: "0:12". */
const clock = (seconds: number | null) => {
	const t = Math.round(seconds ?? 0);
	return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** A new video while the server converts it: 🎬, how far along, and a bar. */
function Converting({ progress }: { progress: number | null }) {
	const pct = Math.round((progress ?? 0) * 100);
	return (
		<span className={s.preparing}>
			<span className={s.preparingIcon} aria-hidden="true">
				🎬
			</span>
			{pct ? `Converting ${pct}%` : "Waiting to convert…"}
			<span className={s.uploadBar}>
				<span style={{ width: `${pct}%` }} />
			</span>
		</span>
	);
}

/**
 * An upload's progress. A video goes on to "Converting" (as the server reports it) and "Ready" before
 * it leaves the list.
 */
function UploadStatus({ upload: u, video }: { upload: Upload; video?: Photo }) {
	const converting = !!u.videoId;
	const step = !converting
		? { label: u.progress < 1 && u.progress > 0 ? `Uploading ${Math.round(u.progress * 100)}%` : "", f: u.progress }
		: video?.ready
			? { label: "Ready ✓", f: 1 }
			: { label: `Converting ${Math.round((video?.progress ?? 0) * 100)}%`, f: video?.progress ?? 0 };
	return (
		<>
			{step.label && <span className={s.uploadStep}>{step.label}</span>}
			<span className={`${s.uploadBar} ${converting && !video?.ready ? s.convertingBar : ""}`}>
				<span style={{ width: `${step.f * 100}%` }} />
			</span>
		</>
	);
}

export default function PhotosPage({ onPreview }: Props) {
	const photos = usePhotos().data ?? [];
	const { refresh, update, remove, setSlideshow } = usePhotoActions();
	const [show, setShow] = useState<Show>("all");
	const [uploads, setUploads] = useState<Upload[]>([]);
	// A converted video shows "Ready" for a moment, then leaves the list (one removed meanwhile, too).
	const doneVideos = uploads
		.filter((u) => u.videoId && !photos.find((p) => p.id === u.videoId && !p.ready))
		.map((u) => u.key)
		.join(",");
	useEffect(() => {
		if (!doneVideos) return;
		const keys = doneVideos.split(",");
		const t = setTimeout(() => setUploads((u) => u.filter((x) => !keys.includes(x.key))), 2500);
		return () => clearTimeout(t);
	}, [doneVideos]);
	const [viewing, setViewing] = useState<string | null>(null);
	// Select mode: the photos in the screen saver start out selected; tap to change, then Save selection.
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [confirm, setConfirm] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	// Phones and tablets: + goes straight to the system's picker, which itself offers the photo
	// library, the camera and files (the drag-and-drop pop-up is for computers).
	const touch = useMediaQuery("(pointer: coarse)");

	const inCount = photos.filter((p) => p.inSlideshow).length;
	const shown = photos.filter((p) => show === "all" || p.inSlideshow);
	const index = shown.findIndex((p) => p.id === viewing);
	const current = index >= 0 ? shown[index] : null;
	const picked = photos.filter((p) => selected.has(p.id));

	function stopSelecting() {
		setSelecting(false);
		setSelected(new Set());
	}
	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setSelected(next);
	}
	function startSelecting() {
		setSelected(new Set(photos.filter((p) => p.inSlideshow).map((p) => p.id)));
		setSelecting(true);
	}
	/** The selected photos are the screen saver's; only what changed is sent. */
	async function saveSelection() {
		const add = photos
			.filter((p) => selected.has(p.id) && !p.inSlideshow)
			.map((p) => p.id);
		const drop = photos
			.filter((p) => !selected.has(p.id) && p.inSlideshow)
			.map((p) => p.id);
		// Shown straight away; both saves carry on in the background.
		if (add.length) setSlideshow.mutate({ ids: add, inSlideshow: true });
		if (drop.length) setSlideshow.mutate({ ids: drop, inSlideshow: false });
		stopSelecting();
	}

	// Upload pop-up (drop area, or choose from Finder), and a file being dragged over the page.
	const [uploadOpen, setUploadOpen] = useState(false);
	// Whether new uploads go straight into the screen saver (untick for a big batch).
	const [toSaver, setToSaver] = useState(true);
	const [dragging, setDragging] = useState(false);
	const dragDepth = useRef(0);
	const hasFiles = (e: DragEvent) =>
		[...e.dataTransfer.types].includes("Files");
	const drag = {
		onDragEnter: (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth.current++;
			setDragging(true);
		},
		onDragOver: (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
		},
		onDragLeave: () => {
			dragDepth.current = Math.max(0, dragDepth.current - 1);
			if (!dragDepth.current) setDragging(false);
		},
		onDrop: (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			dragDepth.current = 0;
			setDragging(false);
			setUploadOpen(false);
			void add(e.dataTransfer.files);
		},
	};

	async function add(files: FileList | File[] | null) {
		// Only images and videos (a dropped folder or document is skipped).
		const images = [...(files ?? [])].filter(
			(f) =>
				f.type.startsWith("image/") ||
				isVideo(f) ||
				/\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name),
		);
		if (!images.length) return;
		const batch = images.map((f, i) => ({
			key: `${Date.now()}-${i}`,
			name: f.name,
			progress: 0,
			file: f,
		}));
		setUploads((u) => [...u, ...batch.map(({ file: _f, ...rest }) => rest)]);
		const set = (key: string, patch: Partial<Upload>) =>
			setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...patch } : x)));
		// One at a time, so a phone on Wi-Fi isn't sending ten at once.
		for (const b of batch) {
			try {
				const progress = (f: number) => set(b.key, { progress: Math.min(0.99, f) });
				// Videos go up as they are (the server converts them); photos are shrunk here first.
				if (isVideo(b.file)) {
					const video = await uploadVideo(b.file, toSaver, progress);
					set(b.key, { progress: 1, videoId: video.id });
				} else {
					await uploadPhoto(await preparePhoto(b.file), toSaver, progress);
					set(b.key, { progress: 1 });
				}
			} catch (e) {
				set(b.key, { error: e instanceof Error ? e.message : String(e) });
			}
		}
		await refresh();
		// Finished ones go away after a moment; failures stay until dismissed.
		setTimeout(
			// Videos stay until they're converted (below).
			() => setUploads((u) => u.filter((x) => x.error || x.progress < 1 || x.videoId)),
			2500,
		);
		if (input.current) input.current.value = "";
	}

	// Arrow keys and Escape in the viewer.
	useEffect(() => {
		if (!current) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setViewing(null);
			if (e.key === "ArrowRight" && index < shown.length - 1)
				setViewing(shown[index + 1].id);
			if (e.key === "ArrowLeft" && index > 0) setViewing(shown[index - 1].id);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [current, index, shown]);

	return (
		<section className={s.page} aria-label="Photos" {...drag}>
			<header className={s.pageHead}>
				<h1 className={s.pageTitle}>Photos</h1>
				<div className={s.actions}>
					<button
						className={s.textButton}
						onClick={() => setSettingsOpen(true)}
					>
						Screen saver settings
					</button>
					<input
						ref={input}
						type="file"
						accept="image/*,video/*"
						multiple
						hidden
						onChange={(e) => {
							setUploadOpen(false);
							void add(e.target.files);
						}}
					/>
				</div>
			</header>

			{photos.length > 0 && (
				<div className={s.tabs} role="tablist" aria-label="Show">
					{(
						[
							["all", `All (${photos.length})`],
							["in", `In screen saver (${inCount})`],
						] as [Show, string][]
					).map(([id, label]) => (
						<button
							key={id}
							role="tab"
							aria-selected={show === id}
							className={`${s.tab} ${show === id ? s.tabOn : ""}`}
							onClick={() => setShow(id)}
						>
							{label}
						</button>
					))}
					{photos.length > 0 && (
						<button
							className={s.secondary}
							disabled={selecting}
							onClick={startSelecting}
						>
							Select images
						</button>
					)}
				</div>
			)}

			{/* Select mode: the selected photos are the ones the screen saver shows. */}
			{selecting && (
				<div className={s.selectBar}>
					<span className={s.selectCount}>
						{picked.length} of {photos.length} selected for the screen saver
					</span>
					<button
						className={s.textButton}
						onClick={() =>
							setSelected(
								picked.length === photos.length
									? new Set()
									: new Set(photos.map((p) => p.id)),
							)
						}
					>
						{picked.length === photos.length ? "Select none" : "Select all"}
					</button>
					<span className={s.spacer} />
					<button className={s.textButton} onClick={stopSelecting}>
						Cancel
					</button>
					<button
						className={s.save}
						disabled={setSlideshow.isPending}
						onClick={() => void saveSelection()}
					>
						Save selection
					</button>
				</div>
			)}

			{uploads.length > 0 && (
				<ul className={s.uploads}>
					{uploads.map((u) => (
						<li key={u.key} className={u.error ? s.failed : undefined}>
							<span className={s.uploadName}>{u.name}</span>
							{u.error ? (
								<>
									<span className={s.uploadError}>{u.error}</span>
									<button
										className={s.dismiss}
										onClick={() =>
											setUploads((x) => x.filter((y) => y.key !== u.key))
										}
										aria-label="Dismiss"
									>
										×
									</button>
								</>
							) : (
								<UploadStatus upload={u} video={photos.find((p) => p.id === u.videoId)} />
							)}
						</li>
					))}
				</ul>
			)}

			{photos.length === 0 ? (
				<div className={s.empty}>
					<h2>No photos yet</h2>
					<p>
						Drag photos here, or tap the <strong>+</strong> to choose them. Pick
						which ones the screen saver shows with <strong>Select</strong>.
					</p>
				</div>
			) : shown.length === 0 ? (
				<p className={s.none}>
					No photos are in the screen saver yet. Use Select to add some.
				</p>
			) : (
				<div className={s.grid}>
					{shown.map((p) => {
						const on = selected.has(p.id);
						return (
							<button
								key={p.id}
								className={`${s.tile} ${selecting ? s.selectable : ""} ${on ? s.picked : ""}`}
								aria-pressed={selecting ? on : undefined}
								aria-label={`Photo from ${taken(p.takenAt)}`}
								onClick={() => (selecting ? toggle(p.id) : setViewing(p.id))}
							>
								{p.ready ? (
									<img src={p.thumbUrl} alt="" loading="lazy" decoding="async" />
								) : (
									<Converting progress={p.progress} />
								)}
								{p.kind === "video" && p.ready && (
									<span className={s.videoBadge} aria-label={`Video, ${clock(p.seconds)}`}>
										▶ {clock(p.seconds)}
									</span>
								)}
								{/* Selecting: a circle on every photo, filled when selected. Otherwise a tick on the screen saver's photos. */}
								{selecting ? (
									<span
										className={`${s.check} ${on ? s.checkOn : ""}`}
										aria-hidden="true"
									>
										{on ? "✓" : ""}
									</span>
								) : (
									p.inSlideshow && (
										<span
											className={`${s.check} ${s.checkOn} ${s.inSaver}`}
											title="In the screen saver"
										>
											✓
										</span>
									)
								)}
							</button>
						);
					})}
				</div>
			)}

			{current && (
				<div className={s.viewer} role="dialog" aria-label="Photo">
					<div className={s.viewerTop}>
						<span className={s.viewerCount}>
							{index + 1} of {shown.length}
						</span>
						<button
							className={s.viewerClose}
							onClick={() => setViewing(null)}
							aria-label="Close"
						>
							×
						</button>
					</div>
					<div className={s.stage}>
						{index > 0 && (
							<button
								className={`${s.nav} ${s.prev}`}
								onClick={() => setViewing(shown[index - 1].id)}
								aria-label="Previous"
							>
								‹
							</button>
						)}
						{current.kind === "video" ? (
							current.ready ? (
								<video key={current.id} src={current.url} poster={current.thumbUrl} className={s.big}
									autoPlay muted loop playsInline controls />
							) : (
								<Converting progress={current.progress} />
							)
						) : (
							<img key={current.id} src={current.url} alt="" className={s.big} />
						)}
						{index < shown.length - 1 && (
							<button
								className={`${s.nav} ${s.next}`}
								onClick={() => setViewing(shown[index + 1].id)}
								aria-label="Next"
							>
								›
							</button>
						)}
					</div>
					<div className={s.viewerBar}>
						<span className={s.when}>{taken(current.takenAt)}</span>
						<label className={s.toggle}>
							<input
								type="checkbox"
								checked={current.inSlideshow}
								onChange={(e) =>
									update.mutate({
										id: current.id,
										patch: { inSlideshow: e.target.checked },
									})
								}
							/>
							In the screen saver
						</label>
						<span className={s.spacer} />
						<button className={s.delete} onClick={() => setConfirm(true)}>
							Delete
						</button>
					</div>
				</div>
			)}

			{settingsOpen && (
				<>
					<div
						className={sheet.scrim}
						onClick={() => setSettingsOpen(false)}
						role="presentation"
					/>
					<div
						className={sheet.sheet}
						role="dialog"
						aria-label="Screen saver settings"
					>
						<header className={sheet.head}>
							<h2 className={sheet.heading}>Screen saver settings</h2>
							<button
								className={sheet.close}
								onClick={() => setSettingsOpen(false)}
								aria-label="Close"
							>
								×
							</button>
						</header>
						<ScreenSaverSettings
							bare
							onPreview={
								inCount > 0
									? () => {
											setSettingsOpen(false);
											onPreview();
										}
									: undefined
							}
						/>
						<p className={s.settingsNote}>
							{inCount
								? `${inCount} ${inCount === 1 ? "photo is" : "photos are"} in the screen saver.`
								: "No photos are in the screen saver yet."}
						</p>
					</div>
				</>
			)}

			{confirm && current && (
				<ConfirmDialog
					title="Delete this photo?"
					confirmLabel="Delete"
					onCancel={() => setConfirm(false)}
					onConfirm={() => {
						const next = shown[index + 1] ?? shown[index - 1] ?? null;
						remove.mutate(current.id);
						setConfirm(false);
						setViewing(next?.id ?? null);
					}}
				>
					It's removed from the album and the screen saver. This can't be
					undone.
				</ConfirmDialog>
			)}
			{/* Upload photos: the round + at the bottom right. */}
			<Fab label="Upload photos" onClick={() => (touch ? input.current?.click() : setUploadOpen(true))} />

			{uploadOpen && (
				<>
					<div
						className={sheet.scrim}
						onClick={() => setUploadOpen(false)}
						role="presentation"
					/>
					<div className={sheet.sheet} role="dialog" aria-label="Upload photos">
						<header className={sheet.head}>
							<h2 className={sheet.heading}>Upload photos and videos</h2>
							<button
								className={sheet.close}
								onClick={() => setUploadOpen(false)}
								aria-label="Close"
							>
								×
							</button>
						</header>
						<div className={`${s.dropZone} ${dragging ? s.dropHot : ""}`}>
							<span className={s.dropIcon} aria-hidden="true">
								🖼️
							</span>
							<strong>Drag photos or videos here</strong>
							<span className={s.dropOr}>or</span>
							<button
								className={s.upload}
								onClick={() => input.current?.click()}
							>
								Choose from Finder
							</button>
							<span className={s.dropHint}>
								Pick as many as you like. They're shrunk to wall size before
								uploading.
							</span>
							{/* Dragging from the Photos app into Chrome only hands over a still preview. */}
							<span className={s.dropHint}>
								Videos from the Photos app: drag them to the desktop first, or
								use Choose from Finder → Photos (under Media). Dragging straight
								from Photos only sends a still picture.
							</span>
						</div>
						<label className={s.toggle}>
							<input
								type="checkbox"
								checked={toSaver}
								onChange={(e) => setToSaver(e.target.checked)}
							/>
							Add them to the screen saver
						</label>
					</div>
				</>
			)}

			{/* Dragging photos over the page: drop anywhere. */}
			{dragging && !uploadOpen && (
				<div className={s.dropOverlay} aria-hidden="true">
					<div>Drop photos or videos to upload</div>
				</div>
			)}
		</section>
	);
}
