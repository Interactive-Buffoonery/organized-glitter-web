import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  installedPlaywrightVersion,
  resolvePlaywrightImage,
} from '../resolve-playwright-image.mjs';

const installedVersion = createRequire(import.meta.url)('@playwright/test/package.json').version;

const digest = `sha256:${'a'.repeat(64)}`;
const response = (status = 200, imageDigest = digest) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(imageDigest ? { 'docker-content-digest': imageDigest } : {}),
});

const options = fetchFn => ({ fetchFn, sleepFn: vi.fn() });

describe('Playwright container resolution', () => {
  it.each(['1.60.0', '1.61.1'])(
    'selects the immutable image for installed version %s without workflow edits',
    async version => {
      const fetchFn = vi.fn().mockResolvedValue(response());
      expect(await resolvePlaywrightImage(version, options(fetchFn))).toBe(
        `mcr.microsoft.com/playwright:v${version}-noble@${digest}`
      );
      expect(fetchFn.mock.calls[0][0]).toBe(
        `https://mcr.microsoft.com/v2/playwright/manifests/v${version}-noble`
      );
      expect(fetchFn.mock.calls[0][1].method).toBe('HEAD');
    }
  );

  it('resolves the image for the installed @playwright/test version', async () => {
    expect(installedPlaywrightVersion()).toBe(installedVersion);
    const fetchFn = vi.fn().mockResolvedValue(response());
    await resolvePlaywrightImage(installedPlaywrightVersion(), options(fetchFn));
    expect(fetchFn.mock.calls[0][0]).toBe(
      `https://mcr.microsoft.com/v2/playwright/manifests/v${installedVersion}-noble`
    );
  });

  it.each([
    ['ci.yml', 'build', 'playwright-image'],
    ['playwright-smoke.yml', 'browser-image', 'image'],
  ])('%s runs the browser container from the resolver output', (filename, job, output) => {
    const workflow = readFileSync(`.github/workflows/${filename}`, 'utf8');
    expect(workflow).toContain('run: node scripts/resolve-playwright-image.mjs');
    expect(workflow).toContain(`${output}: \${{ steps.playwright-image.outputs.image }}`);
    const images = [...workflow.matchAll(/^\s+container:\n\s+image: (.+)$/gm)].map(
      match => match[1]
    );
    expect(images).toEqual([`\${{ needs.${job}.outputs.${output} }}`]);
  });

  it.each(['', 'latest', '1.60.0\nimage=untrusted', '../image', '1.60.0-beta'])(
    'rejects invalid version %s before making a request',
    async version => {
      const fetchFn = vi.fn();
      await expect(resolvePlaywrightImage(version, options(fetchFn))).rejects.toThrow('version');
      expect(fetchFn).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, 'sha256:bad', `sha512:${'a'.repeat(64)}`, `${digest}\nimage=bad`])(
    'fails closed for missing or malformed digest %s',
    async imageDigest => {
      const fetchFn = vi
        .fn()
        .mockResolvedValue({ ...response(), headers: { get: () => imageDigest } });
      await expect(resolvePlaywrightImage('1.60.0', options(fetchFn))).rejects.toThrow('digest');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    }
  );

  it('does not fall back to another version when the image is not published', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(404));
    await expect(resolvePlaywrightImage('1.60.0', options(fetchFn))).rejects.toThrow('HTTP 404');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries transient HTTP and network errors before resolving', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(500))
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValue(response());
    const sleepFn = vi.fn();
    expect(await resolvePlaywrightImage('1.60.0', { fetchFn, sleepFn })).toContain(digest);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('fails after bounded transient retries without returning a floating tag', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(503));
    await expect(resolvePlaywrightImage('1.60.0', options(fetchFn))).rejects.toThrow('HTTP 503');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});
