const path = require('path');
const fs = require('fs-extra');

const info = require('../src/info.json');
const packageJson = require('../package.json');

const { version, author = '', homepage = '', description = '' } = packageJson;
const infoData = { ...info, version, author, homepage, summary: description };
const infoPath = path.join(__dirname, '../src/info.json');

fs.outputJSONSync(infoPath, infoData, { spaces: 2 });
