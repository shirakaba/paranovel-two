module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          // ↓ Tried with and without; no luck.
          // jsxRuntime: 'classic',
          jsxImportSource: '@welldone-software/why-did-you-render',
        },
      ],
    ],
  };
};
