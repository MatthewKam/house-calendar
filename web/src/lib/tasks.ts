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

/**
 * Due on this day for this person: on its weekdays, from the day it was added (earlier days aren't
 * missed, it didn't exist yet). A one-time task is due every day until they do it (it shows ticked
 * that day) or its due-by day ends.
 */
export function dueOn(c: Task, d: Date, memberId: string) {
  const day = dayKey(d);
  if (day < dayKey(new Date(c.createdAt))) return false;
  if (!c.dueBy) return c.days.includes(d.getDay());
  const doneOn = c.doneOn[memberId];
  return day <= c.dueBy && (!doneOn || day <= doneOn);
}

/** A one-time task whose due-by day has passed: off the lists (its ticks stay in the history). */
export const expired = (c: Task, today: string) => !!c.dueBy && c.dueBy < today;

/** Did this person do this task on this day? */
export const didTask = (done: TaskDone[], c: Task, memberId: string, day: string) =>
  done.some((d) => d.taskId === c.id && d.memberId === memberId && d.day === day);

/** Whether this person has ticked every required task due on `day` (extras don't count); false if none are due. */
export function requiredDone(tasks: Task[], done: TaskDone[], memberId: string, day: string) {
  const due = tasksFor(tasks, memberId).filter((c) => c.required && dueOn(c, fromDayKey(day), memberId));
  return due.length > 0 && due.every((c) => didTask(done, c, memberId, day));
}

/**
 * Per member: required tasks due on `day` (their own and everyone's) and how many they've ticked off.
 * Extras don't count here; they earn points instead.
 */
export function taskProgress(tasks: Task[], done: TaskDone[], day: string, memberIds: string[]): Map<string, Progress> {
  const out = new Map<string, Progress>();
  for (const id of memberIds) {
    const due = tasksFor(tasks, id).filter((c) => c.required && dueOn(c, fromDayKey(day), id));
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
