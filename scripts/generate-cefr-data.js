const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const inputPath = args[0];
const outputPath = args[1] || path.join(__dirname, '../src/cefr-data.js');
const levels = ['A1', 'A2', 'B1', 'B2'];
const levelIndex = new Map(levels.map((level, index) => [level, index]));

if (!inputPath) {
  throw new Error(
    'Usage: pnpm generate:cefr -- "/path/to/CEFR-J Wordlist Ver1.6.xlsx"',
  );
}

const workbook = XLSX.readFile(path.resolve(inputPath));
const sheet = workbook.Sheets.ALL_sep;
if (!sheet) throw new Error('The CEFR-J workbook does not contain ALL_sep.');

const lowestLevelByWord = new Map();
for (const row of XLSX.utils.sheet_to_json(sheet, { defval: '' })) {
  const word = String(row.headword || '').trim().toLowerCase();
  const level = String(row.CEFR || '').trim().toUpperCase();
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word) || !levelIndex.has(level)) {
    continue;
  }

  const current = lowestLevelByWord.get(word);
  if (!current || levelIndex.get(level) < levelIndex.get(current)) {
    lowestLevelByWord.set(word, level);
  }
}

const grouped = Object.fromEntries(levels.map((level) => [level, []]));
for (const [word, level] of lowestLevelByWord) grouped[level].push(word);
for (const level of levels) grouped[level].sort();

const output = [
  '// Generated from CEFR-J Wordlist Version 1.6. Do not edit manually.',
  '// Source: https://www.cefr-j.org/data/CEFRJ_wordlist_ver1.6.zip',
  `module.exports = ${JSON.stringify(grouped, null, 2)};`,
  '',
].join('\n');

fs.writeFileSync(path.resolve(outputPath), output);
console.log(
  `Generated ${[...lowestLevelByWord].length} headwords at ${path.resolve(outputPath)}`,
);
