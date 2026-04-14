# FINAL-01 — Marcus (Backend Integration Engineer)
**Project:** TaskMatrix — Supabase Integration
**Agent:** Marcus
**Role:** Backend Integration Engineer
**Model:** Claude Sonnet 4.6
**Thinking:** Standard
**Phase:** 1 — Complete Supabase wiring
**Input:** Taskmatrix.html
**Output:** Taskmatrix-v2.html
---
## Your Mission
You are integrating Supabase into an existing single-file HTML/JS task manager.
This is a backend wiring job — you are NOT redesigning anything.
The existing UI, CSS, and all visual behavior must be preserved exactly.
Your job is to replace localStorage persistence with Supabase, add Google OAuth,
and wire the sync status indicator to real state.
---
## Context — What the App Does
TaskMatrix is an Eisenhower Matrix personal task manager:
- 4 quadrants (Do First / Schedule / Delegate / Eliminate) based on importance + urgency sliders
- Tasks have: title, notes, category, due date/time, estimated duration, tags, subtasks, recurring options
- Sticky notes panel (separate from tasks)
- Stats dashboard
- Dark mode
- Currently saves everything to localStorage
---
## Step-by-Step Instructions
### Step 1 — Add Supabase CDN
At the top of the `<head>`, add:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```
### Step 2 — Add Config and Client Init
At the very top of the `<script>` block, add:
```javascript
// ── Supabase Config ──────────────────────────────────────────
const SUPABASE_URL = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
let currentUser = null
```
### Step 3 — Auth Layer
Add a login screen overlay to the HTML body:
```html
<div id="auth-screen" style="display:none; position:fixed; inset:0;
  background:var(--bg-glass); backdrop-filter:blur(12px);
  z-index:9999; align-items:center; justify-content:center; flex-direction:column; gap:16px;">
  <div style="font-size:24px; font-weight:bold; color:var(--primary-dark);">TaskMatrix</div>
  <div style="color:var(--text-muted); font-size:14px;">Sign in to sync your tasks across devices</div>
  <button onclick="signInWithGoogle()"
    style="background:white; color:#374151; border:1px solid #d1d5db; padding:12px 24px;
    border-radius:8px; font-size:15px; cursor:pointer; display:flex; align-items:center; gap:10px;
    box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
    Sign in with Google
  </button>
