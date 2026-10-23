/**
 * Tests for RichUrlComponent URL sanitization
 *
 * Verifies that dangerous URL protocols (javascript:, data:, etc.)
 * are blocked by the getSafeHref integration, preventing XSS and
 * open redirect attacks via user-supplied source URLs.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RichUrlComponent from '../RichUrlComponent';

// Mock the logger to suppress test output
vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    criticalError: vi.fn(),
  },
  createLogger: () => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    criticalError: vi.fn(),
  }),
}));

describe('RichUrlComponent URL Sanitization', () => {
  const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

  afterEach(() => {
    windowOpenSpy.mockClear();
  });

  it('does not send private source domains to a favicon provider', () => {
    const { container } = render(<RichUrlComponent url="https://private-shop.example.test/kit" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://private-shop.example.test/kit'
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('rejects javascript: protocol URLs', () => {
    render(<RichUrlComponent url="javascript:alert(1)" />);
    expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
  });

  it('renders valid URLs with safe new-tab attributes', () => {
    render(<RichUrlComponent url="https://example.com" />);

    const link = screen.getByRole('link', { name: /example\.com/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});
