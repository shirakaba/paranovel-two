// metro.config.js
const { getDefaultConfig } = require('@expo/metro-config');
const { makeMetroConfig } = require('@rnx-kit/metro-config');

const config = getDefaultConfig(__dirname);
module.exports = makeMetroConfig(config);
