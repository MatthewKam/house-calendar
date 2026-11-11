import { describe, expect, it } from 'vitest';
import { bornYearsAgo, household } from './testing.ts';
import { localDay } from './stages.ts';

// Today at home, so tasks added now are due today.
const TODAY = localDay();

function setup() {
  const h = household([{ id: 'nolan', name: 'Nolan', birthdate: bornYearsAgo(2) }]);
  const day = async () => (await h.call('GET', `/api/learn?today=${TODAY}`)).body[0].today;
  const play = () => h.call('POST', '/api/learn/nolan/done', { today: TODAY, game: 'pop', level: 1, rounds: 3, firstTry: 3 });
  const change = (body: object) => h.call('POST', '/api/learn/nolan/today', { today: TODAY, ...body });
  return { ...h, day, play, change };
}

describe("Learn's day", () => {
  it('opens once the Daily tasks are done, or a grown-up unlocks it; a grown-up can lock it', async () => {
    const { call, day, change } = setup();
    await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true });
    // No Daily tasks: open.
    expect(await day()).toMatchObject({ why: null, tasksDone: true, unlocked: null });

    const task = (await call('POST', '/api/tasks', { title: 'Brush teeth', memberId: 'nolan', days: [0, 1, 2, 3, 4, 5, 6], category: 'non_negotiable' })).body;
    // A chore or a goal doesn't hold it back; a Daily task does.
    await call('POST', '/api/tasks', { title: 'Tidy toys', memberId: 'nolan', days: [0, 1, 2, 3, 4, 5, 6], category: 'chores' });
    expect(await day()).toMatchObject({ why: 'tasks', tasksDone: false });
    await call('PUT', `/api/tasks/${task.id}/done/nolan/${TODAY}`);
    expect(await day()).toMatchObject({ why: null, tasksDone: true });

    // A grown-up locks it, then puts it back to following the tasks; or unlocks it before they're done.
    expect((await change({ open: false })).body.today).toMatchObject({ why: 'locked', unlocked: false });
    expect((await change({ open: null })).body.today).toMatchObject({ why: null, unlocked: null });
    await call('DELETE', `/api/tasks/${task.id}/done/nolan/${TODAY}`);
    expect((await change({ open: true })).body.today).toMatchObject({ why: null, unlocked: true });
  });

  it('allows two games a day unless set, and more from a grown-up', async () => {
    const { call, day, play, change } = setup();
    await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true });
    await play();
    expect(await day()).toMatchObject({ played: 1, games: 2, why: null });
    await play();
    expect(await day()).toMatchObject({ played: 2, games: 2, why: 'games' });
    // Two more, from a grown-up.
    expect((await change({ moreGames: true })).body.today).toMatchObject({ games: 4, why: null });
    // Their own number a day.
    expect((await call('PUT', '/api/learn/nolan', { today: TODAY, gamesADay: 1 })).body.today).toMatchObject({ gamesADay: 1, games: 3 });
    expect((await call('PUT', '/api/learn/nolan', { today: TODAY, gamesADay: 0 })).status).toBe(400);
  });

  it('keeps to a time limit, when there is one, and more minutes from a grown-up', async () => {
    const { call, day, change } = setup();
    await call('PUT', '/api/learn/nolan', { today: TODAY, enabled: true, minutesADay: 10 });
    const time = (seconds: number) => call('POST', '/api/learn/nolan/time', { today: TODAY, seconds });
    await time(300);
    expect(await day()).toMatchObject({ seconds: 300, minutes: 10, why: null });
    await time(300);
    expect(await day()).toMatchObject({ seconds: 600, why: 'time' });
    expect((await change({ moreMinutes: true })).body.today).toMatchObject({ minutes: 25, why: null });
    // No time limit again.
    expect((await call('PUT', '/api/learn/nolan', { today: TODAY, minutesADay: null })).body.today).toMatchObject({ minutes: null, why: null });
    expect((await time(601)).status).toBe(400);
  });
});
