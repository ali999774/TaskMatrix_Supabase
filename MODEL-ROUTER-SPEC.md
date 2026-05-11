# TaskMatrix — Three-Tier Model Router Architecture Spec

**Author:** Ali + Hermes (Charlie)  
**Date:** 2026-05-11  
**Status:** Design spec — ready for implementation

---

## Overview

A vanilla JS module (`ModelRouter`) that abstracts all AI inference behind a single interface. The app code never knows or cares which tier is active. Tiers can be swapped at runtime, and a configurable fallback chain handles failures transparently.

**File:** `src/model-router.js`  
**Consumed by:** `src/voiceTask.js` (task parsing), any future feature (quadrant suggestion, decomposition, smart search)  
**Dependency:** `src/config.js` must define `window.MODEL_ROUTER_CONFIG` before the router loads

---

## 1. Config Schema

### Location and lifecycle

- Defined in `src/config.js` as `window.MODEL_ROUTER_CONFIG`
- Read once at `ModelRouter.init()`. Changes require a page reload — this is intentional. Runtime tier switching changes the *active tier*, not the config.
- API keys live here (not in `.env` — this is a browser PWA, not Node). The config.js file is gitignored.

### Annotated JSON schema

```js
window.MODEL_ROUTER_CONFIG = {
  // ── Global router settings ──────────────────────────────────────
  defaultTier: "edge",             // "edge" | "cloud" | "local"
  fallbackChain: ["cloud", "edge", "local"], // ordered list of tiers to try
  maxRetriesPerTier: 1,            // how many times to retry a tier before falling back
  requestTimeoutMs: 30000,         // per-request timeout (applies to cloud + local)
  edge: {
    enabled: true,
    model: "gemma-3-1b-it",        // WebLLM model ID (see WebLLM model zoo)
    // ^ Recommendation: Gemma 3 1B over Qwen2.5 0.5B.
    //   Gemma has better instruction following at nearly the same size.
    //   Qwen is a valid fallback if WebGPU memory is extremely tight.
    modelUrl: null,                 // null = use WebLLM CDN. Override for self-hosted.
    maxTokens: 256,                 // keep low — browser inference is slow
    temperature: 0.3,
    cacheModel: true,               // store in Cache API after first download
    wasmWorkerCount: 2              // WebLLM internal: number of WASM workers
  },
  cloud: {
    enabled: true,
    primary: {
      provider: "anthropic",
      apiKey: "ANTHROPIC_API_KEY", // references window.ANTHROPIC_API_KEY
      model: "claude-sonnet-4-20250514",
      endpoint: "https://api.anthropic.com/v1/messages",
      maxTokens: 1024,
      temperature: 0.3
    },
    fallback: {
      provider: "openai",
      apiKey: "OPENAI_API_KEY",     // references window.OPENAI_API_KEY
      model: "gpt-4o",
      endpoint: "https://api.openai.com/v1/chat/completions",
      maxTokens: 1024,
      temperature: 0.3
    }
  },
  local: {
    enabled: true,
    endpoint: "http://localhost:11434/api/generate",
    model: "qwen2.5:7b",            // configurable — change this to any Ollama model
    maxTokens: 512,
    temperature: 0.3,
    healthCheckMs: 2000             // timeout for reachability check
  }
};
```

### Why these defaults

- **`defaultTier: "edge"`** — TaskMatrix is a PWA. The offline-first, zero-API-key experience is the primary value prop. Cloud and local are upgrades, not the baseline.
- **`fallbackChain: ["cloud", "edge", "local"]`** — When edge fails (no WebGPU, model not cached, browser too old), jump to cloud immediately (fast, reliable). Local is last because it's the slowest and least available.
- **Edge model: Gemma 3 1B over Qwen 0.5B** — Gemma 3 1B has better instruction following. Task parsing is a structured-output task; Qwen 0.5B will hallucinate JSON structure under pressure. Pay the extra ~700MB download for reliability.
- **Cloud primary: Claude over OpenAI** — Claude is better at structured JSON extraction (your exact use case). OpenAI is the fallback because it's universally available.

---

## 2. Module API

### `ModelRouter` class

Instantiated once, stored on `window.modelRouter`. The app never calls tier-specific code directly.

