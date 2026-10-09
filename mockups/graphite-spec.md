# Paste everything below this line into ChatGPT (or Codex / Claude Code)

Attach the three files from `designs/` if your tool accepts attachments. They are working HTML prototypes of the target look and behaviour. Open them in a browser to see every screen. The spec below is complete without them.

---

You are working in my repository **tomtech04/desk-hub** (branch `main`). It is a personal touchscreen dashboard that runs on a **Raspberry Pi 5 with the 7" Touch Display 2, portrait 720 × 1280, touch only, always on**. The same web app also opens on my laptop and phone. Key files: `public/app.css` (all styling; the last "GLASS" block overrides an earlier flat-dark layer), `public/app.js` (views rendered as HTML strings, the `ICONS` map, sky logic `applySky`), `public/stars.js` (wind-down dot-matrix clock), `public/keyboard.js` (touch keyboard), `README.md`.

**Goal:** replace the current "glass panels over a blurred colour sky" look with a new look called **Graphite**, add three features (ring voice-note widget, journal day archive with search and day notes, adjustable text size), and add a proper **desktop layout** that controls the Pi. Keep my data sources, routes and server logic. Change only presentation and add the small endpoints listed below. Don't add a framework. Stay in vanilla JS, render HTML strings like the existing code does, and keep the Pi fast (no `backdrop-filter`, no big blurs, animate only `transform`/`opacity`).

Work in this order and commit after each step:
1. Add `public/graphite.css` with the tokens and classes in §2. Load it after `app.css`, then delete the GLASS block and the sky/wall styles from `app.css`.
2. Restyle every Pi screen per §3–§4.
3. Add text size (§5), dot clocks (§6), the ring widget (§7) and the journal archive (§8).
4. Add the desktop workstation (§9) and desk-control endpoints (§10).
5. Update the Pi kiosk setup and README per §11.

At the end, list every file you changed and any TODO where my existing data didn't match a field below.

## 1. Design principles
- The base is a near-black graphite. Panels are **solid, opaque** surfaces with a 1px border. No translucency, no blur, no shadows on panels. This is what keeps it crisp on the Pi's display.
- Colour comes from **short, saturated 135° gradients**, used sparingly: card icon tiles, progress rings, chart bars, the active nav item, primary action buttons, and a thin gradient outline on AI cards. The one big gradient is the hero clock card on Home.
- Every section owns one gradient: Focus = amber, To do = yellow-amber, PayIt = mint-teal, Mail/Claude = violet-pink, Journal = pink-peach, Schedule = periwinkle-violet. Home and Settings are white.
- The type is **Geist** for UI and **Geist Mono** for small labels, timestamps, units and metadata. Big numerals use tabular figures with tight tracking.
- Primary buttons are solid near-white with dark ink. Secondary buttons are `#1F232A` with a `#2C313A` border.
- No emoji. The only glyphs are ▲ ▼ ⇧ ⌫ − + and curly quotes.
- Copy stays plain, second person and sentence case, as it is now ("Nothing left open. Nice.", "All clear. Nice.", "Claude is reading the last 24 hours of mail…").

