import { renderWithProviders, screen, userEvent, vi, describe, it, expect } from '@/test-utils';
import { ColoringDetailUnavailable } from '../ColoringDetailUnavailable';

const renderFailure = (error: unknown, isRetrying = false) => {
  const onRetry = vi.fn();
  renderWithProviders(
    <ColoringDetailUnavailable
      kind="book"
      error={error}
      backPath="/dashboard?craft=coloring&status=wishlist&page=3"
      backLabel="Back to coloring"
      onRetry={onRetry}
      isRetrying={isRetrying}
    />
  );
  return onRetry;
};

describe('ColoringDetailUnavailable', () => {
  it.each([
    [{ type: 'not_found', message: 'Missing', retryable: false }, 'Coloring book not found'],
    [{ type: 'auth', message: 'Sign in', retryable: false }, 'Sign in to view this coloring book'],
    [
      { type: 'permission', message: 'No access', retryable: false },
      'You cannot view this coloring book',
    ],
    [{ type: 'network', message: 'Offline', retryable: true }, 'Could not load coloring book'],
  ])('classifies %j as %s and keeps the filtered return link', (error, heading) => {
    renderFailure(error);
    expect(screen.getByRole('heading', { name: heading })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to coloring' })).toHaveAttribute(
      'href',
      '/dashboard?craft=coloring&status=wishlist&page=3'
    );
  });

  it('retries a failed request in place', async () => {
    const onRetry = renderFailure({ type: 'server', message: 'Unavailable', retryable: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load coloring book');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each(['auth', 'permission', 'not_found', 'cancelled', 'validation', 'server'])(
    'does not offer retry for a non-retryable %s failure',
    type => {
      renderFailure({ type, message: 'Cannot retry', retryable: false });
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    }
  );

  it('disables duplicate retry requests while announcing progress', () => {
    renderFailure({ type: 'server', message: 'Unavailable', retryable: true }, true);
    expect(screen.getByRole('button', { name: 'Trying again' })).toBeDisabled();
    expect(screen.getByRole('alert')).not.toHaveTextContent('Trying again');
  });

  it('shows an empty detail state when no record or error exists', () => {
    renderFailure(null);
    expect(screen.getByRole('heading', { name: 'No coloring book selected' })).toBeVisible();
  });
});
