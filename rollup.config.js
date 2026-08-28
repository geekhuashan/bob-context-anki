const fs = require('fs');
const path = require('path');
const copy = require('rollup-plugin-copy');
const commonjs = require('@rollup/plugin-commonjs');
const resolve = require('@rollup/plugin-node-resolve');
const packageJson = require('./package.json');

const pkg = `${packageJson.name}.bobplugin`;
const noticeText = ['LICENSE', 'THIRD_PARTY_NOTICES.md']
  .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8').trim())
  .join('\n\n');
const noticeBanner = `/*!\n${noticeText
  .replaceAll('*/', '* /')
  .split('\n')
  .map((line) => ` * ${line}`)
  .join('\n')}\n */`;

module.exports = {
  input: path.join(__dirname, './src/main.js'),
  output: {
    format: 'cjs',
    exports: 'auto',
    banner: noticeBanner,
    file: path.join(__dirname, `./dist/${pkg}/main.js`),
    globals: {
      $util: '$util',
      $info: '$info',
      $log: '$log',
    },
  },
  plugins: [
    copy({
      targets: [{ src: './src/info.json', dest: `dist/${pkg}/` }],
    }),
    resolve({
      extensions: ['.js', '.json'],
      preferBuiltins: false,
    }),
    commonjs(),
  ],
  external: ['crypto-js'],
};
