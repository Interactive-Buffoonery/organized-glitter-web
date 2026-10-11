/**
 * Fatal error handler for application startup errors
 * Provides user-friendly error display when the app fails to load
 */

import { logger } from '@/utils/logger';
import { captureException } from '@/services/analytics-escape-hatch';
import { buildExceptionContext, classifyExternalError } from '@/utils/error/exceptionContext';
import { getSupportMailto } from '@/lib/contactConfig';
import { inspectException, safeException, thrownValueType } from '@/utils/error/safeException';

/**
 * Flipped to `true` once React has mounted (via `markAppMounted`, called from
 * main.tsx). Before mount, an uncaught error means the app never came up, so we
 * show the full-screen fatal UI. After mount, the app is working: React's error
 * boundaries own render-time UX, so a stray uncaught error (e.g. from a user's
 * broken browser extension) must be captured but must NOT blank a live app.
 */
let appHasMounted = false;

/**
 * Mark the app as mounted so post-mount uncaught errors no longer trigger the
 * full-screen fatal takeover. Called from main.tsx once React is live.
 */
export const markAppMounted = (): void => {
  appHasMounted = true;
};

interface ErrorDisplayOptions {
  title?: string;
  description?: string;
  showTechnicalDetails?: boolean;
}

/**
 * Handle fatal errors by displaying a user-friendly error screen
 * Uses DOM manipulation to avoid any React dependencies
 */
export const handleFatalError = (
  error: Error,
  context: string,
  options: ErrorDisplayOptions = {}
): void => {
  logger.error(`❌ Fatal error in ${context}:`, error);

  const rootElement = document.getElementById('root');
  // Mark ready before app-loaded so loading.js clears the 30s failsafe.
  // innerHTML below does not remove attributes, so the marker survives.
  if (rootElement) {
    rootElement.setAttribute('data-app-ready', 'true');
  }

  // Dispatch app loaded to hide loading screen even on error
  dispatchAppLoadedEvent();

  if (!rootElement) {
    logger.error('Root element not found, cannot display error UI');
    return;
  }

  // Clear existing content
  rootElement.innerHTML = '';

  // Create error display
  const errorContainer = createErrorContainer();
  const errorCard = createErrorCard();

  // Add components to card
  errorCard.appendChild(createErrorIcon());
  errorCard.appendChild(createErrorTitle(options.title));
  errorCard.appendChild(createErrorDescription(options.description));

  const buttonContainer = createButtonContainer();
  buttonContainer.appendChild(createReloadButton());
  buttonContainer.appendChild(createContactButton());
  errorCard.appendChild(buttonContainer);

  if (
    options.showTechnicalDetails === true ||
    (options.showTechnicalDetails !== false && import.meta.env.DEV)
  ) {
    errorCard.appendChild(createTechnicalDetails(error, context));
  }

  errorContainer.appendChild(errorCard);
  rootElement.appendChild(errorContainer);
};

/**
 * Dispatch app-loaded event to hide loading screens
 */
const dispatchAppLoadedEvent = (): void => {
  const event = new CustomEvent('app-loaded');
  window.dispatchEvent(event);
  logger.log('✅ App loaded event dispatched');
};

/**
 * Set up global error handlers for unhandled errors and promise rejections
 */
export const setupGlobalErrorHandlers = (): void => {
  window.addEventListener('error', event => {
    const originalError =
      event.error ||
      new Error(`${event.message} at ${event.filename}:${event.lineno}:${event.colno}`);

    // Always capture, enriched with safe diagnostics + classification.
    captureException(originalError, buildExceptionContext('fatal_global_handler'));

    maybeShowFatalUi(originalError, 'Global Error');
  });

  window.addEventListener('unhandledrejection', event => {
    const { error, summary } = normalizeRejection(event.reason);

    // Classify locally before redaction so external string rejections retain
    // their existing capture annotation and fatal UI suppression.
    const classification = classifyExternalError(inspectException(event.reason));
    captureException(
      error,
      buildExceptionContext('fatal_global_handler', { ...summary, ...classification })
    );

    maybeShowFatalUi(
      error,
      'Unhandled Promise Rejection',
      classification.suspected_external_script
    );
  });
};

/**
 * Decide whether an uncaught error should take over the screen with the fatal
 * UI. The error is ALWAYS captured by the caller before this runs.
 *
 * Rules:
 *  - High-confidence external noise (a user's broken extension, a masked
 *    cross-origin script error) must NEVER blank our app, even pre-mount.
 *  - After the app has mounted, uncaught errors are captured but do not blank
 *    the app; React's error boundaries own render-time UX.
 *  - Only a genuine startup failure (pre-mount, non-external) shows the fatal
 *    "Unable to Load Application" screen.
 */
