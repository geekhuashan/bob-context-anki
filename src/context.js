const CEFR_WORDS = require('./cefr-data');

const LEVELS = ['A1', 'A2', 'B1', 'B2'];
const DEFAULT_MINIMUM_LEVEL = 'B2';
const UNKNOWN_LEVEL = 'UNKNOWN';
const LEVEL_INDEX = new Map(LEVELS.map((level, index) => [level, index]));
const LEVEL_SETS = Object.fromEntries(
  LEVELS.map((level) => [level, new Set(CEFR_WORDS[level])]),
);
const CONTRACTION_FRAGMENTS = new Set(['d', 'll', 'm', 're', 's', 't', 've']);
const IRREGULAR_CONTRACTIONS = new Map([
  ["ain't", 'be'],
  ["can't", 'can'],
  ["shan't", 'shall'],
  ["won't", 'will'],
]);
const IRREGULAR_LEMMAS = new Map(
  Object.entries({
    am: 'be',
    are: 'be',
    ate: 'eat',
    became: 'become',
    began: 'begin',
    begun: 'begin',
    been: 'be',
    being: 'be',
    best: 'good',
    better: 'good',
    bought: 'buy',
    broke: 'break',
    broken: 'break',
    brought: 'bring',
    came: 'come',
    caught: 'catch',
    did: 'do',
    done: 'do',
    drank: 'drink',
    driven: 'drive',
    drove: 'drive',
    drunk: 'drink',
    eaten: 'eat',
    fallen: 'fall',
    felt: 'feel',
    flew: 'fly',
    flown: 'fly',
    forgot: 'forget',
    forgotten: 'forget',
    found: 'find',
    gave: 'give',
    given: 'give',
    gone: 'go',
    got: 'get',
    gotten: 'get',
    grew: 'grow',
    grown: 'grow',
    had: 'have',
    heard: 'hear',
    held: 'hold',
    is: 'be',
    kept: 'keep',
    knew: 'know',
    known: 'know',
    left: 'leave',
    lost: 'lose',
    made: 'make',
    met: 'meet',
    paid: 'pay',
    ran: 'run',
    ridden: 'ride',
    rode: 'ride',
    said: 'say',
    sang: 'sing',
    sat: 'sit',
    saw: 'see',
    seen: 'see',
    sent: 'send',
    slept: 'sleep',
    spoke: 'speak',
    spoken: 'speak',
    spent: 'spend',
    stood: 'stand',
    sung: 'sing',
    swam: 'swim',
    swum: 'swim',
    taken: 'take',
    taught: 'teach',
    thought: 'think',
    threw: 'throw',
    thrown: 'throw',
    told: 'tell',
    took: 'take',
    understood: 'understand',
    was: 'be',
    went: 'go',
    were: 'be',
    worn: 'wear',
    worse: 'bad',
    worst: 'bad',
    written: 'write',
    wrote: 'write',
  }),
);

function normalizeApostrophes(value) {
  return String(value || '').replace(/[\u2018\u2019]/g, "'");
}

function contractionBase(word) {
  const normalized = normalizeApostrophes(word).toLowerCase();
  const irregular = IRREGULAR_CONTRACTIONS.get(normalized);
  if (irregular) return irregular;

  const suffix = ["n't", "'re", "'ve", "'ll", "'d", "'m", "'s"].find(
    (ending) => normalized.endsWith(ending),
  );
  return suffix ? normalized.slice(0, -suffix.length) : normalized;
}

