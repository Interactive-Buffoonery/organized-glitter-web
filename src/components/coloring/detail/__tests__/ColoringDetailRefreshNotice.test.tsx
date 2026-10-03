import { renderWithProviders, screen, vi, describe, it, expect } from '@/test-utils';
import { ColoringDetailRefreshNotice } from '../ColoringDetailRefreshNotice';

describe('ColoringDetailRefreshNotice', () => {
  it('announces the failed refresh once and disables retry while it runs', () => {
    renderWithProviders(
      <ColoringDetailRefreshNotice kind="page" retryable isRetrying onRetry={vi.fn()} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring page');
    expect(screen.getByRole('button', { name: 'Trying again' })).toBeDisabled();
    expect(screen.getByRole('alert')).not.toHaveTextContent('Trying again');
  });

  it('keeps the failure visible without retry for a non-retryable refresh', () => {
    renderWithProviders(
      <ColoringDetailRefreshNotice kind="book" retryable={false} onRetry={vi.fn()} />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not refresh coloring book');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
