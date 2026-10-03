/**
 * Regression: ArtistTable "View projects" links must carry the artist ID,
 * not the artist name.
 *
 * projects.service.ts filters artists via `artist = {:artist}`, which matches
 * on the artist FK (an ID). Before the fix, the link generated `?artist=<name>`
 * which silently returned zero projects on the dashboard.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ArtistTable from '../ArtistTable';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';

vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useDeleteArtist: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../EditArtistDialog', () => ({
  default: () => null,
}));

const mockArtist: ArtistListItem = {
  id: 'artist-id-abc',
  name: 'Abstract Artist',
};

describe('ArtistTable dashboard link', () => {
  it('links "View projects" to /dashboard with the artist ID, not the artist name', () => {
    render(
      <MemoryRouter>
        <ArtistTable artists={[mockArtist]} loading={false} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: /view projects/i });
    const href = link.getAttribute('href') || '';

    expect(href).toBe('/dashboard?artist=artist-id-abc');
    expect(href).not.toContain('Abstract');
  });
});
