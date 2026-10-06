// Elements
const loadingEl = document.getElementById('app-loading');
const errorEl = document.getElementById('app-error');
const retryButton = document.getElementById('retry-button');
const slowLoadWarning = document.getElementById('slow-load-warning');
const bootstrapAnalytics = typeof window !== 'undefined' ? window.__OG_BOOTSTRAP_ANALYTICS__ : null;

const isRootReady = () => {
  const root = document.getElementById('root');
  return Boolean(root && root.getAttribute('data-app-ready') === 'true');
};

// Global state
let isAppLoaded = false;
let hasError = false;
let loadingHideTimer = null;
let hideGeneration = 0;
let displayedFailureReason = null;

const isExternalStartupError = value => {
  try {
    const message = typeof value === 'string' ? value : value?.message || '';
    const stack = typeof value?.stack === 'string' ? value.stack : '';
    return (
      message.startsWith('Script error.') ||
      message.includes('runtime.sendMessage') ||
      message.includes('Tab not found') ||
      /(?:chrome|moz|safari|safari-web)-extension:\/\//.test(stack)
    );
  } catch (_) {
    return false;
  }
};

const prefersReducedMotion = () => {
  try {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch (_) {
    return false;
  }
};

const setRootInert = inert => {
  const root = document.getElementById('root');
  if (!root) return;
  if (inert) {
    root.setAttribute('inert', '');
  } else {
    root.removeAttribute('inert');
  }
};

const revealRoot = () => {
  const root = document.getElementById('root');
  if (root) {
    root.style.opacity = '1';
  }
  setRootInert(false);
};

const removeStartupError = () => {
  if (errorEl && errorEl.parentNode) {
    errorEl.parentNode.removeChild(errorEl);
  }
};

const isErrorShellVisible = () => {
  if (!errorEl || !errorEl.isConnected) return false;
  if (errorEl.getAttribute('aria-hidden') === 'true') return false;
  return errorEl.style.display === 'flex';
};

const clearLoadingHideTimer = () => {
  if (loadingHideTimer !== null) {
    clearTimeout(loadingHideTimer);
    loadingHideTimer = null;
  }
};

const hideLoadingShell = ({ remove = false, afterHide } = {}) => {
  const generation = ++hideGeneration;

  if (!loadingEl) {
    if (generation === hideGeneration) afterHide?.();
    return;
  }

  if (!loadingEl.isConnected || getComputedStyle(loadingEl).display === 'none') {
    if (remove && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
    if (generation === hideGeneration) afterHide?.();
    return;
  }

  clearLoadingHideTimer();

  let didFinish = false;

  const finishHide = () => {
    loadingEl.removeEventListener('transitionend', handleTransitionEnd);
    if (generation !== hideGeneration) return;
    if (didFinish) return;
    didFinish = true;

    clearLoadingHideTimer();
    loadingEl.style.display = 'none';

    if (remove && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }

    afterHide?.();
  };

  const handleTransitionEnd = event => {
    if (event.target === loadingEl && event.propertyName === 'opacity') {
      finishHide();
    }
  };

  if (prefersReducedMotion()) {
    loadingEl.style.pointerEvents = 'none';
    loadingEl.style.opacity = '0';
    loadingEl.setAttribute('aria-hidden', 'true');
    finishHide();
    return;
  }

  loadingEl.addEventListener('transitionend', handleTransitionEnd);
  loadingEl.classList.add('is-fading');
  loadingEl.style.pointerEvents = 'none';
  loadingEl.style.opacity = '0';
  loadingEl.setAttribute('aria-hidden', 'true');

  loadingHideTimer = setTimeout(finishHide, 300);
};

const focusErrorRecovery = () => {
  if (retryButton && typeof retryButton.focus === 'function') {
    try {
      retryButton.focus({ preventScroll: true });
      return;
    } catch (_) {
      retryButton.focus();
      return;
    }
  }

  const heading = errorEl?.querySelector('h2');
  if (heading && typeof heading.focus === 'function') {
    try {
      heading.focus({ preventScroll: true });
    } catch (_) {
      heading.focus();
    }
  }
};

const captureBootstrapFailure = reason => {
  if (
    !bootstrapAnalytics ||
    typeof bootstrapAnalytics.captureBootstrapFailureShown !== 'function'
  ) {
    return;
  }
  try {
    bootstrapAnalytics.captureBootstrapFailureShown(reason);
  } catch (err) {
    console.error('Bootstrap analytics capture failed:', err);
  }
};

// Splash is the visible shell until the app is revealed, so keep #root inert
// and out of the tab order until hideLoadingShell actually finishes. Skip when
// React already marked ready before this script booted (Vite can run modules
// first).
if (loadingEl && loadingEl.isConnected && !isRootReady()) {
  setRootInert(true);
}

// Show slow load warning after 10 seconds
const slowLoadTimeout = setTimeout(() => {
  if (
    !isAppLoaded &&
    !hasError &&
    loadingEl &&
    getComputedStyle(loadingEl).display !== 'none' &&
    parseFloat(getComputedStyle(loadingEl).opacity) > 0
  ) {
    if (slowLoadWarning) {
      slowLoadWarning.style.display = 'block';
      console.log('Slow load warning displayed');
    }
  }
}, 10000);

// Handle retry button click
if (retryButton) {
  retryButton.addEventListener('click', () => {
    console.log('Retry button clicked');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.setAttribute('aria-hidden', 'true');
    }
    if (loadingEl) {
      clearLoadingHideTimer();
      loadingEl.classList.remove('is-fading');
      loadingEl.style.pointerEvents = '';
      loadingEl.style.opacity = '1';
      loadingEl.style.display = 'flex';
      loadingEl.removeAttribute('aria-hidden');
    }
    hasError = false;
    isAppLoaded = false;
    hideGeneration += 1;
    setRootInert(true);
    window.__OG_RESOURCE_RECOVERY__?.resetReloadBudget?.();
    window.location.reload();
  });
}

/**
 * Show the static recovery card. Raw errors and URLs can include credentials.
 * @param {'module_resource'|'startup_timeout'|'runtime_error'} reason
 */
const showError = reason => {
  if (hasError) return; // Prevent multiple error displays

  hasError = true;
  clearTimeout(slowLoadTimeout);

  console.error('Showing bootstrap failure:', reason);

  hideLoadingShell({
    afterHide: () => {
      if (!hasError || isRootReady()) return;
      if (errorEl) {
        errorEl.style.display = 'flex';
        errorEl.setAttribute('aria-hidden', 'false');
      }
      // Keep React content out of the tab order while this shell owns recovery.
      setRootInert(true);
      // Never write stacks, paths, or raw messages into the recovery UI.
      focusErrorRecovery();
      displayedFailureReason = reason;
      captureBootstrapFailure(reason);
    },
  });
};

window.addEventListener('og:resource-failure', () => {
  if (!isRootReady()) showError('module_resource');
});

if (window.__OG_RESOURCE_RECOVERY__?.state === 'failed' && !isRootReady()) {
  showError('module_resource');
}

// Resource errors do not bubble to the runtime error listener below.
window.addEventListener(
  'error',
  event => {
    if (isRootReady() || hasError) return;

    const script = event.target;
    if (!(script instanceof HTMLScriptElement) || script.type !== 'module' || !script.src) {
      return;
    }
    if (script.hasAttribute('data-og-bootstrap')) return;

    const source = new URL(script.src);
    if (
      source.origin !== window.location.origin ||
      (!source.pathname.startsWith('/assets/') && source.pathname !== '/src/main.tsx')
    ) {
      return;
    }

    showError('module_resource');
  },
  true
);

// Global error handler — only active before the app loads
window.addEventListener('error', function (event) {
  // ResizeObserver loop errors are benign browser noise — always ignore
  var msg = event.message || (event.error && event.error.message) || '';
  if (msg.includes('ResizeObserver')) return;
  if (isExternalStartupError(event.error || msg)) return;

  // Once React is ready, its error boundaries own recovery.
  if (!isRootReady()) {
    showError('runtime_error');
  }
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function (event) {
  if (isExternalStartupError(event.reason)) return;
  // Once React is ready, its error boundaries own recovery.
  if (!isRootReady()) {
    showError('runtime_error');
  }
});

const dismissStartupErrorIfReady = () => {
  if (!isRootReady()) return false;
  if (!hasError && !isErrorShellVisible()) return false;

  hasError = false;
  isAppLoaded = true;
  clearTimeout(slowLoadTimeout);
  removeStartupError();
  revealRoot();
  if (displayedFailureReason) {
    const reason = displayedFailureReason;
    displayedFailureReason = null;
    try {
      bootstrapAnalytics?.captureBootstrapRecovery?.(reason);
    } catch (_) {
      // Analytics must not interrupt recovery.
    }
  }
  return true;
};

// Hide loading when app starts. Splash dismiss is not failsafe-complete:
// `data-app-ready` is set by useAppReady / markAppReady, the route error
// boundary, or handleFatalError. A hung Suspense fallback that never marks
// ready can still show Retry at 30s. A later markAppReady / useAppReady(true)
// dismisses an already-shown #app-error so a real page, auth form, or route
// error UI is not trapped under the card.
window.addEventListener('app-loaded', function () {
  if (dismissStartupErrorIfReady()) {
    hideLoadingShell({ remove: true });
    return;
  }

  const reactReady = isRootReady();

  if (isAppLoaded) {
    // Splash already dismissed without completing the failsafe. A later
    // markAppReady (login form, real page, route error) retires leftover
    // hidden #app-error. Visible recovery is handled above.
    if (reactReady) {
      clearTimeout(slowLoadTimeout);
      removeStartupError();
      revealRoot();
    }
    return;
  }

  if (hasError) return;

  isAppLoaded = true;
  if (reactReady) {
    clearTimeout(slowLoadTimeout);
  }
  console.log('App loaded event received, hiding loading screen');

  hideLoadingShell({
    remove: true,
    afterHide: () => {
      // Remove the error shell only after the app has marked itself ready.
      // Keep #app-error in the document so a splash-only dismiss cannot
      // strand a hung PageLoading tree without Retry.
      if (reactReady) {
        removeStartupError();
      }
      revealRoot();
      console.log('Loading screen hidden successfully');
    },
  });
});

// Also cover failures that occurred before this script installed its listeners.
setTimeout(() => {
  if (hasError) return;

  // `#root` having children is not proof the app is usable: lazy-route
  // Suspense fallbacks (PageLoading spinners) also live under `#root`.
  // Splash dismiss without data-app-ready still times out so Retry returns.
  // This timer re-reads the ready marker at fire time; it is not cancelled
  // when the marker is set earlier.
  if (isRootReady()) {
    if (!isAppLoaded) {
      window.dispatchEvent(new CustomEvent('app-loaded'));
    }
    return;
  }

  showError('startup_timeout');
}, 30000);

// Vite production HTML can execute /assets/main-*.js before this file. React
// may have set data-app-ready and fired app-loaded with no listener yet.
if (!hasError && isRootReady() && !isAppLoaded) {
  window.dispatchEvent(new CustomEvent('app-loaded'));
}

// Debug logging
console.log('Loading script initialized', {
  loadingEl: !!loadingEl,
  errorEl: !!errorEl,
  retryButton: !!retryButton,
  slowLoadWarning: !!slowLoadWarning,
  bootstrapAnalytics: !!bootstrapAnalytics,
});
