const fs = require('fs');
const path = require('path');

// Mock window and other browser globals
global.window = {};
global.FormData = class {
  constructor() {
    this.data = {};
  }
  append(key, value, filename) {
    this.data[key] = { value, filename };
  }
};
global.Blob = class {
  constructor(content, options) {
    this.content = content;
    this.type = options ? options.type : 'audio/mp4';
  }
};

// Mock fetch
global.fetch = jest.fn();

// Load the code under test
const voiceTaskCode = fs.readFileSync(path.resolve(__dirname, '../src/voiceTask.js'), 'utf8');
eval(voiceTaskCode);

describe('transcribeAudio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.XAI_API_KEY = 'test-key';
  });

  test('should throw error when XAI_API_KEY is not set', async () => {
    window.XAI_API_KEY = undefined;
    await expect(transcribeAudio(new Blob(['test'], { type: 'audio/mp4' })))
      .rejects.toThrow('XAI_API_KEY is not set — fill in src/config.js');
  });

  test('should throw error when STT API returns non-OK status', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized')
    });

    await expect(transcribeAudio(new Blob(['test'], { type: 'audio/mp4' })))
      .rejects.toThrow('STT failed 401: Unauthorized');
  });

  test('should return transcript text on successful STT', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: 'Hello world' })
    });

    const result = await transcribeAudio(new Blob(['test'], { type: 'audio/mp4' }));
    expect(result).toBe('Hello world');
    expect(global.fetch).toHaveBeenCalledWith('https://api.x.ai/v1/stt', expect.objectContaining({
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-key' },
      body: expect.any(global.FormData)
    }));
  });

  test('should handle network errors during fetch', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));

    await expect(transcribeAudio(new Blob(['test'], { type: 'audio/mp4' })))
      .rejects.toThrow('Network error');
  });
});
