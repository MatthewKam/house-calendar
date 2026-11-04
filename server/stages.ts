// Everyone gets a stage from their birthdate (docs/product-plan.md, "Growing up"), which decides how
// they earn: Little gets instant cheers, Early saves stars in jars, and so on. A guardian can pick a
// different stage for a kid it fits better.

export const STAGES = ['little', 'early', 'middle', 'tween', 'teen', 'adult'] as const;
export type Stage = (typeof STAGES)[number];

/** Whole years old on `today` (both YYYY-MM-DD). */
export function ageOn(birthdate: string, today: string) {
  const [by, bm, bd] = birthdate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** The stage for an age: under 4 is Little (babies too), 4–6 Early, 7–10 Middle, 11–14 Tween, 15–17 Teen. */
export function stageForAge(age: number): Stage {
  return age < 4 ? 'little' : age < 7 ? 'early' : age < 11 ? 'middle' : age < 15 ? 'tween' : age < 18 ? 'teen' : 'adult';
}

/** The chosen stage, else the one from the birthdate; null with neither. */
export function stageOf(m: { birthdate: string | null; stage: string | null }, today: string): Stage | null {
  if (m.stage) return m.stage as Stage;
  return m.birthdate ? stageForAge(ageOn(m.birthdate, today)) : null;
}

/** Today on this server's clock, as YYYY-MM-DD. */
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
