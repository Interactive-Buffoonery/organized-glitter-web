import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RandomizerNextUpPanel } from '../RandomizerNextUpPanel';
import type { RandomizerNextUpPreferences } from '@/types/randomizer';

const preferences: RandomizerNextUpPreferences = {
  version: 1,
  targets: {
    diamond: {
      id: 'project-1',
      mode: 'diamond',
      targetType: 'diamond_project',
      title: 'Diamond Project',
      subtitle: 'Company',
      href: '/projects/project-1',
      savedAt: '2026-05-12T12:00:00Z',
    },
    'coloring-book': {
      id: 'book-1',
      mode: 'coloring-book',
      targetType: 'coloring_book',
      title: 'Hidden Book',
      subtitle: 'Publisher',
      href: '/coloring/book-1',
      savedAt: '2026-05-12T12:00:00Z',
    },
    'coloring-page': {
      id: 'page-1',
      mode: 'coloring-page',
      targetType: 'coloring_page',
      title: 'Hidden Page',
      subtitle: 'Book',
      href: '/coloring/book-1/pages/page-1',
      savedAt: '2026-05-12T12:00:00Z',
    },
  },
};

describe('RandomizerNextUpPanel', () => {
  it('hides saved coloring picks when coloring is disabled', () => {
    render(
      <MemoryRouter>
        <RandomizerNextUpPanel
          preferences={preferences}
          activeMode="diamond"
          canUseDiamond
          canUseColoring={false}
          onClear={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Diamond Project')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Book')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden Page')).not.toBeInTheDocument();
    expect(screen.queryByText('Coloring books')).not.toBeInTheDocument();
    expect(screen.queryByText('Coloring pages')).not.toBeInTheDocument();
  });
});
