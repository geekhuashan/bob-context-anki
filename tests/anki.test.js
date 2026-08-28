const assert = require('node:assert/strict');
const test = require('node:test');

const {
  audioField,
  buildContextNote,
  escapeHtml,
  legacyMediaFilename,
  mediaFilename,
  pronunciationAttribution,
  saveContextNote,
} = require('../src/anki');

const annotation = {
  phonetic: '/immediately/',
  definition: 'At once; without delay.',
  definitionZH: '立即；马上。',
  contextMeaning: '表示动作没有延迟。',
  sentenceTranslation: '我立即采取了行动。',
};
const audioBase64 = 'SUQzBAAAAAA=';
const dictionaryPronunciation = {
  base64: audioBase64,
  source: 'dictionary-us',
  attribution: {
    sourceUrl: 'https://commons.wikimedia.org/w/index.php?curid=694317',
    artist: 'Dvortygirl',
    licenseName: 'BY-SA 3.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
  },
};
const minimaxPronunciation = {
  base64: audioBase64,
  source: 'minimax',
};

function noteFields(values = {}) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value }]),
  );
}

function completeFields(overrides = {}) {
  return noteFields({
    Word: 'immediately',
    Phonetic: annotation.phonetic,
    Definition: annotation.definition,
    DefinitionZH: annotation.definitionZH,
    ContextMeaning: annotation.contextMeaning,
    SentenceTranslation: annotation.sentenceTranslation,
    Source: 'Bob 划词',
    Audio: audioField(mediaFilename('immediately', 'dictionary-us')),
    ...overrides,
  });
}

test('builds a Vocabulary Modern note with context and playable audio', () => {
  const audio = audioField(mediaFilename('immediately', 'dictionary-us'));
  const note = buildContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    annotation,
    audio,
  });

  assert.equal(note.deckName, 'English::Vocabulary');
  assert.equal(note.modelName, 'Vocabulary Modern');
  assert.equal(note.fields.Word, 'immediately');
  assert.equal(note.fields.ExampleSentence, 'I took action immediately.');
  assert.equal(note.fields.Definition, annotation.definition);
  assert.equal(note.fields.DefinitionZH, annotation.definitionZH);
  assert.equal(note.fields.ContextMeaning, annotation.contextMeaning);
  assert.equal(
    note.fields.SentenceTranslation,
    annotation.sentenceTranslation,
  );
  assert.equal(
    note.fields.Audio,
    '[sound:bob-context-immediately-dictionary-us.mp3]',
  );
  assert.equal(note.fields.Source, 'Bob 划词');
  assert.deepEqual(note.tags, ['bob', 'context-word']);
});

test('generates annotation and pronunciation in parallel before adding', async () => {
  const calls = [];
  let annotationFinished = false;
  let storedData;
  let addedNote;
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [true], error: null } };
    }
    if (body.action === 'storeMediaFile') {
      storedData = body.params.data;
      return { data: { result: body.params.filename, error: null } };
    }
    addedNote = body.params.note;
    return { data: { result: 123456, error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => {
      calls.push('annotation');
      await new Promise((resolve) => setImmediate(resolve));
      annotationFinished = true;
      return annotation;
    },
    pronunciationProvider: async () => {
      calls.push('pronunciation');
      assert.equal(annotationFinished, false);
      return dictionaryPronunciation;
    },
  });

  assert.deepEqual(result, {
    status: 'added',
    noteId: 123456,
    pronunciationSource: 'dictionary-us',
  });
  assert.deepEqual(calls, [
    'canAddNotes',
    'annotation',
    'pronunciation',
    'storeMediaFile',
    'addNote',
  ]);
  assert.equal(storedData, audioBase64);
  assert.equal(
    addedNote.fields.Audio,
    '[sound:bob-context-immediately-dictionary-us.mp3]',
  );
  assert.match(addedNote.fields.Source, /Wikimedia Commons/);
  assert.match(addedNote.fields.Source, /Dvortygirl/);
  assert.match(addedNote.fields.Source, /BY-SA 3\.0/);
});

test('complete duplicates consume no annotation or pronunciation quota', async () => {
  const calls = [];
  let providerCalls = 0;
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    return {
      data: {
        result: [
          {
            noteId: 42,
            tags: ['bob', 'context-word'],
            fields: completeFields(),
          },
        ],
        error: null,
      },
    };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => {
      providerCalls += 1;
      return annotation;
    },
    pronunciationProvider: async () => {
      providerCalls += 1;
      return dictionaryPronunciation;
    },
  });

  assert.deepEqual(result, { status: 'duplicate' });
  assert.deepEqual(calls, ['canAddNotes', 'findNotes', 'notesInfo']);
  assert.equal(providerCalls, 0);
});

