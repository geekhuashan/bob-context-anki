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

function buildContextNote({ word, context, annotation = {}, audio = '' }) {
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
      Source: 'Bob 划词',
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

function mediaFilename(word) {
  const safeWord = String(word || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!safeWord) throw new Error('Cannot build a pronunciation filename');
  return `bob-context-${safeWord}.mp3`;
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
      const audioComplete = Boolean(fieldValue(note, 'Audio'));
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
    const needsAudio = !fieldValue(incompleteNote, 'Audio');
    if (needsAnnotation && typeof annotationProvider !== 'function') {
      throw new Error('Annotation provider is missing');
    }
    if (needsAudio && typeof pronunciationProvider !== 'function') {
      throw new Error('Pronunciation provider is missing');
    }

    const [annotation, audioBase64] = await Promise.all([
      needsAnnotation ? annotationProvider() : null,
      needsAudio ? pronunciationProvider() : null,
    ]);
    const fields = needsAnnotation
      ? buildMissingAnnotationFields(annotation, incompleteNote)
      : {};
    if (needsAudio) {
      const filename = mediaFilename(word);
      const storedFilename = await ankiRequest(
        'storeMediaFile',
        { filename, data: audioBase64 },
        request,
      );
      if (storedFilename !== filename) {
        throw new Error('AnkiConnect did not store the pronunciation media');
      }
      fields.Audio = audioField(filename);
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
    };
  }

  if (typeof annotationProvider !== 'function') {
    throw new Error('Annotation provider is missing');
  }
  if (typeof pronunciationProvider !== 'function') {
    throw new Error('Pronunciation provider is missing');
  }
  const [annotation, audioBase64] = await Promise.all([
    annotationProvider(),
    pronunciationProvider(),
  ]);
  const filename = mediaFilename(word);
  const storedFilename = await ankiRequest(
    'storeMediaFile',
    { filename, data: audioBase64 },
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
  });
  const noteId = await ankiRequest('addNote', { note }, request);
  if (typeof noteId !== 'number') {
    throw new Error('AnkiConnect did not return a note id');
  }
  return { status: 'added', noteId };
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
  mediaFilename,
  saveContextNote,
  unwrapAnkiResponse,
};
