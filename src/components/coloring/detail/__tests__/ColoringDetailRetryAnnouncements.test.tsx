import '@testing-library/jest-dom/vitest';
import { describe, expect, it, renderWithProviders, screen } from '@/test-utils';
import { ColoringDetailRetryAnnouncements } from '../ColoringDetailRetryAnnouncements';

describe('ColoringDetailRetryAnnouncements', () => {
  it('keeps a second retry outcome available when the first failed earlier', () => {
    const { rerender } = renderWithProviders(
      <ColoringDetailRetryAnnouncements
        primary="Still could not load coloring book. Try again."
        secondary="Trying again to load coloring book pages."
      />
    );

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('Trying again to load coloring book pages.')).toBeInTheDocument();

    rerender(
      <ColoringDetailRetryAnnouncements
        primary="Still could not load coloring book. Try again."
        secondary="Coloring book pages loaded."
      />
    );
    expect(screen.getByText('Coloring book pages loaded.')).toBeInTheDocument();
  });
});
