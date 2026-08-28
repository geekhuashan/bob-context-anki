const assert = require('node:assert/strict');
const test = require('node:test');

const { buildContextNote, saveContextNote } = require('../src/anki');

test('builds a Vocabulary Modern note with word and sentence context', () => {
  const note = buildContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
  });

  assert.equal(note.deckName, 'English::Vocabulary');
  assert.equal(note.modelName, 'Vocabulary Modern');
  assert.equal(note.fields.Word, 'immediately');
  assert.equal(note.fields.ExampleSentence, 'I took action immediately.');
  assert.equal(note.fields.Source, 'Bob 划词');
  assert.deepEqual(note.tags, ['bob', 'context-word']);
});

test('checks duplicates before adding a note', async () => {
  const calls = [];
  const request = async ({ body }) => {
    calls.push(body);
    if (body.action === 'canAddNotes') {
      return { data: { result: [true], error: null } };
    }
    return { data: { result: 123456, error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
  });

  assert.deepEqual(result, { status: 'added', noteId: 123456 });
  assert.deepEqual(
    calls.map(({ action }) => action),
    ['canAddNotes', 'addNote'],
  );
});

test('does not call addNote when Anki rejects a duplicate', async () => {
  const calls = [];
  const request = async ({ body }) => {
    calls.push(body.action);
    return { data: { result: [false], error: null } };
  };

  const result = await saveContextNote({
    word: 'immediately',
    context: 'I took action immediately.',
    request,
  });

  assert.deepEqual(result, { status: 'duplicate' });
  assert.deepEqual(calls, ['canAddNotes']);
});
