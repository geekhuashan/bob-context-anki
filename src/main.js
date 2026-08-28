import {
  classifyCandidateWords,
  describeMinimumLevel,
} from './context.js';
import { saveContextNote } from './anki.js';
import { createContextSession, isSingleEnglishWord } from './workflow.js';

const contextSession = createContextSession();

function complete(query, text, additions = []) {
  query.onCompletion({
    result: {
      from: query.detectFrom,
      to: query.detectTo,
      toParagraphs: [text],
      toDict: {
        word: '上下文词卡',
        phonetics: [],
        parts: [],
        additions,
      },
    },
  });
}

export const translate = (query) => {
  const source = (query.originalText || query.text || '').trim();

  if (isSingleEnglishWord(source)) {
    const match = contextSession.consume(source);
    if (!match) {
      complete(query, '普通单词查询：未创建卡片。');
      return;
    }

    saveContextNote({
      word: match.word,
      context: match.context,
      request: (options) => $http.request(options),
    })
      .then(({ status }) => {
        const message =
          status === 'added'
            ? `已添加到 Anki：${match.word}`
            : `Anki 已有该单词：${match.word}`;
        complete(query, message, [
          {
            name: '上下文',
            value: match.context,
          },
        ]);
      })
      .catch(() => {
        query.onCompletion({
          error: {
            type: 'api',
            message: '无法写入 Anki',
            addition: '请确认 Anki 已打开，并已启用 AnkiConnect。',
          },
        });
      });
    return;
  }

  const options = typeof $option === 'undefined' ? {} : $option;
  const classification = classifyCandidateWords(source, {
    minimumLevel: options.minimumCefrLevel,
    ignoredWords: options.ignoredWords,
  });
  const { candidates, groups, minimumLevel } = classification;

  if (candidates.length === 0) {
    contextSession.clear();
    complete(
      query,
      `当前句子没有达到“${describeMinimumLevel(minimumLevel)}”的候选词。`,
    );
    return;
  }

  contextSession.remember(source, candidates);

  query.onCompletion({
    result: {
      from: query.detectFrom,
      to: query.detectTo,
      toParagraphs: [
        `选择目标词（${describeMinimumLevel(minimumLevel)}，2 分钟内有效）`,
      ],
      toDict: {
        word: '上下文词卡',
        phonetics: [],
        parts: [],
        relatedWordParts: groups.map(({ label, words }) => ({
          part: label,
          words: words.map((word) => ({ word })),
        })),
        additions: [
          {
            name: '原句',
            value: source,
          },
        ],
      },
    },
  });
};

export const pluginTimeoutInterval = () => 30;

export const supportLanguages = () => ['auto', 'en', 'zh-Hans', 'zh-Hant'];
