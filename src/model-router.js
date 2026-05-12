// ────────────────────────────────────────────────────────────────────
// TaskMatrix — Three-Tier Model Router
//
// Single window.modelRouter instance. App code sends a PromptEnvelope
// { system, user, maxTokens? } and gets back a CompletionResult
// { text, tier, model, latencyMs, fallback } — never knows which
// tier served the request.
//
// File:   src/model-router.js
// Depends: src/config.js must define window.MODEL_ROUTER_CONFIG first
// ────────────────────────────────────────────────────────────────────

// ── Error class ──────────────────────────────────────────────────

class ModelRouterError extends Error {
  constructor(message, { tierErrors = [], code = 'UNKNOWN' } = {}) {
    super(message);
    this.name = 'ModelRouterError';
    this.tierErrors = tierErrors; // [{ tier, reason, statusCode }]
    this.code = code;             // ALL_TIERS_EXHAUSTED | TIER_DISABLED | TIMEOUT | NOT_INITIALIZED
    this.timestamp = Date.now();
  }
}

// ── ModelRouter ───────────────────────────────────────────────────

class ModelRouter {
  // ── Internal state ──────────────────────────────────────────

  static _initialized = false;
  static _activeTier = null;
  static _config = null;
  static _listeners = {};
  static _lastError = null;

  // Edge tier state
  static _edgeState = 'UNKNOWN';   // UNKNOWN | CHECKING | UNAVAILABLE | DOWNLOADING | READY | ERROR
  static _edgeProgress = null;     // { loaded, total, progress } during download
  static _webllmEngine = null;     // WebLLM MLCEngine instance
  static _edgeAttempted = false;   // true after first switchTier("edge")

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Initialize the router. Reads MODEL_ROUTER_CONFIG, probes tier
   * availability, and activates the default tier.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   * @returns {Promise<void>}
   */
  static async init() {
    if (ModelRouter._initialized) return;

    const cfg = window.MODEL_ROUTER_CONFIG;
    if (!cfg) {
      throw new ModelRouterError(
        'MODEL_ROUTER_CONFIG not found. Ensure src/config.js is loaded first.',
        { code: 'NO_CONFIG' }
      );
    }

    ModelRouter._config = cfg;

    // Probe edge capability (doesn't download — just checks WebGPU)
    if (cfg.edge && cfg.edge.enabled) {
      ModelRouter._edgeState = 'CHECKING';
      ModelRouter._emit('edge:state', { state: 'CHECKING' });

      const webgpuOk = await ModelRouter._checkWebGPU();
      if (!webgpuOk) {
        ModelRouter._edgeState = 'UNAVAILABLE';
        ModelRouter._emit('edge:unavailable', { reason: 'No WebGPU support' });
      } else {
        ModelRouter._edgeState = 'CACHED'; // model cached? don't know yet — assume yes for now
        ModelRouter._emit('edge:ready', { model: cfg.edge.model });
      }
    }

    // Activate default tier (don't throw on failure — router is still usable)
    const defaultTier = cfg.defaultTier || 'edge';
    try {
      await ModelRouter.switchTier(defaultTier);
    } catch (err) {
      console.warn('[ModelRouter] Default tier "' + defaultTier + '" unavailable:', err.message);
      // Try fallback chain
      const chain = cfg.fallbackChain || [];
      let activated = false;
      for (const t of chain) {
        if (t === defaultTier) continue;
        try {
          await ModelRouter.switchTier(t);
          activated = true;
          break;
        } catch (e) {
          console.warn('[ModelRouter] Fallback tier "' + t + '" also unavailable:', e.message);
        }
      }
      if (!activated) {
        console.warn('[ModelRouter] No tiers could be activated. Router will work once a tier becomes available.');
        ModelRouter._activeTier = defaultTier; // set anyway so status() shows it
      }
    }

    ModelRouter._initialized = true;
  }

  // ── Core inference ───────────────────────────────────────────

