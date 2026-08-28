const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const DECK_NAME = 'English::Vocabulary';
const MODEL_NAME = 'Vocabulary Modern';
const ANNOTATION_FIELD_MAP = {
  phonetic: 'Phonetic',
  definition: 'Definition',
  definitionZH: 'DefinitionZH',
  contextMeaning: 'ContextMeaning',
  sentenceTranslation: 'SentenceTranslation',
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function safeHttpsUrl(value) {
  const url = String(value || '').trim();
  return url.startsWith('https://') ? url : '';
}

function pronunciationAttribution(pronunciation) {
  if (pronunciation?.source !== 'dictionary-us') return '';
  const sourceUrl = safeHttpsUrl(pronunciation.attribution?.sourceUrl);
  if (!sourceUrl) return '';

  const artist = escapeHtml(pronunciation.attribution?.artist);
  const licenseName = escapeHtml(pronunciation.attribution?.licenseName);
  const licenseUrl = safeHttpsUrl(pronunciation.attribution?.licenseUrl);
  const sourceLabel = sourceUrl.startsWith(
    'https://commons.wikimedia.org/',
  )
    ? 'Wikimedia Commons'
    : '录音来源';
  const creator = artist ? `（${artist}）` : '';
  const license = licenseName
    ? licenseUrl
      ? ` · <a href="${escapeHtml(licenseUrl)}">${licenseName}</a>`
      : ` · ${licenseName}`
    : '';
  return `<small>真人美音：<a href="${escapeHtml(
    sourceUrl,
  )}">${sourceLabel}</a>${creator}${license}</small>`;
}

function sourceField(existingSource, pronunciation) {
  const existing = String(existingSource || '').trim() || 'Bob 划词';
  const attribution = pronunciationAttribution(pronunciation);
  if (!attribution || existing.includes(attribution)) return existing;
  return `${existing}<br>${attribution}`;
}

function buildContextNote({
  word,
  context,
  annotation = {},
  audio = '',
  pronunciation = null,
}) {
  return {
    deckName: DECK_NAME,
    modelName: MODEL_NAME,
    fields: {
      Word: escapeHtml(word),
      Phonetic: escapeHtml(annotation.phonetic),
      Definition: escapeHtml(annotation.definition),
      DefinitionZH: escapeHtml(annotation.definitionZH),
      ContextMeaning: escapeHtml(annotation.contextMeaning),
      ExampleSentence: escapeHtml(context),
      SentenceTranslation: escapeHtml(annotation.sentenceTranslation),
      Source: sourceField('Bob 划词', pronunciation),
      Audio: audio,
    },
    options: {
      allowDuplicate: false,
      duplicateScope: 'deck',
      duplicateScopeOptions: {
        deckName: DECK_NAME,
        checkChildren: false,
        checkAllModels: false,
      },
    },
    tags: ['bob', 'context-word'],
  };
}

function buildAnnotationFields(annotation) {
  return Object.fromEntries(
    Object.entries(ANNOTATION_FIELD_MAP).map(([source, target]) => [
      target,
      escapeHtml(annotation[source]),
    ]),
  );
}

function buildMissingAnnotationFields(annotation, note) {
  return Object.fromEntries(
    Object.entries(buildAnnotationFields(annotation)).filter(([field]) =>
      !fieldValue(note, field),
    ),
  );
}

function safeMediaWord(word) {
  const safeWord = String(word || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!safeWord) throw new Error('Cannot build a pronunciation filename');
  return safeWord;
}

function legacyMediaFilename(word) {
  return `bob-context-${safeMediaWord(word)}.mp3`;
}

function mediaFilename(word, source) {
  if (!['dictionary-us', 'minimax'].includes(source)) {
    throw new Error('Pronunciation source is invalid');
  }
  return `bob-context-${safeMediaWord(word)}-${source}.mp3`;
}

function audioField(filename) {
  return `[sound:${filename}]`;
}

function unwrapAnkiResponse(response) {
  const payload = response && response.data ? response.data : response;
  if (!payload || typeof payload !== 'object') {
    throw new Error('AnkiConnect returned an invalid response');
  }
  if (payload.error) throw new Error(String(payload.error));
  return payload.result;
}

async function ankiRequest(action, params, request) {
  const response = await request({
    method: 'POST',
    url: ANKI_CONNECT_URL,
    header: {
      'Content-Type': 'application/json',
    },
    body: {
      action,
      version: 6,
      params,
    },
  });
  return unwrapAnkiResponse(response);
}

function fieldValue(note, field) {
  return String(note?.fields?.[field]?.value || '').trim();
}

function hasCurrentPronunciation(note, word) {
  const audio = fieldValue(note, 'Audio');
  if (!audio) return false;
  return audio !== audioField(legacyMediaFilename(word));
}

function normalizePronunciationResult(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    typeof result.base64 !== 'string' ||
    !result.base64
  ) {
    throw new Error('Pronunciation provider returned invalid audio');
  }
  if (!['dictionary-us', 'minimax'].includes(result.source)) {
    throw new Error('Pronunciation provider returned an invalid source');
  }
  return result;
}

