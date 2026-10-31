import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColoringPagesStatusOptions } from '@/types/pocketbase.types';
import { COLORING_PAGE_STATUS_FILL, getColoringPageStatusLabel } from '@/utils/statusColors';
import { ColoringPageStatusSection } from './ColoringPageStatusSection';

const fills: [ColoringPagesStatusOptions, string][] = [
  ['not_started', 'bg-muted-foreground text-background'],
  ['palette_chosen', 'bg-sky-500 text-white dark:bg-sky-600'],
  ['in_progress', 'bg-diamond-500 text-white dark:bg-diamond-600'],
  ['on_hold', 'bg-amber-500 text-white dark:bg-amber-600'],
  ['completed', 'bg-emerald-500 text-white dark:bg-emerald-600'],
];

describe('ColoringPageStatusSection pill', () => {
  it.each(fills)('uses the solid fill for %s', (status, fill) => {
    render(<ColoringPageStatusSection status={status} onStatusChange={vi.fn()} />);
    const trigger = screen.getByRole('combobox', { name: 'Change page status' });
    expect(COLORING_PAGE_STATUS_FILL[status]).toBe(fill);
    expect(trigger).toHaveClass(...fill.split(' '));
    expect(trigger).toHaveClass('min-h-11', 'rounded-full');
    expect(trigger).toHaveTextContent(getColoringPageStatusLabel(status));
    expect(trigger).not.toHaveClass('bg-primary/10');
    expect(trigger.querySelector('.lucide-circle')).toBeNull();
  });
});
