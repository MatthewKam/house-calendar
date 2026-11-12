import type { Stage } from "./types";

// Small things about the family's people, used across the app.

/** A kid: anyone with a stage that isn't grown up (no stage: not set up as a kid). */
export const isKid = (m: { stage: Stage | null }) => m.stage !== null && m.stage !== "adult";

/** The first part of someone's name ("Tayen Kam" → "Tayen"). */
export const firstName = (name: string) => name.split(" ")[0];

/** Kids this old and up, on their own device, pick their own accent and ask for a new color (server/members.ts). */
export const OLDER_KID_AGE = 7;

/** Old enough for that on `day` (YYYY-MM-DD), by their birthday. */
export function isOlderKid(m: { birthdate: string | null }, day: string) {
	if (!m.birthdate) return false;
	const age = Number(day.slice(0, 4)) - Number(m.birthdate.slice(0, 4)) - (day.slice(5) < m.birthdate.slice(5) ? 1 : 0);
	return age >= OLDER_KID_AGE;
}
