import { resolve } from 'node:path';
import { openDb } from './db.ts';
import { buildApp } from './app.ts';
import { createSync } from './sync.ts';
import { ICloudSource } from './providers/icloud.ts';
import { claudeClassifier } from './people.ts';
import { googleRoutes } from './travel.ts';
import { googlePlaces } from './places.ts';
import { runShortcut, syncRunner } from './shortcut.ts';
import { macRemindersSync } from './macReminders.ts';
import { fromStored, openAccounts, relativizePaths, type HouseholdRow } from './accounts.ts';
import { householdRegistry } from './households.ts';
import { adoptLegacy, buildServer } from './hosted.ts';
import { appleVerifier, googleVerifier, resendSender, type SendCode } from './identity.ts';
import { googleOAuth } from './providers/google.ts';
import { googleCalendars } from './googleSync.ts';
import { icloudCalendars } from './icloudSync.ts';
import { loadKey, sealer } from './secrets.ts';
import { loadVapid, webPusher } from './push.ts';
import { claudeUnderstand } from './capture.ts';
import { combineStatus } from './sync.ts';

const root = resolve(import.meta.dirname, '..');

// Credentials live in .env (see .env.example).
try {
  process.loadEnvFile(resolve(root, '.env'));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}

const env = process.env;
const dataDir = env.DATA_DIR ?? resolve(root, 'data');
const accounts = openAccounts(resolve(dataDir, 'accounts.db'));
relativizePaths(accounts, dataDir);
const list = (s?: string) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);

// With an Anthropic key, Claude sorts synced events by person (titles go to the Anthropic API).
const classify = env.ANTHROPIC_API_KEY ? claudeClassifier() : null;
// With it too, Say it and Snap a flyer read what's said or photographed (sent to the Anthropic API).
const understand = env.ANTHROPIC_API_KEY ? claudeUnderstand() : undefined;
// Drive times and address suggestions are the service's own key, for every household.
const travel = env.GOOGLE_MAPS_API_KEY ? googleRoutes(env.GOOGLE_MAPS_API_KEY) : undefined;
const places = env.GOOGLE_MAPS_API_KEY ? googlePlaces(env.GOOGLE_MAPS_API_KEY) : undefined;
// Each person connects their own Google Calendar: the same Google client as signing in, plus its secret.
const oauth = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? googleOAuth(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET) : undefined;
const secrets = sealer(loadKey(env.SECRET_KEY, resolve(dataDir, 'secret.key')));
// Alerts on phones: the server's own push keys (VAPID_*), or a key file made on first start.
const push = webPusher(loadVapid({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }, resolve(dataDir, 'vapid.json')),
  env.VAPID_SUBJECT || (env.PUBLIC_URL?.startsWith('https://') ? env.PUBLIC_URL : 'mailto:alerts@sprig.example'));

