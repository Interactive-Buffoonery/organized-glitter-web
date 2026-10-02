import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function resolvePlaywrightImage(
  version,
  { fetchFn = fetch, sleepFn = setTimeout } = {}
) {
  if (typeof version !== 'string' || version !== version.trim() || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Playwright image requires an exact stable package version.');
  }
  const image = `mcr.microsoft.com/playwright:v${version}-noble`;
  const url = `https://mcr.microsoft.com/v2/playwright/manifests/v${version}-noble`;

  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetchFn(url, {
        method: 'HEAD',
        headers: {
          Accept: 'application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json',
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      if (attempt === 2) throw new Error(`Could not resolve ${image}.`, { cause: error });
      await sleepFn(1000 * (attempt + 1));
      continue;
    }

    if (response.ok) {
      const digest = response.headers.get('docker-content-digest');
      if (typeof digest !== 'string' || digest.length !== 71 || !/^sha256:[a-f0-9]{64}$/.test(digest)) {
        throw new Error(`Registry returned an invalid image digest for ${image}.`);
      }
      return `${image}@${digest}`;
    }

    if ((response.status !== 429 && response.status < 500) || attempt === 2) {
      throw new Error(`Cannot resolve ${image}: HTTP ${response.status}.`);
    }
    await sleepFn(1000 * (attempt + 1));
  }
}

export function installedPlaywrightVersion() {
  return createRequire(import.meta.url)('@playwright/test/package.json').version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const image = await resolvePlaywrightImage(installedPlaywrightVersion());
    console.log(image);
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `image=${image}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