</div>
```
Add auth functions:
```javascript
async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  })
  if (error) console.error('Auth error:', error)
}
async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  showAuthScreen()
}
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex'
  document.querySelector('.zen-top-bar').style.display = 'none'
  document.querySelector('.container').style.display = 'none'
}
function hideAuthScreen() {
  document.getElementById('auth-screen').style.display = 'none'
  document.querySelector('.zen-top-bar').style.display = ''
  document.querySelector('.container').style.display = ''
}
```
Add sign-out button to `.zen-actions` in the top bar:
```html
<button class="zen-icon-btn" onclick="signOut()" title="Sign out" style="font-size:14px;">⎋</button>
```
### Step 4 — Rewrite init()
```javascript
async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    currentUser = session.user
    hideAuthScreen()
    await checkAndMigrateLocalStorage()
    await loadTasksFromSupabase()
    await loadNotesFromSupabase()
    render()
    updateStatsDisplay()
  } else {
    showAuthScreen()
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user
      hideAuthScreen()
      await checkAndMigrateLocalStorage()
      await loadTasksFromSupabase()
      await loadNotesFromSupabase()
      render()
      updateStatsDisplay()
    } else if (event === 'SIGNED_OUT') {
      tasks = []
      showAuthScreen()
    }
  })
}
```
### Step 5 — Replace saveTasks() and loadTasks()
```javascript
async function saveTasks() {
  if (!currentUser) return
  setSyncState('syncing')
  try {
    const rows = tasks.map(t => ({
      id: t.supabaseId || undefined,
      user_id: currentUser.id,
      title: t.title,
      notes: t.notes || '',
      category: t.category || 'personal',
      importance: t.importance,
      urgency: t.urgency,
      status: t.status,
      due_date: t.dueDate || null,
      due_time: t.dueTime || null,
      estimated_duration: t.estimatedDuration || null,
      recurring: t.recurring || false,
      recur_frequency: t.recurFrequency || null,
      recur_interval: t.recurInterval || 1,
      recur_days: t.recurDays || [],
      tags: t.tags || [],
      subtasks: t.subtasks || [],
      pinned: t.pinned || false,
      created_at: t.createdAt,
      updated_at: new Date().toISOString()
    }))
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('user_id', currentUser.id)
    if (deleteError) throw deleteError
    if (rows.length > 0) {
      const { data, error } = await supabase.from('tasks').insert(rows).select()
      if (error) throw error
      data.forEach((row, i) => { tasks[i].supabaseId = row.id })
    }
    setSyncState('synced')
  } catch (err) {
    console.error('Save error:', err)
    setSyncState('error')
  }
}
async function loadTasksFromSupabase() {
  if (!currentUser) return
  setSyncState('syncing')
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    tasks = data.map(row => ({
      id: Date.now() + Math.random(),
      supabaseId: row.id,
      title: row.title,
      notes: row.notes,
      category: row.category,
      importance: row.importance,
      urgency: row.urgency,
      status: row.status,
      dueDate: row.due_date,
      dueTime: row.due_time,
      estimatedDuration: row.estimated_duration,
      recurring: row.recurring,
      recurFrequency: row.recur_frequency,
      recurInterval: row.recur_interval,
      recurDays: row.recur_days || [],
      tags: row.tags || [],
      subtasks: row.subtasks || [],
      pinned: row.pinned,
      createdAt: row.created_at,
      modifiedAt: row.updated_at
    }))
    setSyncState('synced')
  } catch (err) {
    console.error('Load error:', err)
    setSyncState('error')
  }
}
```
### Step 6 — Replace sticky notes persistence
```javascript
async function saveNotesToSupabase() {
  if (!currentUser) return
  setSyncState('syncing')
  try {
    await supabase.from('sticky_notes').delete().eq('user_id', currentUser.id)
    if (notes.length > 0) {
      const rows = notes.map(n => ({
        user_id: currentUser.id,
        content: n.content || '',
        color: n.color || 'yellow',
        position_x: n.x || 0,
        position_y: n.y || 0
      }))
      const { error } = await supabase.from('sticky_notes').insert(rows)
      if (error) throw error
    }
    setSyncState('synced')
  } catch (err) {
    console.error('Notes save error:', err)
    setSyncState('error')
  }
}
async function loadNotesFromSupabase() {
  if (!currentUser) return
  try {
    const { data, error } = await supabase
      .from('sticky_notes')
      .select('*')
      .eq('user_id', currentUser.id)
    if (error) throw error
    notes = data.map(row => ({
      id: Date.now() + Math.random(),
      content: row.content,
      color: row.color,
      x: row.position_x,
      y: row.position_y
    }))
  } catch (err) {
    console.error('Notes load error:', err)
  }
}
```
Replace all existing `saveNotes()` calls in the codebase with `saveNotesToSupabase()`.
### Step 7 — Wire the sync status indicator
```javascript
function setSyncState(state) {
  const dot = document.getElementById('sync-dot')
  if (!dot) return
  const states = {
    synced:  { bg: 'var(--success)',    shadow: 'var(--success-bg)',  title: 'Synced' },
    syncing: { bg: 'var(--warning)',    shadow: 'var(--warning-bg)',  title: 'Syncing...' },
    error:   { bg: 'var(--danger)',     shadow: 'var(--danger-bg)',   title: 'Sync error' },
    offline: { bg: 'var(--text-muted)', shadow: 'transparent',        title: 'Offline' }
  }
  const s = states[state] || states.synced
  dot.style.background = s.bg
  dot.style.boxShadow = `0 0 0 2px ${s.shadow}`
  dot.title = s.title
  dot.style.animation = state === 'syncing' ? 'pulse 1s infinite' : 'none'
}
const pulseStyle = document.createElement('style')
pulseStyle.textContent = `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`
document.head.appendChild(pulseStyle)
```
Replace the existing `.status-indicator` div with:
```html
<div id="sync-dot" class="status-indicator" title="Sync status" style="cursor:default;"></div>
```
### Step 8 — localStorage migration
```javascript
async function checkAndMigrateLocalStorage() {
  const stored = localStorage.getItem('tasks')
  if (!stored) return
  let localTasks
  try { localTasks = JSON.parse(stored) } catch { return }
  if (!localTasks || localTasks.length === 0) return
  const banner = document.createElement('div')
  banner.id = 'migration-banner'
  banner.style.cssText = `
    position:fixed; top:70px; left:50%; transform:translateX(-50%);
    background:var(--bg-card); border:1px solid var(--border-color);
    border-radius:12px; padding:16px 24px; z-index:500;
    box-shadow:0 10px 25px rgba(0,0,0,0.1); display:flex;
    align-items:center; gap:16px; font-size:14px;
  `
  banner.innerHTML = `
    <span>📦 You have <strong>${localTasks.length} tasks</strong> saved locally. Import them?</span>
    <button onclick="migrateLocalTasks()" style="background:var(--primary);color:white;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;">Import</button>
    <button onclick="dismissMigration()" style="background:none;border:1px solid var(--border-color);padding:8px 16px;border-radius:6px;cursor:pointer;">Start Fresh</button>
  `
  document.body.appendChild(banner)
  window.migrateLocalTasks = async function() {
    tasks = localTasks
    await saveTasks()
    localStorage.removeItem('tasks')
    document.getElementById('migration-banner')?.remove()
    render()
    updateStatsDisplay()
  }
  window.dismissMigration = function() {
    localStorage.removeItem('tasks')
    document.getElementById('migration-banner')?.remove()
  }
}
```
---
## Critical Rules
1. Do not change any CSS — not a single variable, class, or rule
2. Do not change any HTML structure outside the specific additions above
3. Preserve all existing task logic — quadrant mapping, recurring, subtasks, tags
4. The app must not crash if Supabase is unreachable — show error on dot, continue
5. Keep the output as a single HTML file — no external JS files, no bundler
---
## Output
Deliver `Taskmatrix-v2.html` — a complete drop-in replacement.
Verify before delivering:
- [ ] File opens in browser without console errors
- [ ] Auth screen appears when not signed in
- [ ] All existing UI renders identically after sign-in
- [ ] Supabase config placeholders clearly marked at top of script
- [ ] Sync dot defaults to green

---

# Marcus — Debug Protocol (Addendum)

## Core Principle
**Diagnose root cause before writing any fix.** Patching symptoms produces 10-round debug sessions. One correct diagnosis produces a one-round fix.

---

## Debug Decision Tree

```
Bug reported
  ↓
