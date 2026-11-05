// The six activities moments and goals are grouped by: what a parent catches or a kid works on.

export const ACTIVITIES = ['helpful', 'attitude', 'bravery', 'cleanliness', 'problem_solving', 'self_care'] as const;
export type Activity = (typeof ACTIVITIES)[number];