test('migrates a legacy 0.5 audio reference once', async () => {
  let currentAudio = audioField(legacyMediaFilename('immediately'));
  let pronunciationCalls = 0;
  let storedFilename;
  const request = async ({ body }) => {
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    if (body.action === 'notesInfo') {
      return {
        data: {
          result: [
            {
              noteId: 42,
              tags: ['bob', 'context-word'],
              fields: completeFields({ Audio: currentAudio }),
            },
          ],
          error: null,
        },
      };
    }
    if (body.action === 'storeMediaFile') {
      storedFilename = body.params.filename;
      return { data: { result: storedFilename, error: null } };
    }
    if (body.action === 'updateNoteFields') {
      currentAudio = body.params.note.fields.Audio;
      return { data: { result: null, error: null } };
    }
    assert.fail(`unexpected action: ${body.action}`);
  };
  const options = {
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => assert.fail('annotation should not run'),
    pronunciationProvider: async () => {
      pronunciationCalls += 1;
      return minimaxPronunciation;
    },
  };

  const migrated = await saveContextNote(options);
  const repeated = await saveContextNote(options);

  assert.deepEqual(migrated, {
    status: 'updated',
    noteId: 42,
    repaired: { annotation: false, audio: true },
    pronunciationSource: 'minimax',
  });
  assert.deepEqual(repeated, { status: 'duplicate' });
  assert.equal(pronunciationCalls, 1);
  assert.equal(storedFilename, 'bob-context-immediately-minimax.mp3');
  assert.equal(currentAudio, '[sound:bob-context-immediately-minimax.mp3]');
});

test('preserves a complete card with custom pronunciation audio', async () => {
  let providerCalls = 0;
  const request = async ({ body }) => {
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    if (body.action === 'notesInfo') {
      return {
        data: {
          result: [
            {
              noteId: 42,
              tags: ['bob', 'context-word'],
              fields: completeFields({ Audio: '[sound:custom-recording.mp3]' }),
            },
          ],
          error: null,
        },
      };
    }
    assert.fail(`unexpected action: ${body.action}`);
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => {
      providerCalls += 1;
      return annotation;
    },
    pronunciationProvider: async () => {
      providerCalls += 1;
      return dictionaryPronunciation;
    },
  });

  assert.deepEqual(result, { status: 'duplicate' });
  assert.equal(providerCalls, 0);
});

test('repairs only missing audio without regenerating annotations', async () => {
  const calls = [];
  let annotationCalls = 0;
  let updatedFields;
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    if (body.action === 'notesInfo') {
      return {
        data: {
          result: [
            {
              noteId: 42,
              tags: ['bob', 'context-word'],
              fields: completeFields({ Audio: '' }),
            },
          ],
          error: null,
        },
      };
    }
    if (body.action === 'storeMediaFile') {
      return { data: { result: body.params.filename, error: null } };
    }
    updatedFields = body.params.note.fields;
    return { data: { result: null, error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => {
      annotationCalls += 1;
      return annotation;
    },
    pronunciationProvider: async () => dictionaryPronunciation,
  });

  assert.deepEqual(result, {
    status: 'updated',
    noteId: 42,
    repaired: { annotation: false, audio: true },
    pronunciationSource: 'dictionary-us',
  });
  assert.equal(annotationCalls, 0);
  assert.deepEqual(updatedFields, {
    Audio: '[sound:bob-context-immediately-dictionary-us.mp3]',
    Source:
      'Bob 划词<br><small>真人美音：<a href="https://commons.wikimedia.org/w/index.php?curid=694317">Wikimedia Commons</a>（Dvortygirl） · <a href="https://creativecommons.org/licenses/by-sa/3.0">BY-SA 3.0</a></small>',
  });
  assert.deepEqual(calls, [
    'canAddNotes',
    'findNotes',
    'notesInfo',
    'storeMediaFile',
    'updateNoteFields',
  ]);
});

