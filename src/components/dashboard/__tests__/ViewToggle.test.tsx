import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import ViewToggle from '../ViewToggle';

describe('ViewToggle', () => {
  it('renders all three view toggles and emits the value when clicked', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    renderWithProviders(<ViewToggle activeView="grid" onViewChange={onViewChange} />);

    expect(screen.getByRole('button', { name: /grid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /list/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /table/i }));

    expect(onViewChange).toHaveBeenCalledWith('table');
  });

  it('renders the table toggle on mobile viewports too', () => {
    renderWithProviders(<ViewToggle activeView="list" onViewChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /table/i })).toBeInTheDocument();
  });
});
