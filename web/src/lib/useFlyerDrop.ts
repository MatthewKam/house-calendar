import { useEffect, useState } from 'react';

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const isImage = (f: File) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name);

/**
 * Snap a flyer by dragging its photo onto the page (computers, and tablets side by side with Files or
 * Photos). While `enabled`, a file dragged over the window shows the drop area (`dragging`); a dropped
 * image goes to `onFlyer`, anything else to `onOther` (to say it wasn't a photo).
 */
export function useFlyerDrop(enabled: boolean, onFlyer: (photo: File) => void, onOther: () => void) {
	const [dragging, setDragging] = useState(false);
	useEffect(() => {
		if (!enabled) {
			setDragging(false);
			return;
		}
		// Entering and leaving fire for every element passed over; the count says when it's really gone.
		let depth = 0;
		const enter = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			depth++;
			setDragging(true);
		};
		const over = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.dataTransfer!.dropEffect = 'copy';
		};
		const leave = () => {
			depth = Math.max(0, depth - 1);
			if (!depth) setDragging(false);
		};
		const drop = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			// Kept from the browser, which would otherwise open the file in place of the app.
			e.preventDefault();
			depth = 0;
			setDragging(false);
			const photo = [...e.dataTransfer!.files].find(isImage);
			if (photo) onFlyer(photo);
			else onOther();
		};
		window.addEventListener('dragenter', enter);
		window.addEventListener('dragover', over);
		window.addEventListener('dragleave', leave);
		window.addEventListener('drop', drop);
		return () => {
			window.removeEventListener('dragenter', enter);
			window.removeEventListener('dragover', over);
			window.removeEventListener('dragleave', leave);
			window.removeEventListener('drop', drop);
		};
	}, [enabled, onFlyer, onOther]);
	return dragging;
}
