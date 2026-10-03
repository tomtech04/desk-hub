# Desk Hub

A touchscreen desk dashboard for a Raspberry Pi 5 + Raspberry Pi Touch Display 2 (7", in its native portrait orientation at 720×1280; landscape works too).

| Screen | What it does |
|---|---|
| **Home** | Clock, weather, focus timer, today's to-dos, PayIt today, unread mail, what's up next |
| **Focus** | Pomodoro timer (focus / short / long break), ±5 min, "working on" label pulled from your to-dos, minutes-per-day chart |
| **To do** | Tasks with tags (School / PayIt / Personal), due dates, stars; on-screen keyboard |
| **PayIt** | Gross volume vs. this time yesterday, sales, avg ticket, declines, active merchants, by-hour and 7-day charts, payment-method split, live status from `admin_system_checks` |
| **Mail** | A daily digest from Claude (7:30 by default) of the last 24 hours across all accounts, which is also what Home shows. Below it, unread mail per account, each summarized in one line with an urgency flag and a suggested action. Mail is never marked read. |
| **Suggested tasks** | Urgent emails and the digest's picks become *suggested* tasks in To do, each with Keep / Dismiss. Nothing counts as a real task until you keep it, and each email is suggested at most once. |
| **Schedule** | Next 7 days from Canvas / Google / Outlook calendar feeds |
| **Settings** | Brightness, sleep schedule, timer lengths, Pi health |
| **Sleep** | Moon button or schedule: backlight drops to ~4% with a dim warm clock and tomorrow's first event; "Screen off" kills the backlight entirely. Tap to wake. A wind-down banner appears 30 min before. |

Anything that needs attention (PayIt system down, lots of declines, urgent mail, a class starting in 15 min, overdue tasks, Pi overheating, a source failing to load) shows up as a toast + chime and in the bell drawer.

## Try it on your Mac

```bash
npm install
npm run demo
```

Open http://localhost:8080 (size the window to 720×1280 to match the display).

## Put it on the Pi

1. Flash Raspberry Pi OS (64-bit, Desktop) with SSH enabled and a hostname like `deskhub`. Leave the Touch Display 2 in its default portrait orientation; the layout adapts automatically if you ever rotate it.
2. From this Mac: `bash scripts/deploy.sh <user>@deskhub.local`
3. On the Pi: `cd desk-hub && bash scripts/install-pi.sh`, then fill in `.env` and `sudo reboot`.

After that, `deploy.sh` pushes updates. Logs: `journalctl -u desk-hub -f`.

The server listens on your LAN, so you can also open `http://deskhub.local:8080` on your phone to add tasks with a real keyboard.

## Connecting your stuff (`.env`)

**PayIt.** Run `bash scripts/setup-readonly-db.sh` from your Mac. It creates the `deskhub_reader` Postgres role (POS-App migration `20261002000001_deskhub_reader_role.sql`), which can read only the columns the hub uses and can't write anything. It then sets `PAYIT_DATABASE_URL` and `PAYIT_TEST_OWNER_IDS` on the Pi and removes the service key. Revenue follows the admin panel's rules: businesses owned by team/test accounts and admin-ignored transactions are left out. The admin panel's service key (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) still works as a fallback, but it has full database access.

**Personal Gmail.** Turn on 2-Step Verification, create an App Password, and put it in `MAIL_1_PASS`.

**School email.** Georgia Tech mail is Microsoft 365, which no longer allows password IMAP logins. Options, easiest first:
- If GT allows it, an Outlook rule that forwards to your Gmail under a label (e.g. `GT`), read with `MAIL_2_MAILBOX=GT` using the same Gmail login.
- Microsoft Graph with OAuth (needs an app registration; GT may require admin consent). Not built yet.

**Summaries and digest.** Set `ANTHROPIC_API_KEY` (starts with `sk-ant-`). Both use Claude Haiku 4.5 by default, the cheapest current model; for a sharper digest only, set `DIGEST_MODEL=claude-sonnet-5-5`. Each email is summarized once and cached by Message-ID. Without a key, mail still shows with a plain preview and there's no digest.

**Calendars.** Set `CALENDAR_FEEDS=Canvas|https://...,Personal|https://...`. Canvas → Calendar → Calendar Feed gives you a link with every assignment due date.

**Push your own alerts.** Anything on your network can put a card on the hub:

```bash
curl -X POST http://deskhub.local:8080/api/notify -H 'Content-Type: application/json' \
  -d '{"level":"error","source":"payit","title":"Payout failed","body":"Merchant 123"}'
```

Set `HUB_NOTIFY_TOKEN` to require a bearer token.

## Ideas for next

- **PayIt pushes.** Have the `hourly-system-check` edge function or Stripe webhooks call `/api/notify` (via a Cloudflare Tunnel) so failures arrive instantly instead of on the 60-second poll.
- **App Store / EAS.** TestFlight build status, crash-free rate, EAS Update rollouts.
- **Now playing.** Spotify controls on the home screen.
- **Habits.** Water, gym, sleep streaks, tapped once a day.
- **Study stats.** Focus minutes per class, linked to Canvas due dates ("Lab 2 due in 2 days, 45 min logged").
- **Morning brief.** At wake time, a summary card of today's classes, due work, weather, and overnight PayIt numbers.
- **Presence.** Wake from sleep when you sit down (a PIR sensor on the GPIO, about $3).
- **Room sensors.** Temperature / CO₂ with an SCD41 on I²C, plus a nudge to open a window when CO₂ gets high during a study session.
