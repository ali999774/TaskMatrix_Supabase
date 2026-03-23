# FINAL-02 — Jordan (UX Engineer)
**Project:** TaskMatrix — UX Improvements
**Agent:** Jordan
**Role:** UX Engineer
**Model:** Claude Sonnet 4.6
**Thinking:** Standard
**Phase:** 2 — UX layer on top of Supabase-wired file
**Input:** Taskmatrix-v2.html (Marcus's output — Supabase already wired)
**Output:** Taskmatrix-v3.html
---
## Your Mission
You are adding 5 targeted UX improvements to an existing single-file HTML/JS
Eisenhower Matrix task manager. Marcus has already wired it to Supabase.
Your job is UX only — no backend changes, no CSS redesign.
**The rules:**
- Do NOT touch any Supabase logic, auth, or sync functions
- Do NOT change any existing CSS variables or quadrant styles
- Do NOT add new dependencies
- Preserve every existing feature exactly as-is
- Deliver a single HTML file: Taskmatrix-v3.html
---
## The 5 Changes
---
### Change 1 — Fix the Quick Add quadrant problem
**The bug:** Every quick-added task gets `importance: 3, urgency: 3`, which
maps to the Eliminate quadrant via `getQuad()`. Tasks silently vanish into
the lowest-priority bucket on every quick add.
**The fix:** After a task is quick-added, show a compact inline tray directly
below the top bar input for 4 seconds. The tray shows 4 quadrant buttons.
If the user clicks one, the task moves to that quadrant immediately.
If the tray times out without a click, the task stays in Eliminate and
the tray fades out — no disruption.
**Implementation:**
Add a tray element to the HTML, directly after the top bar:
```html
<div id="quick-add-tray" style="
  display:none;
  position:fixed;
  top:58px;
  left:50%;
  transform:translateX(-50%);
  background:var(--bg-card);
  border:1px solid var(--border-color);
  border-radius:0 0 10px 10px;
  padding:8px 16px;
  z-index:99;
  gap:8px;
  align-items:center;
  box-shadow:0 4px 12px rgba(0,0,0,0.1);
  font-size:13px;
  color:var(--text-muted);
">
  <span>Move to:</span>
  <button onclick="quickAddMoveTo('do-first')"   style="padding:4px 10px;border-radius:6px;border:none;cursor:pointer;background:var(--quad-red-header);color:var(--quad-red-text);font-size:12px;font-weight:600;">🔴 Do First</button>
  <button onclick="quickAddMoveTo('schedule')"   style="padding:4px 10px;border-radius:6px;border:none;cursor:pointer;background:var(--quad-blue-header);color:var(--quad-blue-text);font-size:12px;font-weight:600;">🔵 Schedule</button>
  <button onclick="quickAddMoveTo('delegate')"   style="padding:4px 10px;border-radius:6px;border:none;cursor:pointer;background:var(--quad-yellow-header);color:var(--quad-yellow-text);font-size:12px;font-weight:600;">🟡 Delegate</button>
  <button onclick="quickAddMoveTo('eliminate')"  style="padding:4px 10px;border-radius:6px;border:none;cursor:pointer;background:var(--quad-gray-header);color:var(--quad-gray-text);font-size:12px;font-weight:600;">⚪ Eliminate</button>
</div>
```
Add JS:
```javascript
let lastQuickAddedId = null
let quickAddTrayTimer = null
function showQuickAddTray(taskId) {
  lastQuickAddedId = taskId
  const tray = document.getElementById('quick-add-tray')
  tray.style.display = 'flex'
  clearTimeout(quickAddTrayTimer)
  quickAddTrayTimer = setTimeout(() => {
    tray.style.display = 'none'
    lastQuickAddedId = null
  }, 4000)
}
function quickAddMoveTo(quadrant) {
  if (!lastQuickAddedId) return
  const task = tasks.find(t => t.id === lastQuickAddedId)
  if (!task) return
  const quadMap = {
    'do-first':  { importance: 5, urgency: 5 },
    'schedule':  { importance: 5, urgency: 2 },
    'delegate':  { importance: 2, urgency: 5 },
    'eliminate': { importance: 2, urgency: 2 }
  }
  Object.assign(task, quadMap[quadrant])
  saveTasks()
  render()
  document.getElementById('quick-add-tray').style.display = 'none'
  clearTimeout(quickAddTrayTimer)
  lastQuickAddedId = null
}
```
In `handleQuickAdd()`, after `tasks.push(...)`, add:
```javascript
const newTaskId = tasks[tasks.length - 1].id
showQuickAddTray(newTaskId)
```
---
### Change 2 — Remove the quadrant height cap
**The problem:** Each `.quad-body` has `max-height: 400px; overflow-y: auto`.
This creates internal scroll within each quadrant box, hiding tasks below the
fold and losing situational awareness.
**The fix:** Find this CSS block:
```css
.quad-body {
  padding: 16px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}
```
Replace with:
```css
.quad-body {
  padding: 16px;
  min-height: 200px;
}
```
Two lines removed. That's the entire change.
---
### Change 3 — Direct quadrant reassignment on task card
**The problem:** Moving a task between quadrants requires opening the full
modal, adjusting two sliders, and saving. 4 steps for the most common action
in an Eisenhower system.
**The fix:** A small ⊞ button on each task card opens a 2×2 popover with
the 4 quadrant options. One click moves the task. No modal required.
**CSS to add:**
```css
.quadrant-move-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  border-radius: 4px;
  position: relative;
}
.quadrant-move-btn:hover { color: var(--text-secondary); }
.quadrant-popover {
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 20px rgba(0,0,0,0.12);
  z-index: 300;
  padding: 6px;
  display: none;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  min-width: 180px;
}
.quadrant-popover.show { display: grid; }
.quad-option {
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
}
.quad-option.red    { background:var(--quad-red-header);    color:var(--quad-red-text); }
.quad-option.blue   { background:var(--quad-blue-header);   color:var(--quad-blue-text); }
.quad-option.yellow { background:var(--quad-yellow-header); color:var(--quad-yellow-text); }
.quad-option.gray   { background:var(--quad-gray-header);   color:var(--quad-gray-text); }
.quad-option:hover  { filter: brightness(0.95); }
```
**JS to add:**
```javascript
function toggleQuadrantPopover(taskId, event) {
  event.stopPropagation()
  document.querySelectorAll('.quadrant-popover.show').forEach(p => p.classList.remove('show'))
  const popover = document.getElementById('qpop-' + taskId)
  if (popover) popover.classList.toggle('show')
}
function moveTaskToQuadrant(taskId, quadrant, event) {
  event.stopPropagation()
  const task = tasks.find(t => t.id === taskId)
  if (!task) return
  const quadMap = {
    'do-first':  { importance: 5, urgency: 5 },
    'schedule':  { importance: 5, urgency: 2 },
    'delegate':  { importance: 2, urgency: 5 },
    'eliminate': { importance: 2, urgency: 2 }
  }
  Object.assign(task, quadMap[quadrant])
  saveTasks()
  render()
}
```
Add to the existing `document.addEventListener('click', ...)` handler:
```javascript
document.querySelectorAll('.quadrant-popover.show').forEach(p => p.classList.remove('show'))
```
In the `render()` function, inside the task card HTML template, add after
the pin button and before the delete × button:
```javascript
`<div style="position:relative;">
  <button class="quadrant-move-btn" onclick="toggleQuadrantPopover(${task.id}, event)" title="Move to quadrant">⊞</button>
  <div class="quadrant-popover" id="qpop-${task.id}">
    <button class="quad-option red"    onclick="moveTaskToQuadrant(${task.id},'do-first',event)">🔴 Do First</button>
    <button class="quad-option blue"   onclick="moveTaskToQuadrant(${task.id},'schedule',event)">🔵 Schedule</button>
    <button class="quad-option yellow" onclick="moveTaskToQuadrant(${task.id},'delegate',event)">🟡 Delegate</button>
    <button class="quad-option gray"   onclick="moveTaskToQuadrant(${task.id},'eliminate',event)">⚪ Eliminate</button>
  </div>
</div>`
```
---
### Change 4 — Today strip above the matrix
**The problem:** Tasks due today and overdue are buried inside their quadrants
mixed with everything else. No single daily answer view exists.
**The fix:** A collapsible strip above the matrix showing all tasks due today
or overdue as compact chips, ordered by quadrant priority. Hidden entirely on
clean days — zero visual noise when nothing is urgent.
**HTML:** Add directly above the `.card` div that wraps the matrix:
```html
<div id="today-strip" style="display:none; margin-bottom:16px;">
  <div style="
    background:var(--bg-card);
    border-radius:10px;
    border-left:4px solid var(--danger);
    padding:12px 16px;
    box-shadow:0 2px 4px rgba(0,0,0,0.08);
  ">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-weight:700; font-size:14px; color:var(--text-primary);">
        📅 Today &amp; Overdue
        <span id="today-strip-count" style="
          background:var(--danger-bg); color:var(--danger);
          font-size:11px; padding:2px 7px; border-radius:9999px; margin-left:6px;
        ">0</span>
      </span>
      <button onclick="toggleTodayStrip()" id="today-strip-toggle"
        style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;">
        Hide ▲
      </button>
    </div>
    <div id="today-strip-tasks" style="display:flex; flex-wrap:wrap; gap:8px;"></div>
  </div>
</div>
```
**JS:**
```javascript
let todayStripCollapsed = false
function toggleTodayStrip() {
  todayStripCollapsed = !todayStripCollapsed
  const tasksEl = document.getElementById('today-strip-tasks')
  const toggleBtn = document.getElementById('today-strip-toggle')
  tasksEl.style.display = todayStripCollapsed ? 'none' : 'flex'
  toggleBtn.textContent = todayStripCollapsed ? 'Show ▼' : 'Hide ▲'
}
function renderTodayStrip() {
  const activeTasks = tasks.filter(t => t.status !== 'completed')
  const quadPriority = { 'do-first': 0, 'schedule': 1, 'delegate': 2, 'eliminate': 3 }
  const todayTasks = activeTasks
    .filter(t => {
      const s = getDueStatus(t.dueDate)
      return s === 'today' || s === 'overdue'
    })
    .sort((a, b) => {
      const aOverdue = getDueStatus(a.dueDate) === 'overdue'
      const bOverdue = getDueStatus(b.dueDate) === 'overdue'
      if (aOverdue && !bOverdue) return -1
      if (!aOverdue && bOverdue) return 1
      return quadPriority[getQuad(a.importance, a.urgency)] -
             quadPriority[getQuad(b.importance, b.urgency)]
    })
  const strip = document.getElementById('today-strip')
  const container = document.getElementById('today-strip-tasks')
  const countBadge = document.getElementById('today-strip-count')
  if (todayTasks.length === 0) {
    strip.style.display = 'none'
    return
  }
  strip.style.display = 'block'
  countBadge.textContent = todayTasks.length
  const quadColors = {
    'do-first':  'var(--quad-red-header)',
    'schedule':  'var(--quad-blue-header)',
    'delegate':  'var(--quad-yellow-header)',
    'eliminate': 'var(--quad-gray-header)'
  }
  const quadTextColors = {
    'do-first':  'var(--quad-red-text)',
    'schedule':  'var(--quad-blue-text)',
    'delegate':  'var(--quad-yellow-text)',
    'eliminate': 'var(--quad-gray-text)'
  }
  container.innerHTML = todayTasks.map(task => {
    const quad = getQuad(task.importance, task.urgency)
    const isOverdue = getDueStatus(task.dueDate) === 'overdue'
    const bg = isOverdue ? 'var(--danger-bg)' : quadColors[quad]
    const color = isOverdue ? 'var(--danger)' : quadTextColors[quad]
    const overdueMarker = isOverdue ? '⚠ ' : ''
    return `
      <div onclick="openTaskModal(${task.id})" style="
        background:${bg}; color:${color};
        padding:5px 12px; border-radius:20px;
        font-size:12px; font-weight:600;
        cursor:pointer; white-space:nowrap;
        border:1px solid ${isOverdue ? 'var(--danger)' : 'transparent'};
        max-width:200px; overflow:hidden; text-overflow:ellipsis;
      " title="${task.title}">
        ${overdueMarker}${task.title}
      </div>
    `
  }).join('')
}
```
At the end of the `render()` function add:
```javascript
renderTodayStrip()
```
---
### Change 5 — Context/domain switcher
**The problem:** All life domains are mixed together. No way to focus the
matrix on one context without using the buried search/filter panel.
**The fix:** A segmented control above the matrix filtering the entire view
to one domain. All is default — zero disruption to normal use.
**Domains:** All / Clinic / Practice Launch / Dev / Personal
**HTML:** Add directly inside `.container`, above the search container:
```html
<div id="context-switcher" style="
  display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap;
">
  <button class="ctx-btn active" onclick="setContext('all')"             data-ctx="all">All</button>
  <button class="ctx-btn"        onclick="setContext('clinic')"          data-ctx="clinic">🏥 Clinic</button>
  <button class="ctx-btn"        onclick="setContext('practice-launch')" data-ctx="practice-launch">🏗 Practice Launch</button>
  <button class="ctx-btn"        onclick="setContext('dev')"             data-ctx="dev">💻 Dev</button>
  <button class="ctx-btn"        onclick="setContext('personal')"        data-ctx="personal">👤 Personal</button>
</div>
```
**CSS to add:**
```css
.ctx-btn {
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.ctx-btn:hover {
  border-color: var(--primary);
  color: var(--text-secondary);
}
.ctx-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
```
**JS:**
```javascript
let activeContext = 'all'
function setContext(ctx) {
  activeContext = ctx
  document.querySelectorAll('.ctx-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ctx === ctx)
  })
  const categorySelect = document.getElementById('filter-category')
  if (categorySelect) categorySelect.value = ctx === 'all' ? 'all' : ctx
  applyFilters()
}
function syncContextFromSelect() {
  const val = document.getElementById('filter-category').value
  activeContext = val
  document.querySelectorAll('.ctx-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ctx === val)
  })
}
```
Update the category select options to match the new domains:
```html
<select id="filter-category" class="filter-select" onchange="syncContextFromSelect(); applyFilters()">
  <option value="all">All Categories</option>
  <option value="clinic">Clinic</option>
  <option value="practice-launch">Practice Launch</option>
  <option value="dev">Dev</option>
  <option value="personal">Personal</option>
</select>
```
Update `handleQuickAdd()` — change the default category from `'personal'` to:
```javascript
category: activeContext === 'all' ? 'personal' : activeContext,
```
---
## Delivery Checklist
- [ ] Quick add tray appears after adding a task, disappears after 4s or on click
- [ ] Quick-added task without tray interaction lands in Eliminate (expected)
- [ ] Quadrants grow with content — no internal scroll box
- [ ] ⊞ button on every task card opens 2×2 popover
- [ ] Clicking a quadrant option moves the task and re-renders
- [ ] Popover closes on outside click
- [ ] Today strip appears only when tasks are due today or overdue
- [ ] Today strip hidden when no urgent tasks exist
- [ ] Overdue tasks show ⚠ and red styling in the strip
- [ ] Clicking a chip opens the task modal
- [ ] Context switcher shows 5 buttons, All is default active
- [ ] Clicking a context filters the matrix to that domain
- [ ] Context and category select stay in sync
- [ ] Quick add inherits active context
- [ ] All Supabase sync, auth, and data functions untouched
- [ ] File opens with zero console errors
