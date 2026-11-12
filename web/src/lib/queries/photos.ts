// The photo album.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Photo } from '../types';
import { showNow, putBack } from './shared';

/** The photo album, newest first. */
export function usePhotos() {
	// Every few seconds while a new video is being converted, so it shows up once it's ready.
	return useQuery({
		queryKey: ['photos'],
		queryFn: api.photos,
		refetchInterval: (q) => (q.state.data?.some((p) => !p.ready) ? 1000 : 5 * 60_000),
	});
}

export function usePhotoActions() {
	const qc = useQueryClient();
	const refresh = () => qc.invalidateQueries({ queryKey: ['photos'] });
	const photos = (apply: (list: Photo[]) => Photo[]) => showNow(qc, [{ key: ['photos'], apply }]);
	return {
		refresh,
		update: useMutation({
			mutationFn: ({ id, patch }: { id: string; patch: { inSlideshow?: boolean; memberId?: string | null } }) =>
				api.updatePhoto(id, patch),
			onMutate: ({ id, patch }) => photos((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p))),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		remove: useMutation({
			mutationFn: (id: string) => api.deletePhoto(id),
			onMutate: (id) => photos((list) => list.filter((p) => p.id !== id)),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		/** Several at once (Select mode). */
		setSlideshow: useMutation({
			mutationFn: ({ ids, inSlideshow }: { ids: string[]; inSlideshow: boolean }) => api.setSlideshow(ids, inSlideshow),
			onMutate: ({ ids, inSlideshow }) =>
				photos((list) => list.map((p) => (ids.includes(p.id) ? { ...p, inSlideshow } : p))),
			onError: putBack(qc),
			onSettled: refresh,
		}),
		removeMany: useMutation({
			mutationFn: (ids: string[]) => api.deletePhotos(ids),
			onMutate: (ids) => photos((list) => list.filter((p) => !ids.includes(p.id))),
			onError: putBack(qc),
			onSettled: refresh,
		}),
	};
}
