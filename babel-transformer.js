// Metro has an awkward property, `transformer.babelTransformerPath` that takes
// a path to a single Babel transformer. Expo uses a custom one, which we want
// to extend. Fortunately, they expose it explicitly for this kind of use case:
// @see https://github.com/expo/expo/blob/0b5b03c0b77769e671c214140032661ade8fef3e/docs/pages/versions/v52.0.0/config/metro.mdx#extending-the-babel-transformer

const upstreamTransformer = require('@expo/metro-config/babel-transformer');
const { transformSync } = require('@babel/core');

/**
 * A Babel transformer to consume certain filetypes as "source assets" (i.e. as
 * strings rather than parsed code).
 *
 * Needs to be used alongside a Metro pseudo-plugin, TypeScript declarations,
 * and with VS Code `files.associations` settings configured.
 *
 * @param {object} obj
 * @param {string} obj.src
 * @param {string} obj.filename
 * @param {import("@babel/core").TransformOptions} [obj.options]
 * @param {unknown} obj.plugins
 */
module.exports.transform = async ({ src, filename, options, plugins }) => {
  if (sourceAssetExtensions.some(extension => filename.endsWith(extension))) {
    // For TypeScript files, transpile to JS first.
    if (filename.endsWith('.wvts')) {
      const transpiled = transformSync(src, {
        // We set `allExtensions: true`, otherwise `.wvts` isn't recognised as
        // TypeScript at all because the plugin only looks for `.ts` by default.
        presets: [['@babel/preset-typescript', { allExtensions: true }]],
        filename,
      });
      src = transpiled.code ?? '';
    }

    src = `const source = ${JSON.stringify(src)};\nexport default source;`;
  }

  // Pass the source (modified or not) through the upstream Expo transformer.
  return upstreamTransformer.transform({ src, filename, options, plugins });
};

const sourceAssetExtensions = ['.wvts', '.wvjs', '.wvhtml', '.wvcss'];
