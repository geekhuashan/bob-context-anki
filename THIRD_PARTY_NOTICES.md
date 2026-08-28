# Third-Party Notices

## robbinhan/bob-anki

This project is a derivative work of `robbinhan/bob-anki`:

- Original author: robbinhan
- Source: https://github.com/robbinhan/bob-anki
- License: MIT License

The project retains or adapts portions of the original Bob plugin project
structure, packaging workflow, and AnkiConnect integration. The contextual word
selection, short-lived sentence matching, CEFR-J filtering, and custom Anki note
workflow were developed in this repository.

We thank robbinhan for making the original project available as open source.
The original copyright and MIT permission notice are preserved in this
distribution and in `LICENSE`.

## CEFR-J Wordlist Version 1.6

This plugin includes a derived lookup table from:

> The CEFR-J Wordlist Version 1.6. Compiled by Yukio Tono, Tokyo
> University of Foreign Studies. Retrieved from
> https://www.cefr-j.org/data/CEFRJ_wordlist_ver1.6.zip on 2026-08-28.

Copyright belongs to Tono Laboratory at Tokyo University of Foreign Studies.
The official download page permits research, educational, and commercial use
with proper acknowledgement of the source.

Official information: https://www.cefr-j.org/download.html#cefrj_wordlist

## Free Dictionary API

The plugin queries the public Free Dictionary API at runtime for exact-word
pronunciation metadata and audio:

- Service: https://dictionaryapi.dev/
- Source: https://github.com/meetDeveloper/freeDictionaryAPI
- Source license: GNU General Public License v3.0

No Free Dictionary API source code or dictionary response data is bundled with
this plugin. Runtime audio is accepted only when its URL explicitly identifies
US English and uses HTTPS MP3. Individual pronunciation entries can identify
their own source page and license; those metadata remain authoritative for the
downloaded recording. For dictionary audio, the plugin appends the source page,
available artist name, and license to the Anki note's `Source` field.

## Wikimedia Commons

When a selected dictionary entry identifies a Wikimedia Commons source page,
the plugin queries the public Commons API for that exact page's MP3 derivative.
The plugin does not bundle Wikimedia software or recordings. Each recording's
source page and license metadata are supplied by the dictionary entry.

- Service: https://commons.wikimedia.org/
- API documentation: https://www.mediawiki.org/wiki/API:Video_info
