const assert = require('node:assert/strict');
const test = require('node:test');

const {
  AnnotationError,
  buildAnnotationRequest,
  chatCompletionsUrl,
  generateAnnotation,
  parseAnnotationContent,
} = require('../src/annotation');

const annotation = {
  phonetic: '/alternating/',
  definition: 'Occurring by turns in a repeated sequence.',
  definitionZH: '交替的；轮流的。',
  contextMeaning: '在句中指正负项交替出现的数列。',
  sentenceTranslation: '这是一个交错级数。',
};

test('normalizes OpenAI-compatible chat completion URLs', () => {
  assert.equal(
    chatCompletionsUrl('https://api.minimaxi.com'),
    'https://api.minimaxi.com/v1/chat/completions',
  );
  assert.equal(
    chatCompletionsUrl('https://example.com/v1/'),
    'https://example.com/v1/chat/completions',
  );
  assert.equal(
    chatCompletionsUrl('https://example.com/v1/chat/completions'),
    'https://example.com/v1/chat/completions',
  );
});

test('builds a non-reasoning request with supplied credentials', () => {
  const request = buildAnnotationRequest({
    word: 'alternating',
    context: 'This is an alternating series.',
    apiKey: 'test-key',
    apiBaseUrl: 'https://example.com/v1',
    model: 'test-model',
  });

  assert.equal(request.url, 'https://example.com/v1/chat/completions');
  assert.equal(request.header.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.reasoning_effort, 'none');
  assert.equal(request.body.stream, false);
  assert.deepEqual(JSON.parse(request.body.messages[1].content), {
    word: 'alternating',
    sentence: 'This is an alternating series.',
  });
});

test('parses strict JSON and fenced JSON annotations', () => {
  assert.deepEqual(parseAnnotationContent(JSON.stringify(annotation)), annotation);
  assert.deepEqual(
    parseAnnotationContent(`\`\`\`json\n${JSON.stringify(annotation)}\n\`\`\``),
    annotation,
  );
});

test('generates a validated annotation from an OpenAI response', async () => {
  let requestOptions;
  const result = await generateAnnotation({
    word: 'alternating',
    context: 'This is an alternating series.',
    apiKey: 'test-key',
    request: async (options) => {
      requestOptions = options;
      return {
        data: {
          choices: [{ message: { content: JSON.stringify(annotation) } }],
        },
      };
    },
  });

  assert.deepEqual(result, annotation);
  assert.equal(requestOptions.method, 'POST');
});

test('rejects missing credentials, provider errors, and incomplete JSON', async () => {
  await assert.rejects(
    generateAnnotation({
      word: 'alternating',
      context: 'This is an alternating series.',
      apiKey: '',
      request: async () => assert.fail('request should not run'),
    }),
    (error) =>
      error instanceof AnnotationError && error.code === 'annotation_config',
  );

  await assert.rejects(
    generateAnnotation({
      word: 'alternating',
      context: 'This is an alternating series.',
      apiKey: 'test-key',
      request: async () => ({ data: { error: { message: 'failed' } } }),
    }),
    (error) =>
      error instanceof AnnotationError && error.code === 'annotation_api',
  );

  await assert.rejects(
    generateAnnotation({
      word: 'alternating',
      context: 'This is an alternating series.',
      apiKey: 'test-key',
      request: async () => {
        throw new Error('network failure');
      },
    }),
    (error) =>
      error instanceof AnnotationError && error.code === 'annotation_api',
  );

  assert.throws(
    () => parseAnnotationContent('{"definition":"incomplete"}'),
    (error) =>
      error instanceof AnnotationError && error.code === 'annotation_response',
  );
});