const households = householdRegistry((h) => {
  const db = openDb(fromStored(dataDir, h.db_file));
  // The household from before accounts keeps the .env iCloud and Reminders setup. Every household
  // connects its own: Google sign-in per person, and iCloud with an app-specific password.
  const legacy = h.legacy === 1;
  const sync = legacy && env.ICLOUD_APPLE_ID && env.ICLOUD_APP_PASSWORD
    ? createSync(db, new ICloudSource(env.ICLOUD_APPLE_ID, env.ICLOUD_APP_PASSWORD), classify)
    : null;
  // On a Mac running the wall itself, the server can sync Reminders: directly (REMINDERS_MAC=1), or by
  // running a Shortcut (REMINDERS_SHORTCUT names it). On the Pi, phones run the Shortcut instead.
  let reminders: ReturnType<typeof syncRunner> | null = null;
  let google: ReturnType<typeof googleCalendars> | null = null;
  let icloud: ReturnType<typeof icloudCalendars> | null = null;
  const app = buildApp(db, {
    photosDir: fromStored(dataDir, h.photos_dir),
    sync: () => combineStatus([...(sync ? [sync.status] : []), ...(google?.statuses() ?? []), ...(icloud?.statuses() ?? [])]),
    // Started just below, once the app's logger exists.
    google: oauth ? { list: () => google?.list() ?? [], remove: (id) => google?.remove(id) ?? Promise.resolve(false) } : undefined,
    icloud: {
      list: () => icloud?.list() ?? [],
      remove: (id) => icloud?.remove(id) ?? Promise.resolve(false),
      connect: (c) => icloud!.connect(c),
    },
    onAssignmentsChanged: () => {
      void sync?.assignPeople();
      void google?.assignPeople();
      void icloud?.assignPeople();
    },
    // Any household can connect iCloud, so edits to its calendars can always be sent back.
    syncedEdits: {
      soon: () => {
        if (sync?.canWrite) sync.soon();
        icloud?.soon();
      },
    },
    remindersToken: legacy ? env.REMINDERS_TOKEN || undefined : undefined,
    onRemindersChanged: () => reminders?.soon(),
    onMemberRemoved: (memberId) => {
      accounts.prepare('DELETE FROM memberships WHERE household_id = ? AND member_id = ?').run(h.id, memberId);
      // Their connections went with them.
      google?.refresh();
      icloud?.refresh();
    },
    travel,
    places,
    push,
    understand,
  });
  sync?.start(app.log);
  if (oauth) {
    google = googleCalendars(db, { oauth, sealer: secrets, classify, log: app.log });
    google.refresh();
  }
  icloud = icloudCalendars(db, { sealer: secrets, classify, log: app.log });
  icloud.refresh();
  if (legacy && process.platform === 'darwin' && (env.REMINDERS_MAC === '1' || env.REMINDERS_SHORTCUT)) {
    const minutes = Number(env.REMINDERS_MINUTES ?? env.REMINDERS_SHORTCUT_MINUTES) || 5;
    reminders = env.REMINDERS_MAC === '1'
      ? syncRunner('Reminders sync', macRemindersSync(db), minutes * 60_000, app.log)
      : syncRunner(`The "${env.REMINDERS_SHORTCUT}" Shortcut`, runShortcut(env.REMINDERS_SHORTCUT!), minutes * 60_000, app.log);
    reminders.start();
  }
  return {
    app, db,
    google: google ?? undefined,
    async close() {
      sync?.stop();
      google?.stop();
      icloud?.stop();
      reminders?.stop();
      await app.close();
      db.close();
    },
  };
});

// Without an email service, codes are printed in the server's log: while developing, or when hosted
// with EMAIL_CODES_IN_LOG=1 (a trial, where you read them out of `fly logs`). RESEND_API_KEY sends them.
const sendCode: SendCode | undefined = env.RESEND_API_KEY && env.EMAIL_FROM
  ? resendSender(env.RESEND_API_KEY, env.EMAIL_FROM)
  : env.NODE_ENV !== 'production' || env.EMAIL_CODES_IN_LOG === '1'
    ? async (email, code) => console.log(`Sign-in code for ${email}: ${code}`)
    : undefined;

const server = buildServer(accounts, households, {
  dataDir,
  webDist: resolve(root, 'web/dist'),
  google: env.GOOGLE_CLIENT_ID ? { clientId: env.GOOGLE_CLIENT_ID, verify: googleVerifier([env.GOOGLE_CLIENT_ID, ...list(env.GOOGLE_APP_CLIENT_IDS)]) } : undefined,
  apple: env.APPLE_SERVICE_ID ? { clientId: env.APPLE_SERVICE_ID, verify: appleVerifier([env.APPLE_SERVICE_ID, ...list(env.APPLE_APP_IDS)]) } : undefined,
  sendCode,
  googleCalendar: oauth,
  publicUrl: env.PUBLIC_URL || undefined,
  // Hosted behind the host's HTTPS proxy: TRUST_PROXY=1.
  trustProxy: env.TRUST_PROXY === '1' ? true : 'loopback',
});

// The household from before accounts (data/calendar.db) is kept; claim it with the code this logs.
adoptLegacy(accounts, dataDir, env.DB_PATH ?? resolve(dataDir, 'calendar.db'), env.PHOTOS_DIR ?? resolve(dataDir, 'photos'),
  (msg) => server.app.log.warn(msg));
// Every household's calendars sync from the start, not only once someone signs in. (Fine while there
// are a few households; with many, this would start them as they're used.)
for (const h of accounts.prepare('SELECT * FROM households').all() as HouseholdRow[]) {
  households.get(h).catch((err) => server.app.log.error(err));
}

// Localhost only by default. Set HOST=0.0.0.0 to reach it from phones on your Wi-Fi, or when hosted.
const host = env.HOST ?? '127.0.0.1';
const port = Number(env.PORT ?? 3000);

server.app.listen({ host, port }).catch((err) => {
  server.app.log.error(err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await server.close();
    accounts.close();
    process.exit(0);
  });
}