```js
/**
 * Three-tier model router for TaskMatrix.
 *
 * Usage:
 *   await ModelRouter.init();           // called once in app bootstrap
 *   const result = await ModelRouter.complete(prompt);
 *   await ModelRouter.switchTier("cloud");
 *   const status = ModelRouter.status();
 */
class ModelRouter {
  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Initialize the router. Reads MODEL_ROUTER_CONFIG, checks tier
   * availability, and activates the default tier.
   *
   * Must be called once before any other method.
   * Safe to call multiple times (subsequent calls are no-ops).
   *
   * @returns {Promise<void>}
   */
  static async init() {}

  // ── Core inference ───────────────────────────────────────────────

  /**
   * Send a prompt to the active tier and return a completion.
   *
   * If the active tier fails:
   *   1. Retries once (per maxRetriesPerTier)
   *   2. Falls back through fallbackChain until one succeeds
   *   3. If all tiers exhausted, rejects with ModelRouterError
   *
   * @param {PromptEnvelope} prompt - standard prompt contract (see §5)
   * @returns {Promise<CompletionResult>}
   * @throws {ModelRouterError}
   */
  static async complete(prompt) {}

  // ── Tier management ──────────────────────────────────────────────

  /**
   * Switch the active tier at runtime.
   *
   * If switching to "edge" and the model isn't cached, begins the
   * download flow (see §4). Returns immediately; monitor `status()`
   * for progress.
   *
   * @param {"edge" | "cloud" | "local"} tier
   * @returns {Promise<void>}
   * @throws {ModelRouterError} if tier is disabled in config
   */
  static async switchTier(tier) {}

  /**
   * Check whether a specific tier is currently available.
   *
   * "edge": WebGPU API exists AND model is cached (or download complete)
   * "cloud": primary or fallback API key is present in window.*
   * "local": Ollama endpoint responds to GET / within healthCheckMs
   *
   * @param {"edge" | "cloud" | "local"} tier
   * @returns {Promise<boolean>}
   */
  static async isAvailable(tier) {}

  // ── Status & introspection ───────────────────────────────────────

  /**
   * Return the router's current state.
   *
   * @returns {RouterStatus}
   */
  static status() {}

  // ── Events (for UI binding) ─────────────────────────────────────

  /**
   * Subscribe to router events.
   *
   * Events emitted:
   *   "tier:changed"     → { from, to }
   *   "edge:progress"    → { state, progress, loaded, total }  (see §4)
   *   "edge:ready"       → { model }
   *   "edge:error"       → { error }
   *   "fallback"         → { from, to, reason }
   *   "error"            → { tier, error }
   *
   * @param {string} event
   * @param {Function} callback
   */
  static on(event, callback) {}

  /**
   * Remove an event subscription.
   *
   * @param {string} event
   * @param {Function} callback
   */
  static off(event, callback) {}
}
```

### Supporting types

```js
/**
 * @typedef {Object} PromptEnvelope
 * @property {string} system  - system prompt (instructions, context)
 * @property {string} user    - user message (the actual query)
 * @property {number} [maxTokens]  - override tier default (optional)
 * @property {number} [temperature] - override tier default (optional)
 * @property {Object} [metadata] - arbitrary key-value passthrough
 */

/**
 * @typedef {Object} CompletionResult
 * @property {string} text       - the completion text
 * @property {string} tier       - which tier served the request
 * @property {string} model      - which model (e.g. "gemma-3-1b-it")
 * @property {number} latencyMs  - round-trip time
 * @property {boolean} fallback  - true if fallback was used
 * @property {string} [fallbackReason] - why the primary tier failed
 */

/**
 * @typedef {Object} RouterStatus
 * @property {string} activeTier      - "edge" | "cloud" | "local"
 * @property {Object} tiers           - per-tier availability
 * @property {boolean} initialized    - init() completed
 * @property {Object|null} edgeDownload - edge download state (see §4)
 * @property {Object|null} lastError   - most recent error
 */
```

---

## 3. Fallback Chain Logic

### Decision tree

```
complete(prompt)
  │
  ├─ Try: activeTier
  │   ├─ Success → return result
  │   └─ Fail → emit("fallback", { from: activeTier, reason })
  │       │
  │       └─ Walk fallbackChain (skip activeTier, skip disabled tiers)
  │           │
  │           ├─ For each tier in chain:
  │           │   ├─ Check: isAvailable(tier) ?
  │           │   │   ├─ No  → skip, record reason
  │           │   │   └─ Yes → try complete on this tier
  │           │   │       ├─ Success → return result (with fallback=true)
  │           │   │       └─ Fail   → skip, record reason, continue chain
  │           │   └─ If maxRetriesPerTier > 0, retry same tier once before skipping
  │           │
  │           └─ Chain exhausted → throw ModelRouterError
  │               .message = "All tiers exhausted"
  │               .tierErrors = [{ tier, reason }, ...]
```

