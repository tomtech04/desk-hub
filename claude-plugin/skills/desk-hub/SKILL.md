---
name: desk-hub
description: Put work on the user's Desk Hub (their personal desk dashboard and to-do list). Use when the user says to add, remind, track or log something ("add that to my hub", "remind me to…", "log this", "send this to my desk hub", "what's on my list?", "mark X done"), and at the end of a piece of work that leaves follow-ups or is worth recording.
---

# Desk Hub

The user keeps their tasks, notes and a daily journal on a Desk Hub: a touchscreen on their desk, also at deskhub.example.com. It is reached through the `desk-hub` MCP server. If its tools (`add_tasks`, `list_tasks`, `complete_task`, `add_steps`, `log_work`, `add_note`, `get_today`) are not available, say the Desk Hub connector isn't connected and stop; don't work around it.

## What to send where

- **Something the user has to do** → `add_tasks`. One task per thing, written as a short imperative in their words, with the specifics kept (who, which file, which class). Give `due` (YYYY-MM-DD) only when they stated or clearly implied a day. Use `subtasks` when the thing has several parts they'd tick off separately; don't invent steps to make it look thorough.
- **Work that just got finished** → `log_work`. `summary` is one or two plain sentences in their voice about what was done. Put existing tasks it finished in `completed`, real follow-ups in `next_steps`, and `minutes` only if you actually know how long it took. This feeds their evening recap.
- **A thought, decision or fact to keep** → `add_note`. Not everything is a task.
- **"Mark X done"** → `complete_task`. If you don't have the task's id, call `list_tasks` first and use the id; never guess between similar tasks. Ask if it's ambiguous.
- **"What's on today?" / planning** → `get_today`, then `list_tasks` if they want the whole list.

## Judgment

- Act without asking when the user plainly told you to add, log or complete something. Offer first ("Want me to put these on your hub?") when you are the one who noticed follow-ups at the end of a task.
- Call `list_tasks` before adding if the thing may already be there; update or add steps instead of creating a duplicate.
- Tags: use one returned by `list_tasks` (for example School, PayIt, Personal) or leave it out.
- After a call, tell the user briefly what landed on the hub, in a line, not a table.
- Never put secrets (passwords, keys, tokens) or other people's private details into a task or note; it's shown on a screen on a desk.
