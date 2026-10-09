# Desk Hub: design brief

Design the interface for **Desk Hub**, a personal dashboard that lives on my desk. I want several distinct visual directions for the same product. Everything below describes what it has to do and show; the look is open. Please don't treat any wording here as a style instruction.

For each direction, show at least: Home, Focus (idle and running), To do, Wind-down, and Morning brief. Keep the content identical across directions so they can be compared.

## The device

- A Raspberry Pi 5 with a 7-inch touchscreen, mounted **portrait, 720 × 1280 px**. This is the main target.
- Touch only: a finger, no mouse, no hover, no keyboard. Tap targets at least 56 px. Text is typed on an on-screen keyboard that the hub draws itself.
- It sits at arm's length and is glanced at all day, in a bright room and in a dark one. The most important things on each screen must be readable from about a metre away.
- It is always on. From evening until morning it should be calm and dim.
- The Pi is slow at graphics. Avoid live background blur, large drop shadows on many elements, and anything that needs 60 fps full-screen. Simple movement (fades, slides, a few moving elements) is fine and welcome.
- The same interface is also opened on a **phone** (one column) and a **laptop** (wide). Show how the direction adapts, at least for Home.

## Who it's for

One person: a university student who also works on a payments app called PayIt. The hub mixes school, work and personal life. It should feel like a personal object, not an admin panel.

## Navigation

Eight sections, always one tap away: **Home, Focus, To do, PayIt, Mail, Journal, Schedule, Settings**. Plus two controls that are always reachable: **Alerts** (with an unread count) and **Sleep**. To do and Mail can show a count badge. Where this navigation lives and how it looks is up to you.

## Screens

### Home
A glanceable summary. Each block opens its full section when tapped.

- **Time and date**, the largest thing on the screen.
- **Weather**: current temperature and condition, today's high and low, and a small chart of the next 12 hours: rain chance per hour if rain is coming, otherwise the temperature curve. Tapping opens a fuller forecast (hourly, wind, humidity, sunrise, sunset, tomorrow).
- **Focus**: minutes focused today, the timer's current value, and a Start button.
- **PayIt today**: money taken today (the headline number), change versus this time yesterday, number of sales, average ticket, declined payments, platform profit, and a status (all systems up, or N issues).
- **Up next**: the next 3 or 4 calendar events with time and place; one may be "Now".
- **To do**: the top 3 or 4 open tasks with a tick box, due label (Today, Tomorrow, a weekday, Overdue), a steps count like 2/7, an "Add task" button, and sometimes a "3 to review" badge.
- **Mail digest**: a one-sentence headline written by an AI, 2 or 3 bullets, and unread counts per account (Work, School).

### Focus
A Pomodoro-style timer.

- Three modes: Focus, Short break, Long break. Four sessions make a cycle; show which one you're on.
- **Idle**: choose a length (presets 15, 25, 45, 60, 90 minutes, and a way to dial any value by dragging), see when it would end, and Begin.
- **"Working on"**: pick one open task for this session, or "Nothing in particular".
- **Today**: minutes today, sessions today, minutes this week, and a timeline of today's sessions.
- **Running (locked)**: starting a session takes over the whole screen so nothing else distracts.
  - A 3-2-1 "settle in" count first.
  - Then the time left and progress, with Pause/Resume, +5 min, End.
  - If a task was picked: its full title, tag, due date, and **its steps as large tick boxes** to tick off while working, plus "Add a step".
  - Leaving early needs a press-and-hold, so it can't happen by accident.
- **Finished**: a small celebration, minutes done, and one button to start the break (or the next session).

### To do
- Tasks with: title, optional tag (School, PayIt, Personal), optional due date, star, done.
- Each task can have **steps** (subtasks) that are ticked individually. Ticking the last step completes the task, and it should leave the list with a satisfying animation.
- Filters: All open, Due today, each tag, Done.
- **Suggested tasks**: the AI proposes tasks from email. These need a clearly different treatment with Keep / Dismiss.
- A task can carry a note saying an email changed it (for example, a deadline moved), which can be dismissed.
- Add task: text, tag, due date (No date, Today, Tomorrow, Next week).

### PayIt
Read-only business numbers.

- Today's gross volume versus this time yesterday; sales count; average ticket; declined payments; active merchants; platform profit.
- A chart of today by hour and a chart of the last 7 days.
- Split by payment method.
- A list of system checks, each up or down.

