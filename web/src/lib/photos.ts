import type { Photo } from './types';

// Getting photos ready in the browser: shrunk to wall size (and a thumbnail) before uploading, so
// big phone photos upload fast and the Pi never has to process images.

const FULL = 2560;
const THUMB = 480;

export interface Prepared {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** When it was taken, from the photo's own data if it has it, else the file's date. */
  takenAt: string;
}

/** A JPEG of the image no bigger than `max` on its long side. */
async function shrink(image: ImageBitmap, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error("Couldn't make a JPEG of this photo");
  return { blob, width, height };
}

/**
 * When a JPEG was taken: cameras and phones store it as text like "2026:10:05 14:22:10" near the
 * start of the file. Read as the display's local time.
 */
async function takenAt(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 128 * 1024).arrayBuffer());
  const text = new TextDecoder('latin1').decode(head);
  const m = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) || +m[1] < 1990 ? null : d.toISOString();
}

export async function preparePhoto(file: File): Promise<Prepared> {
  let image: ImageBitmap;
  try {
    // Turns it the right way up (phones store sideways photos with a "rotate me" note).
    image = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`Can't read ${file.name} (try a JPEG or PNG)`);
  }
  try {
    const full = await shrink(image, FULL, 0.86);
    const thumb = await shrink(image, THUMB, 0.8);
    return {
      full: full.blob, thumb: thumb.blob, width: full.width, height: full.height,
      takenAt: (await takenAt(file)) ?? new Date(file.lastModified || Date.now()).toISOString(),
    };
  } finally {
    image.close();
  }
}

/** Uploads a prepared photo, reporting progress from 0 to 1. */
export function uploadPhoto(p: Prepared, inSlideshow: boolean, onProgress: (f: number) => void): Promise<Photo> {
  const query = new URLSearchParams({ width: String(p.width), height: String(p.height), takenAt: p.takenAt, inSlideshow: String(inSlideshow) });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/photos?${query}`);
    xhr.setRequestHeader('content-type', 'image/jpeg');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new Error('Upload failed (no connection)'));
    xhr.onload = async () => {
      if (xhr.status !== 201) {
        let msg = xhr.statusText;
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {
          // Not JSON.
        }
        return reject(new Error(msg));
      }
      const photo = JSON.parse(xhr.responseText) as Photo;
      // The thumbnail is small; a failure just means the grid shows the full photo.
      await fetch(`/api/photos/${photo.id}/thumb`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: p.thumb }).catch(() => {});
      resolve(photo);
    };
    xhr.send(p.full);
  });
}
