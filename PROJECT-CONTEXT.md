# TaskMatrix — Project Context

## Stack
- Single-file PWA (`index.html`) — no build step
- Supabase (PostgreSQL + Realtime) for sync
- Dexie.js (IndexedDB) for offline cache
- Google OAuth via Supabase Auth
- GitHub Pages deployment (`ali999774.github.io/TaskMatrix_Supabase`)
- Service worker (`sw.js`) for offline support

## Tables
- `tasks` — main task store
- `sticky_notes` — pinned notes (columns: id, user_id, content, title, color, position_x, position_y, pinned, created_at, updated_at)

## Architecture Notes
- All modals must be **direct children of `<body>`** — never nested inside other modals or containers with `display:none`. This caused multiple invisible-modal bugs.
- Task IDs are ephemeral local floats (`Date.now() + Math.random()`). `supabaseId` is the stable Supabase UUID. Always use `supabaseId` for DB operations.
- `.upsert()` needs `id` IN the payload for conflict resolution. `.update().eq('id',...)` must NOT have `id` in the payload (Postgres rejects PK updates).
- UUID arguments in inline `onclick` attributes must be quoted: `onclick="fn('${id}')"` not `onclick="fn(${id})"` — hyphens cause arithmetic evaluation → NaN.

---

## Bug Log — April 10, 2026 Debug Session

### Bug 1 — Sync dot stuck red/orange
**Status:** Diagnosed, not yet fixed
**Root cause:** Two sticky flags (`_syncHasError`, `_syncRealtimeOk`) with no self-healing path. Once set, they never reset unless a new sync operation starts.
**Fix (pending):** Add 30s connectivity heartbeat that calls `setSyncState('syncing')` + `setSyncState('synced')` to flush error flag. Track realtime channel states independently.

---

### Bug 2 — Task modal not opening on click
**Status:** Fixed
**Root causes (4):**
1. `mapRowToTask` generated new random ID on every Supabase reload — DOM had stale IDs baked into onclick attributes. Fix: reuse existing in-memory ID via `tasks.find(t => t.supabaseId === row.id)?.id ?? (Date.now() + Math.random())`
2. `#task-modal` was nested inside `#notes-modal` (display:none) — permanently hidden. Fix: moved to direct child of `<body>`
3. Two conflicting `.modal-overlay` CSS rule sets — one restored opacity, other restored display, neither complete. Fix: consolidated into single rule set
4. Modal opened and immediately closed — deferred synthetic click from touch fired on overlay. Fix: 300ms timestamp guard on `closeModalOnOverlay`

---

### Bug 3 — Notes disappearing after save / Pinned Notes not saving
**Status:** Fixed
**Root causes (5):**
1. `_doFlush` (offline path) passed `id` in `.update()` payload — Postgres silently rejected PK update. Fix: destructure id out before `.update()`
2. `saveTasks` (online path) stripped `id` from `.upsert()` payload — Supabase treated every save as new insert. Fix: keep `id` in upsert payload for conflict resolution
3. `sticky_notes` table missing `pinned` (boolean) and `title` (text) columns — every insert returned PGRST204. Fix: `ALTER TABLE sticky_notes ADD COLUMN IF NOT EXISTS pinned boolean DEFAULT false, ADD COLUMN IF NOT EXISTS title text DEFAULT ''`
4. `saveNotesToSupabase` never mapped `n.title` into insert payload. Fix: add `title: n.title || ''`
5. Note card onclick used unquoted UUID: `editNote(a654e261-cda5-...)` — JS treated hyphens as subtraction → NaN. Fix: `onclick="editNote('${note.id}')"`

---

## Known Remaining Issues
- Bug 1 (sync dot heartbeat) — cosmetic but unresolved
- Debug console.log statements left in codebase from session — should be cleaned up before production

## Deployment
- Push to `main` → GitHub Pages auto-deploys in ~60 seconds
- Always hard refresh (`Cmd+Shift+R`) after deploy to bypass service worker cache
- Service worker cache version: `taskmatrix-v4`
