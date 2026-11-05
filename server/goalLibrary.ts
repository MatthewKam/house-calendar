import type { Stage } from './stages.ts';

// The starter goals for ages 2–6 (docs/product-plan.md, "Growing up"): skills practised over time
// and confirmed by a parent once a kid has them. Encouragement, not a checklist of milestones: no
// medical claims, and nothing is ever late or behind. Parents can add their own too.

export type GoalKind = 'body' | 'feelings' | 'thinking' | 'helping' | 'myself';
export interface GoalTemplate { key: string; title: string; emoji: string; kind: GoalKind; stages: Stage[] }

const both: Stage[] = ['little', 'early'];
export const GOAL_LIBRARY: GoalTemplate[] = [
  // Little (2–3)
  { key: 'spoon', title: 'Eats with a spoon', emoji: '🥄', kind: 'myself', stages: ['little'] },
  { key: 'cup', title: 'Drinks from an open cup', emoji: '🥛', kind: 'myself', stages: ['little'] },
  { key: 'potty', title: 'Uses the potty', emoji: '🚽', kind: 'myself', stages: ['little'] },
  { key: 'wash-hands', title: 'Washes hands', emoji: '🧼', kind: 'myself', stages: both },
  { key: 'shoes', title: 'Puts on shoes', emoji: '👟', kind: 'myself', stages: both },
  { key: 'say-feeling', title: 'Says how they feel', emoji: '💛', kind: 'feelings', stages: both },
  { key: 'calm-down', title: 'Calms down with a hug or deep breaths', emoji: '🫧', kind: 'feelings', stages: both },
  { key: 'tidy-toys', title: 'Helps tidy up toys', emoji: '🧸', kind: 'helping', stages: ['little'] },
  { key: 'please-thanks', title: 'Says please and thank you', emoji: '🙏', kind: 'helping', stages: both },
  { key: 'stairs', title: 'Walks up the stairs', emoji: '🪜', kind: 'body', stages: ['little'] },
  { key: 'ball', title: 'Throws and kicks a ball', emoji: '⚽', kind: 'body', stages: both },
  { key: 'colors', title: 'Names colors', emoji: '🎨', kind: 'thinking', stages: ['little'] },
  { key: 'puzzle', title: 'Finishes a puzzle', emoji: '🧩', kind: 'thinking', stages: both },
  // Early (4–6)
  { key: 'dress', title: 'Gets dressed alone', emoji: '👕', kind: 'myself', stages: ['early'] },
  { key: 'brush-teeth', title: 'Brushes teeth alone', emoji: '🪥', kind: 'myself', stages: ['early'] },
  { key: 'pack-bag', title: 'Packs their own bag', emoji: '🎒', kind: 'myself', stages: ['early'] },
  { key: 'take-turns', title: 'Takes turns', emoji: '🔄', kind: 'feelings', stages: ['early'] },
  { key: 'lose-kindly', title: 'Loses a game kindly', emoji: '🎲', kind: 'feelings', stages: ['early'] },
  { key: 'try-hard', title: 'Tries something hard', emoji: '💪', kind: 'feelings', stages: ['early'] },
  { key: 'kind-sibling', title: 'Is kind to a brother or sister', emoji: '🫶', kind: 'helping', stages: ['early'] },
  { key: 'set-table', title: 'Helps set the table', emoji: '🍽️', kind: 'helping', stages: ['early'] },
  { key: 'feed-pet', title: 'Helps feed a pet', emoji: '🐾', kind: 'helping', stages: ['early'] },
  { key: 'bike', title: 'Rides a bike', emoji: '🚲', kind: 'body', stages: ['early'] },
  { key: 'swim', title: 'Swims a little', emoji: '🏊', kind: 'body', stages: ['early'] },
  { key: 'hop', title: 'Hops on one foot', emoji: '🦘', kind: 'body', stages: ['early'] },
  { key: 'write-name', title: 'Writes their name', emoji: '✏️', kind: 'thinking', stages: ['early'] },
  { key: 'count-20', title: 'Counts to 20', emoji: '🔢', kind: 'thinking', stages: ['early'] },
  { key: 'letters', title: 'Knows their letters', emoji: '🔤', kind: 'thinking', stages: ['early'] },
];
