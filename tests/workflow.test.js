const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createContextSession,
  isSingleEnglishWord,
} = require('../src/workflow');

test('consumes a matching candidate once and preserves its sentence', () => {
  let now = 1000;
  const session = createContextSession({ ttlMs: 5000, now: () => now });
  session.remember('I took action immediately.', [
    'took',
    'action',
    'immediately',
  ]);

  assert.deepEqual(session.consume('Immediately'), {
    word: 'Immediately',
    context: 'I took action immediately.',
  });
  assert.equal(session.consume('immediately'), null);

  now += 1;
});

test('does not consume an unrelated or expired word', () => {
  let now = 1000;
  const session = createContextSession({ ttlMs: 100, now: () => now });
  session.remember('I took action immediately.', ['immediately']);

  assert.equal(session.consume('action'), null);
  now = 1101;
  assert.equal(session.consume('immediately'), null);
});

test('recognizes standalone English words and hyphenated compounds', () => {
  assert.equal(isSingleEnglishWord('immediately'), true);
  assert.equal(isSingleEnglishWord('follow-up'), true);
  assert.equal(isSingleEnglishWord('two words'), false);
  assert.equal(isSingleEnglishWord('立即'), false);
});
