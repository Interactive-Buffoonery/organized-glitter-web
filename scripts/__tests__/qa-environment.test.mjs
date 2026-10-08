import net from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { assertPortAvailable, qaEnvironment, waitForHttp } from '../run-local-release-qa.mjs';

describe('disposable QA environment', () => {
  it('does not pass inherited upload or email credentials to build and server processes', () => {
    const parent = {
      PATH: '/example/bin',
      POSTHOG_CLI_TOKEN: 'example-token',
      POSTHOG_CLI_API_KEY: 'example-key',
      RESEND_API_KEY: 'example-mail-key',
    };
    expect(qaEnvironment(parent)).toEqual({
      PATH: '/example/bin',
      POSTHOG_CLI_TOKEN: '',
      POSTHOG_CLI_API_KEY: '',
      RESEND_API_KEY: '',
    });
    expect(parent.POSTHOG_CLI_TOKEN).toBe('example-token');
  });

  it('rejects an occupied port before reaching another local service', async () => {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      await expect(assertPortAvailable(port)).rejects.toThrow(/already in use/);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }

    // The released port can be reassigned to another concurrent test process.
    await expect(assertPortAvailable(0)).resolves.toBeUndefined();
  });

  it('bounds each readiness request and supports a missing optional process handle', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true }));
    await waitForHttp('http://127.0.0.1:1', 'Example', { fetchFn });
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});
