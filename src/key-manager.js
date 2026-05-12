// ────────────────────────────────────────────────────────────────────
// Key Manager — tiny setup panel for local development
//
// Shows once when API keys are missing. After setup, never appears again.
// Also opens via ?keys query param. Loads after config.js.
// ────────────────────────────────────────────────────────────────────

(function() {
  // Only run on localhost — never on the deployed site
  var host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return;

  // Check if critical keys are missing
  var needed = [
    { key: 'SUPABASE_URL',       label: 'Supabase URL',          hint: 'https://xxxxxxxx.supabase.co' },
    { key: 'SUPABASE_ANON_KEY',  label: 'Supabase Anon Key',     hint: 'eyJhbGciOi...', type: 'password' },
    { key: 'XAI_API_KEY',        label: 'xAI API Key (STT)',     hint: 'xai-...', type: 'password' },
    { key: 'ANTHROPIC_API_KEY',  label: 'Anthropic API Key',     hint: 'sk-ant-...', type: 'password' },
    { key: 'OPENAI_API_KEY',     label: 'OpenAI API Key',        hint: 'sk-...', type: 'password' }
  ];

  // Show panel if any keys missing, OR if ?keys is in the URL
  var missing = [];
  for (var i = 0; i < needed.length; i++) {
    if (!localStorage.getItem('tm_key:' + needed[i].key)) {
      missing.push(needed[i]);
    }
  }

  var forceShow = window.location.search.includes('keys');
  if (missing.length === 0 && !forceShow) return;

  if (forceShow) missing = needed;

  // ── Build minimal setup panel ─────────────────────────────────

  var mask = document.createElement('div');
  mask.id = 'tm-keys-mask';
  mask.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
    'z-index:99999;display:flex;align-items:center;justify-content:center;' +
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

  var panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;border-radius:12px;padding:28px 24px 20px;' +
    'max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;';

  var title = document.createElement('div');
  title.textContent = forceShow ? '🔑 API Keys (all)' : '🔑 Local API Keys';
  title.style.cssText = 'font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;';

  var subtitle = document.createElement('div');
  subtitle.textContent = missing.length + ' key' + (missing.length > 1 ? 's' : '') +
    ' needed. Stored in browser only — never leaves this machine.';
  subtitle.style.cssText = 'font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.4;';

  panel.appendChild(title);
  panel.appendChild(subtitle);

  var fields = {};
  for (var i = 0; i < missing.length; i++) {
    var m = missing[i];
    var existing = localStorage.getItem('tm_key:' + m.key) || '';

    var label = document.createElement('div');
    label.textContent = m.label;
    label.style.cssText = 'font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;margin-top:12px;';

    var input = document.createElement('input');
    input.type = m.type || 'text';
    input.placeholder = m.hint;
    input.value = existing;
    input.style.cssText = 'width:100%;padding:8px 12px;border:1px solid #d1d5db;' +
      'border-radius:6px;font-size:13px;box-sizing:border-box;' +
      'outline:none;transition:border-color 0.15s;';
    input.onfocus = function() { this.style.borderColor = '#6366f1'; };
    input.onblur  = function() { this.style.borderColor = '#d1d5db'; };

    fields[m.key] = input;
    panel.appendChild(label);
    panel.appendChild(input);
  }

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:20px;';

  var skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip';
  skipBtn.style.cssText = 'flex:1;padding:10px;border:1px solid #d1d5db;background:#fff;' +
    'color:#6b7280;border-radius:6px;font-size:14px;cursor:pointer;';
  skipBtn.onclick = function() { mask.remove(); };

  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save & Reload';
  saveBtn.style.cssText = 'flex:1;padding:10px;border:none;background:#6366f1;color:#fff;' +
    'border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;';
  saveBtn.onclick = function() {
    for (var k in fields) {
      var val = fields[k].value.trim();
      if (val) {
        localStorage.setItem('tm_key:' + k, val);
        window[k] = val;
      }
    }
    location.reload();
  };

  btnRow.appendChild(skipBtn);
  btnRow.appendChild(saveBtn);
  panel.appendChild(btnRow);

  var hint = document.createElement('div');
  hint.textContent = 'Tip: visit ?keys to reopen this panel later.';
  hint.style.cssText = 'font-size:11px;color:#9ca3af;text-align:center;margin-top:12px;';
  panel.appendChild(hint);

  mask.appendChild(panel);
  document.body.appendChild(mask);
})();
