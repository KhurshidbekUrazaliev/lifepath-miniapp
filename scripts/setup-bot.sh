#!/bin/sh
# Points the bot at the deployed Worker. Run it after `npx wrangler secret put BOT_TOKEN`; safe to run again.
#   sh scripts/setup-bot.sh [--photo] [https://lifepath.<subdomain>.workers.dev]
# It makes fresh WEBHOOK_SECRET and SETUP_KEY secrets (never printed or saved anywhere), then asks the
# Worker to set the webhook, the commands, the descriptions and the menu button (POST /admin/setup).
# --photo also uploads design/bot-avatar.jpg as the bot's profile photo (each upload adds a photo).
set -eu
PHOTO=0
if [ "${1:-}" = "--photo" ]; then PHOTO=1; shift; fi
APP_URL="${1:-https://lifepath.khurshidbekdev.workers.dev}"

WEBHOOK_SECRET=$(openssl rand -hex 32)
SETUP_KEY=$(openssl rand -hex 32)
printf %s "$WEBHOOK_SECRET" | npx wrangler secret put WEBHOOK_SECRET >/dev/null
printf %s "$SETUP_KEY" | npx wrangler secret put SETUP_KEY >/dev/null
echo "Secrets set. Waiting for the Worker to pick them up..."

RESULT=""
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  sleep 5
  RESULT=$(curl -s --max-time 20 -X POST -H "Authorization: Bearer $SETUP_KEY" "$APP_URL/admin/setup" || true)
  case "$RESULT" in *'"calls"'*) break ;; esac
done
echo "$RESULT"
case "$RESULT" in *'"ok":true'*) echo "Bot is set up." ;; *) echo "Setup did not finish; run the script again." >&2; exit 1 ;; esac

if [ "$PHOTO" = 1 ]; then
  curl -s --max-time 30 -X POST -H "Authorization: Bearer $SETUP_KEY" -H "content-type: image/jpeg" \
    --data-binary @design/bot-avatar.jpg "$APP_URL/admin/photo"
  echo
fi
