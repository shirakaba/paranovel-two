// A TS->JS port of:
// https://github.com/expo/examples/blob/master/with-github-remote-build-cache-provider/build-cache-provider/src/download.ts

const spawnAsync = require('@expo/spawn-async');
const glob = require('fast-glob');
const fs = require('fs-extra');
const path = require('node:path');
const { pipeline } = require('stream/promises');
const { extract } = require('tar');
const { v4: uuidv4 } = require('uuid');
const { getTmpDirectory } = require('./helpers');

/**
 * @param {string} url
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function downloadFileAsync(url, outputPath) {
  try {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
      throw new Error(`Failed to download file from ${url}`);
    }

    // @ts-expect-error Not quite sure why it's unhappy with Response.
    await pipeline(response.body, fs.createWriteStream(outputPath));
  } catch (error) {
    if (await fs.pathExists(outputPath)) {
      await fs.remove(outputPath);
    }
    throw error;
  }
}

/**
 * @param {string} appPath
 * @param {string} [cachedAppPath]
 * @returns {Promise<string>}
 */
async function maybeCacheAppAsync(appPath, cachedAppPath) {
  if (cachedAppPath) {
    await fs.ensureDir(path.dirname(cachedAppPath));
    await fs.move(appPath, cachedAppPath);
    return cachedAppPath;
  }
  return appPath;
}

/**
 * @param {string} url
 * @param {"ios" | "android"} platform
 * @param {string} [cachedAppPath]
 * @returns {Promise<string>}
 */
async function downloadAndMaybeExtractAppAsync(url, platform, cachedAppPath) {
  const outputDir = path.join(await getTmpDirectory(), uuidv4());
  await fs.promises.mkdir(outputDir, { recursive: true });

  if (url.endsWith('apk')) {
    const apkFilePath = path.join(outputDir, `${uuidv4()}.apk`);
    await downloadFileAsync(url, apkFilePath);
    console.log('[build-cache-provider] Successfully downloaded app');
    return await maybeCacheAppAsync(apkFilePath, cachedAppPath);
  } else {
    const tmpArchivePathDir = path.join(await getTmpDirectory(), uuidv4());
    await fs.mkdir(tmpArchivePathDir, { recursive: true });

    const tmpArchivePath = path.join(tmpArchivePathDir, `${uuidv4()}.tar.gz`);

    await downloadFileAsync(url, tmpArchivePath);
    console.log('[build-cache-provider] Successfully downloaded app archive');
    await tarExtractAsync(tmpArchivePath, outputDir);

    const appPath = await getAppPathAsync(
      outputDir,
      platform === 'ios' ? 'app' : 'apk',
    );

    return await maybeCacheAppAsync(appPath, cachedAppPath);
  }
}
exports.downloadAndMaybeExtractAppAsync = downloadAndMaybeExtractAppAsync;

/**
 * @param {string} appArchivePath
 * @param {"ios" | "android"} platform
 * @returns {Promise<string>}
 */
async function extractAppFromLocalArchiveAsync(appArchivePath, platform) {
  const outputDir = path.join(await getTmpDirectory(), uuidv4());
  await fs.promises.mkdir(outputDir, { recursive: true });

  await tarExtractAsync(appArchivePath, outputDir);

  return await getAppPathAsync(
    outputDir,
    platform === 'android' ? 'apk' : 'app',
  );
}
exports.extractAppFromLocalArchiveAsync = extractAppFromLocalArchiveAsync;

/**
 * @param {string} outputDir
 * @param {string} applicationExtension
 * @returns {Promise<string>}
 */
async function getAppPathAsync(outputDir, applicationExtension) {
  const appFilePaths = await glob(`./**/*.${applicationExtension}`, {
    cwd: outputDir,
    onlyFiles: false,
  });

  if (appFilePaths.length === 0) {
    throw Error('Did not find any installable apps inside tarball.');
  }

  return path.join(outputDir, appFilePaths[0]);
}

/**
 * @param {string} input
 * @param {string} output
 * @returns {Promise<void>}
 */
async function tarExtractAsync(input, output) {
  try {
    if (process.platform !== 'win32') {
      await spawnAsync('tar', ['-xf', input, '-C', output], {
        stdio: 'inherit',
      });
      return;
    }
  } catch (error) {
    console.warn(
      // @ts-ignore
      `[build-cache-provider] Failed to extract tar using native tools, falling back on JS tar module. ${error.message}`,
    );
  }
  console.log(
    `[build-cache-provider] Extracting ${input} to ${output} using JS tar module`,
  );
  // tar node module has previously had problems with big files, and seems to
  // be slower, so only use it as a backup.
  await extract({ file: input, cwd: output });
}