### Mail
- **Today's digest** from the AI: headline, bullets, when it was written, and a Redo button.
- Per account (Work, School): unread count and the recent messages, each with sender, age, a one-line AI summary, an urgency flag, and sometimes a suggested action.
- Tapping a message opens a **reader** that shows the email as it was sent, with a loading state and a "Make it a task" button.
- An account can be "not connected yet" with a button to connect it.

### Journal
- **Today's recap** from the AI in the evening: headline, bullets, and "Tomorrow" items.
- **Voice notes**: I talk into a ring and the note appears here. Each shows the cleaned-up note, the time, whether the AI filed it as a **reflection** or a **note**, any tasks it created, and any tasks it marked done. A note can be "being processed".
- A button to type a note instead.

### Schedule
- A seven-day strip to pick a day.
- For the chosen day: a short summary, tasks due that day, and an hour-by-hour timeline of events.

### Settings
Rows of controls: screen brightness, wind-down on/off and start time, sleep time and wake time, digest time, recap time, timer lengths, morning brief on/off, email-to-task on/off, connect school mail, device health (temperature, load, memory, uptime), Refresh, and a two-step Restart.

## States and overlays

- **Morning brief**: at wake time, a full-screen greeting that stays until tapped. It shows the forecast with the 12-hour chart, today's calendar, tasks due today, tasks left over from yesterday, and email not yet dealt with. One button: "Start the day". It should feel like a sunrise, an opening to the day.
- **Wind-down** (from about 10 PM until wake): the home screen becomes a calmer, darker version, and Mail and PayIt are hidden. It shows a large clock, how the day went (N things done, N minutes of focus), tomorrow's events and tasks with tomorrow's weather, "Before you sleep" (tonight's reflections and notes from the ring, or a prompt to speak), and tasks still open. Buttons: "Sleep now" and "Show everything". The clock here is the place for a signature animation, including how the digits change each minute.
- **Sleep**: the screen is almost off, with a very dim clock and tomorrow's first event. One tap lights it briefly and shows a Wake button.
- **Alerts**: toasts that appear over any screen (info, warning, error) and a list of past alerts. Examples: a payment system is down, urgent email, class in 15 minutes, overdue tasks, a voice note was saved.
- **On-screen keyboard**: covers the lower part of the screen, with the field being typed into shown above it and quick-pick options (tags, due dates).
- **Sign-in**: a single password field, shown only on phones and laptops.
- **Empty and loading states** for every list: nothing scheduled, no tasks, mail not connected, "the AI is writing…".

## Time of day

The hub knows sunrise and sunset. It should be easy to read at noon in a bright room and comfortable at 11 PM in a dark one. Show how each direction handles day and night, whether as one look that works for both or as a shift between them.

## Sample content to use

- Time: 9:41 AM, Thursday, October 8. Weather: 74°, partly cloudy, high 81°, low 63°, rain likely around 3 PM.
- PayIt: $1,801 today, up 16% versus yesterday, 47 sales, $38.32 average ticket, 4 declined, $37.09 platform profit, 1 issue.
- Up next: "Dynamics, 9:30 AM, Klaus 1443"; "Merchant onboarding call, 3:00 PM, Zoom"; "Lab 2 report due, 11:58 PM".
- Tasks: "ME 3057 lab report: acoustics" (School, today, 2/4 steps); "Review payout reconciliation" (PayIt, today); "Problem set 4 (Dynamics)" (School, tomorrow); "Reply to Stripe support ticket"; one long title: "Fund Platform Revenue checking account to prevent payment failures on the next payout run".
- Steps for the lab report: "Plot the frequency response", "Write the uncertainty analysis", "Compare measured vs. predicted resonance", "Proofread and export to PDF".
- Mail digest: "Stripe needs your tax ID by Friday, and Lab 2 is now due Thursday night." Work 14 unread, School 5 unread.
- Focus: 25:00, 100 minutes today, 3 sessions, session 2 of 4.
- Voice notes: a reflection, "Long day, but I'm proud of getting the lab plots done."; a note, "Idea for PayIt: show tips as a separate line on the receipt."

## What I'd like back

- 3 or 4 clearly different visual directions, each with a name and one sentence on the idea behind it.
- For each: the screens listed at the top at 720 × 1280, day and night, plus Home on a phone.
- For each: the type choices, colour roles, and how movement is used, including the wind-down clock's minute change.
- Built as HTML and CSS where possible, so the chosen direction can be carried into the real hub.
