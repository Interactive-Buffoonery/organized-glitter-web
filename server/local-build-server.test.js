import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createLocalBuildRequestHandler } from './local-build-server.js';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('resend', () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: sendMock,
      },
    };
  }),
}));

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function request(port, path, options = {}) {
  const { body, chunks, headers = {}, method = 'GET' } = options;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        headers,
        method,
        path,
        port,
      },
      res => {
        const chunks = [];

        res.on('error', reject);
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
            statusCode: res.statusCode,
          });
        });
      }
    );

    req.on('error', reject);

    if (chunks) {
      for (const chunk of chunks) {
        req.write(chunk);
      }
      req.end();
      return;
    }

    req.end(body);
  });
}

describe('Local build server static files', () => {
  let server;
  let staticDir;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'organized-glitter-static-'));
    await fs.writeFile(path.join(staticDir, 'index.html'), '<main>Static landing</main>');
    await fs.writeFile(path.join(staticDir, 'app.html'), '<main>SPA shell</main>');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();

    if (server?.listening) {
      await close(server);
    }

    await fs.rm(staticDir, { force: true, recursive: true });
    server = undefined;
  });

  it('blocks framing on app responses', async () => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, '/');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
  });
});

describe('Local build server PostHog proxy', () => {
  let server;

  beforeEach(() => {
    vi.stubEnv('POSTHOG_PROXY_HOST', 'https://us.i.posthog.com');
    vi.stubEnv('POSTHOG_PROXY_ASSET_HOST', 'https://us-assets.i.posthog.com');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.GLIMMER_PROXY_BODY_LIMIT_BYTES;
    delete process.env.GLIMMER_PROXY_BODY_TIMEOUT_MS;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();

    if (server?.listening) {
      await close(server);
    }

    server = undefined;
  });

  function mockProxyFetch() {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', {
        headers: { 'content-type': 'text/plain' },
        status: 200,
      })
    );
  }

  function fetchTargetUrl(fetchSpy) {
    const target = fetchSpy.mock.calls[0][0];
    return target instanceof URL ? target : new URL(target);
  }

  it('does not forward private client headers to PostHog', async () => {
    const fetchSpy = mockProxyFetch();
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/e?v=1', {
      headers: {
        authorization: 'Bearer private-token',
        'cf-connecting-ip': '203.0.113.10',
        cookie: 'session=private-cookie',
        forwarded: 'for=203.0.113.10;proto=https',
        'proxy-authorization': 'Basic private-proxy-token',
        'true-client-ip': '203.0.113.10',
        'x-forwarded-for': '203.0.113.10',
        'x-real-ip': '203.0.113.10',
      },
    });

    expect(response.statusCode).toBe(200);
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cf-connecting-ip')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('forwarded')).toBeNull();
    expect(headers.get('proxy-authorization')).toBeNull();
    expect(headers.get('true-client-ip')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('x-real-ip')).toBeNull();
  });

  it('does not forward an auth-token referer to PostHog', async () => {
    const fetchSpy = mockProxyFetch();
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/e?v=1', {
      headers: {
        referer: 'https://organizedglitter.app/auth/verify-email/header.payload.signature',
      },
    });

    expect(response.statusCode).toBe(200);
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.get('referer')).toBeNull();
  });

  it.each([['link-local metadata host', '/glimmer//169.254.169.254/latest/meta-data/']])(
    'rejects a protocol-relative SSRF attempt via %s without an outbound fetch',
    async (_label, path) => {
      const fetchSpy = mockProxyFetch();
      server = http.createServer(createLocalBuildRequestHandler());
      const port = await listen(server);

      const response = await request(port, path);

      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('Not found');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );
});
