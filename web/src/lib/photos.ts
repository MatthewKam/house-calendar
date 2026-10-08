import type { Photo } from './types';

// Getting photos ready in the browser: shrunk to wall size (and a thumbnail) before uploading, so
// big phone photos upload fast and the Pi never has to process images. Videos go up as they are;
// the server converts them.

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

/** Videos the album takes (iPhone .mov, .mp4 and the like). */
export const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(f.name);

/** Uploads a video as it is (the server converts it), reporting progress from 0 to 1. */
export function uploadVideo(file: File, inSlideshow: boolean, onProgress: (f: number) => void): Promise<Photo> {
  const query = new URLSearchParams({ takenAt: new Date(file.lastModified || Date.now()).toISOString(), inSlideshow: String(inSlideshow) });
  return send(`/api/photos/video?${query}`, file.type || 'video/quicktime', file, onProgress);
}

/** Uploads a prepared photo, reporting progress from 0 to 1. */
export async function uploadPhoto(p: Prepared, inSlideshow: boolean, onProgress: (f: number) => void): Promise<Photo> {
  const query = new URLSearchParams({ width: String(p.width), height: String(p.height), takenAt: p.takenAt, inSlideshow: String(inSlideshow) });
  const photo = await send(`/api/photos?${query}`, 'image/jpeg', p.full, onProgress);
  // The thumbnail is small; a failure just means the grid shows the full photo.
  await fetch(`/api/photos/${photo.id}/thumb`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: p.thumb }).catch(() => {});
  return photo;
}

/** POSTs a file with upload progress (fetch can't report it). */
function send(url: string, type: string, body: Blob, onProgress: (f: number) => void): Promise<Photo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new Error('Upload failed (no connection)'));
    xhr.onload = () => {
      if (xhr.status !== 201) {
        let msg = xhr.statusText;
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {
          // Not JSON.
        }
        return reject(new Error(msg));
      }
      resolve(JSON.parse(xhr.responseText) as Photo);
    };
    xhr.send(body);
  });
}

/**
 * Loads a photo (decoded) or the start of a video before it's shown, so it never appears
 * half-drawn. A video that's slow to start is shown anyway after a few seconds.
 */
export function preload(p: Photo): Promise<void> {
  if (p.kind !== 'video') {
    const img = new Image();
    img.src = p.url;
    return img.decode().catch(() => {});
  }
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 4000);
    v.addEventListener('loadeddata', done, { once: true });
    v.addEventListener('error', done, { once: true });
    v.src = p.url;
  });
}

/** How long a slide stays up: a video plays through once (45 seconds at most); a photo, `photoSeconds`. */
export const slideSeconds = (p: Photo, photoSeconds: number) =>
  p.kind === 'video' && p.seconds ? Math.max(3, p.seconds) : photoSeconds;
