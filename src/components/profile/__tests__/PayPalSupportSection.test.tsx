import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PayPalSupportSection from '../PayPalSupportSection';

afterEach(() => vi.unstubAllEnvs());

// Disabled configuration must render no donation UI or load a payment SDK.
describe('optional donation integration', () => {
  it('does not contact a payment provider without a configured button', () => {
    vi.stubEnv('VITE_PAYPAL_BUTTON_ID', '');
    const { container } = render(<PayPalSupportSection />);
    expect(container).toBeEmptyDOMElement();
    expect(document.querySelector('script[src*="paypalobjects"]')).toBeNull();
  });
});
