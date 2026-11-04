#!/bin/sh
# Sends the settings from .env that the hosted app needs to Fly as secrets (encrypted there, never in
# the code). Run from the project folder after `fly launch`: deploy/set-secrets.sh
set -e
cd "$(dirname "$0")/.."
APP=$(sed -n 's/^app = "\(.*\)"/\1/p' fly.toml)
KEYS="ICLOUD_APPLE_ID ICLOUD_APP_PASSWORD ANTHROPIC_API_KEY GOOGLE_MAPS_API_KEY REMINDERS_TOKEN
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_APP_CLIENT_IDS APPLE_SERVICE_ID APPLE_APP_IDS RESEND_API_KEY EMAIL_FROM"

{
  for k in $KEYS; do
    v=$(sed -n "s/^$k=//p" .env | tail -1)
    [ -n "$v" ] && echo "$k=$v"
  done
  echo "PUBLIC_URL=https://$APP.fly.dev"
  # Same key as here, so connected Google accounts keep working after the move.
  [ -f data/secret.key ] && echo "SECRET_KEY=$(cat data/secret.key)"
  # No email service yet: sign-in codes go to `fly logs`.
  grep -q '^RESEND_API_KEY=.' .env || echo "EMAIL_CODES_IN_LOG=1"
} | fly secrets import --stage

echo "Secrets staged for $APP; they take effect on the next deploy."
fly secrets list
