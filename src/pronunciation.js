const DEFAULT_TTS_API_BASE_URL = 'https://api.minimaxi.com';
const DEFAULT_TTS_MODEL = 'speech-2.8-hd';
const DEFAULT_TTS_VOICE_ID = 'English_Graceful_Lady';
const DEFAULT_TTS_SPEED = 0.85;

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

module.exports = {
  DEFAULT_TTS_API_BASE_URL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_SPEED,
  DEFAULT_TTS_VOICE_ID,
  PronunciationError,
  audioToBase64,
  buildPronunciationRequest,
  generatePronunciation,
  pronunciationAudio,
  ttsUrl,
};
