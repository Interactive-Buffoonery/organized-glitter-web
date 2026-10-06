import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Recovery = {
  start: (config: {
    entry: string;
    resources: string[];
    graphs?: Record<string, string[]>;
  }) => Promise<void>;
  recoverChunk: (error: unknown) => Promise<boolean>;
  resetReloadBudget: () => void;
  readonly state: string;
};

const config = {
  entry: '/assets/main-example.js',
  resources: ['/assets/dependency-example.js', '/assets/main-example.css'],
};
const response = (status = 200, retryAfter?: string, contentType = 'text/javascript') =>
  new Response(status === 200 ? '/* resource */' : '', {
    status,
    headers: {
      'Content-Type': contentType,
      ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
    },
  });

describe('early resource recovery', () => {
  let recovery: Recovery;
  let reload: ReturnType<typeof vi.fn>;
  let fetchResource: ReturnType<typeof vi.fn>;
  let failure: ReturnType<typeof vi.fn>;
  let storage: Storage;

  const boot = () => {
    const page = {
      location: { origin: 'http://localhost:3000', reload },
      sessionStorage: storage,
      dispatchEvent: window.dispatchEvent.bind(window),
      addEventListener: window.addEventListener.bind(window),
      __OG_RESOURCE_RECOVERY__: undefined as Recovery | undefined,
    };
    new Script(
      readFileSync(resolve(process.cwd(), 'public/js/bootstrap-resources.js'), 'utf8')
    ).runInNewContext({
      window: page,
      document,
      fetch: fetchResource,
      URL,
      AbortController,
      CustomEvent,
      setTimeout,
      clearTimeout,
      Date,
      Math,
    });
    recovery = page.__OG_RESOURCE_RECOVERY__!;
  };

  const finish = async () => {
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T18:00:00Z'));
    document.body.innerHTML = '<div id="root"></div>';
    sessionStorage.clear();
    storage = sessionStorage;
    reload = vi.fn();
    failure = vi.fn();
    window.addEventListener('og:resource-failure', failure);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, 'appendChild').mockImplementation(node => {
      const appended = append(node);
      if (node instanceof HTMLLinkElement) {
        queueMicrotask(() => node.dispatchEvent(new Event('load')));
      }
      return appended;
    });
    fetchResource = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(response(200, undefined, url.endsWith('.css') ? 'text/css' : undefined))
      );
  });

  afterEach(() => {
    window.removeEventListener('og:resource-failure', failure);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.head.querySelectorAll('[data-og-bootstrap]').forEach(node => node.remove());
    sessionStorage.clear();
  });

  it.each([config.entry, config.resources[0], config.resources[1]])(
    'retries a transient 429 on %s before executing the module graph',
    async failedUrl => {
      let failed = false;
      fetchResource.mockImplementation((url: string) => {
        if (url.endsWith(failedUrl) && !failed) {
          failed = true;
          return Promise.resolve(response(429, '2'));
        }
        return Promise.resolve(
          response(200, undefined, url.endsWith('.css') ? 'text/css' : undefined)
        );
      });
      boot();
      const started = recovery.start(config);
      await finish();
      expect(document.querySelector('script[type="module"]')).toBeNull();
      await vi.advanceTimersByTimeAsync(2000);
      await started;
      const module = document.querySelector<HTMLScriptElement>('script[type="module"]');
      expect(module?.getAttribute('src')).toBe(config.entry);
      expect(fetchResource.mock.calls.filter(([url]) => url.endsWith(failedUrl))).toHaveLength(2);
      expect(failure).not.toHaveBeenCalled();
      expect(reload).not.toHaveBeenCalled();
    }
  );

  it.each(['3', 'Tue, 06 Oct 2026 18:00:03 GMT'])(
    'honors Retry-After %s without retrying early',
    async retryAfter => {
      fetchResource.mockResolvedValueOnce(response(503, retryAfter));
      boot();
      const started = recovery.start(config);
      await finish();
      await vi.advanceTimersByTimeAsync(2999);
      expect(fetchResource).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await started;
      expect(recovery.state).toBe('started');
    }
  );

  it('exhausts three attempts on persistent failure without executing or reloading', async () => {
    fetchResource.mockResolvedValue(response(503));
    boot();
    const started = recovery.start(config);
    await vi.advanceTimersByTimeAsync(5000);
    await started;
    expect(fetchResource).toHaveBeenCalledTimes(3);
    expect(recovery.state).toBe('failed');
    expect(failure).toHaveBeenCalledTimes(1);
    expect(document.querySelector('script[type="module"]')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('fails without ignoring a Retry-After longer than the recovery deadline', async () => {
    fetchResource.mockResolvedValue(response(429, '120'));
    boot();
    await recovery.start(config);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(recovery.state).toBe('failed');
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 410])('does not retry permanent HTTP %s', async status => {
    fetchResource.mockResolvedValue(response(status));
    boot();
    await recovery.start(config);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries a dropped connection and uses reload cache mode only on the retry', async () => {
    fetchResource.mockRejectedValueOnce(new TypeError('Network request failed'));
    boot();
    const started = recovery.start(config);
    await vi.advanceTimersByTimeAsync(1000);
    await started;
    expect(fetchResource.mock.calls[0][1]).toMatchObject({
      cache: 'default',
      credentials: 'same-origin',
    });
    expect(fetchResource.mock.calls[1][1]).toMatchObject({ cache: 'reload' });
    expect(recovery.state).toBe('started');
  });

  it('treats HTML fallback content as permanent failure', async () => {
    fetchResource.mockResolvedValue(response(200, undefined, 'text/html'));
    boot();
    await recovery.start(config);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(recovery.state).toBe('failed');
  });

  it('does not initialize twice for duplicate start calls', async () => {
    boot();
    const first = recovery.start(config);
    const second = recovery.start(config);
    expect(second).toBe(first);
    await first;
    await recovery.start(config);
    expect(document.querySelectorAll('script[type="module"]')).toHaveLength(1);
    expect(fetchResource).toHaveBeenCalledTimes(3);
  });

  it('cancels recovery when the app becomes ready during backoff', async () => {
    fetchResource.mockResolvedValueOnce(response(429, '2'));
    boot();
    const started = recovery.start(config);
    await finish();
    document.getElementById('root')!.setAttribute('data-app-ready', 'true');
    await vi.advanceTimersByTimeAsync(2000);
    await started;
    expect(document.querySelector('script[type="module"]')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it('uses a fresh document when native execution fails after preflight', async () => {
    boot();
    await recovery.start(config);
    document.querySelector('script[type="module"]')!.dispatchEvent(new Event('error'));
    await finish();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('script[type="module"]')).toHaveLength(1);
  });

  it('bounds native graph reloads across fresh documents', async () => {
    for (let documentNumber = 0; documentNumber < 3; documentNumber++) {
      document.body.innerHTML = '<div id="root"></div>';
      document.head.querySelectorAll('[data-og-bootstrap]').forEach(node => node.remove());
      boot();
      await recovery.start(config);
      document.querySelector('script[type="module"]')!.dispatchEvent(new Event('error'));
      await finish();
    }
    expect(reload).toHaveBeenCalledTimes(2);
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('fails closed on automatic reload when session storage is unavailable', async () => {
    storage = {
      getItem: () => {
        throw new Error('Storage disabled');
      },
    } as unknown as Storage;
    boot();
    await recovery.start(config);
    document.querySelector('script[type="module"]')!.dispatchEvent(new Event('error'));
    await finish();
    expect(reload).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('does not replenish an exhausted reload budget when time passes', async () => {
    sessionStorage.setItem(
      'og-resource-reloads-v1',
      JSON.stringify({ attempts: 2, expiresAt: Date.now() + 5 * 60 * 1000 })
    );
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
    boot();
    await recovery.start(config);
    document.querySelector('script[type="module"]')!.dispatchEvent(new Event('error'));
    await finish();
    expect(reload).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('allows a new reload budget after explicit manual recovery', async () => {
    sessionStorage.setItem('og-resource-reloads-v1', JSON.stringify({ attempts: 2 }));
    boot();
    recovery.resetReloadBudget();
    await recovery.start(config);
    document.querySelector('script[type="module"]')!.dispatchEvent(new Event('error'));
    await finish();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recovers a dynamic import after observing its transient status', async () => {
    fetchResource.mockResolvedValueOnce(response(429, '2'));
    boot();
    const recovered = recovery.recoverChunk(
      new Error(
        'Failed to fetch dynamically imported module: http://localhost:3000/assets/page-example.js'
      )
    );
    await finish();
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await recovered).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous dynamic failures into one recovery', async () => {
    boot();
    const error = new Error('Unable to preload CSS for /assets/page-example.css');
    const first = recovery.recoverChunk(error);
    const second = recovery.recoverChunk(error);
    expect(first).toBe(second);
    expect(await first).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchResource).toHaveBeenCalledTimes(1);
  });

  it('does not assume a healthy dynamic entry means its unknown graph is healthy', async () => {
    boot();
    const error = new Error('Failed to fetch dynamically imported module: /assets/page-example.js');
    expect(await recovery.recoverChunk(error)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('checks the dynamic static graph and stops on a permanent dependency failure', async () => {
    boot();
    await recovery.start({
      ...config,
      graphs: { '/assets/page-example.js': ['/assets/dependency-example.js'] },
    });
    fetchResource.mockClear();
    fetchResource.mockImplementation((url: string) =>
      Promise.resolve(response(url.endsWith('/assets/dependency-example.js') ? 404 : 200))
    );
    const error = new Error('Failed to fetch dynamically imported module: /assets/page-example.js');
    expect(await recovery.recoverChunk(error)).toBe(false);
    expect(fetchResource.mock.calls.map(([url]) => url)).toContain('/assets/dependency-example.js');
    expect(reload).not.toHaveBeenCalled();
  });

  it('retries a transient dynamic dependency even when Chromium names the entry', async () => {
    boot();
    await recovery.start({
      ...config,
      graphs: { '/assets/page-example.js': ['/assets/dependency-example.js'] },
    });
    fetchResource.mockClear();
    fetchResource.mockResolvedValueOnce(response(503, '2'));
    const recovered = recovery.recoverChunk(
      new Error('Failed to fetch dynamically imported module: /assets/page-example.js')
    );
    await finish();
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await recovered).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Failed to fetch dynamically imported module: http://localhost:3000/assets/missing.js',
    'Unable to preload CSS for /assets/missing.css',
  ])('does not reload a permanent dynamic resource failure: %s', async message => {
    fetchResource.mockResolvedValue(response(404));
    boot();
    expect(await recovery.recoverChunk(new Error(message))).toBe(false);
    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    'An API request failed for assets/example',
    'Failed to fetch dynamically imported module: https://other.invalid/assets/page.js',
    'Failed to fetch dynamically imported module: http://localhost:3000/assets/page.js?token=private',
    'Failed to fetch dynamically imported module: http://localhost:3000/private/page.js',
  ])('ignores unrelated or unsafe dynamic errors: %s', async message => {
    boot();
    expect(await recovery.recoverChunk(new Error(message))).toBe(false);
    expect(fetchResource).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('aborts stalled requests and exhausts the time budget', async () => {
    fetchResource.mockImplementation(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal!.addEventListener('abort', () => reject(new TypeError('Network timeout')));
        })
    );
    boot();
    const started = recovery.start(config);
    await vi.advanceTimersByTimeAsync(25000);
    await started;
    expect(fetchResource).toHaveBeenCalledTimes(3);
    expect(recovery.state).toBe('failed');
    expect(failure).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsafe initial graph without making requests', async () => {
    boot();
    await recovery.start({ entry: 'https://other.invalid/assets/main.js', resources: [] });
    expect(fetchResource).not.toHaveBeenCalled();
    expect(recovery.state).toBe('failed');
  });

  it('does not reload after a late ready signal during native graph recovery', async () => {
    boot();
    await recovery.start(config);
    fetchResource.mockResolvedValueOnce(response(429, '2'));
    document.querySelector('script[type="module"]')!.dispatchEvent(new Event('error'));
    await finish();
    document.getElementById('root')!.setAttribute('data-app-ready', 'true');
    await vi.advanceTimersByTimeAsync(2000);
    expect(reload).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it('waits for DOM parsing before starting from inline head configuration', async () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const node = document.createElement('script');
    node.type = 'application/json';
    node.id = 'app-bootstrap-resources';
    node.textContent = JSON.stringify(config);
    document.body.appendChild(node);
    boot();
    await finish();
    expect(fetchResource).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await finish();
    expect(recovery.state).toBe('started');
  });

  it('starts from the inert JSON integration contract', async () => {
    const node = document.createElement('script');
    node.type = 'application/json';
    node.id = 'app-bootstrap-resources';
    node.textContent = JSON.stringify(config);
    document.body.appendChild(node);
    boot();
    await finish();
    expect(document.querySelector('script[type="module"]')?.getAttribute('src')).toBe(config.entry);
  });
});
