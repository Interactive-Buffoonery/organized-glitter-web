const BODY_LIMIT = 1_048_576;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST']);
const REQUEST_HEADERS = ['accept', 'content-type'];
const RESPONSE_HEADERS = ['content-type', 'cache-control', 'etag', 'last-modified'];

function targetFor(url) {
  let origin = 'https://us.i.posthog.com';
  let pathname;
  if (url.pathname.startsWith('/glimmer/static/')) {
    origin = 'https://us-assets.i.posthog.com';
    pathname = url.pathname.replace('/glimmer/static/', '/static/');
  } else if (url.pathname.startsWith('/glimmer/array/')) {
    origin = 'https://us-assets.i.posthog.com';
    pathname = url.pathname.replace('/glimmer/array/', '/array/');
  } else {
    pathname = url.pathname.replace('/glimmer/', '/');
  }
  const target = new URL(origin);
  target.pathname = pathname;
  target.search = url.search;
  return target;
}

async function boundedBody(request) {
  const declaredLength = request.headers.get('Content-Length');
  if (declaredLength !== null && Number(declaredLength) > BODY_LIMIT) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
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

export async function proxyPosthog(request) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return new Response('Method not allowed', { status: 405 });
  }
  const target = targetFor(new URL(request.url));
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method === 'POST';
  const body = hasBody ? await boundedBody(request) : undefined;
  if (body === null) return new Response('Request body too large', { status: 413 });

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) return new Response(null, { status: 204 });
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return new Response(null, { status: 204 });
  }
}
