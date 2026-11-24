import type { CalendarWriter, EventStore } from './types.ts';
import { currentDetails, deleteOccurrence, editEvent, editSeries, newEvent, seriesDetails } from './icalEdit.ts';

// iCloud's write side for the outbox: each edit reads the event's whole resource, changes its text,
// and writes it back only if it's unchanged since (its etag). The calendar isn't needed: a remoteId is
// the resource's own URL (plus "#<recurrence id>" for one day of a repeat), and a series' id is that URL.

type Version = { etag: string; data: string };
const hrefOf = (remoteId: string) => remoteId.split('#')[0];

export function icalStore(w: CalendarWriter): EventStore {
	return {
		async create(_calendar, remoteId, details) {
			const href = hrefOf(remoteId);
			const uid = href
				.split('/')
				.pop()!
				.replace(/\.ics$/, '');
			// False means it's there already (sent before, but the reply was lost): done either way.
			await w.writeEvent(href, '', newEvent(uid, details));
		},
		async read(_calendar, remoteId) {
			const href = hrefOf(remoteId);
			const res = await w.getEvent(href);
			return res && { details: currentDetails(res.data, href, remoteId), version: res };
		},
		update(_calendar, remoteId, version, changes) {
			const v = version as Version;
			const href = hrefOf(remoteId);
			return w.writeEvent(href, v.etag, editEvent(v.data, href, remoteId, changes));
		},
		remove(_calendar, remoteId, version) {
			const v = version as Version;
			const href = hrefOf(remoteId);
			return w.writeEvent(href, v.etag, deleteOccurrence(v.data, href, remoteId));
		},
		async readSeries(_calendar, seriesId) {
			const res = await w.getEvent(seriesId);
			return res && { details: seriesDetails(res.data), version: res };
		},
		updateSeries(_calendar, seriesId, version, changes) {
			const v = version as Version;
			return w.writeEvent(seriesId, v.etag, editSeries(v.data, changes));
		},
		removeSeries(_calendar, seriesId, version) {
			return w.writeEvent(seriesId, (version as Version).etag, null);
		},
	};
}
