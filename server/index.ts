import { resolve } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { createSync } from './sync.ts';
import { ICloudSource } from './providers/icloud.ts';
import { claudeClassifier } from './people.ts';
import { googleRoutes } from './travel.ts';
import { runShortcut, syncRunner } from './shortcut.ts';
import { macRemindersSync } from './macReminders.ts';

const root = resolve(import.meta.dirname, '..');

// Credentials live in .env (see .env.example). Without it, the calendar runs local-only.
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const db = openDb(process.env.DB_PATH ?? resolve(root, 'data/calendar.db'));
const { ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD, ANTHROPIC_API_KEY } = process.env;
// With an Anthropic key, Claude sorts synced events by person (titles go to the Anthropic API).
const classify = ANTHROPIC_API_KEY ? claudeClassifier() : null;
const sync = ICLOUD_APPLE_ID && ICLOUD_APP_PASSWORD
  ? createSync(db, new ICloudSource(ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD), classify)
  : null;
// On a Mac running the wall itself, the server can sync Reminders: directly (REMINDERS_MAC=1), or by
// running a Shortcut (REMINDERS_SHORTCUT names it). On the Pi, phones run the Shortcut instead.
let reminders: ReturnType<typeof syncRunner> | null = null;
const app = buildApp(db, {
  webDist: resolve(root, 'web/dist'),
  sync: sync?.status,
  onAssignmentsChanged: () => void sync?.assignPeople(),
  remindersToken: process.env.REMINDERS_TOKEN || undefined,
  onRemindersChanged: () => reminders?.soon(),
  travel: process.env.GOOGLE_MAPS_API_KEY ? googleRoutes(process.env.GOOGLE_MAPS_API_KEY) : undefined,
});
sync?.start(app.log);
if (process.platform === 'darwin' && (process.env.REMINDERS_MAC === '1' || process.env.REMINDERS_SHORTCUT)) {
  const minutes = Number(process.env.REMINDERS_MINUTES ?? process.env.REMINDERS_SHORTCUT_MINUTES) || 5;
  reminders = process.env.REMINDERS_MAC === '1'
    ? syncRunner('Reminders sync', macRemindersSync(db), minutes * 60_000, app.log)
    : syncRunner(`The "${process.env.REMINDERS_SHORTCUT}" Shortcut`, runShortcut(process.env.REMINDERS_SHORTCUT!), minutes * 60_000, app.log);
  reminders.start();
}

// Localhost only by default. Set HOST=0.0.0.0 to reach it from phones on your Wi-Fi;
// there is no login yet, so only do that on a network you trust.
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);

app.listen({ host, port }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    sync?.stop();
    reminders?.stop();
    await app.close();
    db.close();
    process.exit(0);
  });
}
