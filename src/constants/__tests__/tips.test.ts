import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTipLinks, tipsEnabled } from '../tips';

// Failures: an unconfigured site showing tips, or a non-HTTPS value becoming a link.
describe('tip payment links', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is disabled when no payment links are configured', () => {
    expect(getTipLinks()).toEqual({ fixed: [], custom: null });
    expect(tipsEnabled()).toBe(false);
  });

  it('keeps only HTTPS links in amount order', () => {
    vi.stubEnv('VITE_STRIPE_TIP_10_URL', 'https://buy.stripe.com/test_ten');
    vi.stubEnv('VITE_STRIPE_TIP_2_URL', ' https://buy.stripe.com/test_two ');
    vi.stubEnv('VITE_STRIPE_TIP_3_URL', 'javascript:alert(1)');
    vi.stubEnv('VITE_STRIPE_TIP_5_URL', 'http://buy.stripe.com/test_five');
    vi.stubEnv('VITE_STRIPE_TIP_CUSTOM_URL', 'not a url');

    expect(getTipLinks()).toEqual({
      fixed: [
        { amount: 2, href: 'https://buy.stripe.com/test_two' },
        { amount: 10, href: 'https://buy.stripe.com/test_ten' },
      ],
      custom: null,
    });
    expect(tipsEnabled()).toBe(true);
  });

  it('enables tips with only a custom amount link', () => {
    vi.stubEnv('VITE_STRIPE_TIP_CUSTOM_URL', 'https://buy.stripe.com/test_custom');
    expect(tipsEnabled()).toBe(true);
  });
});
