import type { CaptureResult } from 'posthog-js';
import { AnalyticsEvent } from '@/services/analytics-events';

type WebAnalyticsContext = {
  platform: 'web';
  environment: 'production' | 'preview' | 'local' | 'other';
  release?: string;
};

const ordinaryEvents = new Set<string>(
  Object.values(AnalyticsEvent).filter(
    event =>
      event !== AnalyticsEvent.BOOTSTRAP_FAILURE_SHOWN &&
      event !== AnalyticsEvent.BOOTSTRAP_RECOVERED
  )
);

/** Only public build metadata is eligible; never infer production from Vite mode. */
export function buildWebAnalyticsContext(
  buildId: unknown,
  deploymentEnvironment: unknown,
  isDevelopment: boolean
): WebAnalyticsContext {
  const environment =
    deploymentEnvironment === 'production' ||
    deploymentEnvironment === 'preview' ||
    deploymentEnvironment === 'local' ||
    deploymentEnvironment === 'other'
      ? deploymentEnvironment
      : (deploymentEnvironment === undefined || deploymentEnvironment === '') && isDevelopment
        ? 'local'
        : 'other';
  const release =
    typeof buildId === 'string' &&
    /^[a-zA-Z0-9._-]{1,80}$/.test(buildId) &&
    buildId !== 'dev-build' &&
    buildId !== 'local-build'
      ? buildId
      : undefined;
  return { platform: 'web', environment, ...(release && { release }) };
}

/** Apply reserved dimensions only to registered product events, including pageviews. */
export function enrichWebAnalyticsEvent(
  event: CaptureResult,
  context = buildWebAnalyticsContext(
    typeof __APP_BUILD_ID__ === 'undefined' ? undefined : __APP_BUILD_ID__,
    import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT,
    import.meta.env.DEV
  )
): CaptureResult {
  if (!ordinaryEvents.has(event.event)) return event;
  const properties = { ...event.properties };
  // A persisted SDK super-property cannot supply a stale or unvalidated build identity.
  delete properties.release;
  return { ...event, properties: { ...properties, ...context } };
}
