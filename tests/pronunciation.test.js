const assert = require('node:assert/strict');
const test = require('node:test');

const {
  PronunciationError,
  audioToBase64,
  buildDictionaryLookupRequest,
  buildPronunciationRequest,
  buildWikimediaAudioLookupRequest,
  fetchAmericanDictionaryPronunciation,
  generatePreferredPronunciation,
  generatePronunciation,
  isAmericanMp3Url,
  selectAmericanDictionaryAudio,
  selectWikimediaMp3,
  ttsUrl,
  wikimediaCommonsPageId,
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

test('builds an anonymous exact-word dictionary request', () => {
  const request = buildDictionaryLookupRequest('Follow Up');

  assert.equal(request.method, 'GET');
  assert.equal(
    request.url,
    'https://api.dictionaryapi.dev/api/v2/entries/en/follow%20up',
  );
  assert.equal(request.header.Accept, 'application/json');
  assert.equal(Object.hasOwn(request.header, 'Authorization'), false);
});

test('selects only explicitly marked US English MP3 audio', () => {
  assert.equal(
    isAmericanMp3Url(
      'https://api.dictionaryapi.dev/media/pronunciations/en/word-us.mp3',
    ),
    true,
  );
  assert.equal(
    isAmericanMp3Url(
      'https://cdn.example.test/en-us/word.mp3?download=1',
    ),
    true,
  );
  assert.equal(
    isAmericanMp3Url(
      '//api.dictionaryapi.dev/media/pronunciations/en/word-us.mp3',
    ),
    true,
  );
  assert.equal(
    isAmericanMp3Url(
      'https://api.dictionaryapi.dev/media/pronunciations/en/word-uk.mp3',
    ),
    false,
  );
  assert.equal(
    isAmericanMp3Url(
      'https://api.dictionaryapi.dev/media/pronunciations/en/word-us.ogg',
    ),
    false,
  );
  assert.equal(
    isAmericanMp3Url(
      'http://api.dictionaryapi.dev/media/pronunciations/en/word-us.mp3',
    ),
    false,
  );

  const selected = selectAmericanDictionaryAudio({
    data: [
      {
        phonetics: [
          {
            audio:
              'https://api.dictionaryapi.dev/media/pronunciations/en/word-uk.mp3',
          },
          {
            audio:
              'https://api.dictionaryapi.dev/media/pronunciations/en/word-us.ogg',
          },
          {
            audio:
              '//api.dictionaryapi.dev/media/pronunciations/en/word-us.mp3',
          },
        ],
      },
    ],
  });
  assert.equal(
    selected,
    'https://api.dictionaryapi.dev/media/pronunciations/en/word-us.mp3',
  );
});

test('downloads dictionary MP3 bytes without an authorization header', async () => {
  const requests = [];
  const result = await fetchAmericanDictionaryPronunciation({
    word: 'immediately',
    request: async (options) => {
      requests.push(options);
      if (requests.length === 1) {
        return {
          data: [
            {
              phonetics: [
                {
                  audio:
                    'https://api.dictionaryapi.dev/media/pronunciations/en/immediately-us.mp3',
                },
              ],
            },
          ],
        };
      }
      return {
        rawData: {
          length: 8,
          toBase64: () => Buffer.from('ID3\u0004test').toString('base64'),
        },
      };
    },
  });

  assert.deepEqual(result, {
    base64: Buffer.from('ID3\u0004test').toString('base64'),
    source: 'dictionary-us',
    attribution: {
      sourceUrl: '',
      artist: '',
      licenseName: '',
      licenseUrl: '',
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(Object.hasOwn(requests[0].header, 'Authorization'), false);
  assert.equal(Object.hasOwn(requests[1].header, 'Authorization'), false);
  assert.equal(requests[1].header.Accept, 'audio/mpeg');
});

test('downloads the same US recording from its Wikimedia Commons mirror', async () => {
  assert.equal(
    wikimediaCommonsPageId(
      'https://commons.wikimedia.org/w/index.php?curid=694317',
    ),
    '694317',
  );
  assert.equal(
    wikimediaCommonsPageId('https://example.test/w/index.php?curid=694317'),
    '',
  );
  const commonsRequest = buildWikimediaAudioLookupRequest(
    'https://commons.wikimedia.org/w/index.php?curid=694317',
  );
  assert.match(commonsRequest.url, /pageids=694317/);
  assert.equal(Object.hasOwn(commonsRequest.header, 'Authorization'), false);

  const requests = [];
  const result = await fetchAmericanDictionaryPronunciation({
    word: 'immediately',
    request: async (options) => {
      requests.push(options);
      if (requests.length === 1) {
        return {
          data: [
            {
              phonetics: [
                {
                  audio:
                    'https://api.dictionaryapi.dev/media/pronunciations/en/immediately-us.mp3',
                  sourceUrl:
                    'https://commons.wikimedia.org/w/index.php?curid=694317',
                  license: {
                    name: 'BY-SA 3.0',
                    url: 'https://creativecommons.org/licenses/by-sa/3.0',
                  },
                },
              ],
            },
          ],
        };
      }
      if (requests.length === 2) {
        return {
          data: {
            query: {
              pages: {
                694317: {
                  videoinfo: [
                    {
                      extmetadata: {
                        Artist: {
                          value:
                            '<a href="//commons.wikimedia.org/wiki/User:Dvortygirl">Dvortygirl</a>',
                        },
                      },
                      derivatives: [
                        {
                          src: 'https://upload.wikimedia.org/recording.ogg',
                          type: 'audio/ogg; codecs="vorbis"',
                        },
                        {
                          src: 'https://upload.wikimedia.org/recording.ogg.mp3',
                          type: 'audio/mpeg',
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        };
      }
      return {
        rawData: {
          length: 8,
          toBase64: () => Buffer.from('ID3\u0004test').toString('base64'),
        },
      };
    },
  });

  assert.equal(
    selectWikimediaMp3({
      data: {
        query: {
          pages: {
            1: {
              videoinfo: [
                {
                  derivatives: [
                    {
                      src: 'http://upload.wikimedia.org/insecure.mp3',
                      type: 'audio/mpeg',
                    },
                    {
                      src: 'https://upload.wikimedia.org/recording.ogg.mp3',
                      type: 'audio/mpeg',
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    }),
    'https://upload.wikimedia.org/recording.ogg.mp3',
  );
  assert.deepEqual(result, {
    base64: Buffer.from('ID3\u0004test').toString('base64'),
    source: 'dictionary-us',
    attribution: {
      sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=694317',
      artist: 'Dvortygirl',
      licenseName: 'BY-SA 3.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    },
  });
  assert.equal(requests.length, 3);
  assert.match(requests[1].url, /commons\.wikimedia\.org/);
  assert.match(requests[2].url, /upload\.wikimedia\.org/);
  assert.equal(
    requests.some((request) =>
      Object.hasOwn(request.header || {}, 'Authorization'),
    ),
    false,
  );
});

test('retries the dictionary media URL when the Commons mirror fails', async () => {
  const requests = [];
  const dictionaryAudioUrl =
    'https://api.dictionaryapi.dev/media/pronunciations/en/immediately-us.mp3';
  const result = await fetchAmericanDictionaryPronunciation({
    word: 'immediately',
    request: async (options) => {
      requests.push(options);
      if (requests.length === 1) {
        return {
          data: [
            {
              phonetics: [
                {
                  audio: dictionaryAudioUrl,
                  sourceUrl:
                    'https://commons.wikimedia.org/w/index.php?curid=694317',
                },
              ],
            },
          ],
        };
      }
      if (requests.length === 2) {
        return {
          data: {
            query: {
              pages: {
                694317: {
                  videoinfo: [
                    {
                      derivatives: [
                        {
                          src: 'https://upload.wikimedia.org/recording.ogg.mp3',
                          type: 'audio/mpeg',
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        };
      }
      if (requests.length === 3) throw new Error('Commons media unavailable');
      assert.equal(options.url, dictionaryAudioUrl);
      return {
        rawData: {
          length: 8,
          toBase64: () => Buffer.from('ID3\u0004test').toString('base64'),
        },
      };
    },
  });

  assert.equal(result.source, 'dictionary-us');
  assert.equal(requests.length, 4);
  assert.equal(requests[3].url, dictionaryAudioUrl);
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

test('prefers real US dictionary audio without requiring a MiniMax key', async () => {
  const requests = [];
  const result = await generatePreferredPronunciation({
    word: 'immediately',
    apiKey: '',
    dataApi,
    request: async (options) => {
      requests.push(options);
      if (requests.length === 1) {
        return {
          data: [
            {
              phonetics: [
                {
                  audio:
                    'https://api.dictionaryapi.dev/media/pronunciations/en/immediately-us.mp3',
                },
              ],
            },
          ],
        };
      }
      return {
        rawData: {
          length: 8,
          toBase64: () => Buffer.from('ID3\u0004test').toString('base64'),
        },
      };
    },
  });

  assert.equal(result.source, 'dictionary-us');
  assert.equal(requests.some((request) => request.method === 'POST'), false);
});

test('falls back to MiniMax when US dictionary audio is unavailable', async () => {
  const mp3Hex = Buffer.from('ID3\u0004fallback').toString('hex');

  for (const dictionaryBehavior of ['no-us', 'lookup-failure', 'download-failure']) {
    const requests = [];
    const result = await generatePreferredPronunciation({
      word: 'daunting',
      apiKey: 'test-key',
      dataApi,
      request: async (options) => {
        requests.push(options);
        if (options.method === 'POST') {
          return {
            data: {
              data: { audio: mp3Hex },
              base_resp: { status_code: 0, status_msg: 'success' },
            },
          };
        }
        if (requests.length === 1 && dictionaryBehavior === 'lookup-failure') {
          throw new Error('dictionary lookup failed');
        }
        if (requests.length === 1) {
          return {
            data: [
              {
                phonetics: [
                  {
                    audio:
                      dictionaryBehavior === 'download-failure'
                        ? 'https://api.dictionaryapi.dev/media/pronunciations/en/daunting-us.mp3'
                        : 'https://api.dictionaryapi.dev/media/pronunciations/en/daunting-uk.mp3',
                  },
                ],
              },
            ],
          };
        }
        if (dictionaryBehavior === 'download-failure') {
          throw new Error('dictionary audio failed');
        }
        assert.fail(`unexpected request: ${options.url}`);
      },
    });

    assert.deepEqual(result, {
      base64: Buffer.from('ID3\u0004fallback').toString('base64'),
      source: 'minimax',
    });
    assert.equal(requests.at(-1).method, 'POST');
  }
});

test('keeps a typed pronunciation error when dictionary and MiniMax both fail', async () => {
  await assert.rejects(
    generatePreferredPronunciation({
      word: 'alternating',
      apiKey: 'test-key',
      dataApi,
      request: async (options) => {
        if (options.method === 'GET') throw new Error('dictionary failed');
        throw new Error('MiniMax failed');
      },
    }),
    (error) =>
      error instanceof PronunciationError && error.code === 'pronunciation_api',
  );
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
