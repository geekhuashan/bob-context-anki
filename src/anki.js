const ANKI_CONNECT_URL = 'http://127.0.0.1:8765';
const DECK_NAME = 'English::Vocabulary';
const MODEL_NAME = 'Vocabulary Modern';

function buildContextNote({ word, context }) {
  return {
    deckName: DECK_NAME,
    modelName: MODEL_NAME,
    fields: {
      Word: word,
      Phonetic: '',
      Definition: '',
      DefinitionZH: '',
      ContextMeaning: '',
      ExampleSentence: context,
      SentenceTranslation: '',
      Source: 'Bob 划词',
      Audio: '',
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

async function saveContextNote({ word, context, request }) {
  const note = buildContextNote({ word, context });
  const canAdd = await ankiRequest('canAddNotes', { notes: [note] }, request);

  if (!Array.isArray(canAdd) || canAdd[0] !== true) {
    return { status: 'duplicate' };
  }

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
  buildContextNote,
  saveContextNote,
  unwrapAnkiResponse,
};
