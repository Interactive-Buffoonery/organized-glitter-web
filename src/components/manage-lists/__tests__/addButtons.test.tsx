import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ArtistPageHeader from '@/components/artist/ArtistPageHeader';
import CompanyPageHeader from '@/components/company/CompanyPageHeader';
import TagPageHeader from '@/components/tags/TagPageHeader';

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock('@/hooks/mutations/useArtistMutations', () => ({ useCreateArtist: () => mutation }));
vi.mock('@/hooks/mutations/useCompanyMutations', () => ({ useCreateCompany: () => mutation }));
vi.mock('@/hooks/mutations/useCreateTag', () => ({ useCreateTag: () => mutation }));

describe('Manage Lists add buttons', () => {
  it.each([
    ['company', <CompanyPageHeader key="company" />],
    ['artist', <ArtistPageHeader key="artist" artists={[]} />],
    ['tag', <TagPageHeader key="tag" />],
  ])('uses sentence case for the %s add flow', (noun, header) => {
    render(header);

    const trigger = screen.getByRole('button', { name: `Add ${noun}` });
    expect(trigger.querySelector('svg')).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByRole('heading', { name: `Add ${noun}` })).toBeInTheDocument();
    expect(document.querySelector('form button[type="submit"]')).toHaveTextContent(`Add ${noun}`);
  });
});
