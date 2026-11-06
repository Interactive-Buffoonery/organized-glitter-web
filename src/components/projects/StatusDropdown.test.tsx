import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectStatus } from '@/types/project';
import { FILTER_STATUS_ACTIVE_FILL } from '@/utils/statusColors';
import StatusDropdown from './StatusDropdown';

describe('StatusDropdown pill', () => {
  it.each<ProjectStatus>([
    'wishlist',
    'purchased',
    'stash',
    'kitted',
    'progress',
    'onhold',
    'completed',
    'archived',
    'destashed',
  ])('uses the library solid fill for %s', status => {
    render(<StatusDropdown currentStatus={status} onStatusChange={vi.fn()} variant="pill" />);
    const trigger = screen.getByRole('combobox', { name: 'Change project status' });
    expect(trigger).toHaveClass(...FILTER_STATUS_ACTIVE_FILL[status].split(' '));
    expect(trigger).toHaveClass('min-h-11', 'rounded-full');
    expect(trigger).not.toHaveClass('bg-current/10');
    expect(trigger.querySelector('span[aria-hidden="true"]')).toBeNull();
  });
});
