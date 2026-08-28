const path = require('path');
const copy = require('rollup-plugin-copy');
const commonjs = require('@rollup/plugin-commonjs');
const resolve = require('@rollup/plugin-node-resolve');
const packageJson = require('./package.json');

const pkg = `${packageJson.name}.bobplugin`;

module.exports = {
  input: path.join(__dirname, './src/main.js'),
  output: {
    format: 'cjs',
    exports: 'auto',
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
