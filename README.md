# Desk Hub

A touchscreen desk dashboard for a Raspberry Pi 5 + Raspberry Pi Touch Display 2 (7", in its native portrait orientation at 720×1280; landscape works too).

| Screen | What it does |
|---|---|
| **Home** | Clock, weather, focus timer, today's to-dos, PayIt today, unread mail, what's up next |
| **Focus** | Pomodoro timer (focus / short / long break), ±5 min, "working on" label pulled from your to-dos, minutes-per-day chart |
| **To do** | Tasks with tags (School / PayIt / Personal), due dates, stars; on-screen keyboard |
| **PayIt** | Gross volume vs. this time yesterday, sales, avg ticket, declines, active merchants, by-hour and 7-day charts, payment-method split, live status from `admin_system_checks` |
| **Mail** | Tap an email to read it as it was sent, images and all (in a sandbox: its scripts can't run and it can't reach the hub). A daily digest from Claude (7:30 by default) of the last 24 hours across all accounts, which is also what Home shows. Below it, unread mail per account, each summarized in one line with an urgency flag and a suggested action. Mail is never marked read. |
| **Tasks from email** | Every hour Claude checks new mail against your to-do list. New work becomes a *suggested* task (Keep / Dismiss) with steps if the email has several parts; an email that changes an existing task (a moved deadline, new requirements) updates it and leaves a note on the task saying what changed. "Make it a task" on any email has Claude read the whole message and write a proper task. Automated mail (security alerts, receipts, newsletters) never becomes a task, and email never completes or deletes one. |
| **Subtasks** | Any task can have steps you tick off. Add them by hand, by voice ("I need to plan the demo: book a room, send invites, prepare slides"), or from an email. |
| **Voice commands** | Besides adding tasks and notes, a voice note can finish things: "mark grocery shopping as completed", "I finished the uncertainty section". |
| **Journal** | Voice notes from the ring (or typed on your phone) and an evening recap of your day from Claude, built from your notes, finished tasks and focus time. Anything you say you need to do is added to To do. |
| **Schedule** | A week view: the selected day's summary and tasks due on top, an hour-by-hour timeline of its events, and a seven-day strip to switch days |
| **Settings** | Brightness, sleep schedule, timer lengths, Pi health |
| **Wind-down** | From 10 PM (adjustable) until wake time, the desk screen dims and warms, and puts mail and PayIt away: just tomorrow's schedule, today's recap, what's still open, and a place to leave a note. Only real problems interrupt. "Show everything" overrides it for the night. |
| **Morning brief** | A sunrise screen at wake time with the forecast, today's calendar and to-dos, anything left from yesterday, and email you haven't dealt with. It stays until you tap it. |
| **Sleep** | Moon button or schedule: backlight drops to ~4% with a dim warm clock and tomorrow's first event; "Screen off" kills the backlight entirely. Tap the sleeping screen and it lights up for six seconds with a glowing Wake button, so it can be found in daylight. A wind-down banner appears 30 min before. |

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

## Use it from your phone or laptop

Open `http://deskhub.local:8080` on any device on the same Wi-Fi. Off the desk screen the hub switches to remote mode: a single-column phone layout, your device's own keyboard, and the moon button becomes a remote control for the desk display instead of dimming your phone. On a phone, "Add to Home Screen" makes it open like an app.

Set `HUB_PASSWORD` in `.env` to require a sign-in from every device except the desk screen itself (remembered for 30 days; five wrong tries locks that address out for 15 minutes). That's required before exposing the hub through a tunnel or public URL: without a password, anything arriving through a proxy is refused.

The focus timer runs in each browser, so a timer started on your phone isn't the one on the desk.

## Connecting your stuff (`.env`)

**PayIt.** The hub can read PayIt two ways:

- *Read-only role (preferred).* `sql/deskhub_reader_role.sql` defines a `deskhub_reader` Postgres login that can read only the columns the hub uses and can't write anything. `scripts/setup-readonly-db.sh` applies it, sets `PAYIT_DATABASE_URL` and `PAYIT_TEST_OWNER_IDS` on the Pi, and removes the service key. **This adds a role and policies to PayIt's production database, so get the team's sign-off before running it.** It never touches the PayIt git repo or its migration history.
- *Service key (fallback).* `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Works with no database change, but that key has full read/write access, so it shouldn't live on the Pi long-term.

Either way the screen only receives totals, and revenue follows the admin panel's rules: businesses owned by team/test accounts and admin-ignored transactions are left out.

**Personal Gmail.** Turn on 2-Step Verification, create an App Password, and put it in `MAIL_1_PASS`.

**School email.** Georgia Tech mail is Microsoft 365, which no longer allows password IMAP logins. Options, easiest first:
- If GT allows it, an Outlook rule that forwards to your Gmail under a label (e.g. `GT`), read with `MAIL_2_MAILBOX=GT` using the same Gmail login.
- Microsoft Graph with OAuth (needs an app registration; GT may require admin consent). Not built yet.

**Summaries and digest.** Set `ANTHROPIC_API_KEY` (starts with `sk-ant-`). Both use Claude Haiku 4.5 by default, the cheapest current model; for a sharper digest only, set `DIGEST_MODEL=claude-sonnet-5-5`. Each email is summarized once and cached by Message-ID. Without a key, mail still shows with a plain preview and there's no digest.

**Calendars.** Set `CALENDAR_FEEDS=Canvas|https://...,Personal|https://...`. Canvas → Calendar → Calendar Feed gives you a link with every assignment due date.

**Voice notes from a Pebble Index 01 ring.** The ring's phone app can POST each recording's transcription to a webhook. Set `HUB_VOICE_TOKEN` to a long random string, then in the Pebble app (Index 01 Settings → Webhook) set the URL to `https://<your hub address>/api/voice`, add a header `Authorization: Bearer <token>`, and send transcription only (audio is accepted but ignored). The app's test event shows a "Ring connected" toast on the hub. The phone sends the request, so the hub has to be reachable from wherever your phone is: a public URL through a tunnel, or Tailscale on the phone. Any tool that can POST `{"text": "..."}` with the same header works too.

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
