import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { addAbortSignal, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildContentSecurityPolicy as deploymentCsp,
  analyticsProxyTarget,
} from './deployment-config.js';

import sendFeedbackHandler, { applyFeedbackCorsHeaders } from '../api/send-feedback.js';
import { PUBLIC_PAGE_PATHS, isKnownAppRoute, isStaticFileRequest } from './app-route-policy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const port = Number(process.env.PORT || 8080);
const DEFAULT_FEEDBACK_BODY_LIMIT_BYTES = 16_384;
const DEFAULT_FEEDBACK_RATE_LIMIT_MAX = 5;
const DEFAULT_FEEDBACK_RATE_LIMIT_WINDOW_MS = 900_000;
const DEFAULT_FEEDBACK_RATE_LIMIT_MAX_WINDOWS = 10_000;
const DEFAULT_FEEDBACK_TRUSTED_PROXY_HOPS = 0;
const DEFAULT_GLIMMER_PROXY_BODY_LIMIT_BYTES = 1_048_576;
const DEFAULT_GLIMMER_PROXY_BODY_TIMEOUT_MS = 10_000;

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const APPLE_APP_SITE_ASSOCIATION_PATH = '/.well-known/apple-app-site-association';

export function buildContentSecurityPolicy(env = process.env) {
  return deploymentCsp(env);
}

function applySecurityHeaders(res) {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy());
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
}

class RequestBodyTooLargeError extends Error {
  constructor(message = 'Request body is too large') {
    super(message);
    this.name = 'RequestBodyTooLargeError';
    this.statusCode = 413;
  }
}

class MalformedJsonError extends Error {
  constructor(message = 'Malformed JSON') {
    super(message);
    this.name = 'MalformedJsonError';
    this.statusCode = 400;
  }
}

class RequestBodyTimeoutError extends Error {
  constructor(message = 'Request body timed out') {
    super(message);
    this.name = 'RequestBodyTimeoutError';
    this.statusCode = 408;
  }
}

function getPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getPositiveIntegerConfig(name, fallback, { allowZero = false } = {}) {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return { value: fallback, usedFallback: true, rawValue };
  }

  const value = Number(rawValue);
  const isValid = Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0);
  if (isValid) {
    return { value, usedFallback: false, rawValue };
  }

  return { value: fallback, usedFallback: true, rawValue };
}

function warnInvalidFeedbackConfig(configEntries) {
  for (const { name, config, fallback } of configEntries) {
    if (config.rawValue === undefined || !config.usedFallback) {
      continue;
    }

    console.warn('Invalid feedback limiter config; using default:', {
      name,
      fallback,
      rawValue: config.rawValue,
    });
  }
}

function getFeedbackLimiterConfig() {
  const maxRequests = getPositiveIntegerConfig(
    'FEEDBACK_RATE_LIMIT_MAX',
    DEFAULT_FEEDBACK_RATE_LIMIT_MAX
  );
  const windowMs = getPositiveIntegerConfig(
    'FEEDBACK_RATE_LIMIT_WINDOW_MS',
    DEFAULT_FEEDBACK_RATE_LIMIT_WINDOW_MS
  );
  const maxWindows = getPositiveIntegerConfig(
    'FEEDBACK_RATE_LIMIT_MAX_WINDOWS',
    DEFAULT_FEEDBACK_RATE_LIMIT_MAX_WINDOWS
  );
  const trustedProxyHops = getPositiveIntegerConfig(
    'FEEDBACK_TRUSTED_PROXY_HOPS',
    DEFAULT_FEEDBACK_TRUSTED_PROXY_HOPS,
    { allowZero: true }
  );

  warnInvalidFeedbackConfig([
    {
      name: 'FEEDBACK_RATE_LIMIT_MAX',
      config: maxRequests,
      fallback: DEFAULT_FEEDBACK_RATE_LIMIT_MAX,
    },
    {
      name: 'FEEDBACK_RATE_LIMIT_WINDOW_MS',
      config: windowMs,
      fallback: DEFAULT_FEEDBACK_RATE_LIMIT_WINDOW_MS,
    },
    {
      name: 'FEEDBACK_RATE_LIMIT_MAX_WINDOWS',
      config: maxWindows,
      fallback: DEFAULT_FEEDBACK_RATE_LIMIT_MAX_WINDOWS,
    },
    {
      name: 'FEEDBACK_TRUSTED_PROXY_HOPS',
      config: trustedProxyHops,
      fallback: DEFAULT_FEEDBACK_TRUSTED_PROXY_HOPS,
    },
  ]);

  return {
    maxRequests: maxRequests.value,
    windowMs: windowMs.value,
    maxWindows: maxWindows.value,
    trustedProxyHops: trustedProxyHops.value,
  };
}

function getHeaderValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getHeaderValues(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getIpHeaderValues(value) {
  return getHeaderValues(value)
    .flatMap(headerValue => headerValue.split(','))
    .map(value => value.trim())
    .filter(value => value && isIP(value));
}

function getRightmostHeaderIp(value) {
  const values = getIpHeaderValues(value);
  return values[values.length - 1];
}

function getDeclaredContentLength(req) {
  const value = getHeaderValue(req.headers['content-length']);
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new MalformedJsonError('Invalid Content-Length');
  }

  return parsed;
}

function rejectDeclaredOversizedBody(req, limitBytes) {
  const declaredLength = getDeclaredContentLength(req);
  if (declaredLength !== null && declaredLength > limitBytes) {
    throw new RequestBodyTooLargeError();
  }
}

function isJsonContentType(contentType) {
  const value = getHeaderValue(contentType);
  if (!value) {
    return false;
  }

  const mediaType = value.split(';', 1)[0].trim().toLowerCase();
  return (
    mediaType === 'application/json' ||
    (mediaType.startsWith('application/') && mediaType.endsWith('+json'))
  );
}

function sendJson(res, statusCode, payload, headers = {}) {
  applySecurityHeaders(res);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  applySecurityHeaders(res);
  if (statusCode >= 400) res.setHeader('Cache-Control', 'no-store');
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function getFeedbackClientIp(req, trustedProxyHops) {
  if (trustedProxyHops > 0) {
    const realIp = getRightmostHeaderIp(req.headers['x-real-ip']);
    if (realIp) {
      return realIp;
    }

    const forwardedIps = getIpHeaderValues(req.headers['x-forwarded-for']);
    const forwardedIp =
      forwardedIps.length >= trustedProxyHops
        ? forwardedIps[forwardedIps.length - trustedProxyHops]
        : undefined;

    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return req.socket.remoteAddress || 'unknown';
}

function evictOldestWindow(windows) {
  let oldestIp;
  let oldestWindowStart = Infinity;

  for (const [ip, window] of windows) {
    if (window.windowStart < oldestWindowStart) {
      oldestIp = ip;
      oldestWindowStart = window.windowStart;
    }
  }

  if (oldestIp !== undefined) {
    windows.delete(oldestIp);
  }
}

function createFeedbackRateLimiter({ maxRequests, windowMs, maxWindows }) {
  const windows = new Map();

  return {
    check(ip) {
      const now = Date.now();
      for (const [windowIp, window] of windows) {
        if (now - window.windowStart >= windowMs) {
          windows.delete(windowIp);
        }
      }

      const existing = windows.get(ip);

      if (!existing || now - existing.windowStart >= windowMs) {
        if (!existing && windows.size >= maxWindows) {
          evictOldestWindow(windows);
        }
        windows.set(ip, { windowStart: now, count: 1 });
        return { allowed: true, retryAfterMs: 0 };
      }

      if (existing.count >= maxRequests) {
        return {
          allowed: false,
          retryAfterMs: Math.max(0, windowMs - (now - existing.windowStart)),
        };
      }

      existing.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

function getStaticPath(urlPath, staticDir) {
  const decodedPath = decodeURIComponent(urlPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  return path.join(staticDir, normalizedPath);
}

function applyStaticFileHeaders(res, filePath, relativePath, size) {
  applySecurityHeaders(res);

  if (
    relativePath.startsWith(`assets${path.sep}`) ||
    relativePath.startsWith(`updates${path.sep}_astro${path.sep}`)
  ) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  const contentType =
    normalizedRelativePath === APPLE_APP_SITE_ASSOCIATION_PATH.slice(1)
      ? 'application/json; charset=utf-8'
      : contentTypes.get(path.extname(filePath));
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  res.setHeader('Content-Length', size);
}

export async function serveFile(
  req,
  res,
  { createFileStream, filePath, fileStat: suppliedFileStat, staticDir, statusCode = 200 }
) {
  const relativePath = path.relative(staticDir, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  let stat = suppliedFileStat;
  try {
    stat ??= await fs.stat(filePath);
    if (!stat.isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }
  } catch {
    sendText(res, 404, 'Not found');
    return;
  }

  if (req.method === 'HEAD') {
    applyStaticFileHeaders(res, filePath, relativePath, stat.size);
    if (statusCode >= 400) res.setHeader('Cache-Control', 'no-store');
    res.writeHead(statusCode);
    res.end();
    return;
  }

  let fileStream;

  try {
    fileStream = createFileStream(filePath);
    await once(fileStream, 'open');
  } catch (error) {
    console.warn('Static file stream failed:', {
      error: error instanceof Error ? error.message : String(error),
      path: relativePath,
    });
    sendText(res, 500, 'Internal server error');
    return;
  }

  try {
    applyStaticFileHeaders(res, filePath, relativePath, stat.size);
    if (statusCode >= 400) res.setHeader('Cache-Control', 'no-store');
    res.writeHead(statusCode);
    await pipeline(fileStream, res);
  } catch (error) {
    fileStream.destroy();

    if (error && typeof error === 'object' && error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      return;
    }

    console.warn('Static file stream failed:', {
      error: error instanceof Error ? error.message : String(error),
      path: relativePath,
    });
  }
}

const privateProxyRequestHeaders = [
  'authorization',
  'cf-connecting-ip',
  'cookie',
  'forwarded',
  'proxy-authorization',
  'referer',
  'true-client-ip',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
];

async function proxyPostHog(req, res, url) {
  const proxyTarget = analyticsProxyTarget(url, process.env);
  if (!proxyTarget) {
    sendText(res, 404, 'Not found');
    return;
  }

  const headers = new Headers(req.headers);
  for (const header of privateProxyRequestHeaders) {
    headers.delete(header);
  }
  headers.set('host', proxyTarget.host);

  const hasRequestBody = req.method !== 'GET' && req.method !== 'HEAD';
  const bodyLimitBytes = getPositiveIntegerEnv(
    'GLIMMER_PROXY_BODY_LIMIT_BYTES',
    DEFAULT_GLIMMER_PROXY_BODY_LIMIT_BYTES
  );
  const bodyTimeoutMs = getPositiveIntegerEnv(
    'GLIMMER_PROXY_BODY_TIMEOUT_MS',
    DEFAULT_GLIMMER_PROXY_BODY_TIMEOUT_MS
  );
  const abortController = new AbortController();
  let timeoutId;
  let requestBody;

  if (hasRequestBody) {
    try {
      rejectDeclaredOversizedBody(req, bodyLimitBytes);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        sendText(res, 413, 'Request body too large');
        return;
      }

      sendText(res, 400, 'Invalid request body');
      return;
    }

    let streamedBytes = 0;
    const countedBody = new Transform({
      transform(chunk, _encoding, callback) {
        streamedBytes += chunk.length;

        if (streamedBytes > bodyLimitBytes) {
          const error = new RequestBodyTooLargeError();
          abortController.abort(error);
          callback(error);
          return;
        }

        callback(null, chunk);
      },
    });

    requestBody = addAbortSignal(abortController.signal, req.pipe(countedBody));

    timeoutId = setTimeout(() => {
      abortController.abort(new RequestBodyTimeoutError());
    }, bodyTimeoutMs);
    timeoutId.unref?.();

    requestBody.once('end', () => clearTimeout(timeoutId));
    requestBody.once('close', () => clearTimeout(timeoutId));
  }

  const upstreamTimeout = setTimeout(
    () => {
      abortController.abort(new Error('PostHog upstream request timed out'));
    },
    getPositiveIntegerEnv('GLIMMER_PROXY_REQUEST_TIMEOUT_MS', 10_000)
  );
  upstreamTimeout.unref?.();

  try {
    let response;
    try {
      response = await fetch(proxyTarget, {
        method: req.method,
        headers,
        body: hasRequestBody ? requestBody : undefined,
        duplex: hasRequestBody ? 'half' : undefined,
        signal: abortController.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      const abortReason = abortController.signal.reason;

      if (
        error instanceof RequestBodyTooLargeError ||
        abortReason instanceof RequestBodyTooLargeError
      ) {
        sendText(res, 413, 'Request body too large');
        return;
      }

      if (
        error instanceof RequestBodyTimeoutError ||
        abortReason instanceof RequestBodyTimeoutError
      ) {
        sendText(res, 408, 'Request body timed out');
        return;
      }

      console.warn('PostHog proxy request failed:', {
        path: url.pathname,
        target: proxyTarget.origin,
        error: error instanceof Error ? error.message : String(error),
        clientRequestDestroyed: req.destroyed,
      });
      applySecurityHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    clearTimeout(timeoutId);

    applySecurityHeaders(res);
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key)) {
        res.setHeader(key, value);
      }
    });
    res.writeHead(response.status);

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const body = response.body;
    if (!body) {
      res.end();
      return;
    }

    try {
      await body.pipeTo(
        new WritableStream({
          write(chunk) {
            res.write(chunk);
          },
          close() {
            res.end();
          },
          abort() {
            res.destroy();
          },
        }),
        { signal: abortController.signal }
      );
    } catch (error) {
      console.warn('PostHog proxy response stream failed:', {
        path: url.pathname,
        target: proxyTarget.origin,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!res.headersSent) {
        applySecurityHeaders(res);
        res.writeHead(204);
        res.end();
        return;
      }

      res.destroy(error instanceof Error ? error : undefined);
    }
  } finally {
    clearTimeout(upstreamTimeout);
    clearTimeout(timeoutId);
  }
}

async function readJsonBody(req, limitBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > limitBytes) {
      throw new RequestBodyTooLargeError();
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks, totalBytes).toString('utf8');
  if (!rawBody) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new MalformedJsonError();
  }
}

async function handleFeedback(req, res, { rateLimiter, trustedProxyHops }) {
  let body;

  applyFeedbackCorsHeaders(req, res);

  if (req.method === 'POST') {
    if (!isJsonContentType(req.headers['content-type'])) {
      sendJson(res, 415, { error: 'Unsupported content type' });
      return;
    }

    const rateLimit = rateLimiter.check(getFeedbackClientIp(req, trustedProxyHops));
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil(rateLimit.retryAfterMs / 1000);
      sendJson(
        res,
        429,
        {
          error: 'Too many requests. Please try again later.',
          retryAfter,
        },
        {
          'Retry-After': String(retryAfter),
        }
      );
      return;
    }

    const bodyLimitBytes = getPositiveIntegerEnv(
      'FEEDBACK_BODY_LIMIT_BYTES',
      DEFAULT_FEEDBACK_BODY_LIMIT_BYTES
    );

    try {
      rejectDeclaredOversizedBody(req, bodyLimitBytes);
      body = await readJsonBody(req, bodyLimitBytes);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        sendJson(res, 413, { error: 'Request body too large' });
        return;
      }

      if (error instanceof MalformedJsonError) {
        sendJson(res, 400, { error: error.message });
        return;
      }

      throw error;
    }
  }

  await sendFeedbackHandler(
    {
      method: req.method,
      headers: req.headers,
      body,
    },
    {
      setHeader: (...args) => res.setHeader(...args),
      status(code) {
        res.statusCode = code;
        return this;
      },
      json(payload) {
        if (!res.hasHeader('Content-Type')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        applySecurityHeaders(res);
        res.end(JSON.stringify(payload));
        return this;
      },
      end(payload) {
        applySecurityHeaders(res);
        res.end(payload);
        return this;
      },
    }
  );
}

export function createLocalBuildRequestHandler({
  createFileStream = createReadStream,
  staticDir = distDir,
} = {}) {
  const feedbackLimiterConfig = getFeedbackLimiterConfig();
  const feedbackRateLimiter = createFeedbackRateLimiter(feedbackLimiterConfig);

  return async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (url.pathname === '/api/send-feedback') {
        await handleFeedback(req, res, {
          rateLimiter: feedbackRateLimiter,
          trustedProxyHops: feedbackLimiterConfig.trustedProxyHops,
        });
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        applySecurityHeaders(res);
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      if (url.pathname.startsWith('/glimmer/')) {
        await proxyPostHog(req, res, url);
        return;
      }

      const publicPage = PUBLIC_PAGE_PATHS.find(
        route => url.pathname === route || url.pathname === `${route}/`
      );
      if (publicPage) {
        await serveFile(req, res, {
          createFileStream,
          filePath: path.join(staticDir, `${publicPage.slice(1)}.html`),
          staticDir,
        });
        return;
      }

      const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
      const staticPath = getStaticPath(requestedPath, staticDir);

      try {
        const stat = await fs.stat(staticPath);
        if (stat.isFile()) {
          await serveFile(req, res, {
            createFileStream,
            filePath: staticPath,
            fileStat: stat,
            staticDir,
          });
          return;
        }
        if (
          stat.isDirectory() &&
          (url.pathname === '/updates' || url.pathname.startsWith('/updates/'))
        ) {
          if (!url.pathname.endsWith('/')) {
            applySecurityHeaders(res);
            res.writeHead(308, { Location: `${url.pathname}/${url.search}` });
            res.end();
            return;
          }
          await serveFile(req, res, {
            createFileStream,
            filePath: path.join(staticPath, 'index.html'),
            staticDir,
          });
          return;
        }
      } catch {
        // Fall through to the SPA shell.
      }

      if (isStaticFileRequest(url.pathname)) {
        sendText(res, 404, 'Not found');
        return;
      }

      if (!isKnownAppRoute(url.pathname)) {
        await serveFile(req, res, {
          createFileStream,
          filePath: path.join(staticDir, '404.html'),
          staticDir,
          statusCode: 404,
        });
        return;
      }

      await serveFile(req, res, {
        createFileStream,
        filePath: path.join(staticDir, 'index.html'),
        staticDir,
      });
    } catch (error) {
      if (error instanceof URIError) {
        sendText(res, 400, 'Bad request');
        return;
      }

      console.error(
        'Local build server error:',
        error instanceof Error ? error.message : String(error)
      );
      applySecurityHeaders(res);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  };
}

export const server = http.createServer(createLocalBuildRequestHandler());

export function createGracefulShutdownHandler(serverToClose, options = {}) {
  const { exit = process.exit, forceCloseTimeoutMs = 10_000, logger = console } = options;
  let isShuttingDown = false;

  return signal => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    logger.log(`Received ${signal}; shutting down local build server`);

    const forceCloseTimeout = setTimeout(() => {
      logger.error(`Local build server did not stop within ${forceCloseTimeoutMs}ms; forcing exit`);
      serverToClose.closeAllConnections?.();
      exit(1);
    }, forceCloseTimeoutMs);
    forceCloseTimeout.unref?.();

    serverToClose.close(error => {
      clearTimeout(forceCloseTimeout);

      if (error) {
        logger.error(
          'Local build server failed to close cleanly:',
          error instanceof Error ? error.message : String(error)
        );
        exit(1);
        return;
      }

      logger.log('Local build server stopped');
      exit(0);
    });

    serverToClose.closeIdleConnections?.();
  };
}

export function installGracefulShutdown(serverToClose, options) {
  const shutdown = createGracefulShutdownHandler(serverToClose, options);

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return shutdown;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, () => {
    console.log(`Organized Glitter server listening on port ${port}`);
  });
  installGracefulShutdown(server);
}
