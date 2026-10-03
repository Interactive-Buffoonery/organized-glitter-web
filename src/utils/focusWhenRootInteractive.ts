export function isRootInert(): boolean {
  return Boolean(document.getElementById('root')?.hasAttribute('inert'));
}

/**
 * Focus `element` once `#root` is not inert. While the splash or `#app-error`
 * shell is showing, `#root` stays inert and focus cannot move into the app.
 */
export function focusWhenRootInteractive(element: HTMLElement | null): () => void {
  if (!element) return () => {};

  const tryFocus = () => {
    if (!element.isConnected || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  };

  if (!isRootInert()) {
    tryFocus();
    return () => {};
  }

  const root = document.getElementById('root');
  if (!root) return () => {};

  const observer = new MutationObserver(() => {
    if (!isRootInert()) {
      observer.disconnect();
      tryFocus();
    }
  });
  observer.observe(root, { attributes: true, attributeFilter: ['inert'] });
  return () => observer.disconnect();
}
