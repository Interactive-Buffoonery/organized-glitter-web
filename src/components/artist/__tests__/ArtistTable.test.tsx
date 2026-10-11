import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ArtistTable from '../ArtistTable';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';

const { countsState, refetchMock } = vi.hoisted(() => ({
  countsState: {
    data: undefined as Record<string, number> | undefined,
    isLoading: false,
    isError: false,
  },
  refetchMock: vi.fn(),
}));

vi.mock('@/hooks/queries/useArtistProjectCounts', () => ({
  useArtistProjectCounts: () => ({ ...countsState, refetch: refetchMock }),
}));

vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useDeleteArtist: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../EditArtistDialog', () => ({
  default: () => null,
}));

const artists: ArtistListItem[] = [
  { id: 'artist-id-abc', name: 'Abstract Artist' },
  { id: 'artist-id-one', name: 'Clara Moon' },
  { id: 'artist-id-none', name: 'Unused Artist' },
];

const renderTable = () =>
  render(
    <MemoryRouter>
      <ArtistTable artists={artists} loading={false} />
    </MemoryRouter>
  );

describe('ArtistTable project counts', () => {
  beforeEach(() => {
    countsState.data = { 'artist-id-abc': 3, 'artist-id-one': 1 };
    countsState.isLoading = false;
    countsState.isError = false;
    refetchMock.mockReset();
  });

  it('labels the column Projects', () => {
    renderTable();

    expect(screen.getByRole('columnheader', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('links each count to the dashboard filtered by artist ID, not name', () => {
    renderTable();

    expect(screen.getByRole('link', { name: '3 projects' })).toHaveAttribute(
      'href',
      '/dashboard?artist=artist-id-abc'
    );
    expect(screen.getByRole('link', { name: '1 project' })).toHaveAttribute(
      'href',
      '/dashboard?artist=artist-id-one'
    );
  });

  it('shows artists without projects as plain text instead of a link', () => {
    renderTable();

    expect(screen.getByText('No projects')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows an unavailable state and retries a failed count request', () => {
    countsState.data = undefined;
    countsState.isError = true;
    renderTable();

    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Retry project counts' }));
    expect(refetchMock).toHaveBeenCalledOnce();
  });
});
