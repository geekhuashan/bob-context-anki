const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PronunciationError,
  audioToBase64,
  buildPronunciationRequest,
  generatePronunciation,
  ttsUrl,
} = require('../src/pronunciation');

const dataApi = {
  fromHex(value) {
    return {
      toBase64: () => Buffer.from(value, 'hex').toString('base64'),
    };
  },
  fromBase64(value) {
    return {
      toBase64: () => Buffer.from(value, 'base64').toString('base64'),
    };
  },
};

test('normalizes MiniMax TTS URLs', () => {
  assert.equal(
    ttsUrl('https://api.minimaxi.com'),
    'https://api.minimaxi.com/v1/t2a_v2',
  );
  assert.equal(
    ttsUrl('https://api.minimaxi.com/v1/'),
    'https://api.minimaxi.com/v1/t2a_v2',
  );
  assert.equal(
    ttsUrl('https://api.minimaxi.com/v1/t2a_v2'),
    'https://api.minimaxi.com/v1/t2a_v2',
  );
});

test('builds an English MiniMax pronunciation request', () => {
  const request = buildPronunciationRequest({
    word: 'daunting',
    apiKey: 'test-key',
    apiBaseUrl: 'https://example.com/v1',
    model: 'speech-test',
    voiceId: 'English_Test',
  });

  assert.equal(request.url, 'https://example.com/v1/t2a_v2');
  assert.equal(request.header.Authorization, 'Bearer test-key');
  assert.deepEqual(request.body, {
    model: 'speech-test',
    text: 'daunting',
    stream: false,
    voice_setting: { voice_id: 'English_Test', speed: 0.85 },
    audio_setting: { format: 'mp3' },
  });
});

test('converts MiniMax hex and base64 audio to canonical base64', () => {
  const mp3 = Buffer.from('ID3\u0004test');
  assert.equal(
    audioToBase64(mp3.toString('hex'), dataApi),
    mp3.toString('base64'),
  );
  assert.equal(
    audioToBase64(mp3.toString('base64'), dataApi),
    mp3.toString('base64'),
  );
  assert.equal(
    audioToBase64(
      `data:audio/mp3;base64,${mp3.toString('base64')}`,
      dataApi,
    ),
    mp3.toString('base64'),
  );
});

test('generates base64 pronunciation from a MiniMax response', async () => {
  const mp3Hex = Buffer.from('ID3\u0004test').toString('hex');
  let requestOptions;
  const result = await generatePronunciation({
    word: 'daunting',
    apiKey: 'test-key',
    dataApi,
    request: async (options) => {
      requestOptions = options;
      return {
        data: {
          data: { audio: mp3Hex },
          base_resp: { status_code: 0, status_msg: 'success' },
        },
      };
    },
  });

  assert.equal(result, Buffer.from('ID3\u0004test').toString('base64'));
  assert.equal(requestOptions.method, 'POST');
});

test('classifies configuration, API, and response failures', async () => {
  await assert.rejects(
    generatePronunciation({
      word: 'daunting',
      apiKey: '',
      dataApi,
      request: async () => assert.fail('request should not run'),
    }),
    (error) =>
      error instanceof PronunciationError &&
      error.code === 'pronunciation_config',
  );

  await assert.rejects(
    generatePronunciation({
      word: 'daunting',
      apiKey: 'test-key',
      dataApi,
      request: async () => {
        throw new Error('network failure');
      },
    }),
    (error) =>
      error instanceof PronunciationError && error.code === 'pronunciation_api',
  );

  await assert.rejects(
    generatePronunciation({
      word: 'daunting',
      apiKey: 'test-key',
      dataApi,
      request: async () => ({
        data: { base_resp: { status_code: 1004 }, data: {} },
      }),
    }),
    (error) =>
      error instanceof PronunciationError && error.code === 'pronunciation_api',
  );

  await assert.rejects(
    generatePronunciation({
      word: 'daunting',
      apiKey: 'test-key',
      dataApi,
      request: async () => ({ data: { data: {} } }),
    }),
    (error) =>
      error instanceof PronunciationError &&
      error.code === 'pronunciation_response',
  );
});
