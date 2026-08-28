const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const packageJson = require('../package.json');
const config = require('./config');

const artifactName = `${config.pkgName}-v${packageJson.version}.bobplugin`;
const artifactPath = path.resolve(__dirname, '..', 'release', artifactName);

if (!fs.existsSync(artifactPath)) {
  throw new Error(`Release artifact is missing: ${artifactPath}`);
}

const zip = new AdmZip(artifactPath);
const entries = zip
  .getEntries()
  .filter((entry) => !entry.isDirectory)
  .map((entry) => entry.entryName)
  .sort();

if (JSON.stringify(entries) !== JSON.stringify(['info.json', 'main.js'])) {
  throw new Error(`Unexpected release contents: ${entries.join(', ')}`);
}

const info = JSON.parse(zip.readAsText('info.json'));
if (info.version !== packageJson.version) {
  throw new Error(
    `Version mismatch: package=${packageJson.version}, info=${info.version}`,
  );
}
if (info.identifier !== 'com.huashan.bobplug.context-anki-probe') {
  throw new Error(`Unexpected plugin identifier: ${info.identifier}`);
}

const main = zip.readAsText('main.js');
if (/sk-[A-Za-z0-9_-]{12,}/.test(main)) {
  throw new Error('Release artifact contains a credential-like value');
}
if (!main.includes('http://127.0.0.1:8765')) {
  throw new Error('Release artifact is missing the local AnkiConnect endpoint');
}

const sha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(artifactPath))
  .digest('hex');

console.log(
  JSON.stringify(
    {
      artifact: artifactName,
      entries,
      identifier: info.identifier,
      sha256,
      version: info.version,
    },
    null,
    2,
  ),
);
