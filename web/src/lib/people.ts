import type { Stage } from "./types";

// Small things about the family's people, used across the app.

/** A kid: anyone with a stage that isn't grown up (no stage: not set up as a kid). */
export const isKid = (m: { stage: Stage | null }) => m.stage !== null && m.stage !== "adult";

/** The first part of someone's name ("Tayen Kam" → "Tayen"). */
export const firstName = (name: string) => name.split(" ")[0];
