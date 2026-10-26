import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColoringBookDTO } from '@/services/pocketbase/coloring.service';
import { ColoringBooksStatusOptions } from '@/types/pocketbase.types';
import { getColoringBookStatusColor, getColoringBookStatusLabel } from '@/utils/statusColors';
import { ColoringBookHero } from './ColoringBookHero';

describe('ColoringBookHero status pill', () => {
  it.each(Object.values(ColoringBooksStatusOptions))(
    'uses the library solid fill for %s',
    status => {
      render(
        <ColoringBookHero
          book={{ status, totalPages: 10 } as ColoringBookDTO}
          coverUrl=""
          inProgressPages={0}
          safeCompletedPages={0}
          safeCompletionPct={0}
          updatePending={false}
          onStatusChange={vi.fn()}
        />
      );
      const trigger = screen.getByRole('button', { name: getColoringBookStatusLabel(status) });
      expect(trigger).toHaveClass(...getColoringBookStatusColor(status).split(' '));
      expect(trigger).toHaveClass('min-h-11', 'rounded-full');
      expect(trigger).not.toHaveClass('bg-accent/10', 'text-accent');
      expect(trigger.querySelector('.lucide-circle')).toBeNull();
    }
  );
});
