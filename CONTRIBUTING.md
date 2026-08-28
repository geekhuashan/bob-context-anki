# Contributing

## Development setup

Requirements:

- Node.js 20 or newer
- pnpm 10

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm release:build
```

Generated directories `dist/` and `release/` are intentionally ignored.

## Changes

- Add focused regression tests for behavior changes.
- Keep ordinary sentence translation free of Anki writes.
- Never add API keys to source, fixtures, logs, or release artifacts.
- Keep remote annotation and pronunciation calls explicit, user-configured, and downstream of the Anki duplicate check.
- Store generated audio through AnkiConnect and write only `[sound:filename]` into the `Audio` field.
- Do not add Bob database reads, background scanners, or Accessibility automation.
- Keep the release artifact limited to `info.json` and `main.js`.
- Preserve the installed plugin identifier unless a migration strategy exists.

The generated `src/cefr-data.js` comes from CEFR-J Wordlist 1.6. Regenerate it only from the official workbook and retain the attribution in `THIRD_PARTY_NOTICES.md`.

## Release checklist

1. Update the version in `package.json` and `src/info.json`.
2. Update `CHANGELOG.md`.
3. Run `pnpm release:build`.
4. Confirm the working tree contains only the intended source changes.
5. Create and push a matching `v<version>` tag only when publication is intended.

The Release workflow rejects tags that do not match `package.json`.
