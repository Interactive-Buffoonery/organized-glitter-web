import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyPosthog } from './posthog.js';
import handler from './handler.js';

const proxyEnv = {
  POSTHOG_PROXY_HOST: 'https://us.i.posthog.com',
  POSTHOG_PROXY_ASSET_HOST: 'https://us-assets.i.posthog.com',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Spacefast PostHog proxy', () => {
  it('routes same-origin analytics requests through the runtime entry', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);

    const response = await handler.fetch(
      new Request('https://organizedglitter.app/glimmer/e/?v=3'),
      proxyEnv
    );

    expect(response.status).toBe(204);
    expect(send.mock.calls[0][0].toString()).toBe('https://us.i.posthog.com/e/?v=3');
  });

  it.each([
    ['/glimmer/e/?v=3', 'https://us.i.posthog.com/e/?v=3'],
    ['/glimmer/decide/?v=2', 'https://us.i.posthog.com/decide/?v=2'],
    ['/glimmer/static/array.js?v=1', 'https://us-assets.i.posthog.com/static/array.js?v=1'],
    ['/glimmer/array/1.js', 'https://us-assets.i.posthog.com/array/1.js'],
  ])('maps %s to the allowed upstream', async (path, target) => {
    const send = vi
      .fn()
      .mockResolvedValue(
        new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } })
      );
    vi.stubGlobal('fetch', send);

    const response = await proxyPosthog(new Request(`https://app.example.test${path}`), proxyEnv);

    expect(response.status).toBe(200);
    expect(send.mock.calls[0][0].toString()).toBe(target);
  });

  it.each(['/glimmer/%2F%2Fevil.example/x'])('keeps %s on the PostHog host', async path => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);

    expect(
      (await proxyPosthog(new Request(`https://app.example.test${path}`), proxyEnv)).status
    ).toBe(204);
    expect(send.mock.calls[0][0].origin).toBe('https://us.i.posthog.com');
  });

  it('rejects a protocol-relative path without sending a request', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    expect(
      (
        await proxyPosthog(
          new Request('https://app.example.test/glimmer//evil.example/x'),
          proxyEnv
        )
      ).status
    ).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });

  it('forwards capture body without visitor credentials or forwarding headers', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);
    const request = new Request('https://organizedglitter.app/glimmer/e/?v=3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=private',
        Authorization: 'Bearer private',
        'X-Forwarded-For': '192.0.2.4',
        Referer: 'https://organizedglitter.app/private',
      },
      body: '{"event":"migration_test"}',
    });

    expect((await proxyPosthog(request, proxyEnv)).status).toBe(204);
    const options = send.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(new TextDecoder().decode(options.body)).toBe('{"event":"migration_test"}');
    expect([...options.headers.keys()]).toEqual(['content-type']);
  });

  it('cancels a stalled request body after ten seconds without contacting upstream', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const cancel = vi.fn();
    vi.stubGlobal('fetch', send);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    const pending = proxyPosthog(
      new Request('https://app.example.test/glimmer/e/', {
        method: 'POST',
        body: stream,
        duplex: 'half',
      }),
      proxyEnv
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cancel).toHaveBeenCalledOnce();
    expect((await pending).status).toBe(408);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['GET', 'POST'])(
    'preserves an active upstream %s response beyond ten seconds',
    async method => {
      vi.useFakeTimers();
      vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error('deadline exceeded')), ms);
        return controller.signal;
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url, options) => {
          let index = 0;
          const chunks = ['first', 'second', 'third'];
          return new Response(
            new ReadableStream({
              start(controller) {
                options.signal.addEventListener(
                  'abort',
                  () => controller.error(options.signal.reason),
                  { once: true }
                );
              },
              async pull(controller) {
                await new Promise(resolve => setTimeout(resolve, 6_000));
                controller.enqueue(new TextEncoder().encode(chunks[index++]));
                if (index === chunks.length) controller.close();
              },
            })
          );
        })
      );
      const response = await proxyPosthog(
        new Request('https://app.example.test/glimmer/static/array.js', {
          method,
          body: method === 'POST' ? '{}' : undefined,
        }),
        proxyEnv
      );
      const result = response.text();
      const outcome = result.then(
        body => ({ body }),
        error => ({ error })
      );
      await vi.advanceTimersByTimeAsync(18_000);
      expect(await outcome).toEqual({ body: 'firstsecondthird' });
    }
  );

  it('times out stalled upstream headers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options) =>
          new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {
              once: true,
            });
          })
      )
    );
    const pending = proxyPosthog(new Request('https://app.example.test/glimmer/e/'), proxyEnv);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).status).toBe(204);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a response that stops delivering chunks', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('first'));
              },
              cancel,
            })
          )
      )
    );
    const response = await proxyPosthog(
      new Request('https://app.example.test/glimmer/static/array.js'),
      proxyEnv
    );
    const outcome = response.text().then(
      body => ({ body }),
      error => ({ error })
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await outcome).error.message).toBe('PostHog upstream request timed out');
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline and cancels upstream when the client cancels', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let signal;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, options) => {
        signal = options.signal;
        return new Response(
          new ReadableStream({
            start(controller) {
              options.signal.addEventListener(
                'abort',
                () => controller.error(options.signal.reason),
                { once: true }
              );
            },
            cancel,
          })
        );
      })
    );
    const response = await proxyPosthog(
      new Request('https://app.example.test/glimmer/static/array.js'),
      proxyEnv
    );
    await response.body.cancel('client disconnected');
    expect(signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['HEAD', 'redirect', 'empty'])('clears the deadline for a %s response', async kind => {
    vi.useFakeTimers();
    const upstream =
      kind === 'empty'
        ? new Response(null, { status: 204 })
        : new Response('body', { status: kind === 'redirect' ? 302 : 200 });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => upstream)
    );
    const response = await proxyPosthog(
      new Request('https://app.example.test/glimmer/static/array.js', {
        method: kind === 'HEAD' ? 'HEAD' : 'GET',
      }),
      proxyEnv
    );
    expect(await response.text()).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects oversized bodies and makes upstream errors best effort', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network failed'));
    vi.stubGlobal('fetch', send);

    const oversized = await proxyPosthog(
      new Request('https://organizedglitter.app/glimmer/e/', {
        method: 'POST',
        body: 'x'.repeat(1_048_577),
      }),
      proxyEnv
    );
    expect(oversized.status).toBe(413);
    expect(send).not.toHaveBeenCalled();

    const failed = await proxyPosthog(
      new Request('https://app.example.test/glimmer/decide/'),
      proxyEnv
    );
    expect(failed.status).toBe(204);
  });
});
