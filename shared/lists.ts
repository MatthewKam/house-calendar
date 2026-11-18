// Lists kept in Sprig itself (server/lists.ts): what the server takes and gives back, written once. The
// server checks requests against these and the web app imports their types (types only, so zod stays
// out of its bundle).

import { z } from 'zod';

/** A list's name (POST /api/lists). */
export const ListName = z.strictObject({ title: z.string().min(1).max(100) });
/** A change to a list (PATCH /api/lists/:id): its name, or whether it sorts unchecked first; at least one. */
export const ListPatch = z.strictObject({ ...ListName.shape, sortUnchecked: z.boolean() }).partial();

/** What can be set on an item, with nothing filled in: an edit changes only what it sends. */
const itemFields = {
	title: z.string().min(1).max(300),
	/** When: YYYY-MM-DD (any time that day) or an instant; null: whenever. */
	due: z.string().max(40).nullable(),
	/** Who it's for; null: anyone. */
	memberId: z.string().nullable(),
	/** The section it's under: the recipe it was added for (its name); null: none, with the list's other items. */
	section: z.string().max(100).nullable(),
};

/** A new item (POST /api/lists/:id/items). Left out, it's for anyone, whenever, in no section. */
export const ListItemInput = z.strictObject({
	...itemFields,
	due: itemFields.due.default(null),
	memberId: itemFields.memberId.default(null),
	section: itemFields.section.default(null),
});
/** A change to an item (PATCH /api/lists/items/:id): ticked or not, and any of its fields; at least one. */
export const ListItemPatch = z.strictObject({ done: z.boolean(), ...itemFields }).partial();

/** An item as the server gives it back. */
export const SprigItem = z.object({
	id: z.string(),
	title: z.string(),
	done: z.boolean(),
	due: itemFields.due,
	memberId: itemFields.memberId,
	section: itemFields.section,
	/** When it was ticked (an instant); null while it's open. */
	doneAt: z.string().nullable(),
	/** Who ticked it (a member's id); null while it's open, or not known. */
	doneBy: z.string().nullable(),
});

/** A list as the server gives it back. */
export const SprigList = z.object({
	id: z.string(),
	title: z.string(),
	/** In the order they were added (on a list sorting unchecked first, an unticked one counts from then). */
	items: z.array(SprigItem),
	/** Sort by unchecked first: ticked items go to the bottom, unticked ones back to the end of the rest. Off: items stay in place. */
	sortUnchecked: z.boolean(),
	/** Who is shopping from it together now (Shopping together): members' ids, or null for a device with no one signed in. */
	shopping: z.array(z.string().nullable()),
});

/** The lists, and a stamp of how they are: the same stamp, nothing has changed (GET /api/lists/live). */
export const LiveLists = z.object({ stamp: z.string(), lists: z.array(SprigList) });

export type ListName = z.infer<typeof ListName>;
export type ListPatch = z.infer<typeof ListPatch>;
/** A new item with every field there (what the server has once the defaults are filled in). */
export type ListItemInput = z.output<typeof ListItemInput>;
/** A new item as the web app sends it: what's left out is filled in. */
export type NewListItem = z.input<typeof ListItemInput>;
export type ListItemPatch = z.infer<typeof ListItemPatch>;
export type SprigItem = z.infer<typeof SprigItem>;
export type SprigList = z.infer<typeof SprigList>;
export type LiveLists = z.infer<typeof LiveLists>;
