# LifePath — Telegram Mini App

Plan goals, build daily habits and tasks, and watch yourself grow, inside Telegram.
Open it from [@LifePathAppBot](https://t.me/LifePathAppBot).

- **Home** with the verse of the day, today's progress ring and focus
- **Goals** in life areas, logged progress, proof, milestones and a smart planner
- **Habits** with weekday schedules and streaks; **Tasks** and a **Calendar** with a "now" line
- **Analytics** and **Progress**: XP, levels, badges, Echo (your companion) and the Sparks shop
- **Rankings** (opt-in) and **LifePath Plus**, paid in Telegram Stars
- Reminders from the bot, in English, O'zbekcha or Русский, in dark and light themes

It grew out of [LifePath](https://github.com/KhurshidbekUrazaliev/lifepath) and reuses its rules for XP, levels, streaks and progress.

## How it fits together

| Part | Where | What it does |
| --- | --- | --- |
| Front end | `src/` | React 19 + Vite. Your data lives in Telegram Cloud Storage, so it follows you to every device. |
| Server | `worker/` | One Cloudflare Worker: serves the app, answers `/api/*`, takes the bot's webhook at `/tg/webhook`, and sends reminders from a cron every minute. |
| Database | `migrations/` | Cloudflare D1. Only what the bot needs: reminder times, the ranking profile and score, Plus payments. |

The Worker checks every API call against Telegram's signed `initData`, so nobody can act for someone else.

## Develop

```bash
npm install
npm run dev            # the app on http://localhost:5183, without the server
```

With the server (reminders, rankings, Plus), against a fake Telegram:

```bash
cp .dev.vars.example .dev.vars
npx wrangler d1 migrations apply lifepath --local
npm run mock:telegram  # terminal 1: a stand-in for the Bot API on :8799
npm run worker:dev     # terminal 2: the Worker on :8787 (Vite proxies /api to it)
npm run dev            # terminal 3
```

Add `?demo=1` to the address to load example data.

## Test

```bash
npm test               # rules, habits, storage codec and translation coverage
npm run typecheck      # app and Worker
npm run build && npm run test:worker   # the Worker end to end against the fake Telegram
```

## Deploy (Cloudflare free plan)

```bash
npx wrangler login
npx wrangler d1 migrations apply lifepath --remote   # after adding a migration
npm run deploy                                       # build and deploy
```

First time only:

1. Create the bot in [@BotFather](https://t.me/BotFather), then save its token where only the Worker can read it: `npx wrangler secret put BOT_TOKEN`.
2. `sh scripts/setup-bot.sh --photo` makes the webhook secret and setup key, sets the webhook, commands, descriptions and menu button in three languages, and uploads `design/bot-avatar.jpg` as the bot's photo.
3. In @BotFather: *Bot Settings → Configure Mini App → Enable Mini App*, with the Worker's address.

Everything runs on Cloudflare's free tier: Workers (100,000 requests a day), D1, Workers Logs and cron triggers. Plus payments arrive as Telegram Stars in the bot's balance.
