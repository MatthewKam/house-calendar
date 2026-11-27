#!/bin/sh
# Makes the test copy of the site (fly.test.toml), once: the Fly app, its disk, and its secrets from .env. Then
# `npm run deploy:test` puts the checked-out branch on it. Safe to run again: what's there already is left alone,
# and the secrets are sent again.
#
# On the test site: sign in with an emailed code (as on the real one), the admin page for ADMIN_EMAIL. Off: Google
# and Apple sign-in and Google Calendar (tied to sprig-family.com), the AI features, maps lookups, iPhone alerts,
# the old iCloud setup and backups. Turn one on by sending its secret: fly secrets set -a sprig-family-test KEY=…
# ENV_FILE=path/to/.env reads another .env (from a second checkout of the code, say).
set -e
cd "$(dirname "$0")/.."
FLY=$(command -v fly || echo "$HOME/.fly/bin/fly")
APP=sprig-family-test

"$FLY" apps list | grep -q "^$APP " || "$FLY" apps create "$APP"
"$FLY" volumes list -a "$APP" | grep -q test_data || "$FLY" volumes create test_data -a "$APP" --region sjc --size 1 --yes

{
  for k in RESEND_API_KEY EMAIL_FROM ADMIN_EMAIL OWN_EMAILS; do
    v=$(sed -n "s/^$k=//p" "${ENV_FILE:-.env}" | tail -1)
    [ -n "$v" ] && echo "$k=$v"
  done
  echo "PUBLIC_URL=https://$APP.fly.dev"
  # No email service in .env: sign-in codes go to `fly logs -a sprig-family-test`.
  grep -q "^RESEND_API_KEY=." "${ENV_FILE:-.env}" || echo "EMAIL_CODES_IN_LOG=1"
} | "$FLY" secrets import -a "$APP" --stage

echo "The test site is set up. Put the checked-out branch on it: npm run deploy:test"
