import { dayKey, fromDayKey } from './dates';
import type { Task, TaskCategory, TaskDone, TaskTime } from './types';

export const CATEGORIES: { id: TaskCategory; label: string; hint: string }[] = [
  { id: 'non_negotiable', label: 'Daily', hint: 'Must be done every day it\'s due; always counts toward the bar.' },
  { id: 'chores', label: 'Chores', hint: 'Jobs around the house.' },
  { id: 'bonus', label: 'Bonus', hint: 'Extra jobs for stars; never required.' },
];
export const categoryLabel = (c: TaskCategory) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

/** Parts of the day, in the order the Tasks page lists them. */
export const TIMES: { id: TaskTime | null; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: null, label: 'Anytime' },
  { id: 'evening', label: 'Evening' },
];

/** How a kid is doing on one day's tasks. */
export interface Progress { due: number; done: number }

/** A person's tasks: their own, plus the ones for everyone. */
export const tasksFor = (tasks: Task[], memberId: string) =>
  tasks.filter((c) => c.memberId === memberId || c.memberId === null);

/** Due on its weekdays, from the day it was added (earlier days aren't missed, it didn't exist yet). */
export const dueOn = (c: Task, d: Date) => c.days.includes(d.getDay()) && dayKey(d) >= dayKey(new Date(c.createdAt));

/** Did this person do this task on this day? */
export const didTask = (done: TaskDone[], c: Task, memberId: string, day: string) =>
  done.some((d) => d.taskId === c.id && d.memberId === memberId && d.day === day);

/** Whether this person has ticked every task due on `day` (required ones and extras); false if none are due. */
export function allTasksDone(tasks: Task[], done: TaskDone[], memberId: string, day: string) {
  const weekday = fromDayKey(day).getDay();
  const due = tasksFor(tasks, memberId).filter((c) => c.days.includes(weekday));
  return due.length > 0 && due.every((c) => didTask(done, c, memberId, day));
}

/**
 * Per member: required tasks due on `day` (their own and everyone's) and how many they've ticked off.
 * Extras don't count here; they earn points instead.
 */
export function taskProgress(tasks: Task[], done: TaskDone[], day: string, memberIds: string[]): Map<string, Progress> {
  const weekday = fromDayKey(day).getDay();
  const out = new Map<string, Progress>();
  for (const id of memberIds) {
    const due = tasksFor(tasks, id).filter((c) => c.required && c.days.includes(weekday));
    if (due.length) out.set(id, { due: due.length, done: due.filter((c) => didTask(done, c, id, day)).length });
  }
  return out;
}

/** 0-100, for filling a name button. */
export const percent = (p?: Progress) => (p && p.due ? Math.round((p.done / p.due) * 100) : 0);

/** Icons to pick from for a task, roughly grouped: routines, chores, school, activities, pets, rewards. */
export const TASK_ICONS = [
  '🦷', '🛏️', '🚿', '🛁', '👕', '🧦', '👟', '🧴', '💊', '😴',
  '🍽️', '🧽', '🧺', '🗑️', '🧹', '🪴', '🧸', '🚗', '🛒', '📦',
  '📚', '✏️', '🎒', '🎹', '🎻', '🎨', '🧮', '💻', '📖', '🗣️',
  '⚽', '🏀', '🏊', '🚴', '🤸', '🥋', '🐶', '🐱', '🐟', '⭐',
];

/** Quick titles in the task sheet, each with a matching icon. */
export const QUICK_TASKS: { title: string; icon: string }[] = [
  { title: 'Make bed', icon: '🛏️' },
  { title: 'Brush teeth', icon: '🦷' },
  { title: 'Get dressed', icon: '👕' },
  { title: 'Feed the pet', icon: '🐶' },
  { title: 'Set the table', icon: '🍽️' },
  { title: 'Clear dishes', icon: '🧽' },
  { title: 'Tidy room', icon: '🧸' },
  { title: 'Homework', icon: '📚' },
];