### Why retry-before-fallback instead of immediate-fallback

Retry the same tier once (with exponential backoff: 500ms, then 1s) before falling back. Most cloud failures are transient — rate limits, brief network blips, 503s. Falling back from Claude to Gemini to local Ollama because of one 429 wastes tokens and adds latency. One retry catches 90% of transient failures without meaningfully delaying the fallback to a real outage.

### ModelRouterError

```js
class ModelRouterError extends Error {
  constructor(message, { tierErrors = [], code } = {}) {
    super(message);
    this.name = "ModelRouterError";
    this.tierErrors = tierErrors;  // [{ tier, reason, statusCode }]
    this.code = code;              // "ALL_TIERS_EXHAUSTED" | "TIER_DISABLED" | "TIMEOUT"
    this.timestamp = Date.now();
  }
}
```

The UI layer should catch `ModelRouterError` and show a user-friendly message. Do not expose `tierErrors` to users — log them to console for debugging.

---

## 4. Edge Onboarding State Machine

### States

```
 ┌──────────┐
 │ UNKNOWN  │  ← router.init() not yet called
 └────┬─────┘
      │ init()
      ▼
 ┌──────────┐
 │ CHECKING │  ← probing WebGPU support
 └────┬─────┘
      │
      ├── WebGPU not available ──────► UNAVAILABLE (emit "edge:unavailable")
      │
      └── WebGPU available
           │
           ▼
      ┌──────────┐
      │  CACHED? │  ← check Cache API for model weights
      └────┬─────┘
           │
           ├── Model cached ──► READY (emit "edge:ready")
           │
           └── Not cached
                │
                ▼
           ┌───────────┐
           │ DOWNLOADING│  ← fetching model weights (~500MB)
           └─────┬──────┘
                 │
                 ├── Progress update ──► emit "edge:progress" ({ loaded, total, progress })
                 │
                 ├── Download complete ──► CACHING ──► READY (emit "edge:ready")
                 │
                 └── Download fails ──► ERROR (emit "edge:error")
                      │
                      └── User retries → DOWNLOADING
```

### What the UI needs at each state

| State | UI should show |
|-------|----------------|
| `UNKNOWN` | Nothing yet — router hasn't initialized |
| `CHECKING` | Spinner + "Checking browser capabilities…" |
| `UNAVAILABLE` | "WebGPU not supported in this browser. Try Chrome 113+ or Edge." + button: "Use Cloud instead" |
| `CACHED` | Transient — flashes to READY within ~200ms |
| `DOWNLOADING` | Progress bar + "Downloading AI model (XX MB / ~500 MB)" + cancel button |
| `READY` | Green checkmark + "AI ready — running on your device" |
| `ERROR` | "Download failed — check your connection" + retry button |

### UI integration pattern

The UI subscribes to events:

