const DEFAULT_CONTEXT_TTL_MS = 2 * 60 * 1000;

function normalizeWord(value) {
  return String(value || '').trim().toLowerCase();
}

function isSingleEnglishWord(value) {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(String(value || '').trim());
}

function createContextSession({
  ttlMs = DEFAULT_CONTEXT_TTL_MS,
  now = () => Date.now(),
} = {}) {
  let pending = null;

  return {
    remember(context, candidates) {
      pending = {
        context,
        candidates: new Set(candidates.map(normalizeWord)),
        expiresAt: now() + ttlMs,
      };
    },

    consume(word) {
      if (!pending) return null;
      if (now() > pending.expiresAt) {
        pending = null;
        return null;
      }

      const normalizedWord = normalizeWord(word);
      if (!pending.candidates.has(normalizedWord)) return null;

      const match = {
        word: String(word || '').trim(),
        context: pending.context,
      };
      pending = null;
      return match;
    },

    clear() {
      pending = null;
    },
  };
}

module.exports = {
  DEFAULT_CONTEXT_TTL_MS,
  createContextSession,
  isSingleEnglishWord,
  normalizeWord,
};
