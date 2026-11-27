// What the admin page (web/src/components/admin) gets from GET /api/admin/overview (server/hosted/admin.ts).
// Households by number only: no names, emails or anything they put in.

/** Whose a household is: yours (your own sign-in, or the household from before accounts), one of your test
 *  accounts', App Review's, a site demo, or a real family's (null). */
export type HouseholdTag = 'you' | 'test' | 'review' | 'demo' | null;

export interface AdminHousehold {
	/** Its anonymous number, which stays the same. */
	number: number;
	tag: HouseholdTag;
	createdAt: string;
	guardians: number;
	kids: number;
	devices: { user: number; device: number; wall: number };
	/** When any of its devices was last used. */
	lastActive: string | null;
}

/** One household's day: from the usage log (server/usage.ts). */
export interface AdminDay {
	day: string;
	household: number;
	/** Changes made, all kinds. */
	changes: number;
	active: { user: number; device: number; wall: number };
}

export interface AdminUse {
	/** "POST /api/tasks/:id/done" */
	route: string;
	household: number;
	count: number;
}

export interface AdminCrash {
	id: string;
	source: 'app' | 'server';
	message: string;
	stack: string | null;
	place: string | null;
	platform: string | null;
	version: string | null;
	device: string | null;
	count: number;
	firstAt: string;
	lastAt: string;
	/** The households that saw it, by number. */
	households: number[];
}

export interface AdminOverview {
	/** The days covered (UTC), oldest first. */
	from: string;
	to: string;
	households: AdminHousehold[];
	/** Accounts made each day (UTC), not counting demos, with the household tag of the one they're in. */
	signUps: { day: string; tag: HouseholdTag }[];
	days: AdminDay[];
	/** Changes over the last 30 days, by route and household. */
	uses: AdminUse[];
	crashes: AdminCrash[];
}
