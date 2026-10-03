import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '@/test-utils';
import { RandomizerTargetSelector } from '../RandomizerTargetSelector';
import type { RandomizerTarget } from '@/types/randomizer';

const targets: RandomizerTarget[] = [
  {
    id: 'target-1',
    mode: 'diamond',
    targetType: 'diamond_project',
    title: 'Aurora Wolves',
    subtitle: 'Moonlight Co.',
    href: '/projects/target-1',
    statusLabel: 'In progress',
    selectedMetadata: {},
  },
  {
    id: 'target-2',
    mode: 'coloring-book',
    targetType: 'coloring_book',
    title: 'Garden Pages',
    subtitle: 'Indie Press',
    href: '/coloring/target-2',
    statusLabel: 'Started',
    selectedMetadata: {},
  },
];

describe('RandomizerTargetSelector', () => {
  it('toggles flat target rows by click and keyboard', () => {
    const onTargetToggle = vi.fn();

    renderWithProviders(
      <RandomizerTargetSelector
        targets={targets}
        selectedTargetIds={new Set(['target-1'])}
        onTargetToggle={onTargetToggle}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /deselect aurora wolves/i }));
    expect(onTargetToggle).toHaveBeenCalledWith('target-1');

    fireEvent.keyDown(screen.getByRole('button', { name: /select garden pages/i }), {
      key: 'Enter',
    });
    expect(onTargetToggle).toHaveBeenCalledWith('target-2');
  });

  it('reports selected count and supports select all or none', () => {
    const onSelectAll = vi.fn();
    const onSelectNone = vi.fn();

    renderWithProviders(
      <RandomizerTargetSelector
        targets={targets}
        selectedTargetIds={new Set(['target-1'])}
        onTargetToggle={vi.fn()}
        onSelectAll={onSelectAll}
        onSelectNone={onSelectNone}
      />
    );

    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^select all$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^deselect all$/i }));

    expect(onSelectAll).toHaveBeenCalledOnce();
    expect(onSelectNone).toHaveBeenCalledOnce();
  });
  it('keeps hidden selections and wheel numbers when searching the list', () => {
    renderWithProviders(
      <RandomizerTargetSelector
        targets={targets}
        selectedTargetIds={new Set(['target-1', 'target-2'])}
        onTargetToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('searchbox', { name: /search projects/i }), {
      target: { value: 'Garden' },
    });
    expect(
      screen.queryByRole('button', { name: /deselect aurora wolves/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /deselect garden pages/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /deselect garden pages/i })).toHaveAccessibleName(
      'Deselect Garden Pages. Wheel number 2. Started. Indie Press'
    );
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
  });

  it('navigates only visible rows with the keyboard after a search', () => {
    renderWithProviders(
      <RandomizerTargetSelector
        targets={targets}
        selectedTargetIds={new Set()}
        onTargetToggle={vi.fn()}
        onSelectAll={vi.fn()}
        onSelectNone={vi.fn()}
      />
    );
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Garden' } });
    const row = screen.getByRole('button', { name: /select garden pages/i });
    row.focus();
    fireEvent.keyDown(row, { key: 'End' });
    expect(row).toHaveFocus();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'No matching title' } });
    expect(screen.getByRole('status')).toHaveTextContent('No items match your search.');
  });
});
