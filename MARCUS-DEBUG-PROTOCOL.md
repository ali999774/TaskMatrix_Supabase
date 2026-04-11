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