test('repairs only missing annotation fields without regenerating audio', async () => {
  let pronunciationCalls = 0;
  let updatedFields;
  const request = async ({ body }) => {
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    if (body.action === 'notesInfo') {
      return {
        data: {
          result: [
            {
              noteId: 42,
              tags: ['bob', 'context-word'],
              fields: completeFields({ DefinitionZH: '' }),
            },
          ],
          error: null,
        },
      };
    }
    updatedFields = body.params.note.fields;
    return { data: { result: null, error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => annotation,
    pronunciationProvider: async () => {
      pronunciationCalls += 1;
      return dictionaryPronunciation;
    },
  });

  assert.deepEqual(result.repaired, { annotation: true, audio: false });
  assert.equal(pronunciationCalls, 0);
  assert.deepEqual(updatedFields, { DefinitionZH: annotation.definitionZH });
});

test('repairs annotations and audio together on a plugin-owned card', async () => {
  const calls = [];
  let updatedFields;
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    if (body.action === 'notesInfo') {
      return {
        data: {
          result: [
            {
              noteId: 42,
              tags: ['bob', 'context-word'],
              fields: noteFields({ Word: 'immediately' }),
            },
          ],
          error: null,
        },
      };
    }
    if (body.action === 'storeMediaFile') {
      return { data: { result: body.params.filename, error: null } };
    }
    updatedFields = body.params.note.fields;
    return { data: { result: null, error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => annotation,
    pronunciationProvider: async () => dictionaryPronunciation,
  });

  assert.deepEqual(result.repaired, { annotation: true, audio: true });
  assert.equal(updatedFields.DefinitionZH, annotation.definitionZH);
  assert.equal(
    updatedFields.Audio,
    '[sound:bob-context-immediately-dictionary-us.mp3]',
  );
  assert.deepEqual(calls, [
    'canAddNotes',
    'findNotes',
    'notesInfo',
    'storeMediaFile',
    'updateNoteFields',
  ]);
});

test('does not enrich incomplete duplicate cards owned by another workflow', async () => {
  const calls = [];
  let providerCalls = 0;
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [false], error: null } };
    }
    if (body.action === 'findNotes') {
      return { data: { result: [42], error: null } };
    }
    return {
      data: {
        result: [
          {
            noteId: 42,
            tags: ['vocab'],
            fields: noteFields({ Word: 'immediately', Definition: '' }),
          },
        ],
        error: null,
      },
    };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => {
      providerCalls += 1;
      return annotation;
    },
    pronunciationProvider: async () => {
      providerCalls += 1;
      return dictionaryPronunciation;
    },
  });

  assert.deepEqual(result, { status: 'duplicate' });
  assert.equal(providerCalls, 0);
  assert.deepEqual(calls, ['canAddNotes', 'findNotes', 'notesInfo']);
});

test('provider failures do not store media or create a note', async () => {
  for (const failedProvider of ['annotation', 'pronunciation']) {
    const calls = [];
    const request = async ({ body }) => {
      calls.push(body.action);
      return { data: { result: [true], error: null } };
    };

    await assert.rejects(
      saveContextNote({
        word: 'immediately',
        context: 'I took action immediately.',
        request,
        annotationProvider: async () => {
          if (failedProvider === 'annotation') {
            throw new Error('annotation failed');
          }
          return annotation;
        },
        pronunciationProvider: async () => {
          if (failedProvider === 'pronunciation') {
            throw new Error('pronunciation failed');
          }
          return dictionaryPronunciation;
        },
      }),
      new RegExp(`${failedProvider} failed`),
    );
    assert.deepEqual(calls, ['canAddNotes']);
  }
});

test('media storage failure does not create or update a note', async () => {
  const calls = [];
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [true], error: null } };
    }
    if (body.action === 'storeMediaFile') {
      throw new Error('media failed');
    }
    assert.fail(`unexpected action: ${body.action}`);
  };

  await assert.rejects(
    saveContextNote({
      word: 'immediately',
      context: 'I took action immediately.',
      request,
      annotationProvider: async () => annotation,
      pronunciationProvider: async () => dictionaryPronunciation,
    }),
    /media failed/,
  );
  assert.deepEqual(calls, ['canAddNotes', 'storeMediaFile']);
});

test('uses deterministic safe media filenames', () => {
  assert.equal(
    mediaFilename('Daunting', 'dictionary-us'),
    'bob-context-daunting-dictionary-us.mp3',
  );
  assert.equal(
    mediaFilename('follow-up', 'minimax'),
    'bob-context-follow-up-minimax.mp3',
  );
  assert.equal(
    legacyMediaFilename('Daunting'),
    'bob-context-daunting.mp3',
  );
  assert.equal(
    audioField(mediaFilename('Daunting', 'dictionary-us')),
    '[sound:bob-context-daunting-dictionary-us.mp3]',
  );
});

test('labels only safe dictionary attribution links', () => {
  assert.equal(
    pronunciationAttribution({
      source: 'dictionary-us',
      attribution: { sourceUrl: 'http://insecure.example/audio' },
    }),
    '',
  );
  assert.match(
    pronunciationAttribution({
      source: 'dictionary-us',
      attribution: { sourceUrl: 'https://dictionary.example/audio' },
    }),
    />录音来源<\/a>/,
  );
});

test('escapes HTML before storing screen and model text', () => {
  assert.equal(
    escapeHtml('<b>word & meaning</b>'),
    '&lt;b&gt;word &amp; meaning&lt;/b&gt;',
  );
  const note = buildContextNote({
    word: '<word>',
    context: 'Use <script>alert("x")</script>.',
    annotation: { ...annotation, definition: '<b>unsafe</b>' },
  });
  assert.equal(note.fields.Word, '&lt;word&gt;');
  assert.equal(note.fields.Definition, '&lt;b&gt;unsafe&lt;/b&gt;');
  assert.equal(
    note.fields.ExampleSentence,
    'Use &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;.',
  );
});
