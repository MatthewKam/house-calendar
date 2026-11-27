#!/bin/sh
# Puts the checked-out code (any branch, with what's not committed yet) on the test site: sprig-family-test.fly.dev.
# The real site is deployed as before, with `fly deploy`. Set the test site up first: deploy/test-site.sh
set -e
cd "$(dirname "$0")/.."
FLY=$(command -v fly || echo "$HOME/.fly/bin/fly")
"$FLY" deploy --config fly.test.toml "$@"
echo "On the test site: https://sprig-family-test.fly.dev ($(git branch --show-current))"
