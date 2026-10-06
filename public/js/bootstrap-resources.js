(function () {
  if (window.__OG_RESOURCE_RECOVERY__) return;

  const recoveryWindowMs = 25000;
  const requestTimeoutMs = 8000;
  const maxAttempts = 3;
  const reloadBudgetKey = 'og-resource-reloads-v1';
  const cancelled = Symbol('ready');
  let state = 'idle';
  let startup = null;
  const chunkRecoveries = new Map();
  let graphRecovery = null;
  const chunkGraphs = new Map();

  const isReady = () => document.getElementById('root')?.getAttribute('data-app-ready') === 'true';

  const assetPath = value => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^\/assets\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(url.pathname)
      ) {
        return null;
      }
      return url.pathname;
    } catch (_) {
      return null;
    }
  };

  const retryAfterMs = value => {
    if (!value) return 0;
    if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
  };

  const fail = () => {
    if (isReady() || state === 'failed') return;
    state = 'failed';
    window.dispatchEvent(new CustomEvent('og:resource-failure'));
  };

  const consumeReloadBudget = () => {
    try {
      const stored = window.sessionStorage.getItem(reloadBudgetKey);
      const budget = stored ? JSON.parse(stored) : { attempts: 0 };
      if (!budget || !Number.isInteger(budget.attempts) || budget.attempts < 0) {
        return false;
      }
      if (budget.attempts >= 2) return false;
      budget.attempts += 1;
      const serialized = JSON.stringify({ attempts: budget.attempts });
      window.sessionStorage.setItem(reloadBudgetKey, serialized);
      return window.sessionStorage.getItem(reloadBudgetKey) === serialized;
    } catch (_) {
      // Without persistent tab-local accounting, a fresh document could loop.
      return false;
    }
  };

  const reloadDocument = () => {
    if (!consumeReloadBudget()) return false;
    // Preserve the current route, search, fragment, and authentication storage.
    window.location.reload();
    return true;
  };

  const requestResource = async (url, attempt, deadline) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(requestTimeoutMs, Math.max(0, deadline - Date.now()))
    );
    try {
      const response = await fetch(url, {
        credentials: 'same-origin',
        cache: attempt === 0 ? 'default' : 'reload',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        throw {
          retryable: response.status === 429 || response.status === 408 || response.status >= 500,
          delay: retryAfterMs(response.headers.get('Retry-After')),
        };
      }
      const mime = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
      const validMime = url.endsWith('.css')
        ? mime === 'text/css'
        : /^(?:text|application)\/(?:javascript|ecmascript)$/.test(mime || '');
      if (!validMime) {
        void response.body?.cancel().catch(() => {});
        throw { retryable: false };
      }
      // Consume the complete body so a dropped stream is retried and a healthy
      // immutable resource can warm the HTTP cache without executing ESM.
      await response.arrayBuffer();
    } catch (error) {
      if (typeof error?.retryable === 'boolean') throw error;
      throw { retryable: true, delay: 0 };
    } finally {
      clearTimeout(timeout);
    }
  };

  const warmResource = async (url, deadline, startupRecovery) => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (startupRecovery && isReady()) throw cancelled;
      if (Date.now() >= deadline) throw { retryable: false };
      try {
        await requestResource(url, attempt, deadline);
        return attempt > 0;
      } catch (error) {
        if (!error.retryable || attempt === maxAttempts - 1) throw error;
        const backoff = 1000 * 2 ** attempt;
        const delay = Math.max(backoff, error.delay || 0) + Math.floor(Math.random() * 250);
        // Never shorten a server Retry-After to fit the local recovery budget.
        if (Date.now() + delay >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const recoverGraph = resources => {
    if (graphRecovery) return graphRecovery;
    graphRecovery = (async () => {
      try {
        const deadline = Date.now() + recoveryWindowMs;
        for (const url of resources) await warmResource(url, deadline, true);
        if (isReady()) return;
        // An import failure is cached by the document's module map. Reusing
        // that map (even with a new entry query) cannot retry its dependencies.
        if (!reloadDocument()) fail();
      } catch (error) {
        if (error !== cancelled) fail();
      }
    })();
    return graphRecovery;
  };

  const applyStylesheet = (url, deadline) =>
    new Promise((resolve, reject) => {
      const existing = [...document.querySelectorAll('link[rel="stylesheet"]')].find(
        link => assetPath(link.href) === url
      );
      if (existing?.sheet) {
        resolve();
        return;
      }
      existing?.remove();
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.setAttribute('data-og-bootstrap', '');
      const timeout = setTimeout(
        () => finish(false),
        Math.min(requestTimeoutMs, Math.max(0, deadline - Date.now()))
      );
      const finish = success => {
        clearTimeout(timeout);
        link.onload = null;
        link.onerror = null;
        if (success) resolve();
        else reject({ retryable: true });
      };
      link.onload = () => finish(true);
      link.onerror = () => finish(false);
      document.head.appendChild(link);
    });

  const start = config => {
    if (startup) return startup;
    startup = (async () => {
      try {
        if (isReady()) return;
        const entry = assetPath(config?.entry);
        if (!entry?.endsWith('.js') || !Array.isArray(config?.resources)) {
          throw { retryable: false };
        }
        const resources = [...new Set([...config.resources.map(assetPath), entry])];
        if (resources.includes(null) || resources.length > 256) throw { retryable: false };
        if (config.graphs !== undefined) {
          if (!config.graphs || typeof config.graphs !== 'object' || Array.isArray(config.graphs)) {
            throw { retryable: false };
          }
          const graphs = Object.entries(config.graphs);
          if (graphs.length > 256) throw { retryable: false };
          for (const [name, graph] of graphs) {
            const chunk = assetPath(name);
            if (!chunk?.endsWith('.js') || !Array.isArray(graph)) throw { retryable: false };
            const dependencies = [...new Set([...graph.map(assetPath), chunk])];
            if (dependencies.includes(null) || dependencies.length > 256) {
              throw { retryable: false };
            }
            chunkGraphs.set(chunk, dependencies);
          }
        }
        state = 'loading';
        const deadline = Date.now() + recoveryWindowMs;
        // Serial requests avoid reproducing a burst of modulepreload traffic.
        for (const url of resources) await warmResource(url, deadline, true);
        if (isReady()) return;
        for (const url of resources.filter(url => url.endsWith('.css'))) {
          try {
            await applyStylesheet(url, deadline);
          } catch (_) {
            await recoverGraph(resources);
            return;
          }
        }
        if (isReady()) return;
        const script = document.createElement('script');
        script.type = 'module';
        script.src = entry;
        script.crossOrigin = 'anonymous';
        script.setAttribute('data-og-bootstrap', '');
        script.addEventListener('error', () => void recoverGraph(resources), { once: true });
        state = 'started';
        document.head.appendChild(script);
      } catch (error) {
        if (error !== cancelled) fail();
      }
    })();
    return startup;
  };

  const recoverChunk = error => {
    const message = typeof error === 'string' ? error : error?.message;
    if (typeof message !== 'string') return Promise.resolve(false);
    const match = message.match(
      /(?:Failed to fetch dynamically imported module:|error loading dynamically imported module:|Importing a module script failed:|Unable to preload CSS for)\s*(\S+)/i
    );
    const url = assetPath(match?.[1]);
    if (!url) return Promise.resolve(false);
    if (chunkRecoveries.has(url)) return chunkRecoveries.get(url);
    const chunkRecovery = (async () => {
      try {
        const deadline = Date.now() + recoveryWindowMs;
        const graph = chunkGraphs.get(url);
        if (graph) {
          for (const dependency of graph) await warmResource(dependency, deadline, false);
        } else {
          const observedTransientFailure = await warmResource(url, deadline, false);
          // Chromium can name a healthy entry when a dependency failed. With
          // no graph metadata, a 200 is insufficient evidence to reload ESM.
          if (url.endsWith('.js') && !observedTransientFailure) return false;
        }
        return reloadDocument();
      } catch (_) {
        return false;
      }
    })();
    chunkRecoveries.set(url, chunkRecovery);
    return chunkRecovery;
  };

  window.__OG_RESOURCE_RECOVERY__ = {
    start,
    recoverChunk,
    resetReloadBudget() {
      try {
        window.sessionStorage.removeItem(reloadBudgetKey);
      } catch (_) {
        // Explicit user reload still works when storage is unavailable.
      }
    },
    get state() {
      return state;
    },
  };

  const startConfiguredGraph = () => {
    const config = document.getElementById('app-bootstrap-resources');
    if (config) {
      try {
        void start(JSON.parse(config.textContent));
      } catch (_) {
        fail();
      }
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startConfiguredGraph, { once: true });
  } else {
    startConfiguredGraph();
  }
})();
