// ────────────────────────────────────────────────────────────────────
// TaskMatrix Configuration
//
// THIS FILE IS SAFE TO COMMIT — contains no secrets.
// API keys are stored in browser localStorage, never in this file.
//
// To set keys for local development, open the browser console:
//   _tmSetApiKey('ANTHROPIC_API_KEY', 'sk-ant-...')
//   _tmSetApiKey('OPENAI_API_KEY',    'sk-...')
//
// Keys persist across page reloads. Call _tmSetApiKey(name, null) to remove.
// ────────────────────────────────────────────────────────────────────

// ── API Key Management ────────────────────────────────────────────

/**
 * Set an API key in localStorage and expose it on window.
 * Call from browser console or a settings UI.
 *
 * @param {string} name  — e.g. 'ANTHROPIC_API_KEY', 'XAI_API_KEY'
 * @param {string|null} value — the key, or null to remove
 */
window._tmSetApiKey = function(name, value) {
  if (value === null || value === undefined) {
    localStorage.removeItem('tm_key:' + name);
    delete window[name];
    console.log('[TaskMatrix] Removed key:', name);
  } else {
    localStorage.setItem('tm_key:' + name, value);
    window[name] = value;
    console.log('[TaskMatrix] Set key:', name, '(length ' + value.length + ')');
  }
};

// Load keys from localStorage at startup
(function() {
  var prefix = 'tm_key:';
  var keys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY',
              'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  for (var i = 0; i < keys.length; i++) {
    var stored = localStorage.getItem(prefix + keys[i]);
    if (stored) {
      window[keys[i]] = stored;
    }
  }

  // Public fallbacks — safe to hardcode. No secrets here.
  // These make the app work immediately on fresh installs.
  if (!window.SUPABASE_URL) {
    window.SUPABASE_URL = 'https://xulnxwwwjpvgsaqnsllo.supabase.co';
  }
  if (!window.SUPABASE_ANON_KEY) {
    window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1bG54d3d3anB2Z3NhcW5zbGxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTQwMzYsImV4cCI6MjA4OTc5MDAzNn0.lWoihSm-kv_Ep5fXQZ55H4YU5wXmmKvK4LVLSBIVYic';
  }
})();

// ── Supabase — required for auth + task sync ──────────────────────
// Set via: _tmSetApiKey('SUPABASE_URL', 'https://...')
//         _tmSetApiKey('SUPABASE_ANON_KEY', 'eyJh...')

// ── Model Router Configuration ─────────────────────────────────────
// Three tiers: edge (in-browser WebGPU), cloud (Anthropic/OpenAI),
// local (Ollama on localhost). The router abstracts all AI inference
// behind ModelRouter.complete({ system, user }).

window.MODEL_ROUTER_CONFIG = {
  // ── Global router settings ─────────────────────────────────────
  defaultTier: 'edge',               // 'edge' | 'cloud' | 'local'
  fallbackChain: ['cloud', 'edge', 'local'],
  maxRetriesPerTier: 1,
  requestTimeoutMs: 30000,

  edge: {
    enabled: true,
    model: 'gemma3-1b-it-q4f16_1-MLC',  // WebLLM model ID (Gemma 3 1B, 4-bit quantized)
    modelUrl: null,                  // null = WebLLM CDN; set for self-hosted
    maxTokens: 256,
    temperature: 0.3,
    cacheModel: true,
    wasmWorkerCount: 2
  },

  cloud: {
    enabled: true,
    primary: {
      provider: 'anthropic',
      apiKey: 'ANTHROPIC_API_KEY',   // reads window.ANTHROPIC_API_KEY
      model: 'claude-sonnet-4-20250514',
      endpoint: 'https://api.anthropic.com/v1/messages',
      maxTokens: 1024,
      temperature: 0.3
    },
    fallback: {
      provider: 'openai',
      apiKey: 'OPENAI_API_KEY',       // reads window.OPENAI_API_KEY
      model: 'gpt-4o',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      maxTokens: 1024,
      temperature: 0.3
    }
  },

  local: {
    enabled: true,
    endpoint: 'http://localhost:11434/api/generate',
    model: 'qwen2.5:7b',
    maxTokens: 512,
    temperature: 0.3,
    healthCheckMs: 2000
  }
};
