# TaskMatrix (Supabase PWA) — UI/UX Audit & Roadmap (Layer 3)

> **Project:** TaskMatrix_Supabase (vanilla JS PWA, single-file index.html, ~197KB)
> **Stack:** Vanilla JS + Supabase + Dexie.js + SortableJS + WebLLM
> **Stack modules in play:** All three — this is the original PWA that the React
>   version was rebuilt from. Capacitor iOS wrapper in `/ios/`.
> **This doc holds:** current ✅/❌/⚠️ status, code-level evidence, comparison
>   to React version, prioritized roadmap.
> **Last updated:** June 2026
> **Audit method:** Live code inspection (index.html ~6,800 lines, sw.js, manifest)

---

## Quick comparison: Supabase PWA vs React rebuild

The React version was supposed to be the upgrade. In reality, the Supabase PWA
is **more mature in every area that matters for a PWA** — offline, native feel,
accessibility preferences. The React version has better active states and
aria-label coverage, but the Supabase PWA already ships working offline with
a service worker, Dexie cache, and a sync queue.

| Area | React | Supabase PWA |
|---|---|---|
| Offline support | ❌ Nothing | ✅ SW + Dexie + sync queue + HTML fallback |
| prefers-reduced-motion | ❌ Nothing | ✅ CSS media query + JS matchMedia gating |
| Safe-area insets | ❌ Nothing | ✅ Extensive — top, bottom, left, right |
| Haptics | ❌ Nothing | ✅ tmHaptic() with vibrate fallback |
| Bottom dock / one-handed | ❌ | ✅ 4-button dock bar |
| Dynamic type | ❌ Fixed px | ❌ Fixed px |
| aria-label | ⚠️ ~60% | ❌ 0% |
| Touch targets ≥44px | ❌ Under | ❌ Under (worse — dock buttons ~32px) |
| Active states | ✅ scale 90% | ⚠️ opacity 60-70%, consistent |
| Skeleton loads | ❌ Text | ❌ Nothing |
| Dark mode | ✅ Complete | ✅ Complete |
| Optimistic/local-first | ✅ Local state → await | ✅ Dexie → Supabase |
| Swipe gestures | ❌ | ❌ |
| Focus indicators | ⚠️ focus: not focus-visible: | ❌ outline: none everywhere |

**Net:** The Supabase PWA is a better PWA. The React version has better
micro-interactions. Neither has good a11y. The React version's offline gap is
the critical one — the PWA already solved this.

---

## Status against the standards

### Layer 1 — Universal Principles

| Area (→ source rule) | Status | Evidence |
|---|---|---|
| Touch targets ≥44px (§1) | ❌ | Dock buttons: `padding: 0 4px` + 24px SVG = ~32px. Quick-add: `padding:4px 10px; font-size:12px` — ~32px. Quadrant move: `padding:4px`. All well under 44px. |
| 24px hard floor (§1) | ⚠️ | Dock button SVGs are 24×24px exactly — this meets the floor. But the effective tap target (padded area) is smaller. Quad options at `font-size:11px; padding:6px 8px` may dip below 24px tall. |
| Press/active states (§4) | ⚠️ | `dock-btn:active {opacity:0.6}` and `compact-more-item:active {opacity:0.7}` — present and consistent. Opacity-based rather than scale, so less tactile than the React version's `active:scale-95`. No active states found on quadrant move buttons or menu items. |
| Optimistic updates (§4) | ✅ | Dexie-first writes: tasks and notes are written to IndexedDB immediately, then synced to Supabase. `flushPendingSync()` handles offline reconciliation. This is the pattern the standards call for, implemented with IndexedDB. |
| Skeleton loads (§4) | ❌ | No skeleton or shimmer. Dexie cache means returning visitors see content fast, but first-time load has no visual loading state beyond the app shell. |
| prefers-reduced-motion (§5) | ✅ | **CSS:** All layout animations wrapped in `@media (prefers-reduced-motion: no-preference)`. **JS:** Haptics and drag animations gated behind `matchMedia('(prefers-reduced-motion: reduce)').matches` before firing. This is comprehensive — better than the React version. |
| Dark mode (§6) | ✅ | `[data-theme="dark"]` custom properties covering every color variable. System detect via `matchMedia`. Complete. |
| aria-label on icon buttons (§7) | ❌ | **Zero.** Not a single `aria-label` in the entire codebase. Every icon button (theme, sign-out, pomodoro, search, menu, dock buttons, task actions) is invisible to screen readers. This is the most severe a11y gap. |
| Dynamic type (§7) | ❌ | All `px`-based. `font-size: 12px`, `font-size: 10px`, `font-size: 14px`. No `rem` or relative units. The dock button labels at `font-size: 10px` are below minimum readable size. |
| Focus indicator hygiene (§7) | ❌ | No `focus-visible` anywhere. `outline: none` used on inputs and buttons. Keyboard users may have no visible focus indication. |
| One-handed reach (§2) | ✅ | **Bottom dock bar with 4 primary actions.** This is the right pattern — primary controls at thumb-reachable bottom. Contrast with the React version's top-only layout. |
| Swipe gestures (§3) | ❌ | SortableJS drag-and-drop for reordering within quadrants. No swipe-to-complete. |
| State persistence (§8) | ✅ | Dexie IndexedDB for local persistence + Supabase for cloud sync. Theme likely in localStorage. Offline boot path confirmed in init(). |
| Offline behavior (§9) | ✅ | Service worker with cache-first assets + network-first navigation + Supabase API fallback + offline HTML page. Dexie cache-first render. `flushPendingSync()` queue. Online/offline event listeners. Sync state machine (synced/syncing/error/offline). This is production-grade. |

