#!/bin/sh
# Starts the hosted app. Runs on the server (see Dockerfile); data lives on the volume at $DATA_DIR.
set -e
DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR"

# Moving data in (deploy/upload-data.sh): an archive put at $DATA_DIR/import.tgz replaces the
# databases and photos, before anything opens them. Then it's removed.
if [ -f "$DATA_DIR/import.tgz" ]; then
  echo "Importing $DATA_DIR/import.tgz"
  find "$DATA_DIR" -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' | xargs rm -f
  tar -xzf "$DATA_DIR/import.tgz" -C "$DATA_DIR"
  rm "$DATA_DIR/import.tgz"
fi

# The app runs as the image's own `node` user, not root: a break-in can't touch the system or other
# files. The volume comes mounted as root's, so anything on it not yet node's (the first start, an
# import, files made over `fly ssh`) is handed over, then this script starts again as node.
if [ "$(id -u)" = 0 ]; then
  find "$DATA_DIR" ! -user node -exec chown -h node:node {} +
  exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node "$0" "$@"
fi

APP="node --import tsx server/index.ts"
# With a storage bucket (fly storage create), Litestream copies every database to it as it changes,
# and runs the app; without one, just the app.
if [ -n "$BUCKET_NAME" ]; then
  exec litestream replicate -config /app/deploy/litestream.yml -exec "$APP"
fi
exec $APP
