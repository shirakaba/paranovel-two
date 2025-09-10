const process = require('node:process');
const path = require('node:path');
const fs = require('node:fs');

const {
  isDevClientBuild,
  getBuildRunCacheDirectoryPath,
} = require('./helpers');
const {
  getReleaseAssetsByTag,
  createReleaseAndUploadAsset,
} = require('./github');
const { downloadAndMaybeExtractAppAsync } = require('./download');

/**
 *
 * @param {import("@expo/config").ResolveBuildCacheProps} resolveBuildCacheProps
 * @param {object} ownerAndRepo
 * @param {string} ownerAndRepo.owner
 * @param {string} ownerAndRepo.repo
 *
 * @returns {Promise<string | null>}
 */
async function resolveGitHubRemoteBuildCache(
  { projectRoot, platform, fingerprintHash, runOptions },
  { owner, repo },
) {
  const cachedAppPath = await getCachedAppPath({
    fingerprintHash,
    platform,
    projectRoot,
    runOptions,
  });
  if (fs.existsSync(cachedAppPath)) {
    console.log('Cached build found, skipping download');
    return cachedAppPath;
  }
  if (!process.env.GITHUB_TOKEN) {
    console.log(
      'No GITHUB_TOKEN provided; build-cache-provider skipping resolveGitHubRemoteBuildCache.',
    );
    return null;
  }
  console.log(`Searching builds with matching fingerprint on Github Releases`);

  try {
    const assets = await getReleaseAssetsByTag({
      token: process.env.GITHUB_TOKEN,
      owner,
      repo,
      tag: getTagName({
        fingerprintHash,
        projectRoot,
        runOptions,
      }),
    });

    const buildDownloadURL = assets[0].browser_download_url;
    return await downloadAndMaybeExtractAppAsync(
      buildDownloadURL,
      'ios',
      cachedAppPath,
    );
  } catch (error) {
    console.log('No cached builds available for this fingerprint');
  }
  return null;
}
exports.resolveGitHubRemoteBuildCache = resolveGitHubRemoteBuildCache;

/**
 *
 * @param {import("@expo/config").UploadBuildCacheProps} uploadBuildCacheProps
 * @param {object} ownerAndRepo
 * @param {string} ownerAndRepo.owner
 * @param {string} ownerAndRepo.repo
 *
 * @returns {Promise<string | null>}
 */
async function uploadGitHubRemoteBuildCache(
  { projectRoot, fingerprintHash, runOptions, buildPath },
  { owner, repo },
) {
  if (!process.env.GITHUB_TOKEN) {
    console.log(
      'No GITHUB_TOKEN provided; build-cache-provider skipping uploadGitHubRemoteBuildCache.',
    );
    return null;
  }

  console.log(`Uploading build to Github Releases`);
  try {
    const result = await createReleaseAndUploadAsset({
      token: process.env.GITHUB_TOKEN,
      owner,
      repo,
      tagName: getTagName({
        fingerprintHash,
        projectRoot,
        runOptions,
      }),
      binaryPath: buildPath,
    });

    return result;
  } catch (error) {
    console.log('error', error);
    console.error(
      'Release failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    process.exit(1);
  }
}
exports.uploadGitHubRemoteBuildCache = uploadGitHubRemoteBuildCache;

/**
 *
 * @param {object} arg
 * @param {string} arg.fingerprintHash
 * @param {string} arg.projectRoot
 * @param {import("@expo/config").RunOptions} arg.runOptions
 *
 * @returns {string}
 */
function getTagName({ fingerprintHash, projectRoot, runOptions }) {
  const isDevClient = isDevClientBuild({ projectRoot, runOptions });

  return `fingerprint.${fingerprintHash}${
    isDevClient || true ? '.dev-client' : ''
  }`;
}

/**
 *
 * @param {object} arg
 * @param {string} arg.fingerprintHash
 * @param {string} arg.projectRoot
 * @param {import("@expo/config").RunOptions} arg.runOptions
 * @param {"ios" | "android"} arg.platform
 *
 * @returns {Promise<string>}
 */
async function getCachedAppPath({
  fingerprintHash,
  platform,
  projectRoot,
  runOptions,
}) {
  const buildRunCacheDirectoryPath = await getBuildRunCacheDirectoryPath();

  return path.join(
    buildRunCacheDirectoryPath,
    `${getTagName({
      fingerprintHash,
      projectRoot,
      runOptions,
    })}.${platform === 'ios' ? 'app' : 'apk'}`,
  );
}

/**
 * @type {import("@expo/config").BuildCacheProviderPlugin}
 */
const providerPlugin = {
  resolveBuildCache: resolveGitHubRemoteBuildCache,
  uploadBuildCache: uploadGitHubRemoteBuildCache,
};
exports.default = providerPlugin;
