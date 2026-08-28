const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildContextNote,
  escapeHtml,
  saveContextNote,
} = require('../src/anki');

const annotation = {
  phonetic: '/immediately/',
  definition: 'At once; without delay.',
  definitionZH: '立即；马上。',
  contextMeaning: '表示动作没有延迟。',
  sentenceTranslation: '我立即采取了行动。',
};

test('builds a Vocabulary Modern note with word and sentence context', () => {
  const note = buildContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    annotation,
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
  assert.equal(note.fields.Source, 'Bob 划词');
  assert.deepEqual(note.tags, ['bob', 'context-word']);
});

test('checks duplicates, generates annotations, then adds the note', async () => {
  const calls = [];
  const request = async ({ body }) => {
    calls.push(body.action);
    if (body.action === 'canAddNotes') {
      return { data: { result: [true], error: null } };
    }
    return { data: { result: 123456, error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
    annotationProvider: async () => {
      calls.push('annotation');
      return annotation;
    },
  });

  assert.deepEqual(result, { status: 'added', noteId: 123456 });
  assert.deepEqual(calls, ['canAddNotes', 'annotation', 'addNote']);
});

test('does not call addNote when Anki rejects a duplicate', async () => {
  const calls = [];
  let annotationCalls = 0;
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
            fields: Object.fromEntries(
              Object.entries({
                Word: 'immediately',
                Phonetic: annotation.phonetic,
                Definition: annotation.definition,
                DefinitionZH: annotation.definitionZH,
                ContextMeaning: annotation.contextMeaning,
                SentenceTranslation: annotation.sentenceTranslation,
              }).map(([key, value]) => [key, { value }]),
            ),
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
      annotationCalls += 1;
      return annotation;
    },
  });

  assert.deepEqual(result, { status: 'duplicate' });
  assert.deepEqual(calls, ['canAddNotes', 'findNotes', 'notesInfo']);
  assert.equal(annotationCalls, 0);
});

test('fills annotations on an incomplete card created by this plugin', async () => {
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
              fields: {
                Word: { value: 'immediately' },
                Definition: { value: '' },
              },
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
  });

  assert.deepEqual(result, { status: 'updated', noteId: 42 });
  assert.deepEqual(calls, [
    'canAddNotes',
    'findNotes',
    'notesInfo',
    'updateNoteFields',
  ]);
  assert.equal(updatedFields.DefinitionZH, annotation.definitionZH);
  assert.equal(updatedFields.SentenceTranslation, annotation.sentenceTranslation);
});

test('does not enrich incomplete duplicate cards owned by another workflow', async () => {
  const calls = [];
  let annotationCalls = 0;
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
            fields: {
              Word: { value: 'immediately' },
              Definition: { value: '' },
            },
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
      annotationCalls += 1;
      return annotation;
    },
  });

  assert.deepEqual(result, { status: 'duplicate' });
  assert.equal(annotationCalls, 0);
  assert.deepEqual(calls, ['canAddNotes', 'findNotes', 'notesInfo']);
});

test('does not call addNote when annotation generation fails', async () => {
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
        throw new Error('annotation failed');
      },
    }),
    /annotation failed/,
  );
  assert.deepEqual(calls, ['canAddNotes']);
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
