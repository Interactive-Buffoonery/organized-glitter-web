import { afterEach, describe, expect, it, vi } from 'vitest';
import { proxyPosthog } from './posthog.js';
import handler from './handler.js';

afterEach(() => vi.unstubAllGlobals());

describe('Spacefast PostHog proxy', () => {
  it('routes same-origin analytics requests through the runtime entry', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', send);

    const response = await handler.fetch(
      new Request('https://organizedglitter.app/glimmer/e/?v=3'),
      {}
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

    const response = await proxyPosthog(new Request(`https://organizedglitter.app${path}`));

    expect(response.status).toBe(200);
    expect(send.mock.calls[0][0].toString()).toBe(target);
  });

  it.each(['/glimmer//evil.example/x', '/glimmer/%2F%2Fevil.example/x'])(
    'keeps %s on the PostHog host',
    async path => {
      const send = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', send);

      expect((await proxyPosthog(new Request(`https://organizedglitter.app${path}`))).status).toBe(
        204
      );
      expect(send.mock.calls[0][0].origin).toBe('https://us.i.posthog.com');
    }
  );

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

    expect((await proxyPosthog(request)).status).toBe(204);
    const options = send.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(new TextDecoder().decode(options.body)).toBe('{"event":"migration_test"}');
    expect([...options.headers.keys()]).toEqual(['content-type']);
  });

  it('rejects oversized bodies and makes upstream errors best effort', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network failed'));
    vi.stubGlobal('fetch', send);

    const oversized = await proxyPosthog(
      new Request('https://organizedglitter.app/glimmer/e/', {
        method: 'POST',
        body: 'x'.repeat(1_048_577),
      })
    );
    expect(oversized.status).toBe(413);
    expect(send).not.toHaveBeenCalled();

    const failed = await proxyPosthog(new Request('https://organizedglitter.app/glimmer/decide/'));
    expect(failed.status).toBe(204);
  });
});
