# Security

The plugin communicates with AnkiConnect on `127.0.0.1:8765` and, only after an explicit candidate-word click for a new word or a plugin-owned incomplete card, with the OpenAI-compatible annotation endpoint and the public Free Dictionary API. The dictionary request contains only the target word and no authorization header. When the selected entry identifies its Wikimedia Commons source page, the plugin requests that page's MP3 derivative using only the numeric media page ID. If no explicitly marked US English recording is available, the plugin calls the MiniMax pronunciation endpoint configured by the user as a fallback.

Both API-key settings are declared as Bob `secure` options. A blank MiniMax fallback key reuses the annotation key in memory. Keys must never be hard-coded, logged, included in tests, sent to the dictionary service, or packaged in a release. Annotation output and captured screen text are HTML-escaped before they are stored in Anki fields. Downloaded or generated pronunciation bytes are sent only to the local AnkiConnect media API.

Please report security issues privately through GitHub's security advisory feature after the public repository is created. Do not include API keys, personal Anki data, or private Bob logs in a public issue.

Before publishing a release, run:

```bash
pnpm release:build
```

This validates tests, types, package contents, the plugin identifier, and credential-like values in the bundled runtime.
