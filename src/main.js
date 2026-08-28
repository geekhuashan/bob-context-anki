import {
  classifyCandidateWords,
  describeMinimumLevel,
} from './context.js';
import { saveContextNote } from './anki.js';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_MODEL,
  generateAnnotation,
} from './annotation.js';
import {
  DEFAULT_TTS_API_BASE_URL,
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOICE_ID,
  generatePreferredPronunciation,
} from './pronunciation.js';
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

    const options = typeof $option === 'undefined' ? {} : $option;
    saveContextNote({
      word: match.word,
      context: match.context,
      request: (options) => $http.request(options),
      annotationProvider: () =>
        generateAnnotation({
          word: match.word,
          context: match.context,
          apiKey: options.annotationApiKey,
          apiBaseUrl: options.annotationApiBaseUrl || DEFAULT_API_BASE_URL,
          model: options.annotationModel || DEFAULT_MODEL,
          request: (requestOptions) => $http.request(requestOptions),
        }),
      pronunciationProvider: () =>
        generatePreferredPronunciation({
          word: match.word,
          apiKey: options.ttsApiKey || options.annotationApiKey,
          apiBaseUrl: options.ttsApiBaseUrl || DEFAULT_TTS_API_BASE_URL,
          model: options.ttsModel || DEFAULT_TTS_MODEL,
          voiceId: options.ttsVoiceId || DEFAULT_TTS_VOICE_ID,
          request: (requestOptions) => $http.request(requestOptions),
          dataApi: $data,
        }),
    })
      .then(({ status, repaired, pronunciationSource }) => {
        const pronunciationLabel =
          pronunciationSource === 'dictionary-us'
            ? '真人美音'
            : 'MiniMax 发音';
        const message =
          status === 'added'
            ? `已添加到 Anki（含释义和${pronunciationLabel}）：${match.word}`
            : status === 'updated'
              ? repaired.audio && repaired.annotation
                ? `已补全 Anki 释义和${pronunciationLabel}：${match.word}`
                : repaired.audio
                  ? `已更新 Anki ${pronunciationLabel}：${match.word}`
                  : `已补全 Anki 释义：${match.word}`
              : `Anki 已有完整卡片：${match.word}`;
        complete(query, message, [
          {
            name: '上下文',
            value: match.context,
          },
        ]);
      })
      .catch((error) => {
        const annotationFailure = String(error?.code || '').startsWith(
          'annotation_',
        );
        const pronunciationFailure = String(error?.code || '').startsWith(
          'pronunciation_',
        );
        query.onCompletion({
          error: {
            type: 'api',
            message: annotationFailure
              ? '注释生成失败，未创建卡片'
              : pronunciationFailure
                ? '发音生成失败，未创建卡片'
                : '无法写入 Anki',
            addition:
              error?.code === 'annotation_config'
                ? '请在插件设置中填写注释 API Key、地址和模型。'
                : error?.code === 'pronunciation_config'
                  ? '请在插件设置中填写发音 API Key、地址、模型和音色。'
                  : annotationFailure
                    ? '请检查注释服务配置或稍后重试。'
                    : pronunciationFailure
                      ? '请检查 MiniMax 发音配置或稍后重试。'
                      : '请确认 Anki 已打开，并已启用 AnkiConnect。',
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

export const pluginTimeoutInterval = () => 60;

export const supportLanguages = () => ['auto', 'en', 'zh-Hans', 'zh-Hant'];
