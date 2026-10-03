#!/usr/bin/env node
/**
 * Post-build sourcemap handling for PostHog error tracking.
 *
 * Runs after `vite build`. Vite emits `.map` files in 'hidden' mode so PostHog
 * can symbolicate minified stacks, but those maps must never be served from
 * `dist` (the local build server would expose them). This script guarantees
 * the maps leave `dist` no matter what:
 *
 *  - With credentials: inject PostHog chunk IDs, upload the maps tied to the
 *    build's release version, then delete the local maps.
 *  - Without credentials (e.g. a local `pnpm build`): skip the upload but still
 *    delete the local maps, then exit 0 so the build succeeds and nothing
 *    sensitive ships.
 *
 * Sourcemap upload is a diagnostics nice-to-have, NOT a release gate: if the
 * PostHog CLI fails (e.g. a missing POSTHOG_CLI_PROJECT_ID, network blip), this
 * script logs the failure loudly, deletes the local maps anyway, and exits 0 so
 * the app still deploys. A failed upload must never take down the deploy.
 *
 * Required CI build secrets when uploads ARE wanted (the first two are
 * required TOGETHER; the token alone is not enough for the CLI to upload):
 *  - POSTHOG_CLI_TOKEN (or POSTHOG_CLI_API_KEY): a PostHog personal API key with
 *    the `error_tracking:write` scope.
 *  - POSTHOG_CLI_PROJECT_ID (or POSTHOG_CLI_ENV_ID): the PostHog project/env id.
 *  - POSTHOG_CLI_HOST (optional): defaults to https://us.posthog.com.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const defaultProjectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultDistDir = path.join(defaultProjectRoot, 'dist');

const defaultFsApi = {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
};

/** Recursively delete every `.map` file under a directory. */
export const deleteSourcemaps = (dir, fsApi = defaultFsApi) => {
  let deleted = 0;
  for (const entry of fsApi.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fsApi.statSync(fullPath).isDirectory()) {
      deleted += deleteSourcemaps(fullPath, fsApi);
    } else if (entry.endsWith('.map')) {
      fsApi.rmSync(fullPath);
      deleted += 1;
    }
  }
  return deleted;
};

// Same resolution order as vite.config.ts so the uploaded release matches
// __APP_BUILD_ID__ baked into the bundle.
export const resolveReleaseVersion = env =>
  env.GITHUB_SHA || env.RAILWAY_GIT_COMMIT_SHA || env.VITE_APP_VERSION;

const releaseName = 'organized-glitter';

export const runSourcemapUpload = ({
  projectRoot = defaultProjectRoot,
  distDir = defaultDistDir,
  env = process.env,
  spawnSyncFn = spawnSync,
  logger = console,
  fsApi = defaultFsApi,
} = {}) => {
  if (!fsApi.existsSync(distDir)) {
    logger.error(`[sourcemaps] dist directory not found at ${distDir}; did the build run?`);
    return 1;
  }

  const hasToken = Boolean(env.POSTHOG_CLI_TOKEN || env.POSTHOG_CLI_API_KEY);
  const hasProject = Boolean(env.POSTHOG_CLI_PROJECT_ID || env.POSTHOG_CLI_ENV_ID);

  if (!hasToken || !hasProject) {
    const deleted = deleteSourcemaps(distDir, fsApi);
    logger.log(
      `[sourcemaps] Complete PostHog CLI credentials are not set; skipping upload and deleting ${deleted} local .map file(s) so none ship.`
    );
    return 0;
  }

  const cliBin = path.join(projectRoot, 'node_modules', '.bin', 'posthog-cli');

  /** Run a posthog-cli subcommand, throwing on non-zero exit. */
  const run = args => {
    logger.log(`[sourcemaps] posthog-cli ${args.join(' ')}`);
    const result = spawnSyncFn(cliBin, args, { stdio: 'inherit', cwd: projectRoot });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`posthog-cli ${args[0]} exited ${result.status}`);
    }
  };

  try {
    const releaseVersion = resolveReleaseVersion(env);

    if (!releaseVersion) {
      throw new Error(
        'No release version (GITHUB_SHA / RAILWAY_GIT_COMMIT_SHA / VITE_APP_VERSION).'
      );
    }

    run(['sourcemap', 'inject', '--directory', distDir]);
    run([
      'sourcemap',
      'upload',
      '--directory',
      distDir,
      '--release-name',
      releaseName,
      '--release-version',
      releaseVersion,
      // Remove .map files after a successful upload so they never ship in dist.
      '--delete-after',
    ]);
    logger.log(`[sourcemaps] Uploaded sourcemaps for release ${releaseName}@${releaseVersion}.`);
  } catch (err) {
    // Sourcemap upload is a diagnostics nice-to-have, not a release gate. Log
    // loudly but do NOT fail the build/deploy.
    logger.error(
      `[sourcemaps] Upload failed (continuing so the deploy is not blocked): ${err?.message ?? err}`
    );
  } finally {
    // Always strip local .map files so they never ship, whether the upload
    // succeeded, failed, or was skipped (--delete-after only fires on success).
    const leftover = deleteSourcemaps(distDir, fsApi);
    if (leftover > 0) {
      logger.log(`[sourcemaps] Removed ${leftover} residual .map file(s).`);
    }
  }

  return 0;
};

const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  process.exit(runSourcemapUpload());
}
