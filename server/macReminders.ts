import { execFile } from 'node:child_process';
import type { DB } from './db.ts';
import { applySnapshot, claimPending } from './reminders.ts';

/** Runs a JavaScript for Automation script with osascript, passing it JSON and reading JSON back. */
function jxa<T>(script: string, input: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, JSON.stringify(input)], { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      (err, out, stderr) => {
        if (err) return reject(new Error(stderr.trim() || err.message));
        try {
          resolve(JSON.parse(out) as T);
        } catch {
          reject(new Error(`Unexpected reply from Reminders: ${out.slice(0, 120)}`));
        }
      });
  });
}

// Every list, with the titles of its open reminders. Asking for just the open ones keeps it fast:
// fetching every reminder ever completed can take minutes.
const READ = `function run() {
  const R = Application("Reminders");
  return JSON.stringify(R.lists().map((l) => ({ name: l.name(), open: l.reminders.whose({ completed: false }).name() })));
}`;

// Applies the wall's changes; returns the ids it managed to apply.
const APPLY = `function run(argv) {
  const R = Application("Reminders");
  const done = [];
  for (const c of JSON.parse(argv[0])) {
    try {
      const list = R.lists.whose({ name: c.list })()[0];
      if (!list) continue;
      if (c.op === "add") {
        list.reminders.push(R.Reminder({ name: c.title }));
      } else if (c.op === "rename") {
        const match = list.reminders.whose({ name: c.title, completed: false })();
        if (match.length) match[0].name = c.newTitle;
      } else {
        const match = list.reminders.whose({ name: c.title, completed: c.op !== "complete" })();
        if (match.length) match[0].completed = c.op === "complete";
      }
      done.push(c.id);
    } catch (e) {}
  }
  return JSON.stringify(done);
}`;

export interface MacReminders {
  read(): Promise<{ name: string; open: string[] }[]>;
  apply(changes: { id: number; op: string; list: string; title: string; newTitle?: string | null }[]): Promise<number[]>;
}

const osascriptReminders: MacReminders = {
  read: () => jxa(READ, null),
  apply: (changes) => jxa(APPLY, changes),
};

/**
 * Syncs this Mac's Reminders with the wall directly (no Shortcut): sends the wall's changes to Reminders,
 * then replaces the wall's copy with every list, empty ones included. macOS asks once for permission to
 * control Reminders. On the Pi, phones run the Shortcut instead.
 */
export function macRemindersSync(db: DB, device = 'Mac', reminders: MacReminders = osascriptReminders) {
  return async () => {
    const changes = claimPending(db, device);
    const applied = changes.length ? await reminders.apply(changes) : [];
    const lists = await reminders.read();
    applySnapshot(db, device, lists.flatMap((l) => l.open.map((title) => ({ list: l.name, title }))), applied, new Date(),
      lists.map((l) => l.name));
  };
}
