import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCompletionStatusConfirmation } from '@/hooks/useCompletionStatusConfirmation';
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

describe('ColoringBookHero completion prompt focus', () => {
  it.each(['Escape', 'Keep Completed', 'Change status'])(
    'returns focus to the status trigger after %s',
    async action => {
      const user = userEvent.setup();
      let finishSave: (() => void) | undefined;
      const save = new Promise<void>(resolve => {
        finishSave = resolve;
      });
      const Harness = () => {
        const [pending, setPending] = useState(false);
        const [status, setStatus] = useState(ColoringBooksStatusOptions.completed);
        const { confirm, dialog } = useCompletionStatusConfirmation({ countsAsFinished: false });
        return (
          <>
            <ColoringBookHero
              book={{ status, totalPages: 10, dateCompleted: '2026-01-01' } as ColoringBookDTO}
              coverUrl=""
              inProgressPages={0}
              safeCompletedPages={10}
              safeCompletionPct={100}
              updatePending={pending}
              onStatusChange={async next => {
                if (await confirm()) {
                  setPending(true);
                  await save;
                  setStatus(next);
                  setPending(false);
                }
              }}
            />
            {dialog}
          </>
        );
      };
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Completed' });
      await user.click(trigger);
      await user.click(screen.getByRole('button', { name: 'In progress' }));
      expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
      if (action === 'Escape') await user.keyboard('{Escape}');
      else await user.click(screen.getByRole('button', { name: action }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      if (action === 'Change status') {
        expect(trigger).toHaveAttribute('aria-disabled', 'true');
        await user.keyboard('{Enter}');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await act(async () => finishSave?.());
        expect(trigger).toHaveTextContent('In progress');
        expect(trigger).toHaveFocus();
      } else expect(trigger).toHaveTextContent('Completed');
    }
  );
});