function uniqueWords(words) {
  const seen = new Set();
  return words.filter((word) => {
    const key = normalizeApostrophes(word).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractWords(text) {
  const words =
    String(text || '').match(/[A-Za-z]+(?:['\u2018\u2019-][A-Za-z]+)*/g) ||
    [];

  return uniqueWords(
    words.filter((word) => {
      const normalized = normalizeApostrophes(word).toLowerCase();
      return normalized.length > 1 && !CONTRACTION_FRAGMENTS.has(normalized);
    }),
  );
}

function normalizeMinimumLevel(value) {
  const level = String(value || '').trim().toUpperCase();
  return LEVEL_INDEX.has(level) || level === UNKNOWN_LEVEL
    ? level
    : DEFAULT_MINIMUM_LEVEL;
}

function parseIgnoredWords(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || '').split(/[\s,;，；]+/);
  return new Set(values.map((word) => word.trim().toLowerCase()).filter(Boolean));
}

function addSuffixForms(word, forms) {
  if (word.endsWith('ies') && word.length > 3) {
    forms.add(`${word.slice(0, -3)}y`);
  }

  if (word.endsWith('ing') && word.length > 4) {
    const stem = word.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
  }

  if (word.endsWith('ed') && word.length > 3) {
    const stem = word.slice(0, -2);
    forms.add(stem);
    forms.add(`${stem}e`);
    if (stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
  }

  if (word.endsWith('ity') && word.length > 4) {
    const stem = word.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
  }

  if (word.endsWith('ness') && word.length > 5) forms.add(word.slice(0, -4));
  if (word.endsWith('ly') && word.length > 3) forms.add(word.slice(0, -2));
  if (word.endsWith('er') && word.length > 3) {
    const stem = word.slice(0, -2);
    forms.add(stem);
    forms.add(`${stem}e`);
  }

  if (word.endsWith('es') && word.length > 3) forms.add(word.slice(0, -2));
  if (word.endsWith('s') && word.length > 2) forms.add(word.slice(0, -1));
}

function lemmaForms(word) {
  const normalized = String(word || '').toLowerCase();
  const forms = new Set([normalized]);
  const irregular = IRREGULAR_LEMMAS.get(normalized);
  if (irregular) forms.add(irregular);

  for (let pass = 0; pass < 3; pass += 1) {
    for (const form of [...forms]) addSuffixForms(form, forms);
  }
  return [...forms];
}

function findLowestLevel(word) {
  let lowest = null;

  for (const form of lemmaForms(word)) {
    for (const level of LEVELS) {
      if (!LEVEL_SETS[level].has(form)) continue;
      if (lowest === null || LEVEL_INDEX.get(level) < LEVEL_INDEX.get(lowest)) {
        lowest = level;
      }
    }
  }

  return lowest;
}

function getWordLevel(word) {
  const normalized = contractionBase(String(word || '').trim());
  const directLevel = findLowestLevel(normalized);
  if (directLevel || !normalized.includes('-')) return directLevel;

  const componentLevels = normalized.split('-').map(findLowestLevel);
  if (componentLevels.some((level) => level === null)) return null;

  return componentLevels.reduce((highest, level) =>
    LEVEL_INDEX.get(level) > LEVEL_INDEX.get(highest) ? level : highest,
  );
}

function describeMinimumLevel(value) {
  const level = normalizeMinimumLevel(value);
  return level === UNKNOWN_LEVEL ? '仅词表外 / 专业词' : `${level} 及以上`;
}

function classifyCandidateWords(
  text,
  { minimumLevel = DEFAULT_MINIMUM_LEVEL, ignoredWords = '' } = {},
) {
  const normalizedMinimum = normalizeMinimumLevel(minimumLevel);
  const ignored = parseIgnoredWords(ignoredWords);
  const grouped = new Map([...LEVELS, UNKNOWN_LEVEL].map((level) => [level, []]));
  let filteredCount = 0;
  let candidateCount = 0;

  for (const word of extractWords(text)) {
    if (ignored.has(word.toLowerCase())) {
      filteredCount += 1;
      continue;
    }

    const level = getWordLevel(word);
    const visible =
      normalizedMinimum === UNKNOWN_LEVEL
        ? level === null
        : level === null ||
          LEVEL_INDEX.get(level) >= LEVEL_INDEX.get(normalizedMinimum);

    if (!visible) {
      filteredCount += 1;
      continue;
    }

    if (candidateCount >= 20) continue;
    grouped.get(level || UNKNOWN_LEVEL).push(word);
    candidateCount += 1;
  }

  const groups = [...grouped]
    .filter(([, words]) => words.length > 0)
    .map(([level, words]) => ({
      level,
      label: level === UNKNOWN_LEVEL ? '词表外 / 专业词' : level,
      words,
    }));

  return {
    candidates: groups.flatMap(({ words }) => words),
    filteredCount,
    groups,
    minimumLevel: normalizedMinimum,
  };
}

function extractCandidateWords(text, options) {
  return classifyCandidateWords(text, options).candidates;
}

module.exports = {
  DEFAULT_MINIMUM_LEVEL,
  UNKNOWN_LEVEL,
  classifyCandidateWords,
  describeMinimumLevel,
  extractCandidateWords,
  getWordLevel,
  parseIgnoredWords,
};