  /**
   * Send a prompt to the active tier. Falls back through the
   * fallbackChain if the active tier fails.
   *
   * @param {Object} prompt — { system, user, maxTokens?, temperature? }
   * @returns {Promise<Object>} — { text, tier, model, latencyMs, fallback }
   * @throws {ModelRouterError}
   */
  static async complete(prompt) {
    if (!ModelRouter._initialized) {
      throw new ModelRouterError('Router not initialized. Call ModelRouter.init() first.', {
        code: 'NOT_INITIALIZED'
      });
    }

    if (!prompt || typeof prompt.system !== 'string' || typeof prompt.user !== 'string') {
      throw new ModelRouterError('Invalid prompt. Must have system (string) and user (string).', {
        code: 'INVALID_PROMPT'
      });
    }

    const startTime = performance.now();
    const tierErrors = [];

    // Try active tier first
    try {
      const result = await ModelRouter._tryTier(ModelRouter._activeTier, prompt);
      result.latencyMs = Math.round(performance.now() - startTime);
      result.fallback = false;
      return result;
    } catch (err) {
      tierErrors.push({
        tier: ModelRouter._activeTier,
        reason: err.message,
        statusCode: err.statusCode || null
      });
      ModelRouter._emit('fallback', {
        from: ModelRouter._activeTier,
        reason: err.message
      });
    }

    // Walk fallback chain
    const chain = ModelRouter._config.fallbackChain || [];
    for (const tier of chain) {
      if (tier === ModelRouter._activeTier) continue; // already tried
      if (!ModelRouter._config[tier] || !ModelRouter._config[tier].enabled) continue;

      // Check availability before attempting
      try {
        const available = await ModelRouter.isAvailable(tier);
        if (!available) {
          tierErrors.push({ tier, reason: 'Tier not available', statusCode: null });
          continue;
        }
      } catch (checkErr) {
        tierErrors.push({ tier, reason: `Availability check failed: ${checkErr.message}`, statusCode: null });
        continue;
      }

      // Try with one retry
      try {
        const result = await ModelRouter._tryWithRetry(tier, prompt);
        result.latencyMs = Math.round(performance.now() - startTime);
        result.fallback = true;
        result.fallbackReason = tierErrors[tierErrors.length - 1]?.reason || 'Active tier failed';
        return result;
      } catch (err) {
        tierErrors.push({
          tier,
          reason: err.message,
          statusCode: err.statusCode || null
        });
        ModelRouter._emit('error', { tier, error: err.message });
      }
    }

    // All tiers exhausted
    ModelRouter._lastError = { tierErrors, timestamp: Date.now() };
    throw new ModelRouterError('All tiers exhausted', {
      tierErrors,
      code: 'ALL_TIERS_EXHAUSTED'
    });
  }

  // ── Try a single tier (no retry, no fallback) ────────────────

  static async _tryTier(tier, prompt) {
    switch (tier) {
      case 'edge':  return ModelRouter._completeEdge(prompt);
      case 'cloud': return ModelRouter._completeCloud(prompt);
      case 'local': return ModelRouter._completeLocal(prompt);
      default:
        throw new ModelRouterError(`Unknown tier: ${tier}`, { code: 'UNKNOWN_TIER' });
    }
  }

  // ── Try with retry ───────────────────────────────────────────

