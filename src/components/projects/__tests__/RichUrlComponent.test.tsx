/**
 * Tests for RichUrlComponent URL sanitization
 *
 * Verifies that dangerous URL protocols (javascript:, data:, etc.)
 * are blocked by the getSafeHref integration, preventing XSS and
 * open redirect attacks via user-supplied source URLs.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders valid https URLs as clickable', () => {
    render(<RichUrlComponent url="https://example.com" />);
    expect(screen.queryByText('Invalid URL format')).not.toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('does not send private source domains to a favicon provider', () => {
    const { container } = render(<RichUrlComponent url="https://private-shop.example.test/kit" />);

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://private-shop.example.test/kit'
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders valid http URLs as clickable', () => {
    render(<RichUrlComponent url="http://example.com" />);
    expect(screen.queryByText('Invalid URL format')).not.toBeInTheDocument();
  });

  it('prepends https:// to bare domains', () => {
    render(<RichUrlComponent url="example.com" />);
    expect(screen.queryByText('Invalid URL format')).not.toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('rejects javascript: protocol URLs', () => {
    render(<RichUrlComponent url="javascript:alert(1)" />);
    expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
  });

  it('rejects data: protocol URLs', () => {
    render(<RichUrlComponent url="data:text/html,<script>alert(1)</script>" />);
    expect(screen.getByText('Invalid URL format')).toBeInTheDocument();
  });

  it('does not open invalid URLs on click', async () => {
    const user = userEvent.setup();
    render(<RichUrlComponent url="javascript:alert(1)" />);

    const container = screen.getByText('Invalid URL format').closest('[class*="group"]');
    if (container) {
      await user.click(container);
    }

    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('renders valid URLs with safe new-tab attributes', () => {
    render(<RichUrlComponent url="https://example.com" />);

    const link = screen.getByRole('link', { name: /example\.com/i });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it('does not display a URL control for an empty URL', () => {
    const { container } = render(<RichUrlComponent url="" />);
    expect(container.firstChild).toBeNull();
  });

  it('does not display a URL control for a whitespace-only URL', () => {
    const { container } = render(<RichUrlComponent url="   " />);
    expect(container.firstChild).toBeNull();
  });
});
