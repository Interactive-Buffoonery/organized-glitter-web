import { expect, test as base, type BrowserContext, type Request } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

type ManifestChunk = {
  file: string;
  name?: string;
  imports?: string[];
  css?: string[];
};

type ResourceRequest = {
  path: string;
  query: string;
  method: string;
  type: string;
  at: number;
  injectedStatus?: number | 'network';
  status?: number;
};

type ResourceFault = {
  path: string;
  status: 429 | 503 | 404 | 'network';
  requestType?: string;
  failures?: number;
  retryAfter?: string;
  blockedUntil?: number;
  retryAfterDateMs?: number;
};

export const RECOVERY_TIMEOUT = 45_000;
export const MAX_RESOURCE_REQUESTS = 8;
export const QUIET_PERIOD = 3_000;

async function readAppAssets() {
  const manifest = JSON.parse(
    await readFile(new URL('../../dist/manifest.json', import.meta.url), 'utf8')
  ) as Record<string, ManifestChunk>;
  const app =
    manifest['app.html'] ||
    manifest['index.html'] ||
    Object.values(manifest).find(chunk => chunk.name === 'main');
  expect(app, 'built manifest must expose the app module').toBeDefined();
  if (!app) throw new Error('Built app module is missing from dist/manifest.json');
  expect(app?.imports?.length, 'the app must have a real imported module to fault').toBeGreaterThan(
    0
  );

  const graph = new Set<string>();
  const styles = new Set(app.css || []);
  const visit = (key: string) => {
    const chunk = manifest[key];
    expect(chunk, `missing manifest dependency: ${key}`).toBeDefined();
    if (graph.has(chunk.file)) return;
    graph.add(chunk.file);
    for (const css of chunk.css || []) styles.add(css);
    for (const dependency of chunk.imports || []) visit(dependency);
  };
  for (const key of app.imports || []) visit(key);

  const dependencies = [...graph].map(file => `/${file}`);
  const css = [...styles].map(file => `/${file}`);
  expect(css.length, 'built app must have an initial stylesheet to fault').toBeGreaterThan(0);

  return { entry: `/${app.file}`, dependency: dependencies[0], dependencies, css };
}

export class ColdLoad {
  readonly requests: ResourceRequest[] = [];
  readonly requestRecords = new WeakMap<Request, ResourceRequest>();
  readonly assets: Awaited<ReturnType<typeof readAppAssets>>;
  fault: ResourceFault | undefined;
  blockAppModules = false;

  constructor(assets: Awaited<ReturnType<typeof readAppAssets>>) {
    this.assets = assets;
  }

  requestsFor(path: string) {
    return this.requests.filter(request => request.path === path);
  }

  get documents() {
    return this.requests.filter(request => request.type === 'document');
  }

  get appModules() {
    const paths = new Set([this.assets.entry, ...this.assets.dependencies]);
    return this.requests.filter(request => paths.has(request.path));
  }

  async install(context: BrowserContext, baseURL: string) {
    const origin = new URL(baseURL).origin;
    context.on('response', response => {
      const recorded = this.requestRecords.get(response.request());
      if (recorded) recorded.status = response.status();
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) {
        throw new Error(`Cold-load suite attempted a non-local request to ${url.origin}`);
      }
      const recorded: ResourceRequest = {
        path: url.pathname,
        query: url.search,
        method: request.method(),
        type: request.resourceType(),
        at: Date.now(),
      };
      this.requests.push(recorded);
      this.requestRecords.set(request, recorded);
      const fault = this.fault;
      if (fault?.path === url.pathname && fault.retryAfterDateMs && !fault.blockedUntil) {
        fault.blockedUntil = Math.ceil(Date.now() / 1000) * 1000 + fault.retryAfterDateMs;
        fault.retryAfter = new Date(fault.blockedUntil).toUTCString();
      }
      const shouldFault =
        fault?.path === url.pathname &&
        (!fault.requestType || request.resourceType() === fault.requestType) &&
        (fault.blockedUntil !== undefined
          ? Date.now() < fault.blockedUntil
          : this.requestsFor(fault.path).filter(
              record => !fault.requestType || record.type === fault.requestType
            ).length <= (fault.failures ?? Infinity));
      const appModuleBlocked =
        this.blockAppModules &&
        [this.assets.entry, ...this.assets.dependencies].includes(url.pathname);
      if (shouldFault || appModuleBlocked) {
        const status = shouldFault ? fault!.status : 429;
        recorded.injectedStatus = status;
        if (status === 'network') {
          await route.abort('failed');
          return;
        }
        await route.fulfill({
          status,
          contentType: 'text/plain; charset=utf-8',
          headers: {
            'Cache-Control': 'no-store',
            ...(shouldFault && fault!.retryAfter ? { 'Retry-After': fault!.retryAfter } : {}),
          },
          body: status === 429 ? 'Test resource rate limit' : 'Test missing resource',
        });
        return;
      }
      await route.continue();
    });
  }
}

export const test = base.extend<{ coldLoad: ColdLoad }>({
  coldLoad: async ({ context, baseURL }, runTest, testInfo) => {
    expect(baseURL, 'run through playwright.cold-load.config.ts').toBeTruthy();
    expect(await context.storageState(), 'no cookies or auth state before navigation').toEqual({
      cookies: [],
      origins: [],
    });
    expect(context.serviceWorkers()).toHaveLength(0);
    const coldLoad = new ColdLoad(await readAppAssets());
    await coldLoad.install(context, baseURL!);
    try {
      await runTest(coldLoad);
    } finally {
      await testInfo.attach('cold-load-requests', {
        body: JSON.stringify(coldLoad.requests, null, 2),
        contentType: 'application/json',
      });
    }
  },
});

export const builtIndexPath = fileURLToPath(new URL('../../dist/index.html', import.meta.url));
