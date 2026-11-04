#!/bin/sh
# Copies this machine's data (accounts, your household, photos) to the hosted app, replacing what's
# there. Run from the project folder: deploy/upload-data.sh
# Stop `npm run dev` first, so nothing changes mid-copy.
set -e
cd "$(dirname "$0")/.."
[ -f data/accounts.db ] || { echo "No data/accounts.db here"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Databases: a clean copy of each (their -wal changes included), not the live files.
(cd data && find . -name '*.db') | while read -r db; do
  mkdir -p "$TMP/stage/$(dirname "$db")"
  sqlite3 "data/$db" ".backup '$TMP/stage/$db'"
done
# Households' files must be relative to the data folder (the app makes them so whenever it starts).
if [ "$(sqlite3 "$TMP/stage/accounts.db" "SELECT COUNT(*) FROM households WHERE db_file LIKE '/%'")" != 0 ]; then
  echo "Start the app here once (npm run dev), stop it, then run this again."; exit 1
fi
# Photos and videos. The encryption key goes up as a Fly secret instead (SECRET_KEY).
rsync -a --exclude '*.db' --exclude '*.db-wal' --exclude '*.db-shm' --exclude 'secret.key' data/ "$TMP/stage/"
tar -czf "$TMP/import.tgz" -C "$TMP/stage" .
echo "Uploading $(du -h "$TMP/import.tgz" | cut -f1)…"

fly ssh sftp put "$TMP/import.tgz" /data/import.tgz
# The app imports it as it starts (deploy/start.sh).
fly apps restart
echo "Done. Check it with: fly logs"
