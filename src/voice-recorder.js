// ────────────────────────────────────────────────────────────────────
// Voice Recorder — self-contained voice UI for TaskMatrix
//
// Injects mic (voice→task) and note (voice→note) buttons into the
// top bar. Uses MediaRecorder and calls voiceTask.js functions.
// ────────────────────────────────────────────────────────────────────

(function() {
  'use strict';

  // ── Toast ──────────────────────────────────────────────────────
  var toastEl = null;
  var toastTimer = null;

  function ensureToast() {
    if (toastEl) return;
    toastEl = document.createElement('div');
    toastEl.id = 'voice-toast';
    toastEl.style.cssText =
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
      'background:#111827;color:#fff;padding:10px 20px;border-radius:8px;' +
      'font-size:14px;z-index:10000;opacity:0;transition:opacity 0.2s;' +
      'pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    document.body.appendChild(toastEl);
  }

  function showToast(msg, duration) {
    ensureToast();
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.style.opacity = '1';
    toastTimer = setTimeout(function() {
      toastEl.style.opacity = '0';
      toastTimer = null;
    }, duration || 2500);
  }

  // ── CSS Injection ──────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('voice-recorder-css')) return;
    var style = document.createElement('style');
    style.id = 'voice-recorder-css';
    style.textContent =
      '.voice-mic-btn { transition: all 0.15s; }' +
      '.voice-mic-btn.voice-recording { color: #ef4444; box-shadow: 0 0 0 3px rgba(239,68,68,0.3); border-radius: 8px; }' +
      '.voice-mic-btn.voice-processing { color: var(--text-muted, #6b7280); opacity: 0.6; }' +
      '.voice-mic-btn.voice-done { color: #16a34a; }' +
      '.voice-mic-btn.voice-error { color: #dc2626; }' +
      '@keyframes voiceNotePulse {' +
      '  0%, 100% { box-shadow: 0 0 0 2px rgba(202,138,4,0.4); }' +
      '  50%       { box-shadow: 0 0 0 5px rgba(202,138,4,0.15); }' +
      '}' +
      '.voice-note-btn { transition: all 0.15s; }' +
      '.voice-note-btn.vnote-recording { color: #ca8a04; animation: voiceNotePulse 0.9s ease-in-out infinite; border-radius: 8px; }' +
      '.voice-note-btn.vnote-processing { opacity: 0.6; }' +
      '.voice-note-btn.vnote-done { color: #16a34a; }' +
      '.voice-note-btn.vnote-error { color: #dc2626; }';
    document.head.appendChild(style);
  }

  // ── Button Injection ───────────────────────────────────────────

  function injectButtons() {
    var actions = document.querySelector('.zen-actions');
    if (!actions) {
      // Retry after a short delay — DOM may not be ready
      setTimeout(injectButtons, 200);
      return;
    }
    if (document.getElementById('voice-mic-btn')) return; // already injected

    // Create mic button (voice → task)
    var micBtn = document.createElement('button');
    micBtn.type = 'button';
    micBtn.id = 'voice-mic-btn';
    micBtn.className = 'zen-icon-btn voice-mic-btn';
    micBtn.title = 'Hold to speak — creates a task';
    micBtn.textContent = '🎤';
    micBtn.addEventListener('mousedown', function(e) { e.preventDefault(); startVoiceRecording(); });
    micBtn.addEventListener('mouseup', function(e) { e.preventDefault(); stopVoiceRecording(); });
    micBtn.addEventListener('touchstart', function(e) { e.preventDefault(); startVoiceRecording(); });
    micBtn.addEventListener('touchend', function(e) { e.preventDefault(); stopVoiceRecording(); });

    // Create note button (voice → note)
    var noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.id = 'voice-note-btn';
    noteBtn.className = 'zen-icon-btn voice-note-btn';
    noteBtn.title = 'Hold to dictate a note';
    noteBtn.textContent = '📝';
    noteBtn.addEventListener('mousedown', function(e) { e.preventDefault(); startVoiceNoteRecording(); });
    noteBtn.addEventListener('mouseup', function(e) { e.preventDefault(); stopVoiceNoteRecording(); });
    noteBtn.addEventListener('touchstart', function(e) { e.preventDefault(); startVoiceNoteRecording(); });
    noteBtn.addEventListener('touchend', function(e) { e.preventDefault(); stopVoiceNoteRecording(); });

    // Insert before the pomodoro button (or prepend if not found)
    var pomodoro = document.getElementById('pomodoro-btn');
    if (pomodoro) {
      actions.insertBefore(noteBtn, pomodoro);
      actions.insertBefore(micBtn, noteBtn);
    } else {
      actions.prepend(micBtn);
      actions.prepend(noteBtn);
    }
  }

  // ── Voice → Task ───────────────────────────────────────────────

  var taskRecorder = null;
  var taskChunks = [];
  var taskMimeType = 'audio/webm';
  var taskStartTime = 0;

  var micStates = {
    idle:       { text: '🎤', title: 'Hold to speak',      cls: '',               disabled: false },
    recording:  { text: '🔴', title: 'Release to send',    cls: 'voice-recording',  disabled: false },
    processing: { text: '⏳', title: 'Processing…',        cls: 'voice-processing', disabled: true  },
    done:       { text: '✅', title: 'Task created!',      cls: 'voice-done',       disabled: false },
    error:      { text: '❌', title: 'Recording failed',   cls: 'voice-error',      disabled: false }
  };

  function setMicState(state) {
    var btn = document.getElementById('voice-mic-btn');
    if (!btn) return;
    var s = micStates[state] || micStates.idle;
    btn.textContent = s.text;
    btn.title = s.title;
    btn.disabled = s.disabled;
    btn.className = 'zen-icon-btn voice-mic-btn' + (s.cls ? ' ' + s.cls : '');
    if (state === 'done' || state === 'error') {
      setTimeout(function() { setMicState('idle'); }, 2000);
    }
  }

  function startVoiceRecording() {
    if (taskRecorder) {
      if (taskRecorder.state === 'recording') return;
      try { taskRecorder.stream.getTracks().forEach(function(t) { t.stop(); }); } catch(ex) {}
      taskRecorder = null;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      var mime = (window._getSupportedVoiceMimeType && window._getSupportedVoiceMimeType()) || 'audio/webm';
      taskMimeType = mime;
      taskChunks = [];
      taskStartTime = Date.now();
      taskRecorder = new MediaRecorder(stream, { mimeType: mime });
      taskRecorder.ondataavailable = function(ev) { if (ev.data.size > 0) taskChunks.push(ev.data); };
      taskRecorder.onerror = function(ev) {
        console.error('[voice] MediaRecorder error:', ev.error);
        setMicState('error');
        showToast('Recording failed — try again');
      };
      taskRecorder.start();
      setMicState('recording');
    }).catch(function(err) {
      console.error('[voice] mic access failed:', err);
      setMicState('error');
      var msg = err.name === 'NotAllowedError' ? 'Microphone access denied — check browser permissions'
        : err.name === 'NotFoundError' ? 'No microphone found'
        : 'Could not access microphone';
      showToast(msg, 4000);
    });
  }

  function stopVoiceRecording() {
    if (!taskRecorder || taskRecorder.state !== 'recording') return;
    var duration = (Date.now() - taskStartTime) / 1000;
    if (duration < 0.5) {
      taskRecorder.stream.getTracks().forEach(function(t) { t.stop(); });
      taskRecorder = null;
      taskChunks = [];
      setMicState('idle');
      showToast('Hold to record — tap was too short', 2000);
      return;
    }
    setMicState('processing');
    taskRecorder.onstop = function() {
      var stream = taskRecorder ? taskRecorder.stream : null;
      var audioBlob = new Blob(taskChunks, { type: taskMimeType });
      taskChunks = [];
      if (stream) { try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch(ex) {} }
      taskRecorder = null;

      if (audioBlob.size < 100) {
        setMicState('error');
        showToast('No audio captured — try again', 3000);
        return;
      }

      if (typeof handleVoiceTask !== 'function') {
        setMicState('error');
        showToast('Voice pipeline not loaded', 3000);
        return;
      }

      handleVoiceTask(audioBlob).then(function(result) {
        if (typeof window._tmAddVoiceTask === 'function') {
          window._tmAddVoiceTask(result);
        } else {
          console.warn('[voice] _tmAddVoiceTask not found — task data:', result);
          showToast('Transcribed: ' + (result.title || result.raw_transcript || 'done'), 3000);
        }
        setMicState('done');
      }).catch(function(err) {
        console.error('[voice] pipeline failed:', err);
        var msg = (err.message || '');
        if (msg.indexOf('voice:no_api_key') >= 0) {
          showToast('Voice needs API key — set XAI_API_KEY via _tmSetApiKey()', 4000);
        } else if (msg.indexOf('voice:no_audio') >= 0) {
          showToast('No audio detected — speak louder', 3000);
        } else if (msg.indexOf('voice:timeout') >= 0 || msg.indexOf('voice:parse_timeout') >= 0) {
          showToast('Request timed out — try again', 3000);
        } else {
          showToast('Voice failed — ' + (msg.substring(0, 50)), 3000);
        }
        setMicState('error');
      });
    };
    taskRecorder.stop();
  }

  // ── Voice → Note ───────────────────────────────────────────────

  var noteRecorder = null;
  var noteChunks = [];
  var noteMimeType = 'audio/webm';
  var noteStartTime = 0;

  var noteStates = {
    idle:       { text: '📝', title: 'Hold to dictate a note', cls: '',                disabled: false },
    recording:  { text: '🔴', title: 'Release to save',        cls: 'vnote-recording',  disabled: false },
    processing: { text: '⏳', title: 'Processing…',            cls: 'vnote-processing', disabled: true  },
    done:       { text: '✅', title: 'Note saved!',            cls: 'vnote-done',       disabled: false },
    error:      { text: '❌', title: 'Recording failed',       cls: 'vnote-error',      disabled: false }
  };

  function setNoteState(state) {
    var btn = document.getElementById('voice-note-btn');
    if (!btn) return;
    var s = noteStates[state] || noteStates.idle;
    btn.textContent = s.text;
    btn.title = s.title;
    btn.disabled = s.disabled;
    btn.className = 'zen-icon-btn voice-note-btn' + (s.cls ? ' ' + s.cls : '');
    if (state === 'done' || state === 'error') {
      setTimeout(function() { setNoteState('idle'); }, 2000);
    }
  }

  function startVoiceNoteRecording() {
    if (noteRecorder) {
      if (noteRecorder.state === 'recording') return;
      try { noteRecorder.stream.getTracks().forEach(function(t) { t.stop(); }); } catch(ex) {}
      noteRecorder = null;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      var mime = (window._getSupportedVoiceMimeType && window._getSupportedVoiceMimeType()) || 'audio/webm';
      noteMimeType = mime;
      noteChunks = [];
      noteStartTime = Date.now();
      noteRecorder = new MediaRecorder(stream, { mimeType: mime });
      noteRecorder.ondataavailable = function(ev) { if (ev.data.size > 0) noteChunks.push(ev.data); };
      noteRecorder.onerror = function(ev) {
        console.error('[voice-note] MediaRecorder error:', ev.error);
        setNoteState('error');
        showToast('Note recording failed — try again');
      };
      noteRecorder.start();
      setNoteState('recording');
    }).catch(function(err) {
      console.error('[voice-note] mic access failed:', err);
      setNoteState('error');
      var msg = err.name === 'NotAllowedError' ? 'Microphone access denied — check browser permissions'
        : err.name === 'NotFoundError' ? 'No microphone found'
        : 'Could not access microphone';
      showToast(msg, 4000);
    });
  }

  function stopVoiceNoteRecording() {
    if (!noteRecorder || noteRecorder.state !== 'recording') return;
    var duration = (Date.now() - noteStartTime) / 1000;
    if (duration < 0.5) {
      noteRecorder.stream.getTracks().forEach(function(t) { t.stop(); });
      noteRecorder = null;
      noteChunks = [];
      setNoteState('idle');
      showToast('Hold to record — tap was too short', 2000);
      return;
    }
    setNoteState('processing');
    noteRecorder.onstop = function() {
      var stream = noteRecorder ? noteRecorder.stream : null;
      var audioBlob = new Blob(noteChunks, { type: noteMimeType });
      noteChunks = [];
      if (stream) { try { stream.getTracks().forEach(function(t) { t.stop(); }); } catch(ex) {} }
      noteRecorder = null;

      if (audioBlob.size < 100) {
        setNoteState('error');
        showToast('No audio captured — try again', 3000);
        return;
      }

      if (typeof transcribeAndSaveNote !== 'function') {
        setNoteState('error');
        showToast('Voice notes pipeline not loaded', 3000);
        return;
      }

      transcribeAndSaveNote(audioBlob).then(function() {
        setNoteState('done');
      }).catch(function(err) {
        console.error('[voice-note] pipeline failed:', err);
        var msg = (err.message || '');
        if (msg.indexOf('voice:bridge_not_ready') >= 0) {
          showToast('Notes feature not available — notes were stripped', 4000);
        } else if (msg.indexOf('voice:no_api_key') >= 0) {
          showToast('Voice needs API key — set XAI_API_KEY via _tmSetApiKey()', 4000);
        } else if (msg.indexOf('voice:no_audio') >= 0) {
          showToast('No audio detected — speak louder', 3000);
        } else if (msg.indexOf('voice:timeout') >= 0) {
          showToast('Request timed out — try again', 3000);
        } else {
          showToast('Voice note failed — ' + (msg.substring(0, 50)), 3000);
        }
        setNoteState('error');
      });
    };
    noteRecorder.stop();
  }

  // ── Boot ───────────────────────────────────────────────────────

  function boot() {
    injectCSS();
    injectButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
