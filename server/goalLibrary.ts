import type { Stage } from './stages.ts';
import type { Activity } from './activities.ts';

// The starter goals for ages 2–6 (docs/product-plan.md, "Growing up"): skills practised over time
// and confirmed by a parent once a kid has them. Encouragement, not a checklist of milestones: no
// medical claims, and nothing is ever late or behind. Parents can add their own too.

/** `stages`: the ages it suits; empty for any age (a parent's own). */
export interface GoalTemplate { key: string; title: string; emoji: string; kind: Activity; stages: Stage[] }

const both: Stage[] = ['little', 'early'];
export const GOAL_LIBRARY: GoalTemplate[] = [
  // Little (2–3)
  { key: 'spoon', title: 'Eats with a spoon', emoji: '🥄', kind: 'self_care', stages: ['little'] },
  { key: 'cup', title: 'Drinks from an open cup', emoji: '🥛', kind: 'self_care', stages: ['little'] },
  { key: 'potty', title: 'Uses the potty', emoji: '🚽', kind: 'self_care', stages: ['little'] },
  { key: 'wash-hands', title: 'Washes hands', emoji: '🧼', kind: 'cleanliness', stages: both },
  { key: 'shoes', title: 'Puts on shoes', emoji: '👟', kind: 'self_care', stages: both },
  { key: 'say-feeling', title: 'Says how they feel', emoji: '💛', kind: 'attitude', stages: both },
  { key: 'calm-down', title: 'Calms down with a hug or deep breaths', emoji: '🫧', kind: 'attitude', stages: both },
  { key: 'tidy-toys', title: 'Helps tidy up toys', emoji: '🧸', kind: 'cleanliness', stages: ['little'] },
  { key: 'please-thanks', title: 'Says please and thank you', emoji: '🙏', kind: 'attitude', stages: both },
  { key: 'stairs', title: 'Walks up the stairs', emoji: '🪜', kind: 'bravery', stages: ['little'] },
  { key: 'ball', title: 'Throws and kicks a ball', emoji: '⚽', kind: 'bravery', stages: both },
  { key: 'colors', title: 'Names colors', emoji: '🎨', kind: 'problem_solving', stages: ['little'] },
  { key: 'puzzle', title: 'Finishes a puzzle', emoji: '🧩', kind: 'problem_solving', stages: both },
  // Early (4–6)
  { key: 'dress', title: 'Gets dressed alone', emoji: '👕', kind: 'self_care', stages: ['early'] },
  { key: 'brush-teeth', title: 'Brushes teeth alone', emoji: '🪥', kind: 'cleanliness', stages: ['early'] },
  { key: 'pack-bag', title: 'Packs their own bag', emoji: '🎒', kind: 'self_care', stages: ['early'] },
  { key: 'take-turns', title: 'Takes turns', emoji: '🔄', kind: 'attitude', stages: ['early'] },
  { key: 'lose-kindly', title: 'Loses a game kindly', emoji: '🎲', kind: 'attitude', stages: ['early'] },
  { key: 'try-hard', title: 'Tries something hard', emoji: '💪', kind: 'bravery', stages: ['early'] },
  { key: 'kind-sibling', title: 'Is kind to a brother or sister', emoji: '🫶', kind: 'helpful', stages: ['early'] },
  { key: 'set-table', title: 'Helps set the table', emoji: '🍽️', kind: 'helpful', stages: ['early'] },
  { key: 'feed-pet', title: 'Helps feed a pet', emoji: '🐾', kind: 'helpful', stages: ['early'] },
  { key: 'bike', title: 'Rides a bike', emoji: '🚲', kind: 'bravery', stages: ['early'] },
  { key: 'swim', title: 'Swims a little', emoji: '🏊', kind: 'bravery', stages: ['early'] },
  { key: 'hop', title: 'Hops on one foot', emoji: '🦘', kind: 'bravery', stages: ['early'] },
  { key: 'write-name', title: 'Writes their name', emoji: '✏️', kind: 'problem_solving', stages: ['early'] },
  { key: 'count-20', title: 'Counts to 20', emoji: '🔢', kind: 'problem_solving', stages: ['early'] },
  { key: 'letters', title: 'Knows their letters', emoji: '🔤', kind: 'problem_solving', stages: ['early'] },
];
