// Voice-to-task pipeline: STT via xAI Grok → parse via ModelRouter → task object
// API key is set in src/config.js (gitignored). Model router handles LLM inference.
// Bridges into index.html via window._tm* for notes, and exposes handleVoiceTask for tasks.
// Requires: src/config.js, src/model-router.js loaded first
// ─────────────────────────────────────────────────────────────────────

// Detect supported audio MIME type for the current browser.
// Chrome/Safari: audio/mp4  |  Firefox: audio/webm  |  Fallback: audio/webm
function getSupportedMimeType() {
  const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'audio/webm'; // last-resort fallback
}

// Parse the MIME type into a file extension for the FormData filename.
function mimeToExt(mimeType) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

// ── STT via xAI Grok ──────────────────────────────────────────────
// Accepts an audio Blob and returns the transcribed text.
// Throws on any failure so callers have a clean error path.
// Note: STT stays on xAI — it's speech-to-text, not LLM inference.

async function transcribeAudio(audioBlob) {
  if (!window.XAI_API_KEY) {
    throw new Error('voice:no_api_key');
  }

  // Reject empty or near-empty recordings
  if (!audioBlob || audioBlob.size < 100) {
    throw new Error('voice:no_audio');
  }

  const mimeType = audioBlob.type || 'audio/webm';
  const ext = mimeToExt(mimeType);
  const formData = new FormData();
  formData.append('file', audioBlob, `recording.${ext}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch('https://api.x.ai/v1/stt', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${window.XAI_API_KEY}` },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error('voice:auth_error');
      }
      throw new Error(`voice:stt_failed:${response.status}:${errText.substring(0, 80)}`);
    }

    const result = await response.json();
    const text = (result.text || '').trim();
    if (!text) throw new Error('voice:empty_transcript');
    return text;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('voice:timeout');
    if (err.message && err.message.startsWith('voice:')) throw err; // already tagged
    throw new Error(`voice:network:${err.message}`);
  }
}

// ── Structured parsing via ModelRouter ─────────────────────────────
// Takes raw transcript text and returns { title, quadrant }.
// Uses ModelRouter.complete() — works with edge (WebGPU), cloud, or local tier.
// Falls back to raw text as title (do-first) if all tiers fail.

const PARSE_SYSTEM_PROMPT =
  'You are a task parser for an Eisenhower Matrix. ' +
  'Given a spoken task description, return ONLY valid JSON with two fields: ' +
  'title (short task name, max 6 words) and quadrant (one of: do_first, schedule, delegate, eliminate). ' +
  'No explanation, no markdown, just JSON.';

async function parseTranscript(transcript) {
  try {
    const result = await ModelRouter.complete({
      system: PARSE_SYSTEM_PROMPT,
      user: transcript,
      maxTokens: 100
    });

    const raw = (result.text || '').trim();
    console.log('[voiceTask] Parsed via', result.tier, result.model,
      `(${result.latencyMs}ms` + (result.fallback ? ', fallback' : '') + ')');

    let parsed;
    try {
      const cleanRaw = raw.replace(/^`{3}(json)?/im, '').replace(/`{3}$/im, '').trim();
      parsed = JSON.parse(cleanRaw);
    } catch (e) {
      console.warn('[voiceTask] parseTranscript → invalid JSON, using fallback:', raw.substring(0, 60));
      return { title: capFirst(transcript), quadrant: 'do_first', fallback: true };
    }

    const validQuadrants = ['do_first', 'schedule', 'delegate', 'eliminate'];
    if (!parsed.title || !validQuadrants.includes(parsed.quadrant)) {
      console.warn('[voiceTask] parseTranscript → missing/invalid fields, using fallback:', parsed);
      return { title: capFirst(parsed.title || transcript), quadrant: 'do_first', fallback: true };
    }

    return { title: capFirst(parsed.title), quadrant: parsed.quadrant, fallback: false };
  } catch (err) {
    if (err instanceof ModelRouterError) {
      console.error('[voiceTask] All tiers exhausted for parseTranscript:', err.tierErrors);
      return { title: capFirst(transcript), quadrant: 'do_first', fallback: true };
    }
    // Network or unexpected errors — still fall back gracefully
    console.error('[voiceTask] parseTranscript error:', err.message);
    return { title: capFirst(transcript), quadrant: 'do_first', fallback: true };
  }
}

function capFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Voice → Note (transcribe + save directly) ───────────────────────
// Used by the voice note button. Transcribes and saves a note.
// Returns { intent: 'note', content } on success.
// Throws tagged errors on failure.

async function transcribeAndSaveNote(audioBlob) {
  // Bridge readiness check
  if (!window._tmNotes || !window._tmRenderNotes || !window._tmSaveNotes) {
    throw new Error('voice:bridge_not_ready');
  }

  const transcript = await transcribeAudio(audioBlob);

  if (!transcript) {
    throw new Error('voice:empty_transcript');
  }

  const note = {
    id: Date.now(),
    title: `🎤 ${new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })}`,
    content: transcript,
    pinned: false,
    color: 'yellow'
  };

  window._tmNotes.push(note);
  window._tmRenderNotes();
  window._tmRenderPinnedNotes();
  window._tmSaveNotes();

  return { intent: 'note', content: transcript };
}

// ── Voice → Task (transcribe + parse) ──────────────────────────────
// Used by the voice mic button. Transcribes and parses into a task.
// Returns { intent, title, quadrant, raw_transcript }.

async function handleVoiceTask(audioBlob) {
  const rawTranscript = await transcribeAudio(audioBlob);

  const parsed = await parseTranscript(rawTranscript);

  const quadrantMap = {
    do_first:  'do-first',
    schedule:  'schedule',
    delegate:  'delegate',
    eliminate: 'eliminate'
  };

  return {
    intent: 'task',
    title: parsed.title,
    quadrant: quadrantMap[parsed.quadrant] || 'do-first',
    due_date: null,
    created_via: 'voice',
    raw_transcript: rawTranscript
  };
}

// Export the supported MIME detector so the HTML recorder can use it
window._getSupportedVoiceMimeType = getSupportedMimeType;
