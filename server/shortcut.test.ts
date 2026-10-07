import { describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { syncRunner } from './shortcut.ts';

const log = { warn: vi.fn() } as unknown as FastifyBaseLogger;

describe('syncRunner', () => {
  it('runs on start, then on a timer, and soon after wall changes, without overlapping', async () => {
    vi.useFakeTimers();
    let finish = () => {};
    const run = vi.fn(() => new Promise<void>((r) => (finish = r)));
    const runner = syncRunner('Reminders sync', run, 60_000, log, 5_000);
    runner.start();
    expect(run).toHaveBeenCalledTimes(1);
    // Three ticks in a row share one run, which waits for the first to finish.
    runner.soon();
    runner.soon();
    runner.soon();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    runner.stop();
    vi.useRealTimers();
  });

  it('logs a failed run and keeps going', async () => {
    const run = vi.fn(async () => {
      throw new Error('no such shortcut');
    });
    const runner = syncRunner('Reminders sync', run, 60_000, log);
    runner.start();
    await vi.waitFor(() => expect(log.warn).toHaveBeenCalled());
    runner.stop();
  });
});
