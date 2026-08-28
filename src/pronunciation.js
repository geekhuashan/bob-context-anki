const DEFAULT_TTS_API_BASE_URL = 'https://api.minimaxi.com';
const DEFAULT_TTS_MODEL = 'speech-2.8-hd';
const DEFAULT_TTS_VOICE_ID = 'English_Graceful_Lady';
const DEFAULT_TTS_SPEED = 0.85;
const DICTIONARY_API_BASE_URL = 'https://api.dictionaryapi.dev';
const WIKIMEDIA_COMMONS_API_BASE_URL = 'https://commons.wikimedia.org';
const DICTIONARY_TIMEOUT_MS = 5000;
const PRONUNCIATION_SOURCE_DICTIONARY_US = 'dictionary-us';
const PRONUNCIATION_SOURCE_MINIMAX = 'minimax';

class PronunciationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PronunciationError';
    this.code = code;
  }
}

function ttsUrl(apiBaseUrl = DEFAULT_TTS_API_BASE_URL) {
  const base = String(apiBaseUrl || DEFAULT_TTS_API_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
  if (/\/t2a_v2$/i.test(base)) return base;
  if (/\/v1$/i.test(base)) return `${base}/t2a_v2`;
  return `${base}/v1/t2a_v2`;
}

function dictionaryLookupUrl(word) {
  return `${DICTIONARY_API_BASE_URL}/api/v2/entries/en/${encodeURIComponent(
    String(word || '').trim().toLowerCase(),
  )}`;
}

function buildDictionaryLookupRequest(word) {
  return {
    method: 'GET',
    url: dictionaryLookupUrl(word),
    header: {
      Accept: 'application/json',
    },
    timeout: DICTIONARY_TIMEOUT_MS,
  };
}

function normalizeDictionaryAudioUrl(value) {
  const url = String(value || '').trim();
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('https://')) return url;
  return '';
}

