// A TS->JS port of:
// https://github.com/expo/examples/blob/master/with-github-remote-build-cache-provider/build-cache-provider/src/helpers.ts

const { getPackageJson } = require('@expo/config');

const path = require('node:path');

/**
 *
 * @param {object} arg
 * @param {string} arg.projectRoot
 * @param {import("@expo/config").RunOptions} arg.runOptions
 *
 * @returns {boolean}
 */
function isDevClientBuild({ runOptions, projectRoot }) {
  if (!hasDirectDevClientDependency(projectRoot)) {
    return false;
  }

  if ('variant' in runOptions && runOptions.variant !== undefined) {
    return runOptions.variant === 'debug';
  }
  if ('configuration' in runOptions && runOptions.configuration !== undefined) {
    return runOptions.configuration === 'Debug';
  }

  return true;
}
exports.isDevClientBuild = isDevClientBuild;

/**
 * @param {string} projectRoot
 * @returns {boolean}
 */
function hasDirectDevClientDependency(projectRoot) {
  const { dependencies = {}, devDependencies = {} } =
    getPackageJson(projectRoot);
  return (
    !!dependencies['expo-dev-client'] || !!devDependencies['expo-dev-client']
  );
}
exports.hasDirectDevClientDependency = hasDirectDevClientDependency;

async function getTmpDirectory() {
  const { default: envPaths } = await import('env-paths');

  const { temp: TEMP_PATH } = envPaths('github-build-cache-provider');

  return TEMP_PATH;
}
exports.getTmpDirectory = getTmpDirectory;

async function getBuildRunCacheDirectoryPath() {
  const TEMP_PATH = await getTmpDirectory();
  return path.join(TEMP_PATH, 'build-run-cache');
}
exports.getBuildRunCacheDirectoryPath = getBuildRunCacheDirectoryPath;