Claude Code: diagnose only — no fixes yet
Ask: what file, what function, what is actually happening technically?
  ↓
Fix not working after one attempt?
  ↓
STOP. Do not write more code.
  ↓
Is it a UI/modal/click bug? → Browser console inspection first
Is it a sync/save bug?      → Network tab first
  ↓
Re-diagnose from new evidence
  ↓
Fix one thing at a time
Test after every single fix before moving to next
```

---

## Tool Routing for Debugging

| Problem type | Right tool | Wrong tool |
|---|---|---|
| Modal not opening | Browser console — inspect DOM structure | Claude Code reading source |
| Click handler not firing | Browser console — check `outerHTML`, `onclick` attribute | Guessing in code |
| Sync dot red | Network tab — check request/response | Reading sync logic |
| Fix not deploying | Browser console — search for changed string in source | Assuming deploy worked |
| DB save failing | Network tab — check status code and response body | Reading JS save functions |

---

## Browser Inspection Checklist (Modal Bugs)

When a modal is not visible despite `.active` class being added:

```javascript
// 1. Is it nested inside a hidden parent?
document.getElementById('modal-id').parentElement.tagName
document.getElementById('modal-id').parentElement.id

// 2. What are computed styles?
const m = document.getElementById('modal-id')
window.getComputedStyle(m).display
window.getComputedStyle(m).opacity
window.getComputedStyle(m).visibility

// 3. Does it have dimensions?
m.getBoundingClientRect()
```

**Rule:** All modals must be direct children of `<body>`. Never nest modals inside other modals or containers with `display:none`.

---

## Network Tab Checklist (Sync/Save Bugs)

When sync dot goes red after save:
1. Filter Network tab by Fetch/XHR
2. Find the Supabase request
3. Check status code — 400/422 = payload problem, 401 = auth, 500 = server
4. Read response body — PostgREST errors are explicit (e.g. `PGRST204: column not found`)
5. Read request body — check for wrong fields, missing fields, type mismatches

**Rule:** Sync dot goes red → Network tab first, always. Never start reading code before seeing the actual error.

---

## Supabase-Specific Landmines

| Pattern | Problem | Fix |
|---|---|---|
| `.update({ id: x, ...fields })` | Postgres rejects PK update silently | Destructure id out: `const { id: _, ...payload } = row` |
| `.upsert(payload)` without id in payload | Treated as new insert, old row untouched | Keep id in upsert payload for conflict resolution |
| `onclick="fn(${uuid})"` | Hyphens = arithmetic → NaN | Always quote: `onclick="fn('${uuid}')"` |
| Missing DB column | PGRST204, silent fail in some paths | Check schema matches code before debugging JS |
| Service worker caching | Old code served despite push | Bump cache version in sw.js, hard refresh |

---

## Deployment Verification

After every push, before testing:
1. Wait 60 seconds for GitHub Pages
2. Hard refresh: `Cmd+Shift+R`
3. Verify fix deployed — search for changed string in page source or run a console check
4. Only then test the fix

Never test immediately after push — stale cache will waste rounds.

---

## Lessons from TaskMatrix Debug Session (April 10, 2026)

- 4 separate root causes for one modal bug — all structural HTML/CSS, none in JS logic
- 5 separate root causes for one save bug — spread across JS, SQL schema, and HTML attributes
- Every stuck bug was cracked by browser inspection, not code reading
- One of our own fixes (stripping id from upsert) introduced a new bug — always understand why a fix works before applying it
