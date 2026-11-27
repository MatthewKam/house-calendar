# Restoring a backup

What to do when data on the hosted app (Fly.io, `sprig-family`) is lost or broken. Steps 1–3 of each case were
tried on the live app on 2026-11-27 without changing it; the times below are from that drill.

`fly` is `~/.fly/bin/fly` on the owner's Mac. Every command takes `-a sprig-family`.

## The two kinds of backup

| Backup                  | What's in it                                          | How far back                                                      | Where                   |
| ----------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- | ----------------------- |
| Litestream              | Every database: `accounts.db`, each household's `calendar.db` | To the second, but only back to the last **midnight UTC** (4 PM Pacific) | Tigris bucket `sprig-family-backups`, under `backups/<path in /data>` |
| Fly volume snapshots    | The whole disk: databases, photos, videos, `vapid.json` | One a day (about 20:00 UTC), kept 14 days                        | Fly, `fly volumes snapshots list <volume>` |

So: a database broken in the last few hours → Litestream. Anything older, or photos → a snapshot.

Litestream keeps one full copy a day (taken at 00:00 UTC) and the changes after it. A time before that copy
answers "no matching backup files available". Just after 4 PM Pacific, it can only go back minutes; use a
snapshot for anything earlier.

## Before anything: look, don't touch

The server has no `sqlite3`; check databases with Node from `/app` (it has `better-sqlite3`). Restore into
`/tmp` first, check it, and only then put it back.

The Litestream commands need the bucket's address, not the config file: `litestream restore -config
/app/deploy/litestream.yml /data/accounts.db` answers "database not found in config", because the config names a
folder, not each database. Inside `fly ssh console`:

```sh
Q="?endpoint=$AWS_ENDPOINT_URL_S3&region=auto"
U="s3://$BUCKET_NAME/backups/households/<id>/calendar.db$Q"   # or backups/accounts.db, backups/calendar.db

litestream ltx -level all "$U"                                # what's there, and when
litestream restore -o /tmp/r.db "$U"                          # the latest (4–16 s each in the drill)
litestream restore -timestamp 2026-11-27T16:00:00Z -o /tmp/r.db "$U"   # as it was then (UTC)
```

Check it (any of the restored files):

```sh
cd /app && node -e '
const D = require("better-sqlite3"), db = new D("/tmp/r.db", { readonly: true });
console.log(db.pragma("integrity_check", { simple: true }));   // "ok"
console.log(db.prepare("SELECT count(*) n FROM events").get());'
```

Which household is which: `accounts.db`'s `households` table has each one's `db_file`, relative to `/data`. The
household from before accounts is `calendar.db`.

## Case 1: one household's data is wrong (a bad change, a bug)

1. Restore that household's database to `/tmp` at a time before it went wrong, and check it (above).
2. Restore every **other** database at the latest, into the same folder layout:
   `/tmp/stage/accounts.db`, `/tmp/stage/households/<id>/calendar.db`, and so on, with the fixed one in its place.
3. `tar -czf /data/import.tgz -C /tmp/stage .` then, from the Mac, `fly apps restart`. On starting,
   `deploy/start.sh` removes every database and unpacks the archive, the same way `deploy/upload-data.sh`
   moves data in. Photos aren't touched.
4. Open the app as that household and check, then `fly logs` for errors.

Changes made in the seconds between step 2 and the restart are lost. A quiet time is best.

## Case 2: everything is lost (the disk is gone or the server won't start)

Fastest: a new disk from last night's snapshot, then today's database changes on top from Litestream.

1. `fly volumes snapshots list <volume id>`; pick the latest.
2. `fly volumes create household_data --snapshot-id <vs_…> --region sjc --size 3 --yes` (22 s in the drill).
3. Move the app onto it: `fly machine destroy <old id> --force`, then `fly deploy` (it makes a machine and
   takes the new disk, which has the name in `fly.toml`).
4. The databases on it are from the snapshot's time. Bring them up to now with Case 1, steps 2–3, using the
   latest of everything.
5. Destroy the old disk only once the app is right (`fly volumes destroy <old>`).

If the disk can't be had at all, Litestream alone brings back every database (Case 1 onto a new empty disk), but
not photos or `vapid.json`. The push keys are also Fly secrets, so phone alerts keep working.

## Case 3: photos are lost

Photos are only in the snapshots, so a lost photo can come back as of last night, not later.

1. A disk from the snapshot: `fly volumes create restore_drill --snapshot-id <vs_…> --region sjc --size 3 --yes`.
2. A throwaway machine with it: `fly machine run alpine:3.20 sleep 3600 --name restore-drill --region sjc
   --volume <vol id>:/restore --restart no`. The photos are under `/restore/photos` and
   `/restore/households/<id>/photos`.
3. Copy what's missing across. The two machines can't share a disk, so go through the Mac:
   `fly ssh sftp get … --machine <drill id>`, then `fly ssh sftp put …` to the live one.
4. Clean up: `fly machine destroy <drill id> --force`, then `fly volumes destroy <vol id> --yes`.

If the machine won't start with "insufficient resources … with existing volume", the disk landed on a full
host. Destroy the disk and make it again (it lands elsewhere). That happened in the drill.

## Not tried yet

The drill restored into `/tmp` and a throwaway disk; it never put anything back on the live server. Case 1
step 3 and Case 2 step 3 are untried. In particular, whether Litestream carries on cleanly after its databases are
swapped under it: if `fly logs` shows Litestream errors after a restore, remove that database's
`.calendar.db-litestream` (or `.accounts.db-litestream`) folder and restart, so it starts a fresh copy. Rehearse
these on a test copy of the site before they're needed.
