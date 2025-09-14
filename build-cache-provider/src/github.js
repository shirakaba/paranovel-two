// A TS->JS port of:
// https://github.com/expo/examples/blob/master/with-github-remote-build-cache-provider/build-cache-provider/src/github.ts

const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { create: createTar } = require('tar');
const path = require('path');

const { getTmpDirectory } = require('./helpers');

/**
 * @typedef {{
 *   token: string;
 *   owner: string;
 *   repo: string;
 *   tagName: string;
 *   binaryPath: string;
 * }} GithubProviderOptions
 */

/**
 * @param {GithubProviderOptions} arg
 */
async function createReleaseAndUploadAsset({
  token,
  owner,
  repo,
  tagName,
  binaryPath,
}) {
  const { Octokit } = await import('@octokit/rest');

  const octokit = new Octokit({ auth: token });

  try {
    const commitSha = await getBranchShaWithFallback(octokit, owner, repo);

    // Original Expo example captures return value but doesn't do anything with
    // it.
    // https://github.com/expo/examples/blob/a836cc44dd088b2da8c637205484e2ab8a58c2d8/with-github-remote-build-cache-provider/build-cache-provider/src/github.ts#L30
    await ensureAnnotatedTag(octokit, {
      owner,
      repo,
      tag: tagName,
      message: tagName,
      object: commitSha,
      type: 'commit',
      tagger: {
        name: 'Release Bot',
        email: 'bot@expo.dev',
        date: new Date().toISOString(),
      },
    });

    const release = await octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: tagName,
      name: tagName,
      draft: false,
      prerelease: true,
    });

    await uploadReleaseAsset(octokit, {
      owner,
      repo,
      releaseId: release.data.id,
      binaryPath,
    });

    return release.url;
  } catch (error) {
    throw new Error(
      `GitHub release failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
exports.createReleaseAndUploadAsset = createReleaseAndUploadAsset;

/**
 * @param {import("@octokit/rest").Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<string>}
 */
async function getBranchShaWithFallback(octokit, owner, repo) {
  const branchesToTry = ['main', 'master'];

  for (const branchName of branchesToTry) {
    try {
      const { data } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: branchName,
      });
      return data.commit.sha;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Branch not found')
      ) {
        if (branchName === 'master') throw new Error('No valid branch found');
        continue;
      }
      throw error;
    }
  }
  throw new Error('Branch fallback exhausted');
}

/**
 * @param {import("@octokit/rest").Octokit} octokit
 * @param {import("@octokit/plugin-rest-endpoint-methods").RestEndpointMethodTypes["git"]["createTag"]["parameters"]} params
 * @returns {Promise<string>}
 */
async function ensureAnnotatedTag(octokit, params) {
  const { owner, repo, tag } = params;
  const refName = `refs/tags/${tag}`;

  try {
    const { data: existingRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${tag}`,
    });
    // Return existing tag SHA
    return existingRef.object.sha;
  } catch (err) {
    // @ts-ignore
    if (err.status !== 404) {
      throw err;
    }
  }

  // Create the annotated tag object
  const { data: tagData } = await octokit.rest.git.createTag(params);

  // Create the tag reference pointing to the new tag object
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: refName,
    sha: tagData.sha,
  });

  return tagData.sha;
}

/**
 * @param {import("@octokit/rest").Octokit} octokit
 * @param {object} params
 * @param {string} params.owner
 * @param {string} params.repo
 * @param {number} params.releaseId
 * @param {string} params.binaryPath
 */
async function uploadReleaseAsset(octokit, params) {
  let filePath = params.binaryPath;
  let name = path.basename(filePath);
  if ((await fs.stat(filePath)).isDirectory()) {
    await fs.mkdirp(await getTmpDirectory());
    const tarPath = path.join(await getTmpDirectory(), `${uuidv4()}.tar.gz`);
    const parentPath = path.dirname(filePath);
    await createTar({ cwd: parentPath, file: tarPath, gzip: true }, [name]);
    filePath = tarPath;
    name = name + '.tar.gz';
  }

  /** @type {string} Type workaround for binary data */
  // @ts-ignore
  const fileData = await fs.readFile(filePath);

  return octokit.rest.repos.uploadReleaseAsset({
    owner: params.owner,
    repo: params.repo,
    release_id: params.releaseId,
    name: name,
    data: fileData,
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': fileData.length.toString(),
    },
  });
}

/**
 *
 * @param {object} arg
 * @param {string} arg.token
 * @param {string} arg.owner
 * @param {string} arg.repo
 * @param {string} arg.tag
 */
async function getReleaseAssetsByTag({ token, owner, repo, tag }) {
  const { Octokit } = await import('@octokit/rest');

  const octokit = new Octokit({ auth: token });
  const release = await octokit.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag,
  });
  return release.data.assets;
}
exports.getReleaseAssetsByTag = getReleaseAssetsByTag;
