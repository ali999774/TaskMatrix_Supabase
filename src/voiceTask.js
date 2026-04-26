// Voice-to-task pipeline: STT via xAI Grok → parse via xAI grok-3-mini → task object
// API key is set in src/config.js (gitignored)

async function transcribeAudio(audioBlob) {
  if (!window.XAI_API_KEY) throw new Error('XAI_API_KEY is not set — fill in src/config.js');

  const mimeType = audioBlob.type || 'audio/mp4';
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const formData = new FormData();
  formData.append('file', audioBlob, `recording.${ext}`);

  const response = await fetch('https://api.x.ai/v1/stt', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${window.XAI_API_KEY}` },
    body: formData
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`STT failed ${response.status}: ${err}`);
  }

  const result = await response.json();
  return result.text;
}

async function parseTranscript(transcript) {
  if (!window.XAI_API_KEY) throw new Error('XAI_API_KEY is not set — fill in src/config.js');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${window.XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a task parser for an Eisenhower Matrix. Given a spoken task description, return ONLY valid JSON with two fields: title (short task name, max 6 words) and quadrant (one of: do_first, schedule, delegate, eliminate). No explanation, no markdown, just JSON.'
        },
        {
          role: 'user',
          content: transcript
        }
      ],
      max_tokens: 100
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`xAI parse failed ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content.trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('[voiceTask] xAI raw response:', raw);
    throw new Error(`Invalid JSON from xAI: ${e.message}`);
  }

  const validQuadrants = ['do_first', 'schedule', 'delegate', 'eliminate'];
  if (!parsed.title || !validQuadrants.includes(parsed.quadrant)) {
    console.error('[voiceTask] xAI parsed object:', parsed);
    throw new Error('Missing or invalid fields in xAI response');
  }

  return parsed;
}

async function handleVoiceTask(audioBlob) {
  const rawTranscript = await transcribeAudio(audioBlob);
  console.log('[voiceTask] raw_transcript:', rawTranscript);

  const parsed = await parseTranscript(rawTranscript);

  const quadrantMap = {
    do_first:  'do-first',
    schedule:  'schedule',
    delegate:  'delegate',
    eliminate: 'eliminate'
  };

  return {
    title: parsed.title,
    quadrant: quadrantMap[parsed.quadrant] || 'do-first',
    due_date: null,
    created_via: 'voice',
    raw_transcript: rawTranscript
  };
}
