// This script file is for trying out the build cache provider in isolation,
// without having to run a full `npx expo run:ios` command.
//
// Run it as follows:
// node ./build-cache-provider/scripts/demo.js

const path = require('node:path');
const {
  default: providerPlugin,
  uploadGitHubRemoteBuildCache,
} = require('../src/index');

main()
  .then(() => {
    console.log('[demo] success');
  })
  .catch(error => {
    console.error('[demo] failure', error);
  });

async function main() {
  /** @type {"ios" | "android"} */
  const platform = 'ios';
  // The options I got by default from `npx expo run:ios`.
  /** @type {import("@expo/config").RunOptions} */
  const runOptions = {
    buildCache: true,
    bundler: true,
    install: true,
  };
  const projectRoot = path.resolve(__dirname, '../..');

  const fingerprintHash = await calculateFingerprintHashAsync({
    projectRoot,
    runOptions,
    platform,
    provider: { plugin: providerPlugin, options: {} },
  });
  if (!fingerprintHash) {
    throw new Error('Expected fingerprintHash to be non-null.');
  }
  await uploadGitHubRemoteBuildCache(
    {
      projectRoot: path.resolve(__dirname, '../..'),
      fingerprintHash,
      runOptions,
      platform,
      buildPath: '',
    },
    { owner: 'shirakaba', repo: 'paranovel-two' },
  );
}

/**
 * Returns a fingerprint hash, e.g. "8599e6998f3a3682050d5d256b1afe6b419b937b".
 *
 * https://github.com/expo/expo/blob/0866d35160af6490e04699313822cb76430d323b/packages/%40expo/cli/src/utils/build-cache-providers/index.ts#L147
 * node_modules/@expo/cli/build/src/utils/build-cache-providers/index.js
 *
 * @param {object} arg
 * @param {string} arg.projectRoot
 * @param {"android" | "ios"} arg.platform
 * @param {import("@expo/config").BuildCacheProvider} arg.provider
 * @param {import("@expo/config").RunOptions} arg.runOptions
 * @returns {Promise<string | null>}
 */
async function calculateFingerprintHashAsync({
  projectRoot,
  runOptions,
  platform,
  provider,
}) {
  if (provider.plugin.calculateFingerprintHash) {
    return await provider.plugin.calculateFingerprintHash(
      {
        projectRoot,
        platform,
        runOptions,
      },
      provider.options,
    );
  }
  const Fingerprint = importFingerprintForDev(projectRoot);
  if (!Fingerprint) {
    console.warn(
      '[build-cache-provider] @expo/fingerprint is not installed in the project, unable to calculate fingerprint',
    );
    return null;
  }
  const fingerprint = await Fingerprint.createFingerprintAsync(projectRoot);
  return fingerprint.hash;
}

/**
 * https://github.com/expo/expo/blob/0866d35160af6490e04699313822cb76430d323b/packages/%40expo/cli/src/utils/build-cache-providers/index.ts#L175
 * @param {string} projectRoot
 */
function importFingerprintForDev(projectRoot) {
  try {
    return require(require.resolve('@expo/fingerprint', {
      paths: [projectRoot],
    }));
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      return null;
    }
    throw error;
  }
}