function isAmericanMp3Url(value) {
  const url = normalizeDictionaryAudioUrl(value).toLowerCase();
  const path = url.split(/[?#]/, 1)[0];
  return (
    path.endsWith('.mp3') &&
    (path.includes('-us.') || path.includes('en-us'))
  );
}

function selectAmericanDictionaryAudio(response) {
  return selectAmericanDictionaryEntry(response)?.audioUrl || '';
}

function selectAmericanDictionaryEntry(response) {
  if (response?.error) return null;
  const payload = responsePayload(response);
  if (!Array.isArray(payload)) return null;

  for (const entry of payload) {
    for (const phonetic of entry?.phonetics || []) {
      if (isAmericanMp3Url(phonetic?.audio)) {
        return {
          audioUrl: normalizeDictionaryAudioUrl(phonetic.audio),
          sourceUrl: normalizeDictionaryAudioUrl(phonetic.sourceUrl),
          licenseName: String(phonetic.license?.name || '').trim(),
          licenseUrl: normalizeDictionaryAudioUrl(phonetic.license?.url),
        };
      }
    }
  }
  return null;
}

function wikimediaCommonsPageId(value) {
  const url = normalizeDictionaryAudioUrl(value);
  if (!url.startsWith(`${WIKIMEDIA_COMMONS_API_BASE_URL}/`)) return '';
  return url.match(/[?&]curid=(\d+)(?:&|$)/)?.[1] || '';
}

function buildWikimediaAudioLookupRequest(sourceUrl) {
  const pageId = wikimediaCommonsPageId(sourceUrl);
  if (!pageId) return null;
  return {
    method: 'GET',
    url:
      `${WIKIMEDIA_COMMONS_API_BASE_URL}/w/api.php?action=query` +
      `&format=json&origin=*&prop=videoinfo&pageids=${pageId}` +
      '&viprop=derivatives%7Cextmetadata',
    header: {
      Accept: 'application/json',
    },
    timeout: DICTIONARY_TIMEOUT_MS,
  };
}

function selectWikimediaMp3(response) {
  if (response?.error) return '';
  const payload = responsePayload(response);
  const pages = payload?.query?.pages;
  if (!pages || typeof pages !== 'object') return '';

  for (const page of Object.values(pages)) {
    for (const derivative of page?.videoinfo?.[0]?.derivatives || []) {
      const url = normalizeDictionaryAudioUrl(derivative?.src);
      const path = url.toLowerCase().split(/[?#]/, 1)[0];
      if (
        String(derivative?.type || '')
          .toLowerCase()
          .startsWith('audio/mpeg') &&
        path.endsWith('.mp3')
      ) {
        return url;
      }
    }
  }
  return '';
}

function plainWikimediaText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function selectWikimediaArtist(response) {
  if (response?.error) return '';
  const payload = responsePayload(response);
  const pages = payload?.query?.pages;
  if (!pages || typeof pages !== 'object') return '';

  for (const page of Object.values(pages)) {
    const artist = plainWikimediaText(
      page?.videoinfo?.[0]?.extmetadata?.Artist?.value,
    );
    if (artist) return artist;
  }
  return '';
}

function binaryAudioToBase64(response) {
  if (!response || response.error) {
    throw new PronunciationError(
      'pronunciation_response',
      'Dictionary audio download failed',
    );
  }
  const data = response.rawData || response.data;
  if (!data || typeof data.toBase64 !== 'function') {
    throw new PronunciationError(
      'pronunciation_response',
      'Dictionary audio is not binary data',
    );
  }
  if (typeof data.length === 'number' && data.length <= 0) {
    throw new PronunciationError(
      'pronunciation_response',
      'Dictionary audio is empty',
    );
  }
  const base64 = data.toBase64();
  if (!base64) {
    throw new PronunciationError(
      'pronunciation_response',
      'Dictionary audio encoding is invalid',
    );
  }
  return base64;
}

async function fetchAmericanDictionaryPronunciation({ word, request }) {
  try {
    const lookup = await request(buildDictionaryLookupRequest(word));
    const entry = selectAmericanDictionaryEntry(lookup);
    if (!entry) return null;

    const audioUrls = [];
    let artist = '';
    const commonsRequest = buildWikimediaAudioLookupRequest(entry.sourceUrl);
    if (commonsRequest) {
      try {
        const commons = await request(commonsRequest);
        const commonsAudioUrl = selectWikimediaMp3(commons);
        artist = selectWikimediaArtist(commons);
        if (commonsAudioUrl) audioUrls.push(commonsAudioUrl);
      } catch {
        // The dictionary's own media URL remains available below.
      }
    }
    if (!audioUrls.includes(entry.audioUrl)) audioUrls.push(entry.audioUrl);

    for (const audioUrl of audioUrls) {
      try {
        const audio = await request({
          method: 'GET',
          url: audioUrl,
          header: {
            Accept: 'audio/mpeg',
          },
          timeout: DICTIONARY_TIMEOUT_MS,
        });
        return {
          base64: binaryAudioToBase64(audio),
          source: PRONUNCIATION_SOURCE_DICTIONARY_US,
          attribution: {
            sourceUrl: entry.sourceUrl,
            artist,
            licenseName: entry.licenseName,
            licenseUrl: entry.licenseUrl,
          },
        };
      } catch {
        // Try the next exact recording URL before using synthesized speech.
      }
    }
    return null;
  } catch {
    return null;
  }
}

function buildPronunciationRequest({
  word,
  apiKey,
  apiBaseUrl = DEFAULT_TTS_API_BASE_URL,
  model = DEFAULT_TTS_MODEL,
  voiceId = DEFAULT_TTS_VOICE_ID,
}) {
  const normalizedKey = String(apiKey || '').trim();
  if (!normalizedKey) {
    throw new PronunciationError('pronunciation_config', 'API key is missing');
  }

  const normalizedWord = String(word || '').trim();
  const normalizedModel = String(model || DEFAULT_TTS_MODEL).trim();
  const normalizedVoiceId = String(voiceId || DEFAULT_TTS_VOICE_ID).trim();
  if (!normalizedWord || !normalizedModel || !normalizedVoiceId) {
    throw new PronunciationError(
      'pronunciation_config',
      'Word, model, or voice is missing',
    );
  }

  return {
    method: 'POST',
    url: ttsUrl(apiBaseUrl),
    header: {
      Authorization: `Bearer ${normalizedKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      model: normalizedModel,
      text: normalizedWord,
      stream: false,
      voice_setting: {
        voice_id: normalizedVoiceId,
        speed: DEFAULT_TTS_SPEED,
      },
      audio_setting: {
        format: 'mp3',
      },
    },
  };
}

function responsePayload(response) {
  return response && response.data ? response.data : response;
}

function pronunciationAudio(response) {
  const payload = responsePayload(response);
  if (!payload || typeof payload !== 'object' || response?.error) {
    throw new PronunciationError(
      'pronunciation_api',
      'Pronunciation provider returned an invalid response',
    );
  }
  if (payload.error || Number(payload.base_resp?.status_code || 0) !== 0) {
    throw new PronunciationError(
      'pronunciation_api',
      'Pronunciation provider failed',
    );
  }

  const audio = payload.data?.audio;
  if (typeof audio !== 'string' || !audio.trim()) {
    throw new PronunciationError(
      'pronunciation_response',
      'Pronunciation provider returned no audio',
    );
  }
  return audio.trim();
}

function audioToBase64(audio, dataApi) {
  const normalized = String(audio || '')
    .trim()
    .replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
  if (!normalized) {
    throw new PronunciationError(
      'pronunciation_response',
      'Pronunciation audio is empty',
    );
  }
  if (!dataApi) {
    throw new PronunciationError(
      'pronunciation_config',
      'Bob data conversion API is unavailable',
    );
  }

  try {
    const isHex =
      normalized.length % 2 === 0 && /^[0-9a-f]+$/i.test(normalized);
    const data = isHex
      ? dataApi.fromHex(normalized)
      : dataApi.fromBase64(normalized);
    const base64 = data.toBase64();
    if (!base64) throw new Error('empty data');
    return base64;
  } catch {
    throw new PronunciationError(
      'pronunciation_response',
      'Pronunciation audio encoding is invalid',
    );
  }
}

async function generatePronunciation({ request, dataApi, ...options }) {
  if (typeof request !== 'function') {
    throw new PronunciationError(
      'pronunciation_config',
      'HTTP request function is missing',
    );
  }
  const requestOptions = buildPronunciationRequest(options);
  let response;
  try {
    response = await request(requestOptions);
  } catch {
    throw new PronunciationError(
      'pronunciation_api',
      'Pronunciation request failed',
    );
  }
  return audioToBase64(pronunciationAudio(response), dataApi);
}

async function generatePreferredPronunciation({ request, dataApi, ...options }) {
  if (typeof request !== 'function') {
    throw new PronunciationError(
      'pronunciation_config',
      'HTTP request function is missing',
    );
  }

  const dictionary = await fetchAmericanDictionaryPronunciation({
    word: options.word,
    request,
  });
  if (dictionary) return dictionary;

  return {
    base64: await generatePronunciation({ request, dataApi, ...options }),
    source: PRONUNCIATION_SOURCE_MINIMAX,
  };
}

module.exports = {
  DEFAULT_TTS_API_BASE_URL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_SPEED,
  DEFAULT_TTS_VOICE_ID,
  DICTIONARY_API_BASE_URL,
  DICTIONARY_TIMEOUT_MS,
  PRONUNCIATION_SOURCE_DICTIONARY_US,
  PRONUNCIATION_SOURCE_MINIMAX,
  PronunciationError,
  WIKIMEDIA_COMMONS_API_BASE_URL,
  audioToBase64,
  binaryAudioToBase64,
  buildDictionaryLookupRequest,
  buildPronunciationRequest,
  buildWikimediaAudioLookupRequest,
  dictionaryLookupUrl,
  fetchAmericanDictionaryPronunciation,
  generatePreferredPronunciation,
  generatePronunciation,
  isAmericanMp3Url,
  normalizeDictionaryAudioUrl,
  pronunciationAudio,
  plainWikimediaText,
  selectAmericanDictionaryAudio,
  selectAmericanDictionaryEntry,
  selectWikimediaArtist,
  selectWikimediaMp3,
  ttsUrl,
  wikimediaCommonsPageId,
};
