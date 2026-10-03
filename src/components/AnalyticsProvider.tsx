import React from 'react';
import { PostHogProvider } from '@posthog/react';
import type { PostHogConfig } from 'posthog-js';
import { useAnalytics } from '@/hooks/useAnalytics';
import { sanitizeAnalyticsEvent } from '@/utils/analytics/sanitizeEvent';

const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim();

const posthogOptions: Partial<PostHogConfig> = {
  api_host: posthogHost,
  before_send: event => (event ? sanitizeAnalyticsEvent(event) : null),
  ui_host: 'https://us.posthog.com',
  advanced_disable_flags: true,
  advanced_disable_feature_flags: true,
  // We handle pageviews manually via react-router
  capture_pageview: false,
  capture_pageleave: false,
  // Respect Do Not Track
  respect_dnt: true,
  persistence: 'localStorage',
  cross_subdomain_cookie: false,
  secure_cookie: true,
  // Don't start session recording by default; enable via PostHog UI
  disable_session_recording: true,
  disable_surveys: true,
  // Batch events to reduce network requests
  request_batching: true,
  // Minimal autocapture; we instrument explicitly
  autocapture: false,
  capture_exceptions: false,
  mask_all_element_attributes: true,
  mask_all_text: true,
  mask_personal_data_properties: true,
};

/**
 * Side-effect component that runs useAnalytics() inside the provider context.
 * Handles identify/reset and SPA pageview tracking.
 */
const AnalyticsEffects: React.FC = () => {
  useAnalytics();
  return null;
};

/**
 * Wraps children with the official PostHog React provider.
 * If no API key is configured, renders children without PostHog.
 */
export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!posthogKey?.trim() || !posthogHost) {
    if (import.meta.env.DEV) {
      console.debug('[analytics] VITE_PUBLIC_POSTHOG_KEY not set, analytics disabled');
    }
    return <>{children}</>;
  }

  return (
    <PostHogProvider apiKey={posthogKey} options={posthogOptions}>
      <AnalyticsEffects />
      {children}
    </PostHogProvider>
  );
};
