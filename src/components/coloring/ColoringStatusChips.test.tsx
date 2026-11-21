import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ColoringFilterProvider } from '@/contexts/ColoringFilterContext';
import { ColoringStatusChips } from './ColoringStatusChips';

const bookStatuses = [
  'wishlist',
  'in_progress',
  'in_progress',
  'archived',
  'archived',
  'destashed',
];

vi.mock('@/services/pocketbase/coloring.service', () => ({
  ColoringService: {
    listBooks: vi.fn(async ({ filter }: { filter: string }) => {
      const included = [...filter.matchAll(/status = "(\w+)"/g)].map(match => match[1]);
      const excluded = [...filter.matchAll(/status != "(\w+)"/g)].map(match => match[1]);
      const totalItems = bookStatuses.filter(status =>
        included.length ? included.includes(status) : !excluded.includes(status)
      ).length;
      return { items: [], totalItems };
    }),
  },
}));
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }));
vi.mock('@/hooks/use-mobile', () => ({
  useMobileDevice: () => ({ isMobile: false, isTablet: false }),
}));
vi.mock('@/hooks/queries/coloring/useBookPublishers', () => ({
  useBookPublishers: () => ({ data: { items: [] }, isLoading: false }),
}));
vi.mock('@/hooks/queries/coloring/useBookIllustrators', () => ({
  useBookIllustrators: () => ({ data: { items: [] }, isLoading: false }),
}));
vi.mock('@/hooks/queries/coloring/useColoringTags', () => ({
  useColoringTags: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/queries/useColoringNavigationContext', () => ({
  useColoringNavigationContext: () => ({ data: null, isLoading: false, isFetching: false }),
}));
vi.mock('@/hooks/mutations/useSaveColoringNavigationContext', () => ({
  useSaveColoringNavigationContext: () => ({ mutate: vi.fn() }),
}));

function LocationSearch() {
  return <output aria-label="location">{useLocation().search}</output>;
}

const renderChips = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/dashboard?craft=coloring${search}`]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ColoringFilterProvider user={{ id: 'example-user' }}>
          <ColoringStatusChips userId="example-user" />
          <LocationSearch />
        </ColoringFilterProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );

const chip = (name: string) => screen.findByRole('button', { name });

describe('coloring status chips', () => {
  it('hides Archived and Destashed while their switches are off', async () => {
    renderChips('');
    expect(await chip('All 3')).toBeInTheDocument();
    expect(await chip('In progress 2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archived|Destashed/ })).not.toBeInTheDocument();
  });

  it('adds up to All when both switches are on', async () => {
    renderChips('&includeArchived=true&includeDestashed=true');
    expect(await chip('All 6')).toBeInTheDocument();
    expect(await chip('Archived 2')).toBeInTheDocument();
    expect(await chip('Destashed 1')).toBeInTheDocument();
  });

  it('keeps both switches when a chip is selected and returns to the same All', async () => {
    renderChips('&includeArchived=true&includeDestashed=true');
    fireEvent.click(await chip('Archived 2'));

    expect(await chip('Archived 2')).toHaveAttribute('aria-pressed', 'true');
    expect(await chip('Destashed 1')).toBeInTheDocument();
    const search = screen.getByLabelText('location').textContent ?? '';
    expect(search).toContain('includeArchived=true');
    expect(search).toContain('includeDestashed=true');

    fireEvent.click(await chip('All 6'));
    expect(await chip('All 6')).toHaveAttribute('aria-pressed', 'true');
    expect(await chip('Destashed 1')).toBeInTheDocument();
  });

  it('drops the count of a deep-linked chip that falls outside All', async () => {
    renderChips('&status=archived');
    expect(await chip('All 3')).toBeInTheDocument();
    expect(await chip('Archived')).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles multiple statuses and clears them with All', async () => {
    renderChips('');
    fireEvent.click(await chip('In progress 2'));
    fireEvent.click(await chip('Wishlist 1'));
    expect(await chip('Wishlist 1')).toHaveAttribute('aria-pressed', 'true');
    expect(await chip('In progress 2')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(await chip('All 3'));
    expect(await chip('All 3')).toHaveAttribute('aria-pressed', 'true');
    expect(await chip('Wishlist 1')).toHaveAttribute('aria-pressed', 'false');
  });
});
