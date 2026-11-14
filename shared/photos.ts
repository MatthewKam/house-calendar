// The photo album (server/photos.ts): what the photo routes take and give back, written once. The
// server checks requests against these and the web app imports their types (types only, so zod stays
// out of its bundle). The pictures and videos themselves go up as the request's body.

import { z } from 'zod';

/** A photo's details, in the query beside its JPEG (POST /api/photos). */
export const PhotoUpload = z.object({
	width: z.int().min(1).max(20000),
	height: z.int().min(1).max(20000),
	/** When it was taken (or the file's date), if known. */
	takenAt: z.string().max(40).optional(),
	/** Who added it. */
	memberId: z.string().optional(),
	/** Shown in the screen saver; left out, it is. */
	inSlideshow: z.boolean().optional(),
	/** A photo of a flyer, kept for its events but not shown in the album or screen saver. */
	flyer: z.boolean().optional(),
});
/** A video's details, in the query beside it (POST /api/photos/video). */
export const VideoUpload = PhotoUpload.pick({ takenAt: true, memberId: true, inSlideshow: true });

/** A change to a photo (PATCH /api/photos/:id): any of these, at least one. */
export const PhotoPatch = z.strictObject({ inSlideshow: z.boolean(), memberId: z.string().nullable() }).partial();

/** Photos picked in the album's Select mode. */
const ids = z.array(z.string()).min(1).max(5000);
/** Several in or out of the screen saver at once (POST /api/photos/slideshow). */
export const PhotosInSlideshow = z.strictObject({ ids, inSlideshow: z.boolean() });
/** Several deleted at once (POST /api/photos/delete). */
export const PhotosDelete = z.strictObject({ ids });

/** A photo or video in the album, as the server gives it back. */
export const Photo = z.object({
	id: z.string(),
	width: z.int(),
	height: z.int(),
	/** When it was taken (or the file's date). */
	takenAt: z.string().nullable(),
	/** Who added it. */
	memberId: z.string().nullable(),
	source: z.enum(['upload', 'google']),
	/** Shown in the screen saver. */
	inSlideshow: z.boolean(),
	createdAt: z.string(),
	url: z.string(),
	thumbUrl: z.string(),
	/** A video plays muted, its length at most 45 seconds. */
	kind: z.enum(['photo', 'video']),
	/** A video's length. */
	seconds: z.number().nullable(),
	/** False while a new video is being converted on the server. */
	ready: z.boolean(),
	/** While converting: how far along, 0 to 1 (0 while it waits its turn). */
	progress: z.number().nullable(),
});

export type PhotoPatch = z.infer<typeof PhotoPatch>;
export type Photo = z.infer<typeof Photo>;
