const assert = require('node:assert/strict');
const test = require('node:test');

const {
  classifyCandidateWords,
  extractCandidateWords,
  getWordLevel,
  parseIgnoredWords,
} = require('../src/context');

test('uses the lowest CEFR-J level for common words and inflections', () => {
  assert.equal(getWordLevel('do'), 'A1');
  assert.equal(getWordLevel('these'), 'A1');
  assert.equal(getWordLevel('immediately'), 'B1');
  assert.equal(getWordLevel('agents'), 'A2');
  assert.equal(getWordLevel('coding'), 'A1');
  assert.equal(getWordLevel('took'), 'A1');
  assert.equal(getWordLevel('developers'), 'A2');
  assert.equal(getWordLevel('productivity'), 'B1');
});

test('defaults to B2 and excludes basic words from the sample sentence', () => {
  const result = classifyCandidateWords(
    'AI-powered coding agents increase productivity for many developers. ' +
      'But do these agents produce good-quality code.',
  );

  assert.deepEqual(result.groups, [
    {
      level: 'UNKNOWN',
      label: '词表外 / 专业词',
      words: ['AI-powered'],
    },
  ]);
  assert.equal(result.minimumLevel, 'B2');
});

test('filters immediately at B2 but includes it at B1', () => {
  assert.deepEqual(extractCandidateWords('I took action immediately.'), []);
  assert.deepEqual(
    extractCandidateWords('I took action immediately.', { minimumLevel: 'B1' }),
    ['immediately'],
  );
});

test('filters math variables and keeps typographic contractions intact', () => {
  const sentence =
    'This is an alternating series, and so the error in truncating the series ' +
    'after n terms is bounded by the size of the n+1 term, if you’ve gone far ' +
    'enough out in the series that the terms are monotonically decreasing in ' +
    'absolute value.';

  assert.equal(getWordLevel("you've"), 'A1');
  assert.equal(getWordLevel('you’ve'), 'A1');
  assert.deepEqual(classifyCandidateWords(sentence).groups, [
    { level: 'B2', label: 'B2', words: ['alternating'] },
    {
      level: 'UNKNOWN',
      label: '词表外 / 专业词',
      words: ['truncating', 'monotonically'],
    },
  ]);
});

test('groups B2 and out-of-list words separately', () => {
  assert.deepEqual(
    classifyCandidateWords('The sophisticated algorithm failed.').groups,
    [
      { level: 'B2', label: 'B2', words: ['sophisticated'] },
      {
        level: 'UNKNOWN',
        label: '词表外 / 专业词',
        words: ['algorithm'],
      },
    ],
  );
});

test('supports a personal known-word exclusion list', () => {
  const ignored = parseIgnoredWords('algorithm, productivity; developers');
  assert.deepEqual([...ignored], ['algorithm', 'productivity', 'developers']);
  assert.deepEqual(
    extractCandidateWords('A sophisticated algorithm.', {
      ignoredWords: 'sophisticated algorithm',
    }),
    [],
  );
});

test('deduplicates case-insensitively while preserving first spelling', () => {
  assert.deepEqual(
    extractCandidateWords('Sophisticated plans were sophisticated.'),
    ['Sophisticated'],
  );
});
