const path = require('node:path');
const { getDefaultConfig } = require('@expo/metro-config');
const { makeMetroConfig } = require('@rnx-kit/metro-config');

let config = getDefaultConfig(__dirname);
config = makeMetroConfig(config);
withSourceAssets(config, {
  babelTransformerPath: path.resolve(__dirname, 'babel-transformer.js'),
  sourceAssetExts: ['wvjs', 'wvts', 'wvcss', 'wvhtml'],
});

/**
 * A Metro pseudo-plugin to consume certain filetypes as "source assets" (i.e.
 * as strings rather than parsed code). Mutates the input Metro config.
 *
 * Needs to be used alongside a Babel transformer, TypeScript declarations, and
 * with VS Code `files.associations` settings configured.
 *
 * @param {import("metro-config").MetroConfig} config
 * @param {object} args
 * @param {string} args.babelTransformerPath The path to your Babel transformer,
 * which should extend your existing one (try logging out the existing value and
 * inspecting it). See [Extending the Babel transformer](https://github.com/expo/expo/blob/0b5b03c0b77769e671c214140032661ade8fef3e/docs/pages/versions/v52.0.0/config/metro.mdx#extending-the-babel-transformer) for
 * guidance. The docs are for Expo SDK 52, but the same concepts apply even in
 * bare React Native apps.
 * @param {Array<string>} args.sourceAssetExts The file extensions you want to
 * be treated as source assets. These should match whatever your Babel
 * transformer and TypeScript declarations handle. Example:
 * `['wvjs', 'wvts', 'wvcss', 'wvhtml']`
 */
function withSourceAssets(config, { babelTransformerPath, sourceAssetExts }) {
  if (!config.transformer) {
    config.transformer = {};
  }
  config.transformer.babelTransformerPath = babelTransformerPath;

  if (!config.resolver) {
    config.resolver = {};
  }
  if (!config.resolver.sourceExts) {
    config.resolver.sourceExts = [];
  }

  config.resolver.sourceExts = [
    ...new Set([...config.resolver.sourceExts, ...sourceAssetExts]),
  ];
}

module.exports = config;
