import React from 'react';
import { PostHogProvider } from '@posthog/react';
import posthog, { type PostHogConfig } from 'posthog-js';
import { useAnalytics } from '@/hooks/useAnalytics';
import { sanitizeAnalyticsEvent } from '@/utils/analytics/sanitizeEvent';

import { getAnalyticsEnabled, syncAnalyticsConsent } from '@/services/analytics-preference';

const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST?.trim();

const posthogOptions: Partial<PostHogConfig> = {
  api_host: posthogHost,
  before_send: event => (event && getAnalyticsEnabled() ? sanitizeAnalyticsEvent(event) : null),
  opt_out_capturing_by_default: !getAnalyticsEnabled(),
  ui_host: 'https://us.posthog.com',
  advanced_disable_flags: true,
  advanced_disable_feature_flags: true,
  // We handle pageviews manually via react-router
  capture_pageview: false,
  capture_pageleave: false,
  save_campaign_params: false,
  // Respect Do Not Track
  respect_dnt: true,
  persistence: 'localStorage',
  cross_subdomain_cookie: false,
  secure_cookie: true,
  // Session recording requires a separate privacy review.
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

// Initialize before React effects, including child capture calls, can run.
const posthogClient =
  posthogKey?.trim() && posthogHost ? posthog.init(posthogKey, posthogOptions) : undefined;

if (posthogClient) syncAnalyticsConsent();

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
 * If either the key or host is missing, renders children without PostHog.
 */
export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!posthogClient) {
    if (import.meta.env.DEV) {
      console.debug('[analytics] PostHog key or host missing, analytics disabled');
    }
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthogClient}>
      <AnalyticsEffects />
      {children}
    </PostHogProvider>
  );
};