## 2. Tokens and base classes (`public/graphite.css`)
```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap');
:root{
  --ts:1.15;                       /* text scale, 1.00–1.40, set from settings */
  --bg:#0C0E12; --rail:#0F1115; --panel:#15181D; --panel-2:#1C2027; --control:#1F232A;
  --line:#232831; --line-soft:#20242B; --border-control:#2C313A; --track:#22262D;
  --text:#F2F4F7; --text-2:#AEB5C1; --text-3:#8C94A1; --muted:#7A8290; --faint:#5C6370;
  --amber:#FFB547; --mint:#6EF0B4; --mint-2:#5EE6B0; --coral:#FF7A7A; --blue:#8AB4FF; --violet:#C59CFF; --pink:#FF9DB0;
  --g-focus:linear-gradient(135deg,#FFC65C 0%,#FF7A45 100%);
  --g-tasks:linear-gradient(135deg,#FFE07A 0%,#FFAE45 100%);
  --g-money:linear-gradient(135deg,#6EF0B4 0%,#1FB5C9 100%);
  --g-mail:linear-gradient(135deg,#C59CFF 0%,#FF8DB9 100%);
  --g-journal:linear-gradient(135deg,#FF9DB0 0%,#FF9354 100%);
  --g-cal:linear-gradient(135deg,#8AB4FF 0%,#8C7BFF 100%);
  --g-bad:linear-gradient(135deg,#FF9A8A 0%,#FF5F6D 100%);
  --hero-day:linear-gradient(140deg,#1C44B0 0%,#2C6FD0 52%,#1B93A8 100%);
  --hero-dusk:linear-gradient(140deg,#3B2377 0%,#93407A 55%,#D9683E 100%);
  --hero-payit:linear-gradient(145deg,#0E5C52 0%,#0F3F45 55%,#12262E 100%);
  --ease:cubic-bezier(.2,.8,.2,1); --ease-pop:cubic-bezier(.2,1.4,.4,1); --ease-finish:cubic-bezier(.4,0,.2,1);
  --mono:'Geist Mono',ui-monospace,monospace;
}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{background:var(--panel);border:1px solid var(--line);border-radius:24px;padding:18px 20px}
.card.ai{border:1px solid transparent;background:linear-gradient(var(--panel),var(--panel)) padding-box,linear-gradient(135deg,rgba(197,156,255,.7),rgba(255,141,185,.5)) border-box}
.card.ai.journal{background:linear-gradient(var(--panel),var(--panel)) padding-box,linear-gradient(135deg,rgba(255,157,176,.7),rgba(255,147,84,.5)) border-box}
.card-h{display:flex;align-items:center;gap:10px}
.card-h .tile{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;color:#0C0E12}
.card-h .title{font-size:calc(17px*var(--ts));font-weight:600;color:#D4D9E1}
.card-h .meta{margin-left:auto;font-family:var(--mono);font-size:calc(13px*var(--ts));color:var(--muted)}
.row{border-top:1px solid var(--line-soft);min-height:56px;display:flex;align-items:center;gap:12px}
.mono{font-family:var(--mono)}
.btn{height:52px;padding:0 22px;border-radius:16px;font-size:calc(18px*var(--ts));font-weight:600;border:0;display:inline-flex;align-items:center;gap:8px}
.btn.primary{background:var(--text);color:#0C0E12}
.btn.secondary{background:var(--control);border:1px solid var(--border-control);color:var(--text);font-weight:500}
.btn.focus{background:var(--g-focus);color:#1A0F05}
.check{width:30px;height:30px;border-radius:50%;border:2px solid #3A404B;background:transparent;display:grid;place-items:center;color:#06231A}
.check.on{border-color:transparent;background:var(--g-money)}
.chip{height:44px;padding:0 16px;border-radius:14px;background:var(--panel);border:1px solid #2A2F38;color:#D4D9E1;font-size:calc(16px*var(--ts));font-weight:500}
.chip.on{background:var(--text);border-color:var(--text);color:#0C0E12}
.seg{display:flex;gap:4px;padding:4px;background:var(--panel);border:1px solid var(--line);border-radius:18px}
.seg button{height:48px;border-radius:14px;background:transparent;color:var(--text-2)} .seg button.on{background:var(--text);color:#0C0E12}
.toggle{width:60px;height:36px;border-radius:18px;background:#2A2F38;position:relative} .toggle.on{background:var(--g-focus)}
.toggle::after{content:"";position:absolute;top:4px;left:4px;width:28px;height:28px;border-radius:50%;background:#fff;transition:left .2s var(--ease)} .toggle.on::after{left:28px}
.sheet{position:absolute;left:0;right:0;bottom:0;background:var(--panel);border-top:1px solid #2A2F38;border-radius:34px 34px 0 0;padding:14px 24px 28px;animation:up .3s var(--ease) both}
.scrim{position:absolute;inset:0;background:rgba(4,5,7,.72)}
@keyframes up{from{transform:translateY(48px);opacity:0}to{transform:none;opacity:1}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes load{from{transform:translateX(-100%)}to{transform:translateX(300%)}}
@keyframes rise{from{transform:translateY(60px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes ringping{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.7);opacity:0}}
@keyframes pop{from{transform:translateY(10px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@keyframes shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
```
**Every body-text `font-size` of 28px or less must be written as `calc(Npx * var(--ts))`.** Display numerals (clock, timer, money, temperature, 3-2-1 count) don't scale. Radii: hero 28, cards 24, sheets 34, buttons 16–20, chips 14, keys 13, icon tiles 11, tags 6–8. Gaps: 14px between cards, 16px page padding.