```js
ModelRouter.on("edge:progress", ({ progress, loaded, total }) => {
  // update progress bar: (loaded / total * 100)%
  // show: `${(loaded / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB`
});

ModelRouter.on("edge:ready", ({ model }) => {
  // show: "✓ Ready — Gemma 3 1B running locally"
  // enable tier-switch dropdown, enable AI features
});

ModelRouter.on("edge:error", ({ error }) => {
  // show error message + retry / fallback-to-cloud buttons
});
```

### Design decisions for edge onboarding

- **Auto-download on first `switchTier("edge")`, not on `init()`.** The user may never use edge tier. Don't burn 500MB of their bandwidth on page load. Init just checks capability; download only begins when the user (or code) explicitly activates the edge tier.
- **Cache API, not IndexedDB.** WebLLM already uses the Cache API. Don't fight it. The service worker (`sw.js`) can serve cached model weights offline.
- **No background download.** The Progress API exists but browser support is patchy for large blobs. The download blocks the tier until complete. Show a progress bar; don't try to be clever.

---

## 5. Prompt Contract

### The one interface every tier must satisfy

```js
/**
 * @typedef {Object} PromptEnvelope
 * @property {string} system  - System prompt (instructions, role, constraints)
 * @property {string} user    - User message (the actual query to process)
 * @property {number} [maxTokens]  - Override tier default. If omitted, tier default used.
 * @property {number} [temperature] - Override tier default. If omitted, tier default used.
 * @property {Object} [metadata] - Arbitrary passthrough for logging/debugging
 */
```

### How each tier maps the envelope

**Edge (WebLLM / ChatModule):**
```js
// WebLLM uses an OpenAI-compatible chat format
const messages = [
  { role: "system", content: prompt.system },
  { role: "user",   content: prompt.user }
];
const reply = await engine.chat.completions.create({
  messages,
  max_tokens: prompt.maxTokens ?? config.edge.maxTokens,
  temperature: prompt.temperature ?? config.edge.temperature
});
return reply.choices[0].message.content;
```

**Cloud (Anthropic):**
```js
// Anthropic uses a different shape — the router normalizes it
const body = JSON.stringify({
  model: config.cloud.primary.model,
  system: prompt.system,              // top-level, not in messages array
  messages: [{ role: "user", content: prompt.user }],
  max_tokens: prompt.maxTokens ?? config.cloud.primary.maxTokens,
  temperature: prompt.temperature ?? config.cloud.primary.temperature
});
const res = await fetch(config.cloud.primary.endpoint, {
  method: "POST",
  headers: {
    "x-api-key": window[config.cloud.primary.apiKey],
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  },
  body
});
const data = await res.json();
return data.content[0].text;          // normalize to flat string
```

**Cloud (OpenAI fallback):**
```js
// Standard OpenAI-compatible format
const body = JSON.stringify({
  model: config.cloud.fallback.model,
  messages: [
    { role: "system", content: prompt.system },
    { role: "user",   content: prompt.user }
  ],
  max_tokens: prompt.maxTokens ?? config.cloud.fallback.maxTokens,
  temperature: prompt.temperature ?? config.cloud.fallback.temperature
});
const res = await fetch(config.cloud.fallback.endpoint, { ... });
const data = await res.json();
return data.choices[0].message.content;
```

**Local (Ollama):**
```js
// Ollama /api/generate uses a prompt string, not chat messages.
// Concatenate system + user with clear delimiters.
const combinedPrompt = `<system>\n${prompt.system}\n</system>\n\n<user>\n${prompt.user}\n</user>`;
const body = JSON.stringify({
  model: config.local.model,
  prompt: combinedPrompt,
  stream: false,
  options: {
    num_predict: prompt.maxTokens ?? config.local.maxTokens,
    temperature: prompt.temperature ?? config.local.temperature
  }
});
const res = await fetch(config.local.endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" }
});
const data = await res.json();
return data.response;                 // Ollama uses "response", not "choices[0]..."
```

### Why a flat `{ system, user }` envelope instead of OpenAI-compatible `{ messages }`

- **Anthropic puts `system` at the top level.** OpenAI puts it in the messages array. Ollama takes a single prompt string. A flat envelope avoids coupling the caller to any one API shape.
- **Callers don't need to know the tier.** `voiceTask.js` sends `{ system: PARSE_SYSTEM_PROMPT, user: transcript }` and gets back text. Zero tier awareness.
- **Future-proof.** If a tier requires a different shape (e.g., Gemini's `systemInstruction` or Grok's specific format), the router handles it — callers never change.

### Example: migrating `parseTranscript` to use the router

**Before (hardcoded xAI):**
```js
async function parseTranscript(transcript) {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    headers: { 'Authorization': `Bearer ${window.XAI_API_KEY}` },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      messages: [
        { role: 'system', content: PARSE_SYSTEM_PROMPT },
        { role: 'user', content: transcript }
      ],
      max_tokens: 100
    })
  });
  // ... parse response ...
}
```

**After (using router):**
```js
async function parseTranscript(transcript) {
  try {
    const result = await ModelRouter.complete({
      system: PARSE_SYSTEM_PROMPT,
      user: transcript,
      maxTokens: 100
    });
    // result.text, result.tier, result.model all available for logging
    // ... parse result.text as JSON ...
  } catch (err) {
    if (err instanceof ModelRouterError) {
      // All tiers exhausted — show user-friendly error, fall back to raw transcript
      console.error('[parseTranscript] All tiers failed:', err.tierErrors);
      return { title: capFirst(transcript), quadrant: 'do_first', fallback: true };
    }
    throw err;
  }
}
```

The function shrinks, gains tier-agnostic error handling, and works offline when edge tier is active.

---

## 6. Tier Tradeoff Matrix

| Dimension | Edge (WebGPU) | Cloud (Claude/OpenAI) | Local (Ollama) |
|-----------|---------------|----------------------|-----------------|
| **Latency** | 2–8s (first token) for 1B model. ~15–30 tok/s after. | 200–800ms (first token). ~50–80 tok/s. | 500ms–3s (first token). ~20–40 tok/s on M-series Mac. |
| **Capability ceiling** | Low. Gemma 3 1B can do basic classification, parsing, summarization. Cannot reason, decompose, or handle complex multi-step prompts. | Very high. Claude Sonnet 4 handles complex reasoning, multi-step decomposition, nuanced classification. | Medium-high. Qwen 2.5 7B is strong at classification and parsing; weaker at open-ended reasoning. |
| **Offline** | ✓ Fully offline after first download. | ✗ Requires connectivity. | ✓ Works offline if on localhost. |
| **Privacy** | Complete. Data never leaves the browser. | Zero privacy. All prompts sent to third-party servers. | Complete. Data stays on your machine. |
| **Cost** | Free. Model download is one-time bandwidth (~500MB). | Pay-per-token. Claude Sonnet 4: ~$3/M input tokens, ~$15/M output tokens. TaskMatrix use case is cheap (~$0.001 per task parse). | Free. You pay for electricity. |
| **Setup complexity** | Browser download, ~2–5 min first launch. User sees a progress bar. | API key in config.js. Instant. | Install Ollama (`brew install ollama`), pull model (`ollama pull qwen2.5:7b`), ensure port 11434 is accessible. |
| **Failure modes** | WebGPU not available (Firefox, older Safari, some mobile). GPU out of memory if other tabs use WebGPU. Model download interrupted. | API key missing/expired. Rate limited (429). Network down. Provider outage. | Ollama not running. Port blocked. Model not pulled. Machine asleep/off network. |
| **Best when…** | You're offline, on a plane, or privacy-sensitive. Quick task parsing on the go. The default for a PWA. | You need high-quality results for complex tasks (quadrant suggestion with reasoning, task decomposition). Connected, want speed. | You're at your desk, want privacy, and have a decent GPU. Good middle ground between edge capability and cloud latency. |

### Recommended tier defaults by feature

| Feature | Default tier | Why |
|---------|-------------|-----|
| Voice → task parsing | Edge | Simple classification, needs to work offline, latency acceptable |
| Quadrant suggestion | Cloud | Requires reasoning about task content — 1B models can't do this reliably |
| Task decomposition | Cloud | Multi-step reasoning beyond edge/local capability |
| Smart search | Edge | Simple keyword extraction + filtering |
| Daily summary | Cloud | Natural language generation needs quality |

---

## Implementation Order

For a solo developer building this incrementally:

1. **Module skeleton + config schema** — `src/model-router.js` with the class, `init()`, `status()`, `switchTier()`. Cloud tier only at first.
2. **Cloud tier implementation** — Anthropic + OpenAI paths, `PromptEnvelope → CompletionResult` flow.
3. **Fallback chain** — retry logic, `ModelRouterError`, event emission.
4. **Migrate `voiceTask.js`** — replace hardcoded xAI calls with `ModelRouter.complete()`.
5. **Edge tier** — WebLLM integration, `isAvailable()` via WebGPU check, download state machine.
6. **Local tier** — Ollama fetch, health check, prompt concatenation.
7. **UI integration** — tier selector in settings, progress bar for edge download, status indicator.

---

## Constraints & Guardrails

- **No build step.** The router must be a plain `.js` file loaded via `<script src>`. No ES modules (`import`/`export`) — GitHub Pages serves without a bundler.
- **No third-party CDN for the router itself.** The WebLLM library will come from CDN (unavoidable — it's a 200MB+ WASM runtime), but `model-router.js` is a local file.
- **Single `window.modelRouter` instance.** No reason for multiple routers in a single-page PWA.
- **Key references:** API keys are read from `window.*` at call time, not cached. This allows the user to update keys in config.js and have them take effect on the next request without a reload.
- **Failed fallback does not change active tier.** If edge fails and cloud succeeds via fallback, the active tier remains edge. The next request tries edge again. This prevents a transient failure from permanently downgrading the user.
- **No streaming in v1.** All completions are request → wait → response. Streaming adds complexity without payoff for TaskMatrix's use case (short completions: task titles, quadrant labels, JSON blobs).
- **`complete()` is async but not cancellable in v1.** If the user navigates away mid-request, the promise rejects on its own. An `AbortController`-based cancel API can be added later.