const maybeShowFatalUi = (error: Error, context: string, suspectedExternal = false): void => {
  if (suspectedExternal || classifyExternalError(error).suspected_external_script) {
    logger.warn(`Suppressing fatal UI for suspected external error in ${context}:`, error.message);
    return;
  }

  if (appHasMounted) {
    logger.warn(
      `Captured post-mount uncaught error in ${context} without blanking app:`,
      error.message
    );
    return;
  }

  handleFatalError(error, context);
};

/** Keep native Errors local; never stringify arbitrary rejection reasons. */
const normalizeRejection = (
  reason: unknown
): { error: Error; summary?: Record<string, unknown> } => {
  const inspected = inspectException(reason);
  if (inspected instanceof Error) return { error: inspected };
  return {
    error: safeException(reason).error,
    summary: { rejection_reason_type: thrownValueType(reason) },
  };
};

// Private helper functions

const createErrorContainer = (): HTMLDivElement => {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, #f8e8f6 0%, #f2e3eb 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    /* System sans, fatal error handler runs when fontsource imports may have failed to load. */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    z-index: 10000;
  `;
  return container;
};

const createErrorCard = (): HTMLDivElement => {
  const card = document.createElement('div');
  card.style.cssText = `
    max-width: 500px;
    background: #fdf6f9;
    padding: 40px;
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.1);
    text-align: center;
    border: 1px solid rgba(0,0,0,0.1);
  `;
  return card;
};

const createErrorIcon = (): HTMLDivElement => {
  const iconContainer = document.createElement('div');
  iconContainer.style.cssText = `
    width: 64px;
    height: 64px;
    background: #fee2e2;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 24px;
  `;
  iconContainer.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 8v4"/>
      <path d="M12 16h.01"/>
    </svg>
  `;
  return iconContainer;
};

const createErrorTitle = (customTitle?: string): HTMLHeadingElement => {
  const title = document.createElement('h1');
  title.style.cssText = `
    color: #1f2937;
    margin: 0 0 16px 0;
    font-size: 24px;
    font-weight: 600;
  `;
  title.textContent = customTitle || 'Unable to Load Application';
  return title;
};

const createErrorDescription = (customDescription?: string): HTMLParagraphElement => {
  const description = document.createElement('p');
  description.style.cssText = `
    color: #6b7280;
    margin: 0 0 24px 0;
    font-size: 16px;
    line-height: 1.5;
  `;
  description.textContent =
    customDescription ||
    'Organized Glitter encountered an error while starting up. This might be due to a temporary issue or a problem with your internet connection.';
  return description;
};

const createButtonContainer = (): HTMLDivElement => {
  const container = document.createElement('div');
  container.style.cssText = 'display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;';
  return container;
};

const createReloadButton = (): HTMLButtonElement => {
  const button = document.createElement('button');
  button.style.cssText = `
    background: #7c3aed;
    color: white;
    border: none;
    padding: 12px 32px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: all 0.2s;
  `;
  button.textContent = 'Reload Page';
  button.onclick = () => window.location.reload();
  button.onmouseover = () => (button.style.background = '#6d28d9');
  button.onmouseout = () => (button.style.background = '#7c3aed');
  return button;
};

const createContactButton = (): HTMLButtonElement => {
  const button = document.createElement('button');
  button.style.cssText = `
    background: transparent;
    color: #6b7280;
    border: 1px solid #d1d5db;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: all 0.2s;
  `;
  button.textContent = 'Contact Support';
  button.onclick = () => {
    const mailto = getSupportMailto('App Loading Error');
    if (mailto) window.open(mailto, '_blank');
  };
  button.onmouseover = () => (button.style.background = '#f9fafb');
  button.onmouseout = () => (button.style.background = 'transparent');
  return button;
};

const createTechnicalDetails = (error: Error, context: string): HTMLDetailsElement => {
  const details = document.createElement('details');
  details.style.cssText = 'margin-top: 24px; text-align: left;';

  const summary = document.createElement('summary');
  summary.style.cssText = `
    cursor: pointer;
    color: #9ca3af;
    font-size: 14px;
    padding: 8px 0;
  `;
  summary.textContent = 'Show Technical Details';

  const techDetails = document.createElement('div');
  techDetails.style.cssText = `
    background: #f9fafb;
    padding: 16px;
    border-radius: 8px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    color: #374151;
    margin-top: 8px;
    border: 1px solid #e5e7eb;
    white-space: pre-wrap;
    word-break: break-word;
  `;
  techDetails.textContent = `${context}: ${error.stack || error.message}`;

  details.appendChild(summary);
  details.appendChild(techDetails);
  return details;
};
