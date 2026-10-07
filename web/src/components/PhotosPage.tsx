import { useEffect, useRef, useState, type DragEvent } from "react";
import { usePhotoActions, usePhotos } from "../lib/queries";
import { preparePhoto, uploadPhoto } from "../lib/photos";
import ConfirmDialog from "./ConfirmDialog";
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
export default function PhotosPage({ onPreview }: Props) {
	const photos = usePhotos().data ?? [];
	const { refresh, update, remove, setSlideshow } = usePhotoActions();
	const [show, setShow] = useState<Show>("all");
	const [uploads, setUploads] = useState<Upload[]>([]);
	const [viewing, setViewing] = useState<string | null>(null);
	// Select mode: the photos in the screen saver start out selected; tap to change, then Save selection.
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [confirm, setConfirm] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);

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
		if (add.length)
			await setSlideshow.mutateAsync({ ids: add, inSlideshow: true });
		if (drop.length)
			await setSlideshow.mutateAsync({ ids: drop, inSlideshow: false });
		stopSelecting();
	}

	// Upload pop-up (drop area, or choose from Finder), and a file being dragged over the page.
	const [uploadOpen, setUploadOpen] = useState(false);
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
		// Only images (a dropped folder or document is skipped).
		const images = [...(files ?? [])].filter(
			(f) =>
				f.type.startsWith("image/") ||
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
				const prepared = await preparePhoto(b.file);
				await uploadPhoto(prepared, (f) =>
					set(b.key, { progress: Math.min(0.99, f) }),
				);
				set(b.key, { progress: 1 });
			} catch (e) {
				set(b.key, { error: e instanceof Error ? e.message : String(e) });
			}
		}
		await refresh();
		// Finished ones go away after a moment; failures stay until dismissed.
		setTimeout(
			() => setUploads((u) => u.filter((x) => x.error || x.progress < 1)),
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
					<button className={s.upload} onClick={() => setUploadOpen(true)}>
						+ Upload photos
					</button>
					<input
						ref={input}
						type="file"
						accept="image/*"
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
								<span className={s.uploadBar}>
									<span style={{ width: `${u.progress * 100}%` }} />
								</span>
							)}
						</li>
					))}
				</ul>
			)}

			{photos.length === 0 ? (
				<div className={s.empty}>
					<h2>No photos yet</h2>
					<p>
						Drag photos here, or tap <strong>Upload photos</strong> to choose
						them. Pick which ones the screen saver shows with{" "}
						<strong>Select</strong>.
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
								<img src={p.thumbUrl} alt="" loading="lazy" decoding="async" />
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
						<img key={current.id} src={current.url} alt="" className={s.big} />
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
			{uploadOpen && (
				<>
					<div
						className={sheet.scrim}
						onClick={() => setUploadOpen(false)}
						role="presentation"
					/>
					<div className={sheet.sheet} role="dialog" aria-label="Upload photos">
						<header className={sheet.head}>
							<h2 className={sheet.heading}>Upload photos</h2>
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
							<strong>Drag photos here</strong>
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
						</div>
					</div>
				</>
			)}

			{/* Dragging photos over the page: drop anywhere. */}
			{dragging && !uploadOpen && (
				<div className={s.dropOverlay} aria-hidden="true">
					<div>Drop photos to upload</div>
				</div>
			)}
		</section>
	);
}
