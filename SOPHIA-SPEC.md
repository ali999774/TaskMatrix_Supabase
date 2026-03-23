# SOPHIA-SPEC — TaskMatrix Supabase Integration
**Project:** TaskMatrix Personal Task Manager
**Owner:** Ali
**Date:** 2026-03-22
**Phase:** 1 — Supabase Wiring
**Status:** Ready to build
---
## What We're Building
TaskMatrix is a single-file HTML/JS Eisenhower Matrix task manager currently saving
to localStorage (device-bound, no sync). We are wiring it to Supabase so that:
- Tasks persist to a cloud database and sync across all devices
- Only Ali can access his data (Google OAuth + Row Level Security)
- A real sync status indicator shows live connection state
- The existing UI is fully preserved — this is a backend integration, not a redesign
---
## Source File
`Taskmatrix.html` — ~2987 lines of vanilla HTML/CSS/JS.
No framework. No bundler. No build step.
All Supabase code will be added as ESM script tags + inline JS refactoring.
---
## Tech Stack
| Layer | Choice |
|-------|--------|
| Frontend | Vanilla HTML/CSS/JS (preserve as-is) |
| Backend | Supabase (Postgres + Auth + RLS) |
| Auth | Google OAuth via Supabase Auth |
| Realtime | Not in Phase 1 — deferred |
| Hosting | GitHub Pages |
---
## Supabase Schema
### tasks
```
id            uuid PK
user_id       uuid FK → auth.users
title         text NOT NULL
notes         text
category      text
importance    int
urgency       int
status        text ('todo' | 'in-progress' | 'completed')
due_date      date
due_time      time
estimated_duration  int
recurring     boolean
recur_frequency  text
recur_interval   int
recur_days    int[]
tags          text[]
subtasks      jsonb
pinned        boolean
created_at    timestamptz
updated_at    timestamptz
```
### sticky_notes
```
id          uuid PK
user_id     uuid FK → auth.users
content     text
color       text
position_x  int
position_y  int
created_at  timestamptz
updated_at  timestamptz
```
---
## Auth Flow
1. App loads → check for active Supabase session
2. If no session → show centered "Sign in with Google" screen overlaying the app
3. User clicks → Google OAuth popup → redirects back → session stored in browser
4. Session persists across page refreshes (Supabase handles this via localStorage token)
5. Sign out button in top bar (small, unobtrusive)
6. RLS on both tables — DB enforces user_id = auth.uid() at the query level
---
## Sync Status Indicator
Replace the cosmetic green dot with a real 3-state indicator:
| State | Color | Trigger |
|-------|-------|---------|
| Synced | Green | After successful DB write |
| Syncing | Yellow (pulse) | During any in-flight DB call |
| Offline / Error | Red | Network error or Supabase error |
---
## Data Migration
On first login, if localStorage contains tasks/notes → offer to migrate them to Supabase.
Show a one-time banner: "You have X tasks in local storage. Import them?" → Yes / Start Fresh.
After successful import → clear localStorage.
---
## What Does NOT Change
- All CSS and visual design (preserved exactly)
- All UI interactions and modals
- Quadrant logic (importance/urgency → quadrant mapping)
- Recurring task logic
- Tag and subtask rendering
- Stats display
- Dark mode toggle
---
## Key Functions to Refactor
| Current function | Action |
|-----------------|--------|
| `saveTasks()` | Replace localStorage with Supabase upsert |
| `loadTasks()` | Replace localStorage with Supabase select |
| `deleteTask()` | Add Supabase delete call |
| `saveNotes()` | Replace with Supabase upsert |
| `loadNotes()` | Replace with Supabase select |
| `init()` | Add auth check + load from Supabase |
---
## Supabase Config (fill in before deploying)
```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'
```
---
## Out of Scope (Phase 1)
- Real-time sync (Supabase Realtime) — Phase 2
- Offline queue / service worker — Phase 2
- Mobile layout improvements — Phase 2
- Drag-and-drop between quadrants — Phase 2
---
## Success Criteria
- [ ] App loads and shows Google sign-in if not authenticated
- [ ] After sign-in, tasks load from Supabase
- [ ] Adding a task writes to Supabase immediately
- [ ] Editing a task updates the Supabase row
- [ ] Deleting a task removes the Supabase row
- [ ] Opening on a second device shows the same tasks
- [ ] Sticky notes also sync
- [ ] Sync dot shows correct state (green/yellow/red)
- [ ] localStorage migration offered on first login if data exists
- [ ] Sign out works and returns to login screen
