import { execFile } from 'node:child_process';
import type { FastifyBaseLogger } from 'fastify';

/** Runs a Shortcut with macOS's `shortcuts` command. */
export const runShortcut = (name: string) => (): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile('/usr/bin/shortcuts', ['run', name], { timeout: 120_000 }, (err, _out, stderr) =>
      err ? reject(new Error(stderr.trim() || err.message)) : resolve());
  });

/**
 * Runs a Reminders sync on this Mac every few minutes, and a few seconds after a list changes on the
 * wall, so wall changes reach Reminders quickly. Only for a Mac running the wall itself; on the Pi the
 * phones run the Shortcut instead. Runs never overlap: a request during a run starts one more after it.
 */
export function syncRunner(label: string, run: () => Promise<void>, everyMs: number, log: FastifyBaseLogger, soonMs = 5_000) {
  let running = false;
  let again = false;
  let soonTimer: NodeJS.Timeout | undefined;
  let timer: NodeJS.Timeout | undefined;

  async function go() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await run();
    } catch (err) {
      log.warn({ err }, `${label} failed`);
    } finally {
      running = false;
      if (again) {
        again = false;
        void go();
      }
    }
  }

  return {
    start() {
      void go();
      timer = setInterval(() => void go(), everyMs);
      timer.unref();
    },
    /** Run shortly; repeated calls within a few seconds (several ticks in a row) share one run. */
    soon() {
      clearTimeout(soonTimer);
      soonTimer = setTimeout(() => void go(), soonMs);
      soonTimer.unref();
    },
    stop() {
      clearInterval(timer);
      clearTimeout(soonTimer);
    },
  };
}
