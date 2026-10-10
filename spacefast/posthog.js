import { analyticsProxyTarget } from '../server/deployment-config.js';

const BODY_LIMIT = 1_048_576;
const BODY_TIMEOUT = Symbol('body-timeout');
const REQUEST_TIMEOUT_MS = 10_000;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST']);
const REQUEST_HEADERS = ['accept', 'content-type'];
const RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'last-modified'];

async function boundedBody(request) {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null && Number(declaredLength) > BODY_LIMIT) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, REQUEST_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) return BODY_TIMEOUT;
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function proxyPosthog(request, env = {}) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response('Method not allowed', { status: 405 });
  }
  const target = analyticsProxyTarget(new URL(request.url), env);
  if (!target) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method === 'POST';
  let body;
  try {
    body = hasBody ? await boundedBody(request) : undefined;
  } catch {
    return new Response('Invalid request body', { status: 400 });
  }
  if (body === BODY_TIMEOUT) return new Response('Request body timed out', { status: 408 });
  if (body === null) return new Response('Request body too large', { status: 413 });

  const abortController = new AbortController();
  let upstreamTimeout;
  function resetUpstreamTimeout() {
    clearTimeout(upstreamTimeout);
    upstreamTimeout = setTimeout(() => {
      abortController.abort(new Error('PostHog upstream request timed out'));
    }, REQUEST_TIMEOUT_MS);
    upstreamTimeout.unref?.();
  }
  resetUpstreamTimeout();

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: abortController.signal,
    });
    resetUpstreamTimeout();
    if (upstream.status >= 300 && upstream.status < 400) {
      clearTimeout(upstreamTimeout);
      await upstream.body?.cancel();
      return new Response(null, { status: 204 });
    }
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (request.method === 'HEAD' || !upstream.body) {
      clearTimeout(upstreamTimeout);
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status, headers: responseHeaders });
    }

    const reader = upstream.body.getReader();
    let finished = false;
    let onAbort;
    function finish() {
      finished = true;
      clearTimeout(upstreamTimeout);
      abortController.signal.removeEventListener('abort', onAbort);
    }
    const responseBody = new ReadableStream({
      start(controller) {
        onAbort = () => {
          finish();
          controller.error(abortController.signal.reason);
          void reader.cancel(abortController.signal.reason).catch(() => {});
        };
        abortController.signal.addEventListener('abort', onAbort, { once: true });
      },
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (finished) return;
          if (done) {
            finish();
            reader.releaseLock();
            controller.close();
          } else {
            resetUpstreamTimeout();
            controller.enqueue(value);
          }
        } catch (error) {
          if (finished) return;
          finish();
          controller.error(error);
        }
      },
      async cancel(reason) {
        finish();
        abortController.abort(reason);
        await reader.cancel(reason);
      },
    });
    return new Response(responseBody, { status: upstream.status, headers: responseHeaders });
  } catch {
    clearTimeout(upstreamTimeout);
    abortController.abort();
    return new Response(null, { status: 204 });
  }
}