## 3. Pi frame (720 × 1280)
A column with three parts:
- **Status bar, 56px.** Padding `0 18px 0 24px`. On the left: an 8px mint dot, then mono 14px `#7A8290` "deskhub · 52°C · {current view}" (use the real CPU temperature). On the right: an alerts button (44px tall, radius 14, `#171A1F`, 1px `#232831` border, coral bell icon and count) and a 44px sleep button with the moon icon.
- **Main.** Padding `2px 16px 14px`.
- **Rail, 104px.** Background `#0F1115`, 1px top border `#1F232A`, docked to the bottom. It holds 8 equal items: Home, Focus, To do, PayIt, Mail, Journal, Schedule, Settings. Each item is a 62×44 pill (radius 14) holding a 25px icon, with a 12px label underneath. The active pill takes that section's gradient with a `#0C0E12` icon; inactive icons are `#8C94A1` and labels `#6F7785`. Badges are coral `#FF5F6D` pills, 22px high, with a 2px rail-coloured border, sitting top-right of the pill. To do's badge counts tasks due today or overdue plus suggestions. During wind-down, hide PayIt and Mail.

Icons: keep my existing `ICONS` map (24×24, 2px stroke, round caps). Add `search: <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`.

## 4. Pi screens
Every card header is a 34px gradient icon tile, then the title, then mono metadata on the right. Lists use 1px `#20242B` row dividers and no row backgrounds. Page headers (every screen except Home) are 60px tall: a 36px/600 title with −.025em tracking on the left, and the primary action on the right.

