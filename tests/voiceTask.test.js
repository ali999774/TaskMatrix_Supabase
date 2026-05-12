const fs = require('fs');
const path = require('path');

// Mock browser globals
global.window = {};
global.MediaRecorder = { isTypeSupported: () => true };
global.FormData = class {
  constructor() {
    this._entries = new Map();
  }
  append(key, value, filename) {
    this._entries.set(key, { value, filename });
  }
  get(key) { return this._entries.get(key)?.value; }
};
global.Blob = class {
  constructor(content, options) {
    this.content = content;
    this.type = options ? options.type : 'audio/mp4';
    // Calculate total size from content parts
    let totalSize = 0;
    if (content) {
      for (const part of content) {
        if (part instanceof Uint8Array || part instanceof ArrayBuffer) {
          totalSize += part.byteLength;
        } else if (typeof part === 'string') {
          totalSize += part.length;
        } else if (part && part.length) {
          totalSize += part.length;
        }
      }
    }
    this.size = totalSize;
  }
};
global.AbortController = class {
  constructor() {
    this.signal = { aborted: false, addEventListener: () => {} };
  }
  abort() { this.signal.aborted = true; }
};

global.fetch = jest.fn();

// Load the code under test
const voiceTaskCode = fs.readFileSync(path.resolve(__dirname, '../src/voiceTask.js'), 'utf8');
eval(voiceTaskCode);

describe('transcribeAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should throw tagged error when XAI_API_KEY is not set', async () => {
    delete window.XAI_API_KEY;
    await expect(transcribeAudio(new Blob(['test'], { type: 'audio/mp4' })))
      .rejects.toThrow('voice:no_api_key');
  });

  test('should throw no-audio error for tiny blobs', async () => {
    window.XAI_API_KEY = 'test-key';
    const tinyBlob = new Blob(['a'], { type: 'audio/mp4' }); // size < 100
    await expect(transcribeAudio(tinyBlob))
      .rejects.toThrow('voice:no_audio');
  });

  test('should throw auth error on 401 from STT API', async () => {
    window.XAI_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    });

    // Need blob > 100 bytes
    const bigBlob = new Blob([new Uint8Array(200)], { type: 'audio/mp4' });
    await expect(transcribeAudio(bigBlob))
      .rejects.toThrow('voice:auth_error');
  });

  test('should throw tagged error on 500 from STT API', async () => {
    window.XAI_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal error')
    });

    const bigBlob = new Blob([new Uint8Array(200)], { type: 'audio/mp4' });
    await expect(transcribeAudio(bigBlob))
      .rejects.toThrow('voice:stt_failed:500');
  });

  test('should return transcript text on successful STT', async () => {
    window.XAI_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Hello world' })
    });

    const bigBlob = new Blob([new Uint8Array(200)], { type: 'audio/mp4' });
    const result = await transcribeAudio(bigBlob);
    expect(result).toBe('Hello world');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.x.ai/v1/stt',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-key' },
        body: expect.any(global.FormData),
        signal: expect.any(Object)
      })
    );
  });

  test('should throw empty-transcript error if API returns empty text', async () => {
    window.XAI_API_KEY = 'test-key';
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: '' })
    });

    const bigBlob = new Blob([new Uint8Array(200)], { type: 'audio/mp4' });
    await expect(transcribeAudio(bigBlob))
      .rejects.toThrow('voice:empty_transcript');
  });

  test('should handle network errors during fetch', async () => {
    window.XAI_API_KEY = 'test-key';
    global.fetch.mockRejectedValue(new Error('Network error'));

    const bigBlob = new Blob([new Uint8Array(200)], { type: 'audio/mp4' });
    await expect(transcribeAudio(bigBlob))
      .rejects.toThrow('voice:network');
  });
});
