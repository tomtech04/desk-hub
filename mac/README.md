# Desk Hub for Mac

One app for the hub on your Mac, for macOS 26 and later:

- **The workstation in a window:** the hub's laptop layout (Today, Inbox, Tasks, Journal, Claude, Calendar, PayIt, Focus), in its own window with a Dock icon instead of a browser tab.
- **Your Claude chats in the menu bar:** which are running, which are done, and which are waiting on you, with alerts so you don't miss one. It covers chats in the Claude app's Code tab and Claude Code in a terminal. The panel uses Liquid Glass, like Control Center.
- **The link between them:** it sends your chats to the hub, so the desk and the iPhone app show them, and a chat tapped on the desk or the phone opens here.

At login it starts quietly, as just the menu bar item. Open it yourself (Dock, Finder, Spotlight, or Open Desk Hub in the menu bar panel) for the window; close the window and it goes back to the menu bar, where the Claude side keeps running.

## What you see

The menu bar icon changes with the most urgent state:

| Icon | Meaning |
|---|---|
| Speech bubble with `!` and a number | That many chats need you |
| Speech bubble with `…` and a number | That many chats are running |
| Speech bubble with a check | A chat finished since you last opened the panel |
| Empty speech bubble | Nothing going on |

While a chat needs you, the icon becomes an orange badge with a raised hand and the count. It flashes until you open the panel.

Click it for the panel. Chats are grouped into **Needs you**, **Running** and **Done**. Each row shows the chat's title, its project folder, how long it has been in that state, and what it is waiting for (or, for finished chats, the last thing Claude said). A blue dot marks finished chats you haven't opened yet. It stays until you open the chat (from the panel, an alert, or Desk Hub) or it starts working again; **Mark All Read** clears them all. Running chats say what they're doing, like "Running commands" or "Editing files".

Click a row to jump to it. Claude app chats open in the Claude app; terminal chats bring their terminal window forward. Right-click a row to copy its session id or resume command, or to show its folder in Finder.

## Alerts

When a chat starts waiting on you:

- A glass pop-up drops down from the top of the screen and stays there until you open the chat, close the pop-up, or the chat moves on. Click it to jump to the chat.
- The "Glass" sound plays and a macOS notification appears. Clicking the notification opens the chat too.
- The menu bar badge flashes until you open the panel.
- If the chat is still waiting after 5 minutes, all of that happens again, every 5 minutes until it's handled.

When a chat finishes, a shorter pop-up shows for 8 seconds with the last thing Claude said, plus a softer sound and a notification.

Everything is under `…` → Alerts in the panel: each kind of alert can be turned off, reminders can be every 2, 5 or 10 minutes or never, and **Send a Test Alert** shows what it all looks like. For notifications that stay on screen until you dismiss them, open **Notification Settings…** there and change the style from Banners to Alerts.

## On Desk Hub

If this Mac has the hub's mail sync set up (`~/.deskhub/mail-sync.json`), the app also sends your chats to the hub, using the same address and token. They show on the desk's Claude board and on Home, and a chat that finishes or needs you takes over the desk screen. Tapping a chat on the desk opens it here: the app keeps a connection open to the hub for that. Unread chats stay in step both ways. It sends whenever something changes and once a minute; turn it off with `…` → **Show on Desk Hub**.

macOS asks once whether Desk Hub may find devices on your local network. Choose **Allow**, or the hub can't be reached (the menu then shows **Can't Reach Desk Hub**, which opens the setting).

## How it knows

- **Running and done** come from `~/.claude/sessions/`, where Claude Code keeps a small file for every open chat with its title and whether it is busy or idle. Nothing needs to be set up for this.
- **Needs you** for some dialogs comes from the same files. Permission prompts, questions (AskUserQuestion) and plan reviews don't show up there, so a small hook fills them in. It writes the latest event for each chat to `~/.claude/claude-status/events/` and prints nothing, so it can't change what Claude does. It takes about 30 ms per event.

The app reads files on your Mac. Its only network traffic is to your own Desk Hub, if you have one set up.

## Install

From the repo:

```bash
zsh mac/scripts/install.sh https://your-hub-address/
```

This builds the app, puts it in `~/Applications/Desk Hub.app` and opens it. The address is the one the window opens (your hub's public address works anywhere; without one it uses the address the mail sync saved). It replaces Claude Status and the old browser launcher if they're there, and keeps their settings. The first time, sign in to the hub in the window.

To turn on the hook, click **Turn On** in the panel, or run:

```bash
mac/scripts/setup-hook.sh
```

It adds the hook to `~/.claude/settings.json` (leaving your other settings alone) and saves a backup next to it as `settings.json.bak-claude-status`. To take it out again:

```bash
mac/scripts/setup-hook.sh --remove
```

The app opens at login. It turns this on itself the first time it runs; to stop it, open the panel, click `…` and turn off **Open at Login** (it stays off after that).

## Build only

```bash
zsh mac/scripts/build.sh
```

The app ends up in `mac/build/Desk Hub.app`. It needs Xcode with the macOS 26 SDK or newer.

## Files

| Path | What it is |
|---|---|
| `Sources/DeskHub/SessionStore.swift` | Reads the session files and hook events, decides each chat's state, opens chats |
| `Sources/DeskHub/PanelView.swift` | The panel |
| `Sources/DeskHub/DeskHubApp.swift` | App entry point, starting quietly at login, and the menu bar icon |
| `Sources/DeskHub/HubWindow.swift` | The workstation window |
| `Sources/DeskHub/Chat.swift` | The chat model and the file formats it reads |
| `Sources/DeskHub/Alerter.swift` | Alerts: when to fire, sounds, notifications, reminders, flashing |
| `Sources/DeskHub/Toasts.swift` | The glass pop-ups and the orange menu bar badge |
| `Sources/DeskHub/HubSync.swift` | Sends the chat list to Desk Hub |
| `Sources/DeskHub/SelfCheck.swift` | Debug builds only: run with `CLAUDE_STATUS_SNAPSHOT=<folder>` to fire a silent test alert and save images of the badge, pop-up and rows |
| `hooks/claude-status-hook.sh` | The hook |
| `scripts/` | Build, install and hook setup |

## Limits

- Regular claude.ai chats (outside the Code tab) aren't included. They don't run in the background and Claude doesn't expose their state on your Mac.
- If two tools run in parallel and one of them is waiting for permission, the other one finishing can clear the "needs you" state early. It comes back with the next prompt.
