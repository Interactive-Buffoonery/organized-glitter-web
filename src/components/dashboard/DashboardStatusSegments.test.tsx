import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DashboardStatusSegments from './DashboardStatusSegments';

vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }));

describe('DashboardStatusSegments', () => {
  it('offers Archived and Destashed chips when those kits exist', () => {
    render(
      <DashboardStatusSegments
        activeStatus="everything"
        displayedCounts={{
          everything: 5,
          wishlist: 1,
          purchased: 0,
          stash: 1,
          kitted: 0,
          progress: 1,
          onhold: 0,
          completed: 0,
          archived: 2,
          destashed: 3,
        }}
        isLoadingCounts={false}
        hasCountError={false}
        onStatusChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Archived 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Destashed 3' })).toBeInTheDocument();
  });
});
