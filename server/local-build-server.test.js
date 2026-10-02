import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { Readable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildContentSecurityPolicy,
  createGracefulShutdownHandler,
  createLocalBuildRequestHandler,
  serveFile,
} from './local-build-server.js';

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

function postJson(port, path, body, headers = {}) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  return request(port, path, {
    body: rawBody,
    headers: {
      'content-length': Buffer.byteLength(rawBody),
      'content-type': 'application/json',
      ...headers,
    },
    method: 'POST',
  });
}

function expectAllowedFeedbackCorsHeaders(response) {
  expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  expect(response.headers['access-control-allow-methods']).toBe('POST, OPTIONS');
  expect(response.headers['access-control-allow-headers']).toBe('Content-Type');
  expect(response.headers['access-control-max-age']).toBe('300');
  expect(response.headers.vary).toBe('Origin');
}

describe('Local build server static files', () => {
  let server;
  let staticDir;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    staticDir = await fs.mkdtemp(path.join(os.tmpdir(), 'organized-glitter-static-'));
    await fs.writeFile(path.join(staticDir, 'index.html'), '<main>SPA shell</main>');
  });

  afterEach(async () => {
    vi.restoreAllMocks();

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

  it.each([
    '/assets/missing.js',
    '/css/missing.unknown',
    '/images/missing.unknown',
    '/missing.css',
    '/missing.js',
  ])('returns 404 for missing static file %s', async requestPath => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, requestPath);

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('Not found');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('returns a useful HTML 404 for an unknown public route', async () => {
    await fs.copyFile(
      path.join(process.cwd(), 'public/404.html'),
      path.join(staticDir, '404.html')
    );
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, '/no-such-page-xyz');
    const headResponse = await request(port, '/no-such-page-xyz', { method: 'HEAD' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toContain('data-error="page-not-found"');
    expect(headResponse.statusCode).toBe(404);
    expect(headResponse.body).toBe('');
  });

  it('serves blog directory indexes and returns 404 for a removed post', async () => {
    await fs.mkdir(path.join(staticDir, 'updates', 'example-post'), { recursive: true });
    await fs.writeFile(path.join(staticDir, 'updates', 'index.html'), '<main>Updates index</main>');
    await fs.writeFile(
      path.join(staticDir, 'updates', 'example-post', 'index.html'),
      '<article>Example post</article>'
    );
    await fs.writeFile(path.join(staticDir, '404.html'), '<main>Page not found</main>');
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const index = await request(port, '/updates/?source=mail');
    const post = await request(port, '/updates/example-post/?source=mail');
    const removed = await request(port, '/updates/removed-post/?source=mail');

    expect(index.statusCode).toBe(200);
    expect(index.body).toContain('Updates index');
    expect(post.statusCode).toBe(200);
    expect(post.body).toContain('Example post');
    expect(removed.statusCode).toBe(404);
    expect(removed.body).toContain('Page not found');
  });

  it.each([
    '/dashboard',
    '/projects/record123',
    '/coloring/book123/pages/page456',
    '/auth/verify-email/token.with.dots',
    '/auth/confirm-email-change/token.with.dots',
  ])('serves the shell for known deep link %s', async requestPath => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, requestPath);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('SPA shell');
  });

  it('serves existing assets and preserves headers for HEAD requests', async () => {
    await fs.mkdir(path.join(staticDir, 'assets'));
    await fs.writeFile(path.join(staticDir, 'assets', 'app.js'), 'export const ready = true;');
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const getResponse = await request(port, '/assets/app.js');
    const headResponse = await request(port, '/assets/app.js', { method: 'HEAD' });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).toBe('export const ready = true;');
    expect(getResponse.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(getResponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headResponse.statusCode).toBe(200);
    expect(headResponse.body).toBe('');
    expect(headResponse.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(headResponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves hashed blog assets with immutable caching for GET and HEAD', async () => {
    const assetDirectory = path.join(staticDir, 'updates', '_astro');
    await fs.mkdir(assetDirectory, { recursive: true });
    await fs.writeFile(path.join(assetDirectory, 'blog.abc123.css'), 'body { color: red; }');
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const getResponse = await request(port, '/updates/_astro/blog.abc123.css');
    const headResponse = await request(port, '/updates/_astro/blog.abc123.css', {
      method: 'HEAD',
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headResponse.statusCode).toBe(200);
    expect(headResponse.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(headResponse.body).toBe('');
  });

  it('serves the Apple association file as JSON without a redirect', async () => {
    const wellKnownDir = path.join(staticDir, '.well-known');
    const association = JSON.stringify({ applinks: { details: [] } });
    await fs.mkdir(wellKnownDir);
    await fs.writeFile(path.join(wellKnownDir, 'apple-app-site-association'), association);
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const getResponse = await request(port, '/.well-known/apple-app-site-association');
    const headResponse = await request(port, '/.well-known/apple-app-site-association', {
      method: 'HEAD',
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.body).toBe(association);
    expect(getResponse.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(headResponse.statusCode).toBe(200);
    expect(headResponse.body).toBe('');
    expect(headResponse.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('does not serve the SPA shell when the Apple association file is missing', async () => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, '/.well-known/apple-app-site-association');

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe('Not found');
  });

  it.each([
    [
      '/',
      'index.html',
      'Organized Glitter | Coloring Book &amp; Diamond Art Tracker',
      'https://organizedglitter.app/',
    ],
    ['/about', 'about.html', 'About | Organized Glitter', 'https://organizedglitter.app/about'],
    [
      '/links',
      'links.html',
      "Sarah's Links | Organized Glitter",
      'https://organizedglitter.app/links',
    ],
    [
      '/privacy',
      'privacy.html',
      'Privacy policy | Organized Glitter',
      'https://organizedglitter.app/privacy',
    ],
    [
      '/terms',
      'terms.html',
      'Terms of service | Organized Glitter',
      'https://organizedglitter.app/terms',
    ],
  ])(
    'serves route-specific metadata for %s before JavaScript runs',
    async (requestPath, fileName, title, canonical) => {
      for (const entry of [
        'index.html',
        'about.html',
        'links.html',
        'privacy.html',
        'terms.html',
      ]) {
        await fs.copyFile(path.join(process.cwd(), entry), path.join(staticDir, entry));
      }
      server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
      const port = await listen(server);
      const response = await request(port, requestPath);

      expect(response.statusCode).toBe(200);
      const document = new JSDOM(response.body).window.document;
      expect(document.title).toBe(title.replace('&amp;', '&'));
      expect(document.querySelector('meta[name="description"]')?.content).toBeTruthy();
      expect(document.querySelector('link[rel="canonical"]')?.href).toBe(canonical);
      expect(document.querySelector('meta[property="og:url"]')?.content).toBe(canonical);
      expect(document.querySelector('meta[property="og:title"]')?.content).toBe(document.title);
      expect(document.querySelector('meta[name="twitter:title"]')?.content).toBe(document.title);
      expect(document.querySelector('meta[name="twitter:description"]')?.content).toBe(
        document.querySelector('meta[name="description"]')?.content
      );
      expect(response.body).toBe(await fs.readFile(path.join(staticDir, fileName), 'utf8'));
    }
  );

  it('keeps extensionless application routes on the SPA shell', async () => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, '/projects/example');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('<main>SPA shell</main>');
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it.each([
    '/auth/verify-email/header.payload.signature',
    '/auth/confirm-password-reset/header.payload.signature',
    '/auth/confirm-email-change/header.payload.js',
  ])('keeps dotted auth token route %s on the SPA shell', async requestPath => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, requestPath);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('<main>SPA shell</main>');
    expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it('returns 400 for a malformed percent-encoded path', async () => {
    server = http.createServer(createLocalBuildRequestHandler({ staticDir }));
    const port = await listen(server);

    const response = await request(port, '/bad%ZZpath');

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe('Bad request');
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('returns 500 when an existing static file cannot be opened', async () => {
    await fs.writeFile(path.join(staticDir, 'broken.js'), 'console.log("broken")');
    const createFileStream = vi.fn(() => {
      const stream = new Readable({ read() {} });
      queueMicrotask(() => stream.destroy(new Error('disk read failed')));
      return stream;
    });
    server = http.createServer(createLocalBuildRequestHandler({ createFileStream, staticDir }));
    const port = await listen(server);

    const response = await request(port, '/broken.js');

    expect(response.statusCode).toBe(500);
    expect(response.body).toBe('Internal server error');
    expect(createFileStream).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('Static file stream failed:', {
      error: 'disk read failed',
      path: 'broken.js',
    });
  });

  it('closes the file stream when response header setup fails', async () => {
    await fs.writeFile(path.join(staticDir, 'broken.js'), 'console.log("broken")');
    const fileStream = new Readable({ read() {} });
    const destroySpy = vi.spyOn(fileStream, 'destroy');
    const createFileStream = vi.fn(() => {
      queueMicrotask(() => fileStream.emit('open'));
      return fileStream;
    });
    const res = {
      setHeader: vi.fn(() => {
        throw new Error('header setup failed');
      }),
      writeHead: vi.fn(),
    };

    await serveFile({ method: 'GET' }, res, {
      createFileStream,
      filePath: path.join(staticDir, 'broken.js'),
      staticDir,
    });

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(fileStream.destroyed).toBe(true);
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('closes the file stream when the client disconnects', async () => {
    await fs.writeFile(path.join(staticDir, 'large.js'), Buffer.alloc(1024));
    let resolveDestroyed;
    const destroyed = new Promise(resolve => {
      resolveDestroyed = resolve;
    });
    let hasPushed = false;
    const fileStream = new Readable({
      destroy(error, callback) {
        resolveDestroyed();
        callback(error);
      },
      read() {
        if (!hasPushed) {
          hasPushed = true;
          this.push(Buffer.alloc(512));
        }
      },
    });
    const createFileStream = vi.fn(() => {
      queueMicrotask(() => fileStream.emit('open'));
      return fileStream;
    });
    server = http.createServer(createLocalBuildRequestHandler({ createFileStream, staticDir }));
    const port = await listen(server);

    await new Promise((resolve, reject) => {
      const clientRequest = http.get({ host: '127.0.0.1', path: '/large.js', port }, response => {
        response.once('data', () => {
          response.destroy();
          resolve();
        });
      });
      clientRequest.once('error', reject);
    });

    await expect(destroyed).resolves.toBeUndefined();
    expect(fileStream.destroyed).toBe(true);
  });
});

async function drainNodeStream(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe('Local build server feedback handling', () => {
  let server;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendMock.mockReset();
    delete process.env.RESEND_API_KEY;
    delete process.env.FEEDBACK_BODY_LIMIT_BYTES;
    delete process.env.FEEDBACK_RATE_LIMIT_MAX;
    delete process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS;
    delete process.env.FEEDBACK_RATE_LIMIT_MAX_WINDOWS;
    delete process.env.FEEDBACK_TRUSTED_PROXY_HOPS;
    delete process.env.GLIMMER_PROXY_BODY_LIMIT_BYTES;
    delete process.env.GLIMMER_PROXY_BODY_TIMEOUT_MS;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (server?.listening) {
      await close(server);
    }

    server = undefined;
  });

  it('rejects unsupported feedback content types with 415', async () => {
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = 'feedback=This+message+is+long+enough';

    const response = await request(port, '/api/send-feedback', {
      body,
      headers: {
        'content-length': Buffer.byteLength(body),
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:5173',
      },
      method: 'POST',
    });

    expect(response.statusCode).toBe(415);
    expectAllowedFeedbackCorsHeaders(response);
    expect(JSON.parse(response.body)).toEqual({ error: 'Unsupported content type' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('accepts JSON suffix feedback content types', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    sendMock.mockResolvedValueOnce({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await postJson(
      port,
      '/api/send-feedback',
      {
        feedback: 'This message is long enough to submit.',
        type: 'general',
      },
      {
        'content-type': 'application/vnd.organized-glitter.feedback+json',
      }
    );

    expect(response.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for malformed feedback JSON', async () => {
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/api/send-feedback', {
      body: '{"feedback":',
      headers: {
        'content-length': '12',
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      method: 'POST',
    });

    expect(response.statusCode).toBe(400);
    expectAllowedFeedbackCorsHeaders(response);
    expect(JSON.parse(response.body)).toEqual({ error: 'Malformed JSON' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 413 for declared oversized feedback bodies', async () => {
    process.env.FEEDBACK_BODY_LIMIT_BYTES = '20';
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = JSON.stringify({ feedback: 'This message is long enough to submit.' });

    const response = await request(port, '/api/send-feedback', {
      body,
      headers: {
        'content-length': Buffer.byteLength(body),
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      method: 'POST',
    });

    expect(response.statusCode).toBe(413);
    expectAllowedFeedbackCorsHeaders(response);
    expect(JSON.parse(response.body)).toEqual({ error: 'Request body too large' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns 413 for chunked oversized feedback bodies', async () => {
    process.env.FEEDBACK_BODY_LIMIT_BYTES = '20';
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/api/send-feedback', {
      chunks: ['{"feedback":"', 'This message is too large', '"}'],
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
      },
      method: 'POST',
    });

    expect(response.statusCode).toBe(413);
    expectAllowedFeedbackCorsHeaders(response);
    expect(JSON.parse(response.body)).toEqual({ error: 'Request body too large' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate limits feedback sends and prevents extra Resend calls', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      origin: 'http://localhost:5173',
      'x-real-ip': '203.0.113.10',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      origin: 'http://localhost:5173',
      'x-real-ip': '203.0.113.10',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expectAllowedFeedbackCorsHeaders(secondResponse);
    expect(secondResponse.headers['retry-after']).toBe('900');
    expect(JSON.parse(secondResponse.body)).toEqual({
      error: 'Too many requests. Please try again later.',
      retryAfter: 900,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('rate limits oversized feedback bodies before reading them', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const firstResponse = await postJson(
      port,
      '/api/send-feedback',
      {
        feedback: 'This message is long enough to submit.',
        type: 'general',
      },
      {
        'x-real-ip': '203.0.113.10',
      }
    );
    process.env.FEEDBACK_BODY_LIMIT_BYTES = '20';
    const oversizedBody = JSON.stringify({ feedback: 'This message is too large to accept.' });
    const secondResponse = await request(port, '/api/send-feedback', {
      body: oversizedBody,
      headers: {
        'content-length': Buffer.byteLength(oversizedBody),
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.10',
      },
      method: 'POST',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expect(JSON.parse(secondResponse.body)).toEqual({
      error: 'Too many requests. Please try again later.',
      retryAfter: 900,
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('prefers x-real-ip over spoofed forwarded headers', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '1.1.1.1, 203.0.113.20',
      'x-real-ip': '198.51.100.10',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '2.2.2.2, 203.0.113.21',
      'x-real-ip': '198.51.100.10',
    });

    expect([firstResponse.statusCode, secondResponse.statusCode]).toEqual([200, 429]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to trusted forwarded IP when x-real-ip is absent', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const responses = [];
    const spoofedLeftmostIps = ['1.1.1.1', '2.2.2.2', '3.3.3.3'];
    for (const spoofed of spoofedLeftmostIps) {
      responses.push(
        await postJson(port, '/api/send-feedback', body, {
          'x-forwarded-for': `${spoofed}, 198.51.100.10`,
        })
      );
    }

    expect(responses.map(response => response.statusCode)).toEqual([200, 429, 429]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('attributes a single-entry forwarded header to the client at the trusted depth', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '198.51.100.10',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '198.51.100.10',
    });
    const otherClientResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '198.51.100.11',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expect(otherClientResponse.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('uses the rightmost valid x-real-ip when duplicate values are comma-joined', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-real-ip': '1.1.1.1, 198.51.100.10',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-real-ip': '2.2.2.2, 198.51.100.10',
    });

    expect([firstResponse.statusCode, secondResponse.statusCode]).toEqual([200, 429]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('ignores forwarded and real IP headers when trusted proxy hops is zero', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    process.env.FEEDBACK_TRUSTED_PROXY_HOPS = '0';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '203.0.113.20, 198.51.100.10',
      'x-real-ip': '198.51.100.30',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '203.0.113.21, 198.51.100.10',
      'x-real-ip': '198.51.100.31',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to trusted forwarded IP when x-real-ip is invalid', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '1.1.1.1, 198.51.100.30',
      'x-real-ip': 'not-an-ip',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '2.2.2.2, 198.51.100.30',
      'x-real-ip': 'not-an-ip',
    });

    expect([firstResponse.statusCode, secondResponse.statusCode]).toEqual([200, 429]);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('caps active rate-limit windows and evicts the oldest bucket for new IPs', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '900000';
    process.env.FEEDBACK_RATE_LIMIT_MAX_WINDOWS = '2';
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-real-ip': '198.51.100.10',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-real-ip': '198.51.100.11',
    });
    const thirdResponse = await postJson(port, '/api/send-feedback', body, {
      'x-real-ip': '198.51.100.12',
    });
    const evictedIpResponse = await postJson(port, '/api/send-feedback', body, {
      'x-real-ip': '198.51.100.10',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(thirdResponse.statusCode).toBe(200);
    expect(evictedIpResponse.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(4);
  });

  it('warns once per invalid feedback limiter config and falls back to defaults', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = 'not-a-number';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '-1';
    process.env.FEEDBACK_RATE_LIMIT_MAX_WINDOWS = '0';
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(
        await postJson(port, '/api/send-feedback', body, {
          'x-forwarded-for': '203.0.113.50, 198.51.100.10',
        })
      );
    }

    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith('Invalid feedback limiter config; using default:', {
      name: 'FEEDBACK_RATE_LIMIT_MAX',
      fallback: 5,
      rawValue: 'not-a-number',
    });
    expect(console.warn).toHaveBeenCalledWith('Invalid feedback limiter config; using default:', {
      name: 'FEEDBACK_RATE_LIMIT_WINDOW_MS',
      fallback: 900000,
      rawValue: '-1',
    });
    expect(console.warn).toHaveBeenCalledWith('Invalid feedback limiter config; using default:', {
      name: 'FEEDBACK_RATE_LIMIT_MAX_WINDOWS',
      fallback: 10000,
      rawValue: '0',
    });
    expect(responses.map(response => response.statusCode)).toEqual([200, 200, 200, 200, 200, 429]);
    expect(responses[5].headers['retry-after']).toBe('900');
    expect(sendMock).toHaveBeenCalledTimes(5);
  });

  it('prunes expired rate-limit windows and allows requests after the window', async () => {
    process.env.RESEND_API_KEY = 'test_resend_key';
    process.env.FEEDBACK_RATE_LIMIT_MAX = '1';
    process.env.FEEDBACK_RATE_LIMIT_WINDOW_MS = '1000';
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2500);
    sendMock.mockResolvedValue({ error: null });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);
    const body = {
      feedback: 'This message is long enough to submit.',
      type: 'general',
    };

    const firstResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '203.0.113.40',
    });
    const secondResponse = await postJson(port, '/api/send-feedback', body, {
      'x-forwarded-for': '203.0.113.40',
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});

describe('Local build server content security policy', () => {
  it('allows the disposable PocketBase origin only in the test runtime', () => {
    const policy = buildContentSecurityPolicy({
      APP_TEST_ENV: 'test',
      VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
    });

    expect(policy).toContain("connect-src 'self' http://127.0.0.1:8090");
    expect(policy).toContain("img-src 'self' http://127.0.0.1:8090");
  });

  it('does not add non-loopback or production runtime origins', () => {
    const baseline = buildContentSecurityPolicy({});

    expect(
      buildContentSecurityPolicy({
        APP_TEST_ENV: 'test',
        VITE_POCKETBASE_URL: 'https://attacker.example',
      })
    ).toBe(baseline);
    expect(
      buildContentSecurityPolicy({
        APP_TEST_ENV: 'production',
        VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
      })
    ).toBe(baseline);
  });
});

describe('Local build server PostHog proxy', () => {
  let server;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.GLIMMER_PROXY_BODY_LIMIT_BYTES;
    delete process.env.GLIMMER_PROXY_BODY_TIMEOUT_MS;
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (server?.listening) {
      await close(server);
    }

    server = undefined;
  });

  it('returns a controlled empty response when the PostHog proxy fetch fails', async () => {
    const fetchError = new Error('fetch failed');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(fetchError);
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/capture/?v=1');

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(response.headers['content-security-policy']).toContain('https://i.ytimg.com');
    expect(response.headers['content-security-policy']).not.toContain('https://api.resend.com');
    expect(console.warn).toHaveBeenCalledWith(
      'PostHog proxy request failed:',
      expect.objectContaining({
        clientRequestDestroyed: expect.any(Boolean),
        error: 'fetch failed',
        path: '/glimmer/capture/',
        target: 'https://us.i.posthog.com',
      })
    );
    expect(console.error).not.toHaveBeenCalledWith('Local build server error:', expect.anything());
  });

  it('returns 413 for declared oversized glimmer bodies without calling fetch', async () => {
    process.env.GLIMMER_PROXY_BODY_LIMIT_BYTES = '4';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null));
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/capture/', {
      body: '12345',
      headers: {
        'content-length': '5',
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.statusCode).toBe(413);
    expect(response.body).toBe('Request body too large');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts streamed oversized glimmer bodies and returns 413', async () => {
    process.env.GLIMMER_PROXY_BODY_LIMIT_BYTES = '4';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      await drainNodeStream(init.body);
      return new Response(null, { status: 204 });
    });
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/capture/', {
      chunks: ['12', '345'],
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    });

    expect(response.statusCode).toBe(413);
    expect(response.body).toBe('Request body too large');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('awaits proxied response streams and closes the downstream response', async () => {
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('accepted'));
            setTimeout(() => controller.close(), 10);
          },
        }),
        { status: 202 }
      )
    );
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/capture/?v=1');

    expect(response.statusCode).toBe(202);
    expect(response.body).toBe('accepted');
  });

  it('handles proxied response stream rejection without an unhandled rejection', async () => {
    const unhandledRejections = [];
    const onUnhandledRejection = reason => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', onUnhandledRejection);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.error(new Error('downstream stream failed'));
          },
        }),
        { status: 200 }
      )
    );
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    await expect(request(port, '/glimmer/capture/?v=1')).rejects.toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 0));
    process.off('unhandledRejection', onUnhandledRejection);

    expect(unhandledRejections).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      'PostHog proxy response stream failed:',
      expect.objectContaining({
        error: 'downstream stream failed',
        path: '/glimmer/capture/',
        target: 'https://us.i.posthog.com',
      })
    );
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

  it('proxies a legitimate capture request to the PostHog ingest origin', async () => {
    const fetchSpy = mockProxyFetch();
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/e?v=1');

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const target = fetchTargetUrl(fetchSpy);
    expect(target.origin).toBe('https://us.i.posthog.com');
    expect(target.pathname).toBe('/e');
  });

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

  it('proxies a legitimate static asset request to the PostHog assets origin', async () => {
    const fetchSpy = mockProxyFetch();
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/static/array.js');

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const target = fetchTargetUrl(fetchSpy);
    expect(target.origin).toBe('https://us-assets.i.posthog.com');
    expect(target.pathname).toBe('/static/array.js');
  });

  it('proxies a legitimate array request to the PostHog assets origin', async () => {
    const fetchSpy = mockProxyFetch();
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/array/key/config.js');

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const target = fetchTargetUrl(fetchSpy);
    expect(target.origin).toBe('https://us-assets.i.posthog.com');
    expect(target.pathname).toBe('/array/key/config.js');
  });

  it.each([
    ['link-local metadata host', '/glimmer//169.254.169.254/latest/meta-data/'],
    ['foreign host', '/glimmer//evil.com/x'],
  ])(
    'rejects a protocol-relative SSRF attempt via %s without an outbound fetch',
    async (_label, path) => {
      const fetchSpy = mockProxyFetch();
      server = http.createServer(createLocalBuildRequestHandler());
      const port = await listen(server);

      const response = await request(port, path);

      expect(response.statusCode).toBe(404);
      expect(response.body).toBe('');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('keeps an encoded-slash payload on the PostHog origin instead of a foreign host', async () => {
    const fetchSpy = mockProxyFetch();
    server = http.createServer(createLocalBuildRequestHandler());
    const port = await listen(server);

    const response = await request(port, '/glimmer/%2F%2Fevil.com/x');

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const target = fetchTargetUrl(fetchSpy);
    expect(target.origin).toBe('https://us.i.posthog.com');
    expect(target.hostname).not.toBe('evil.com');
  });
});

describe('Local build server graceful shutdown', () => {
  let server;

  afterEach(async () => {
    vi.restoreAllMocks();

    if (server?.listening) {
      await close(server);
    }

    server = undefined;
  });

  it('exits cleanly when Railway stops the container', async () => {
    const exit = vi.fn();
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
    };
    server = http.createServer(createLocalBuildRequestHandler());
    await listen(server);

    const shutdown = createGracefulShutdownHandler(server, {
      exit,
      forceCloseTimeoutMs: 100,
      logger,
    });

    shutdown('SIGTERM');

    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(0);
    });
    expect(logger.log).toHaveBeenCalledWith('Received SIGTERM; shutting down local build server');
    expect(logger.log).toHaveBeenCalledWith('Local build server stopped');
    expect(logger.error).not.toHaveBeenCalled();
    expect(server.listening).toBe(false);
  });
});
