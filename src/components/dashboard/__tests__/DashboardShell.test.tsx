import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { DashboardShell } from '../DashboardShell';

describe('DashboardShell', () => {
  it('renders the Library heading and craft switch without decorative icons', () => {
    const { container } = render(
      <MemoryRouter>
        <DashboardShell activeMode="diamond" canUseDiamond canUseColoring onModeChange={vi.fn()}>
          <div>Dashboard content</div>
        </DashboardShell>
      </MemoryRouter>
    );

    const craftSwitch = screen.getByRole('group');

    expect(screen.getByRole('heading', { level: 1, name: 'Library' })).toHaveAttribute(
      'data-testid',
      'library-page-heading'
    );

    expect(
      within(craftSwitch).getByRole('button', { name: 'Diamond paintings' })
    ).toBeInTheDocument();
    expect(within(craftSwitch).getByRole('button', { name: 'Coloring books' })).toBeInTheDocument();
    expect(
      within(craftSwitch).queryByRole('button', { name: 'Coloring pages' })
    ).not.toBeInTheDocument();
    expect(container.querySelector('[role="group"] svg')).not.toBeInTheDocument();
  });
});
