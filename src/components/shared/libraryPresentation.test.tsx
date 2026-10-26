import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusChips } from './StatusChips';
import { formatKitMetadata, formatLibraryDate } from './libraryPresentation';

describe('library presentation', () => {
  it('keeps All, hides zero counts and wires the full status label', () => {
    const onChange = vi.fn();
    render(
      <StatusChips
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'All', count: 0 },
          { value: 'progress', label: 'In progress', count: 12 },
          { value: 'wishlist', label: 'Wishlist', count: 0 },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'All, 0' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Wishlist/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'In progress, 12' }));
    expect(onChange).toHaveBeenCalledWith('progress');
  });
  it('formats a short date and today without shifting date-only values', () => {
    expect(formatLibraryDate('2026-10-18', new Date(2026, 9, 20))).toBe('Oct 18');
    expect(formatLibraryDate('2026-10-20', new Date(2026, 9, 20))).toBe('Today');
    expect(formatLibraryDate('invalid')).toBe('');
  });
  it('joins only available kit metadata', () => {
    expect(
      formatKitMetadata({ company: 'Company', width: 50, height: 70, drillShape: 'round' })
    ).toBe('Company · 50x70 · Round');
    expect(formatKitMetadata({ company: '', width: 50 })).toBe('');
    expect(formatKitMetadata({ drillShape: 'square' })).toBe('Square');
  });
});
