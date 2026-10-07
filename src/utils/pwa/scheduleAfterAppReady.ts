export function scheduleAfterAppReady(register: () => void): () => void {
  let disposed = false;
  let scheduled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;

  const run = () => {
    if (!disposed) register();
  };
  const onReady = () => {
    if (scheduled || document.getElementById('root')?.getAttribute('data-app-ready') !== 'true') {
      return;
    }
    scheduled = true;
    window.removeEventListener('app-loaded', onReady);
    // Let the ready route and splash transition finish before offline caching.
    timer = setTimeout(() => {
      if (disposed) return;
      if (typeof window.requestIdleCallback === 'function') {
        idle = window.requestIdleCallback(run, { timeout: 2000 });
      } else {
        run();
      }
    }, 1000);
  };

  window.addEventListener('app-loaded', onReady);
  onReady();
  return () => {
    disposed = true;
    window.removeEventListener('app-loaded', onReady);
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
  };
}