async function findIncompleteContextNote(word, request) {
  const noteIds = await ankiRequest(
    'findNotes',
    {
      query:
        `deck:"${DECK_NAME}" note:"${MODEL_NAME}" ` +
        `Word:"${String(word).replaceAll('"', '')}"`,
    },
    request,
  );
  if (!Array.isArray(noteIds) || noteIds.length === 0) return null;

  const notes = await ankiRequest('notesInfo', { notes: noteIds }, request);
  if (!Array.isArray(notes)) return null;

  return (
    notes.find((note) => {
      const exactWord =
        fieldValue(note, 'Word').toLowerCase() === word.toLowerCase();
      const owned =
        Array.isArray(note.tags) && note.tags.includes('context-word');
      const annotationsComplete = Object.values(ANNOTATION_FIELD_MAP).every(
        (field) => fieldValue(note, field),
      );
      const audioComplete = hasCurrentPronunciation(note, word);
      return exactWord && owned && !(annotationsComplete && audioComplete);
    }) || null
  );
}

async function saveContextNote({
  word,
  context,
  request,
  annotationProvider,
  pronunciationProvider,
}) {
  const duplicateProbe = buildContextNote({ word, context });
  const canAdd = await ankiRequest(
    'canAddNotes',
    { notes: [duplicateProbe] },
    request,
  );

  if (!Array.isArray(canAdd) || canAdd[0] !== true) {
    const incompleteNote = await findIncompleteContextNote(word, request);
    if (!incompleteNote) return { status: 'duplicate' };

    const needsAnnotation = Object.values(ANNOTATION_FIELD_MAP).some(
      (field) => !fieldValue(incompleteNote, field),
    );
    const needsAudio = !hasCurrentPronunciation(incompleteNote, word);
    if (needsAnnotation && typeof annotationProvider !== 'function') {
      throw new Error('Annotation provider is missing');
    }
    if (needsAudio && typeof pronunciationProvider !== 'function') {
      throw new Error('Pronunciation provider is missing');
    }

    const [annotation, pronunciationResult] = await Promise.all([
      needsAnnotation ? annotationProvider() : null,
      needsAudio ? pronunciationProvider() : null,
    ]);
    const fields = needsAnnotation
      ? buildMissingAnnotationFields(annotation, incompleteNote)
      : {};
    if (needsAudio) {
      const pronunciation = normalizePronunciationResult(pronunciationResult);
      const filename = mediaFilename(word, pronunciation.source);
      const storedFilename = await ankiRequest(
        'storeMediaFile',
        { filename, data: pronunciation.base64 },
        request,
      );
      if (storedFilename !== filename) {
        throw new Error('AnkiConnect did not store the pronunciation media');
      }
      fields.Audio = audioField(filename);
      const source = sourceField(
        fieldValue(incompleteNote, 'Source'),
        pronunciation,
      );
      if (source !== fieldValue(incompleteNote, 'Source')) {
        fields.Source = source;
      }
    }
    await ankiRequest(
      'updateNoteFields',
      {
        note: {
          id: incompleteNote.noteId,
          fields,
        },
      },
      request,
    );
    return {
      status: 'updated',
      noteId: incompleteNote.noteId,
      repaired: { annotation: needsAnnotation, audio: needsAudio },
      pronunciationSource: pronunciationResult?.source || null,
    };
  }

  if (typeof annotationProvider !== 'function') {
    throw new Error('Annotation provider is missing');
  }
  if (typeof pronunciationProvider !== 'function') {
    throw new Error('Pronunciation provider is missing');
  }
  const [annotation, pronunciationResult] = await Promise.all([
    annotationProvider(),
    pronunciationProvider(),
  ]);
  const pronunciation = normalizePronunciationResult(pronunciationResult);
  const filename = mediaFilename(word, pronunciation.source);
  const storedFilename = await ankiRequest(
    'storeMediaFile',
    { filename, data: pronunciation.base64 },
    request,
  );
  if (storedFilename !== filename) {
    throw new Error('AnkiConnect did not store the pronunciation media');
  }
  const note = buildContextNote({
    word,
    context,
    annotation,
    audio: audioField(filename),
    pronunciation,
  });
  const noteId = await ankiRequest('addNote', { note }, request);
  if (typeof noteId !== 'number') {
    throw new Error('AnkiConnect did not return a note id');
  }
  return {
    status: 'added',
    noteId,
    pronunciationSource: pronunciation.source,
  };
}

module.exports = {
  ANKI_CONNECT_URL,
  DECK_NAME,
  MODEL_NAME,
  audioField,
  buildAnnotationFields,
  buildContextNote,
  buildMissingAnnotationFields,
  escapeHtml,
  findIncompleteContextNote,
  hasCurrentPronunciation,
  legacyMediaFilename,
  mediaFilename,
  normalizePronunciationResult,
  pronunciationAttribution,
  safeHttpsUrl,
  saveContextNote,
  sourceField,
  unwrapAnkiResponse,
};