**Home.** A 2-column grid with rows `288px auto auto 1fr` and a 14px gap. Rows grow with text size, and cards hide overflow.
1. **Hero (spans both columns, radius 28, `--hero-day` by day and `--hero-dusk` after about 4 PM).** Two faint decorative circle outlines (1px white at .12–.16 alpha) sit off the top-right corner. On the left: the **dot-matrix clock (§6, white)**, then a small mono AM/PM tag (white at .18 alpha) next to "Thursday, October 8" (21px/500). On the right: the weather icon (42px), the temperature (62px/500), the condition (18px), and mono "H 81° · L 63° · 70% rain". Along the bottom, behind a 1px white-.24 rule: 6 hourly columns, each a mono time label above an hour temperature in 20px/600. Tapping the hero opens the weather sheet.
2. **Focus card.** A 90px ring (9px stroke, amber gradient, `#22262D` track), "25:00" at 42px/600, mono "Ends 10:06 AM", and a full-width 52px "Start focus" button using the focus gradient with a play icon. Tapping the card opens Focus. The button starts Focus lock.
3. **PayIt card.** Header status "● 1 issue" in amber. "$1,801" at 50px/600, then a mint "▲ 16%" pill (`rgba(94,230,176,.14)` background, `#6EF0B4` text). Below: "vs. $1,553 yesterday by now" in 14px `#8C94A1`. Then a 4-column stat row: sales, avg, declined (amber), profit (mint), with mono 11px labels.
4. **Up next (spans both).** Three 48px rows: a mono time (blue `#8AB4FF` when it's "Now"), the title at 18px/500, and the location in mono 13px on the right.
5. **To do.** A header + button, then up to 4 rows (56px): a round check, the task text on one line, and the due label in mono 12px (Today amber, Overdue coral, others `#AEB5C1`).
6. **Mail digest (`.card.ai`).** The headline at 18px/500, two bullet points (5px violet dots, 14px `#AEB5C1`), and footer counts "Work 14 · School 5" as mono tags.

**Focus.** The focus/short/long segmented control and 4 cycle dots at the top. Then a large card containing a −/+ pair of 60px round buttons around a **400px dial**. The dial is a 16px gradient ring plus 60 tick marks; ticks inside the progress are `#FF9A50`, the rest `#2E333B`. Inside the dial: mono "SESSION 2 OF 4", the time at 96px/600, and "Ends …". Below it: 5 round 66px presets (focus 15/25/45/60/90, breaks 3/5/10/15/20; the selected one uses the focus gradient), then a 340×64 "Begin" button. Then a "WORKING ON" card that opens a sheet for picking a task. Then a stats card showing min today · sessions · min this week, with a session strip (14px track from 7 AM to 11 PM, amber gradient segments, white "now" tick).

**Focus lock (fullscreen).** Background `radial-gradient(90% 50% at 50% 0%, rgba(255,140,70,.16), transparent 70%), #0A0B0E`.
- **Settle:** mono "SETTLE IN", then a 3-2-1 count at 380px with amber gradient text.
- **Run:** a 380px ring with the time at 92px. Under it, the task card with steps (58px rows with checks) and "Add a step". Then Pause/Resume, +5 min and End pills (60px). Then a "Hold to leave early" button, 300×54, which fills coral over 1s while held.
- **Done:** a 110px mint gradient check that pops in, "Nice work", "N minutes of focus · X today", the cycle dots, then "Start 5 min break" and "Done for now".

**To do.** Header with "Add". When there are suggestions, a `.card.ai` "Suggested from email" card lists each one with Keep (white) and ✕. Below it, filter chips: All open, Due today, School, PayIt, Personal, Done. Then a list card with 68px rows: a 34px check, the text with mono meta underneath (tag colour square: School `#8AB4FF`, PayIt `#5EE6B0`, Personal `#C59CFF`; due; "2/4 steps"; "Updated" in violet), and a star (filled `#FFC65C` when on). Tapping a row expands it to show steps, an update note (violet-tinted pill with "Got it"), and "Add a step". **Finishing a task:** the check turns mint instantly. After a .45s hold, the row slides 46px right, scales to .97, fades and blurs 3px over .5s, then it's marked done.

**PayIt.** A hero card using `--hero-payit` with border `#1C5550`: mono "GROSS VOLUME TODAY", "$1,801" at 80px, the delta pill, and the "platform kept" line. Below: 4 dark tiles (`rgba(5,20,20,.45)`). Then a Systems card with status dots (up mint, down coral). Then two bar charts side by side, "By hour" and "Last 7 days". Bars have radius 6; the selected bar uses the mint gradient and the others `#262B33`. Tapping a bar selects it and updates the caption. Last, "By payment method", with mint gradient progress bars.

**Mail.** A `.card.ai` digest with a Redo button. While Claude rewrites the digest, show a pulsing "Claude is reading the last 24 hours of mail…" and a violet loading bar. Then one card per account, each message a row with sender, an optional "Urgent" coral tag, age, summary, and an amber action line with an arrow. Tapping a message opens a reader sheet: title, sender, a summary box, a "Make it a task" button, a loading bar, then the original email on white.

**Schedule.** A summary card (big "Today" + date, a summary line, tasks due). A timeline card covering 8 AM–12 AM with mono hour labels every 2h: events are blocks with the periwinkle gradient and dark `#0B0D1A` text, and a coral "now" line. Under it, a 7-day strip of 84px buttons; the selected day uses the periwinkle gradient.

**Settings.** Cards with mono uppercase section titles, holding 66px rows of a label plus a hint, and one of: toggle, stepper (−/value/+ in a `#1F232A` capsule), slider (10px track, focus gradient fill, 28px white knob) or button.
- **Display:** Text size (§5), Brightness, Sounds.
- **Evening and morning:** Wind down toggle, Wind down starts, Sleep at, Wake at, Morning brief.
- **Mail and Claude:** Email digest at, Day recap at, Tasks from email, School mail connect.
- **Focus timer:** the three lengths.
- **This hub:** stats, Refresh, Restart (asks to confirm).

**Sheets and overlays** use `.scrim` and `.sheet` with a 56×5 grab handle.
- **Weather:** big temperature, 12 hourly columns with periwinkle rain bars, a 3×2 detail grid, and tomorrow's forecast.
- **Alerts:** 44px icon tiles with level gradients (error = bad, warn = focus, info = cal).
- **Toasts:** at the top, solid `#1E2229` with a 40px gradient icon tile, title, "source · body" and ✕. Auto-dismiss after 4.5s.
- **Keyboard:** Cancel / title / Done. The text field (`#0F1115`) has a blinking amber caret. Keys are 64px tall in `#262B33` (modifier keys `#1C2027`). Task mode adds tag and due chips.

**Wind-down (replaces Home after the wind-down time).** Page background `#0E0B09` with a faint dot grid (`radial-gradient(circle, rgba(217,145,74,.08) 1px, transparent 1.6px) 0 0/10px 10px`). Text is warm `#EADBC9`.
- **Hero card** (`linear-gradient(165deg,#2C1A12,#180F0B 60%,#110C09)`, border `#33251C`): mono "WIND DOWN" and "LIGHTS OUT 11:00 PM", the **warm dot-matrix clock (§6)**, the date and weather, then a progress bar to lights-out (6px, gradient `#E8955A→#D9604A`) with "N min left".
- **Then:** "Before you sleep" (tasks due today, with warm checks), "Tomorrow" (events), and "Today's recap".
- **Buttons:** Add a note, Show everything, and Sleep (gradient `#E8955A→#B5502E`).

**Sleep.** Pure black screen with "11:04" in `#6B2A14` and the alarm line in `#4A1E10`. A tap warms them to `#FFB38A` / `#C98A6C` for 6s and shows a glowing amber "Wake" button.

**Morning brief.** The top half is a sky gradient `#0E1A4A → #33389A 22% → #A24F86 40% → #F08A5B 52% → #FFD08A 60%`. A sun (300px radial `#FFF6D8→#FFD27A→#FFB347`) rises 220px over 3.2s. Copy: "Good morning", date, weather line. A solid `#0C0E12` bottom sheet (660px tall, radius 40) slides up after .5s with: "YOUR DAY" events, two stat tiles (tasks due today, PayIt yesterday), the digest headline, and "Start the day".

## 5. Text size
Add a setting `textScale` (1.00–1.40, default **1.15**, 0.05 steps), saved on the server so the Pi and other devices share it. Apply it with `document.documentElement.style.setProperty('--ts', value)`. In Settings → Display, show it as a slider labelled "Text size", with the hint "Bigger text for reading from your chair · 115%". The desktop app also offers presets: 100 / 115 / 130 / 140%.

## 6. Dot-matrix clock (Home and wind-down)
Rework `public/stars.js` into a reusable `DotClock(canvas, {w, h, step, font, r, palette, align})` that draws on a 2× canvas at about 30fps, and only while visible.
- **Sampling.** Draw the time string (`h:mm`, no AM/PM) with `600 {font}px Geist` on an offscreen canvas. Every grid cell centre whose alpha is above 120 becomes a lit cell. Record which character each cell belongs to, using `measureText` prefix widths.
- **Minute change.** When the length of the time string stays the same, pair dots **per character slot**: unchanged characters don't move. Inside a changed slot, sort the old and new cells in reading order and pair them by index. Each dot travels **along its row first, then along its column (never diagonally)** over 1.1s with cubic in-out easing and a random 0–420ms delay. Surplus old dots slide to the nearest new cell and fade out. Missing dots split off a random old dot and fade in. If the length changes, pair the whole string the same way.
- **Ambient.** Draw the background grid as 2px squares. Lit dots breathe with `0.8 + 0.2·sin(t/1000 − x·0.012 + y·0.02)`. About 25% of frames, a random grid point twinkles (fading in and out over 1.4s). Now and then (p ≈ .006 per frame), a 9-dot runner streaks along a row at 0.5px/ms.
- **Each lit dot** is a soft glow circle (radius r·1.8, alpha .24) plus a core circle (radius r).
- **Day palette (Home hero):** grid `rgba(255,255,255,.13)`, white core, glow `rgb(200,230,255)`. Size: `w 380, h 150, step 8, font 150, r 2.8, align left`.
- **Wind palette:** grid `rgba(217,145,74,.15)`. The core goes from `rgb(255,214,160)` to `rgb(255,144,110)` across the width, and the glow is a deeper orange. Size: `w 624, h 220, step 10, font 200, r 3.5, centred`.
- **Desktop hero:** `w 330, h 120, step 7, font 124, r 2.4`.

## 7. Ring voice-note widget
When a new journal entry arrives (from the ring, or a typed note), show a floating widget on every device:
- **Where:** on the Pi it's absolute, 16px from the sides and 118px from the bottom (just above the rail). On desktop it's fixed bottom-right, 400px wide.
- **Look:** a solid `#1A1D23` card with the journal gradient border (`padding-box / border-box` trick), radius 28 on the Pi and 24 on desktop, shadow `0 24px 60px rgba(0,0,0,.65)`, entering with `rise .5s`.
- **Header:** a 44px journal-gradient tile with a mic icon and a pinging copy behind it (`ringping 1.6s infinite`). The title changes by stage (below), with mono "From your ring · just now" (or "Typed note") and ✕.
- **Body:** the transcript in italic quotes, fading in.
- **Stages:**
  1. `heard`, 0–1.1s: title "Got your voice note".
  2. `think`, until the server replies: title "Working on it", a pulsing "Working out what you meant…" and a loading bar.
  3. `done`: title "Done · N things". List each action as a row (`#22262E`, radius 16), entering with `pop .45s` staggered 0.18s per row. Each row has a 34px tile (gradient + icon), a mono 11px label and the action text. Kinds:
     - `task`: "ADDED TASK", tasks gradient, plus icon.
     - `done`: "MARKED DONE", money gradient, check icon.
     - `cal`: "CALENDAR", cal gradient, schedule icon.
     - `note`: "SAVED NOTE", journal gradient, journal icon.
     - `recap`: "RECAP", mail gradient, mail icon.

     Under the rows: a 3px bar shrinking over 5.4s and "Tap to open journal".
- **Dismiss** automatically 5.4s after `done`. Tapping the widget opens Journal → Today; ✕ closes it. A desktop setting "Show ring notes here" turns the widget off on that device.
- **Data contract:** the server pushes (SSE/WebSocket, or the existing polling) `{type:'journal.entry', id, source:'ring'|'typed', said, stage:'heard'|'done', actions:[{kind, text}]}`. Map whatever my voice pipeline already returns (tasks created, steps completed, notes filed) onto `actions`. Typed notes skip the `think` stage.

## 8. Journal: Today and Past days
Put a segmented control under the header: **Today | Past days**.
- **Today** (scrolls):
  1. The `.card.ai.journal` recap card: headline, bullets, and a "Tomorrow" box.
  2. A **"Notes for today"** card with an "Add" button. Notes are typed on the touch keyboard (title "Note for today") or the desktop input. Each row is a mono time plus the text. Empty state: "Jot anything you want to find later. It stays with today under Past days."
  3. The existing "Voice notes" card ("● Ring connected"), showing transcript quotes, "Done: …" lines in mint and new tasks in amber.
- **Past days:**
  - A 56px search field that opens the keyboard on the Pi and is a real input on desktop, plus a clear button.
  - Quick chips: Stripe, Lab, PayIt, Prof. Lin.
  - A mono result line: "N matches across M days", or "N days recorded · newest first".
  - One card per day, newest first, with **today first**. Each card has the date ("Wed, Oct 7"), mono "3 entries · 85 min · 4 done", and the **day summary written by Claude**. Tap to expand into a timeline: mono time and kind (Reflection violet, Voice note pink, Day note blue), the text, and an amber "→ Task: …" line.
  - While searching, keep only the days and entries that match, expand them, and highlight matches (`background: rgba(255,181,71,.3); color: #FFE2B0`).
- **Server:**
  - Store a day record `{date, summary, focusMinutes, tasksDone, entries:[{at, kind, text, said?, action?}]}`.
  - Generate `summary` when the 9:00 PM recap runs, using the same Claude call as the recap.
  - Endpoints: `GET /api/journal/days?q=` (case-insensitive search over summary, text and action) and `POST /api/journal/daynote {text}`.

## 9. Desktop workstation (laptop ≥ 1024px; same app, same server)
The desktop is **not a mirror of the Pi**. The Pi is a glanceable touch screen with no typing. The desktop is where I *work*: keyboard-first, denser, every list editable. Use the same tokens and gradients, but compact: body 13–14px, mono 10.5–12px, rows 36–40px, cards radius 16, 12px gaps. Reference: `designs/Desk Hub - Workstation.html`.

- **Frame.** A grid `232px | 1fr` above a **30px status bar**.
  - **Sidebar** (`#0F1115`):
    - "Desk Hub" plus a mono "WORKSTATION" tag.
    - A **Record a note** button (journal gradient, mic icon, `R` hint).
    - A "Search or run… ⌘K" button.
    - 8 nav rows, 36px each, with 24px icon tiles: Today, Inbox, Tasks, Journal, Calendar, PayIt, Focus, Settings. Count pills show unread mail in violet and tasks due today in amber.
    - When focus is running, a pill with a mini ring, the time and the task.
    - At the bottom, a desk card: status dot, awake/asleep, 4 icon buttons that send Home/Focus/Schedule/Journal to the Pi, and "Desk shows …".
  - **Header** (58px): page title, mono subtitle, a "Synced with desk" pill and the alerts popover.
  - **Status bar** (`#090A0D`, mono 11px): desk state · focus countdown (amber) · PayIt "$1,801 ▲16%" · "1 system down" (coral) · unread count · weather and time · "⌘K commands · R record · 1–8 views".
- **Keyboard:**
  - **Everywhere:** ⌘K or / opens the palette. R records. N focuses the new-task input. 1–8 switch views. Esc blurs or closes.
  - **Inbox:** J/K move, D drafts a reply, E archives, T makes a task.
  - **Tasks:** X completes the selected task.
  - **Ignore shortcuts while an input is focused.**
- **⌘K command palette:** 620px wide, centred 13vh from the top. An input, then up to 11 results, each with a 24px gradient tile and a hint; ↑↓ choose and ↵ runs.
  - When text is typed, the first results are "Add task “…”" (parses `#school #payit #personal` and `!today !tomorrow !fri`), "Add to today's note", "Search journal" and "Search inbox".
  - Fixed commands:
    - Record a voice note.
    - Start focus 25 min, here or on the desk.
    - Show Schedule on the desk.
    - Put the desk to sleep.
    - Draft a reply to Stripe.
    - Go to each view.
- **Recording on the computer:**
  - **Modal:** bottom-centre, 560px, journal-gradient border. It shows a pulsing red dot, "Recording" and the elapsed time, a **live waveform** (canvas, 58 rounded bars in the journal gradient, newest bar white), and a **live transcript** with a blinking caret. Cancel (Esc) or Stop and save (↵).
  - **Audio:** use `getUserMedia` and an `AnalyserNode` (RMS) for the waveform.
  - **Transcription:** use the Web Speech API (`webkitSpeechRecognition`, continuous, interim results) when it's available. Otherwise upload the audio to the server (Whisper or my existing pipeline).
  - **On save:** POST the transcript and audio. The server works out the actions, and the **same floating result widget as §7** appears bottom-right, 380px. The client-side fallback rules are:
    - "remind me to / I need to / don't forget to X" → task.
    - "finished / done with X" → mark the matching step done.
    - "idea" → note.
    - Feeling words → recap.
    - Always "Saved to today's journal".
- **Today** (3 columns: `290px | 1fr | 360px`, each scrolling on its own; below 1240px, `1fr | 340px` with agenda and tasks stacked on the left):
  - **Left:**
    - A small hero (day gradient) with the dot clock at `w 250, h 84, step 6, font 86, r 2`, date, and weather line.
    - An **Agenda** card: rows of mono time, title and "where · N min". Past events at .45 opacity, a NOW tag on the current one, and a coral line with the current time between past and future. Clicking an event opens it in Calendar.
    - A Tomorrow card.
  - **Centre:** "Tasks · N open · N due today", then a quick-add input (Enter saves; syntax hint underneath). Then cards grouped OVERDUE (coral) / TODAY (amber) / UPCOMING (blue) / NO DATE (grey). Each row is 40px: a 20px check, text with a steps count, tag dot, mono due, a ▶ "Focus on this" button (amber on hover) and a star. Clicking a row opens it in Tasks.
  - **Right:** **Needs you**, a triage stream of cards. Each has a 28px gradient tile, a mono kind label, title and body, a primary and a secondary button, and ✕. Items:
    - Payout runner down: Retry run / Open PayIt.
    - Stripe tax ID: Draft reply / Make task.
    - Maria wants 3:30: **Accept 3:30** moves the calendar event and drafts the reply / Reply.
    - Each suggested-from-email task: Keep / Not real.

    Below the stream, **Today's note**: a journal-bordered textarea that autosaves to the day record, with "Saved · N words".
- **Inbox** (`196px folders | 390px list | reader`):
  - **Folders:** All, Work, School, Urgent, Archived, with counts, plus a mini Claude digest card.
  - **List:** a search box, then rows with an unread violet dot, sender, URGENT tag, account and age, subject, and Claude's one-line summary.
  - **Reader:** subject at 21px, sender line, a "SUMMARY · CLAUDE" box with an amber action line, then buttons: **Draft reply with Claude** (mail gradient), Make it a task, Archive.
    - The draft streams into an editable textarea under "Claude is drafting…". Send sends it and archives the email.
    - Below that, the original email on white.
- **Tasks** (list | 420px editor):
  - **List:** add input, filter input, chips (All open, Starred, School, PayIt, Personal, Done), and the same grouped rows. The selected row is `#1F232A`.
  - **Editor:** check plus an editable 18px title (textarea), Tag and Due chip rows, the update note pill, a STEPS card (check, text, delete, and an "Add a step" input), a NOTES textarea, and buttons: Focus on this, Focus on desk, Delete (coral text).
- **Journal** (`300px` day list | detail):
  - **Day list:** search, chips, result line, and day buttons with summaries and match counts.
  - **Detail:** date and meta, a Record button, and the DAY SUMMARY · CLAUDE box.
    - **Today:** a large "Today's note" editor, then Voice notes, each with a gradient play button and a 40-bar waveform that fills in time with playback, plus duration, transcript and resulting actions.
    - **Past days:** the entries timeline with search highlights.
- **Calendar:** a quick-add input that parses "Study group sun 4pm" (day word plus time) into a 1-hour event. Below it, a **week grid**: 56px time gutter and 7 columns (Thu 8 – Wed 14), 40px per hour from 8 AM to 11 PM. Events are blocks in the periwinkle gradient, selectable with a white ring. The selected event appears in a bar with Delete. Today's column has a faint blue tint and a coral now line.
- **PayIt:**
  - **KPIs:** an auto-fit grid of tiles. GROSS TODAY gets the teal hero gradient. The others are SALES, AVG TICKET, MERCHANTS and DECLINED.
  - **By hour:** chart with selectable bars.
  - **Systems:** each row has a status dot. **Retry run** on a down system calls the server and flips it to up.
  - **Recent payments table** (TIME · MERCHANT · METHOD · STATUS · AMOUNT) with filter chips (All, Paid, Declined, Refunded). Status pills: Paid mint, Declined amber, Refunded violet. Refund amounts show "−".
- **Focus:** a "This computer | On the desk" segmented control, a 290px dial with ticks, presets, and Begin (or Pause/+5/End while running). A WORKING ON radio list. A Sessions today table (time · min · task · where). A This-week bar chart.
- **Settings** (auto-fill cards, 420px minimum):
  - **Your desk:** stats, desk text size, Wind down, Morning brief, Restart the Pi.
  - **This computer:** Open at login, Notifications, Show voice-note results here, Microphone.
  - **Keyboard:** a list of the shortcuts.
  - **Connected accounts.**
- **Toasts:** top-right, 340px, 3.8s.
- Package as a **PWA** (manifest: name "Desk Hub", `display: standalone`, theme `#0C0E12`) so it installs as an app. Below 1024px, fall back to the Pi screens at fluid width (phone).

## 10. Linking desktop ↔ Pi (add to the server)
Keep the server's state as the single source of truth and push changes to every open client over SSE or WebSocket.
- `GET /api/desk/state` returns `{awake, view, brightness, textScale, focus:{running, endsAt, paused, where}}`.
- `POST /api/desk/view {view}`. The Pi navigates to that view.
- `POST /api/desk/sleep`, `POST /api/desk/wake`.
- `POST /api/desk/brightness {value 10–100}`. On the Pi, write to `/sys/class/backlight/*/brightness` (scaled to that file's `max_brightness`), or use a CSS `filter: brightness(.35 + .65·v/100)` fallback.
- `POST /api/settings {textScale, …}`.
- `POST /api/focus/start {minutes, task, where:'desk'|'here'}`
- `POST /api/voice {transcript, audio?}` returns `{actions:[{kind,text}]}`; `POST /api/mail/:id/draft` streams Claude's reply; `POST /api/mail/:id/send`; `POST /api/mail/:id/archive`; `PATCH /api/tasks/:id` for title, tag, due, steps and notes; `POST /api/events`; `POST /api/payit/payout/retry`., `/pause`, `/end`. When `where` is `desk`, the Pi opens Focus lock. The desktop mirrors the countdown from `endsAt`.
- Journal events per §7, and day notes per §8.

## 11. Pi kiosk setup (also write this into README.md)
- **OS:** Raspberry Pi OS Bookworm (64-bit), with the desk-hub server running as a systemd service (keep the current one).
- **Portrait:** Screen Configuration → Touchscreen → Orientation → rotate to portrait. Or in `~/.config/wayfire.ini` / labwc: `transform = 90`.
- **Fonts offline:** download Geist and Geist Mono (woff2, weights 300–700) into `public/fonts/` and declare them with `@font-face` instead of the Google import, so the Pi works without internet.
- **Kiosk autostart** (labwc: `~/.config/labwc/autostart`; wayfire: the `[autostart]` section):
  `chromium-browser --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --touch-events=enabled --overscroll-history-navigation=0 --enable-features=OverlayScrollbar http://localhost:<PORT>/`
- **Hide the cursor:** `sudo apt install unclutter-xfixes` or the labwc equivalent, and add `cursor: none` on the Pi layout.
- **No blanking:** turn off screen blanking in raspi-config → Display. The app's own sleep screen handles night-time dimming.
- **Performance:** no `backdrop-filter`. Run the canvas clocks at about 30fps and pause them when hidden (`IntersectionObserver` / `visibilitychange`).

## 12. Sample content (for empty states and testing)
- **Home:** 9:41 AM, Thursday, October 8. 74° partly cloudy, H 81 L 63, 70% rain after 2 PM.
- **PayIt:** $1,801 ▲16% vs. $1,553. 47 sales, $38.32 avg, 12 merchants, 4 declined · 1 refunded, profit $37.09 / $214.60 this week. Payout runner down: "Platform Revenue balance too low for next run".
- **Events:** Dynamics (Klaus 1443, Now), Merchant onboarding call (Zoom, 3:00 PM), Lab 2 report due (Canvas, 11:58 PM).
- **Tasks:**
  - "ME 3057 lab report: acoustics" (School, Today, 4 steps, 2 done).
  - Review payout reconciliation (PayIt, Today).
  - Problem set 4 (Dynamics) (School, Tomorrow).
  - Reply to Stripe support ticket (PayIt).
  - Fund Platform Revenue checking account… (PayIt, Overdue).
- **Digest:** "Stripe needs your tax ID by Friday, and Lab 2 is now due Thursday night."
- **Recap:** "A solid lab day: the plots are done and PayIt ran clean apart from one payout check."

Acceptance check: open the Pi at 720×1280 and the desktop at 1440×900, and compare them side by side with the attached prototypes. Spacing, colours, type sizes, motion timings and copy should match.
