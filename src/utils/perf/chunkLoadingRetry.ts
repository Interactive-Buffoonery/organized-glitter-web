declare global {
  interface Window {
    __OG_RESOURCE_RECOVERY__?: {
      start: (config: {
        entry: string;
        resources: string[];
        graphs?: Record<string, string[]>;
      }) => Promise<void>;
      recoverChunk: (error: unknown) => Promise<boolean>;
      resetReloadBudget: () => void;
      readonly state: 'idle' | 'loading' | 'started' | 'failed';
    };
  }
}

let initialized = false;

const recoverChunk = (error: unknown): void => {
  // The pre-React loader owns status checks and the budget across documents.
  // Keep Vite's rejection intact so the route boundary remains usable.
  void window.__OG_RESOURCE_RECOVERY__?.recoverChunk(error).catch(() => {});
};

export const initializeChunkLoadingRetry = (): void => {
  if (initialized) return;
  initialized = true;

  window.addEventListener('vite:preloadError', event => {
    recoverChunk((event as Event & { payload?: unknown }).payload);
  });

  window.addEventListener('unhandledrejection', event => {
    recoverChunk(event.reason);
  });
};