  static async _tryWithRetry(tier, prompt) {
    const maxRetries = ModelRouter._config.maxRetriesPerTier || 1;
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await ModelRouter._tryTier(tier, prompt);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          // Exponential backoff: 500ms, 1s, 2s...
          const delay = 500 * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  // ── Tier management ──────────────────────────────────────────

  /**
   * Switch the active tier at runtime.
   *
   * Switching to "edge" for the first time begins the WebLLM
   * download flow. The promise resolves when the switch is complete;
   * monitor ModelRouter.status() for edge download progress.
   *
   * @param {"edge" | "cloud" | "local"} tier
   * @returns {Promise<void>}
   * @throws {ModelRouterError}
   */
  static async switchTier(tier) {
    const cfg = ModelRouter._config;
    if (!cfg) {
      throw new ModelRouterError('Router not initialized.', { code: 'NOT_INITIALIZED' });
    }

    const validTiers = ['edge', 'cloud', 'local'];
    if (!validTiers.includes(tier)) {
      throw new ModelRouterError(`Invalid tier: ${tier}`, { code: 'UNKNOWN_TIER' });
    }

    if (cfg[tier] && cfg[tier].enabled === false) {
      throw new ModelRouterError(`Tier "${tier}" is disabled in config.`, { code: 'TIER_DISABLED' });
    }

    const previousTier = ModelRouter._activeTier;

    // Edge onboarding: first activation triggers WebLLM load + model download
    if (tier === 'edge' && !ModelRouter._edgeAttempted) {
      ModelRouter._edgeAttempted = true;
      try {
        await ModelRouter._loadEdgeTier();
      } catch (err) {
        ModelRouter._edgeState = 'ERROR';
        ModelRouter._emit('edge:error', { error: err.message });
        throw new ModelRouterError(`Failed to activate edge tier: ${err.message}`, {
          code: 'EDGE_ACTIVATION_FAILED'
        });
      }
    }

    ModelRouter._activeTier = tier;
    if (previousTier !== tier) {
      ModelRouter._emit('tier:changed', { from: previousTier, to: tier });
    }
  }

  // ── Availability check ───────────────────────────────────────

  /**
   * Check whether a specific tier is available right now.
   *
   * edge:  WebGPU exists AND model loaded
   * cloud: Primary or fallback API key is present
   * local: Ollama endpoint responds within healthCheckMs
   *
   * @param {"edge" | "cloud" | "local"} tier
   * @returns {Promise<boolean>}
   */
  static async isAvailable(tier) {
    const cfg = ModelRouter._config;
    if (!cfg) return false;

    switch (tier) {
      case 'edge': {
        if (!cfg.edge || !cfg.edge.enabled) return false;
        if (!await ModelRouter._checkWebGPU()) return false;
        // Model loaded? Edge state must be READY
        return ModelRouter._edgeState === 'READY';
      }

      case 'cloud': {
        if (!cfg.cloud || !cfg.cloud.enabled) return false;
        const primary = cfg.cloud.primary;
        const fallback = cfg.cloud.fallback;
        const primaryKey = primary?.apiKey ? window[primary.apiKey] : null;
        const fallbackKey = fallback?.apiKey ? window[fallback.apiKey] : null;
        return !!(primaryKey || fallbackKey);
      }

      case 'local': {
        if (!cfg.local || !cfg.local.enabled) return false;
        try {
          const timeoutMs = cfg.local.healthCheckMs || 2000;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(cfg.local.endpoint.replace('/api/generate', '/'), {
            method: 'GET',
            signal: controller.signal
          });
          clearTimeout(timeout);
          return res.ok;
        } catch {
          return false;
        }
      }

      default:
        return false;
    }
  }

  // ── Status ───────────────────────────────────────────────────

  /**
   * @returns {{ activeTier, tiers, initialized, edgeDownload, lastError }}
   */
  static status() {
    const tiers = {};
    for (const t of ['edge', 'cloud', 'local']) {
      const cfg = ModelRouter._config?.[t];
      tiers[t] = {
        enabled: cfg?.enabled ?? false,
        available: ModelRouter._initialized ? null : undefined // populated post-init
      };
    }

    return {
      activeTier: ModelRouter._activeTier,
      tiers,
      initialized: ModelRouter._initialized,
      edgeDownload: ModelRouter._edgeState === 'DOWNLOADING'
        ? ModelRouter._edgeProgress
        : null,
      lastError: ModelRouter._lastError
    };
  }

  // ── Events ───────────────────────────────────────────────────

  /**
   * Subscribe to router events.
   *
   * Events:
   *   "tier:changed"   → { from, to }
   *   "edge:state"     → { state }
   *   "edge:progress"  → { state, progress, loaded, total }
   *   "edge:ready"     → { model }
   *   "edge:unavailable" → { reason }
   *   "edge:error"     → { error }
   *   "fallback"       → { from, to, reason }
   *   "error"          → { tier, error }
   */
  static on(event, callback) {
    if (!ModelRouter._listeners[event]) {
      ModelRouter._listeners[event] = [];
    }
    ModelRouter._listeners[event].push(callback);
  }

  static off(event, callback) {
    const list = ModelRouter._listeners[event];
    if (!list) return;
    ModelRouter._listeners[event] = list.filter(cb => cb !== callback);
  }

  static _emit(event, data) {
    const list = ModelRouter._listeners[event];
    if (!list) return;
    for (const cb of list) {
      try { cb(data); } catch (e) {
        console.warn(`[ModelRouter] Event handler error (${event}):`, e);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TIER IMPLEMENTATIONS
  // ═══════════════════════════════════════════════════════════════

  // ── Edge: WebLLM in-browser inference ────────────────────────

  static async _completeEdge(prompt) {
    if (!ModelRouter._webllmEngine || ModelRouter._edgeState !== 'READY') {
      throw new ModelRouterError('Edge tier not ready', { code: 'EDGE_NOT_READY' });
    }

    const cfg = ModelRouter._config.edge;
    const messages = [
      { role: 'system', content: prompt.system },
      { role: 'user',   content: prompt.user }
    ];

    try {
      const reply = await ModelRouter._webllmEngine.chat.completions.create({
        messages,
        max_tokens: prompt.maxTokens ?? cfg.maxTokens,
        temperature: prompt.temperature ?? cfg.temperature
      });

      const text = reply.choices?.[0]?.message?.content || '';
      return {
        text,
        tier: 'edge',
        model: cfg.model
      };
    } catch (err) {
      const error = new Error(`Edge inference failed: ${err.message}`);
      error.statusCode = null;
      throw error;
    }
  }

  /**
   * Load and initialize WebLLM for the edge tier.
   * Called on first switchTier("edge").
   */
  static async _loadEdgeTier() {
    const cfg = ModelRouter._config.edge;
    if (!cfg) throw new Error('Edge config missing');

    // 1. Check WebGPU
    if (!await ModelRouter._checkWebGPU()) {
      ModelRouter._edgeState = 'UNAVAILABLE';
      ModelRouter._emit('edge:unavailable', { reason: 'WebGPU not supported' });
      throw new Error('WebGPU not available in this browser');
    }

    // 2. Dynamically import WebLLM from esm.run CDN (only when needed)
    if (typeof webllm === 'undefined') {
      try {
        const module = await import('https://esm.run/@mlc-ai/web-llm');
        window.webllm = module;
      } catch (e) {
        throw new Error('Failed to load WebLLM: ' + e.message);
      }
    }

    if (typeof webllm === 'undefined' || typeof webllm.CreateMLCEngine !== 'function') {
      throw new Error('WebLLM loaded but CreateMLCEngine not found');
    }

    // 3. Create engine (triggers model download if not cached)
    ModelRouter._edgeState = 'DOWNLOADING';
    ModelRouter._emit('edge:state', { state: 'DOWNLOADING' });

    try {
      const engine = await webllm.CreateMLCEngine(cfg.model, {
        initProgressCallback: (progress) => {
          ModelRouter._edgeProgress = {
            progress: progress.progress || (progress.loaded / progress.total),
            loaded: progress.loaded || 0,
            total: progress.total || 0,
            text: progress.text || ''
          };
          ModelRouter._emit('edge:progress', ModelRouter._edgeProgress);
        },
        modelUrl: cfg.modelUrl || undefined,
        logLevel: 'WARN'
      });

      ModelRouter._webllmEngine = engine;
      ModelRouter._edgeState = 'READY';
      ModelRouter._emit('edge:ready', { model: cfg.model });
    } catch (err) {
      ModelRouter._edgeState = 'ERROR';
      throw err;
    }
  }

  /**
   * Check if WebGPU is available in this browser.
   * @returns {Promise<boolean>}
   */
  static async _checkWebGPU() {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  }

  // ── Cloud: Anthropic (primary) + OpenAI (fallback) ───────────

  static async _completeCloud(prompt) {
    const cfg = ModelRouter._config.cloud;

    // Determine which provider to use
    const useProvider = (providerCfg) => {
      const keyName = providerCfg.apiKey;
      const key = keyName ? window[keyName] : null;
      return key ? providerCfg : null;
    };

    const provider = useProvider(cfg.primary) || useProvider(cfg.fallback);
    if (!provider) {
      throw new Error('No cloud API key configured (set ANTHROPIC_API_KEY or OPENAI_API_KEY in config.js)');
    }

    const providerName = provider.provider;

    if (providerName === 'anthropic') {
      return ModelRouter._completeCloudAnthropic(prompt, provider);
    } else if (providerName === 'openai') {
      return ModelRouter._completeCloudOpenAI(prompt, provider);
    } else {
      throw new Error(`Unknown cloud provider: ${providerName}`);
    }
  }

  static async _completeCloudAnthropic(prompt, provider) {
    const keyName = provider.apiKey;
    const apiKey = window[keyName];
    if (!apiKey) throw new Error('Missing Anthropic API key');

    const controller = new AbortController();
    const timeoutMs = ModelRouter._config.requestTimeoutMs || 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = JSON.stringify({
        model: provider.model,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        max_tokens: prompt.maxTokens ?? provider.maxTokens,
        temperature: prompt.temperature ?? provider.temperature
      });

      const res = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const error = new Error(`Anthropic HTTP ${res.status}: ${errBody.substring(0, 200)}`);
        error.statusCode = res.status;
        throw error;
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || '';

      return {
        text,
        tier: 'cloud',
        model: provider.model
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        const error = new Error('Cloud request timed out');
        error.statusCode = 408;
        throw error;
      }
      throw err;
    }
  }

  static async _completeCloudOpenAI(prompt, provider) {
    const keyName = provider.apiKey;
    const apiKey = window[keyName];
    if (!apiKey) throw new Error('Missing OpenAI API key');

    const controller = new AbortController();
    const timeoutMs = ModelRouter._config.requestTimeoutMs || 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body = JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user',   content: prompt.user }
        ],
        max_tokens: prompt.maxTokens ?? provider.maxTokens,
        temperature: prompt.temperature ?? provider.temperature
      });

      const res = await fetch(provider.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const error = new Error(`OpenAI HTTP ${res.status}: ${errBody.substring(0, 200)}`);
        error.statusCode = res.status;
        throw error;
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';

      return {
        text,
        tier: 'cloud',
        model: provider.model
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        const error = new Error('Cloud request timed out');
        error.statusCode = 408;
        throw error;
      }
      throw err;
    }
  }

  // ── Local: Ollama ────────────────────────────────────────────

  static async _completeLocal(prompt) {
    const cfg = ModelRouter._config.local;
    if (!cfg) throw new Error('Local config missing');

    // Concatenate system + user with delimiters
    const combinedPrompt = `<system>\n${prompt.system}\n</system>\n\n<user>\n${prompt.user}\n</user>`;

    const controller = new AbortController();
    const timeoutMs = ModelRouter._config.requestTimeoutMs || 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          prompt: combinedPrompt,
          stream: false,
          options: {
            num_predict: prompt.maxTokens ?? cfg.maxTokens,
            temperature: prompt.temperature ?? cfg.temperature
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        const error = new Error(`Ollama HTTP ${res.status}: ${errBody.substring(0, 200)}`);
        error.statusCode = res.status;
        throw error;
      }

      const data = await res.json();
      const text = data.response || '';

      return {
        text,
        tier: 'local',
        model: cfg.model
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        const error = new Error('Local request timed out');
        error.statusCode = 408;
        throw error;
      }
      throw err;
    }
  }
}

// ── Export to window ───────────────────────────────────────────

window.ModelRouter = ModelRouter;
window.ModelRouterError = ModelRouterError;