### Stack module: React + Tailwind

**N/A** — this is vanilla CSS. The React module doesn't apply. However, the
conceptual equivalents map as follows:

| React/Tailwind concept | Vanilla equivalent | Status |
|---|---|---|
| `active:scale-*` | `:active { opacity }` | ⚠️ Present but opacity, not scale |
| `min-h-[44px]` | Explicit sizing | ❌ Not used |
| `motion-reduce:` | `@media (prefers-reduced-motion)` | ✅ Gated |
| Skeleton | None | ❌ |
| aria-label | None | ❌ |

### Stack module: Capacitor + iOS WebView

| Area | Status | Evidence |
|---|---|---|
| `dvh` / viewport | ❌ | `min-height: 100vh` used, not `100dvh`. The Capacitor wrapper uses `viewport-fit=cover` on the meta tag. |
| Safe-area insets | ✅ | `env(safe-area-inset-top)` on header, `env(safe-area-inset-bottom)` on dock bar, all four sides respected with `max()` fallbacks. Documented: "this stops iOS from recomputing the safe-area insets mid-scroll." |
| Haptics | ✅ | `tmHaptic()` function bridges `navigator.vibrate` with Capacitor Haptics plugin. Fires on task complete with SUCCESS notification pattern. Gated on reduced-motion preference. |
| Platform detection | ✅ | Capacitor check in `tmHaptic()` — gates native haptics behind `Capacitor.getPlatform() === 'ios'`. Falls back to `navigator.vibrate`. |
| Keyboard avoidance | ⚠️ | `interactive-widget=resizes-content` on viewport meta. Not explicitly tested for keyboard overlap with dock bar. |

### Stack module: PWA / Offline

| Area | Status | Evidence |
|---|---|---|
| Service worker | ✅ | `sw.js` v8. Cache-first for assets, network-first for nav, Supabase API fallback with JSON 503. `skipWaiting()` + `claim()`. Offline HTML fallback page with styled content. Cache version bumps for invalidation. |
| Offline indicator | ✅ | Sync state machine shows "Offline" / "Syncing..." / "Error" status. `navigator.onLine` + `online`/`offline` event listeners. Sync state dot is visible in UI. |
| IndexedDB mutation queue | ✅ | Dexie `pendingSync` field. `flushPendingSync()` on reconnect. Tombstone pattern for offline deletes (marker kept in Dexie, confirmed on server before removal). |
| Cache-first render | ✅ | Init flow: Supabase → fallback to Dexie cache → offline boot without CDN. Returning visitors see Dexie data before Supabase response. |
| Performance targets | ⚠️ | Not measured. 197KB single-file app — HTML parse time may be significant. CDN scripts (Supabase, Dexie, SortableJS) add render-blocking weight. |

---

## What's genuinely good

1. **The offline architecture is production-grade.** Service worker with three
   strategies (network-first nav, cache-first assets, network-first API),
   Dexie write-through cache, sync queue with tombstone pattern, offline fallback
   HTML page, online/offline event listeners — this is more complete than most
   commercial PWAs.

2. **`prefers-reduced-motion` is comprehensively implemented.** Both CSS media
   queries AND JavaScript `matchMedia()` checks. Haptics and drag animations are
   independently gated. This exceeds the standard — the React version has none
   of this.

3. **Safe-area insets are handled correctly everywhere.** Header, dock, overlays,
   menus — every `position: fixed` element respects the notch and home indicator.
   Even the edge case of iOS recomputing insets mid-scroll is documented and
   handled.

4. **The bottom dock bar** is the right navigation pattern for a mobile PWA.
   Four primary actions at thumb-reachable bottom position. The React version
   lost this.

5. **Haptics are wired in** with platform detection. Capacitor native on iOS,
   `navigator.vibrate` fallback, gated on reduced-motion preference. Task
   completion gets a SUCCESS notification buzz.

---

## What needs fixing

1. **`aria-label` on every icon button.** Zero today. Every dock button, header
   icon, task action, menu item needs one. This is the single biggest a11y gap.

2. **Touch targets.** Dock buttons, quick-add quadrant buttons, quadrant move
   buttons all need `min-height: 44px` and adequate padding.

3. **Dynamic type.** Replace all `px` font sizes with `rem`. The `font-size: 10px`
   on dock button labels is below minimum readable size regardless of dynamic type.

4. **`focus-visible` migration.** Replace bare `outline: none` patterns with
   `focus-visible`-gated focus rings.

5. **`dvh` instead of `vh`.** The root `min-height: 100vh` should be `100dvh`
   to handle iOS URL bar correctly. The Capacitor module explicitly calls for
   this.

## Things the React version should steal from this

1. The service worker + Dexie offline architecture
2. The `prefers-reduced-motion` gating pattern
3. The safe-area inset handling
4. The `tmHaptic()` function with platform detection
5. The bottom dock bar for one-handed mobile use
6. The sync state machine (synced/syncing/error/offline)

---

*Audit: live code inspection, June 2026. index.html ~6,800 lines, sw.js, manifest.*
