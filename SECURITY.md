# Security

The plugin is designed to communicate only with AnkiConnect on `127.0.0.1:8765`.

Please report security issues privately through GitHub's security advisory feature after the public repository is created. Do not include API keys, personal Anki data, or private Bob logs in a public issue.

Before publishing a release, run:

```bash
pnpm release:build
```

This validates tests, types, package contents, the plugin identifier, and credential-like values in the bundled runtime.
