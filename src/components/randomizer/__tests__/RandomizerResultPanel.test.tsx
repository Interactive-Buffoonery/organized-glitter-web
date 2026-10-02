import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '@/test-utils';
import { RandomizerResultPanel } from '../RandomizerResultPanel';
import type { RandomizerTarget } from '@/types/randomizer';

const diamondTarget: RandomizerTarget = {
  id: 'project-1',
  mode: 'diamond',
  targetType: 'diamond_project',
  title: 'Aurora Wolves',
  subtitle: 'Moonlight Co.',
  href: '/projects/project-1',
  statusLabel: 'In progress',
  selectedMetadata: {},
};

const bookTarget: RandomizerTarget = {
  id: 'book-1',
  mode: 'coloring-book',
  targetType: 'coloring_book',
  title: 'Garden Pages',
  subtitle: 'Indie Press',
  href: '/coloring/book-1',
  statusLabel: 'In progress',
  selectedMetadata: { coloringBook: 'book-1' },
};

const pageTarget: RandomizerTarget = {
  id: 'page-1',
  mode: 'coloring-page',
  targetType: 'coloring_page',
  title: 'Garden Pages, page 7',
  subtitle: 'Garden Pages',
  href: '/coloring/book-1/pages/page-1',
  statusLabel: 'Palette chosen',
  selectedMetadata: { coloringPage: 'page-1' },
};

const baseProps = {
  section: null,
  onSectionChange: vi.fn(),
  progressNote: {
    onSave: vi.fn(),
    getDefault: vi.fn(() => 'Diamond note'),
  },
  onClear: vi.fn(),
};

describe('RandomizerResultPanel', () => {
  it('announces page picking failures', () => {
    renderWithProviders(
      <RandomizerResultPanel
        {...baseProps}
        target={bookTarget}
        pagePicker={{ onPick: vi.fn(), error: 'Could not pick a page.' }}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not pick a page.');
  });

  it('announces the picked page and preserves focus when its trigger is replaced', () => {
    const { rerender } = renderWithProviders(
      <RandomizerResultPanel {...baseProps} target={bookTarget} pagePicker={{ onPick: vi.fn() }} />
    );
    const trigger = screen.getByRole('button', { name: 'Pick a page' });
    trigger.focus();
    fireEvent.click(trigger);
    rerender(
      <RandomizerResultPanel
        {...baseProps}
        target={bookTarget}
        pagePicker={{ onPick: vi.fn(), isPicking: true }}
      />
    );
    fireEvent.blur(trigger, { relatedTarget: null });
    trigger.blur();
    rerender(<RandomizerResultPanel {...baseProps} target={pageTarget} />);
    expect(screen.getByRole('status')).toHaveTextContent(pageTarget.title);
    expect(screen.getByRole('heading', { name: pageTarget.title })).toHaveFocus();
  });

  it('does not steal focus from an unchanged result action', () => {
    const { rerender } = renderWithProviders(
      <RandomizerResultPanel {...baseProps} target={bookTarget} pagePicker={{ onPick: vi.fn() }} />
    );
    const link = screen.getByRole('link', { name: 'View book' });
    link.focus();
    rerender(<RandomizerResultPanel {...baseProps} target={pageTarget} />);
    expect(screen.getByRole('link', { name: 'View page' })).toHaveFocus();
  });

  it('saves the current result as next up for its mode', () => {
    const onToggleNextUp = vi.fn();

    renderWithProviders(
      <RandomizerResultPanel
        {...baseProps}
        target={diamondTarget}
        nextUp={{
          target: null,
          onToggle: onToggleNextUp,
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /set as next up/i }));

    expect(onToggleNextUp).toHaveBeenCalledWith(diamondTarget);
    expect(screen.getByRole('link', { name: /view project/i })).toHaveAttribute(
      'href',
      '/projects/project-1'
    );
  });

  it('keeps coloring book note saving hidden until a page is picked', () => {
    renderWithProviders(
      <RandomizerResultPanel
        {...baseProps}
        target={bookTarget}
        pagePicker={{
          onPick: vi.fn(),
        }}
      />
    );

    expect(screen.getByRole('link', { name: /view book/i })).toHaveAttribute(
      'href',
      '/coloring/book-1'
    );
    expect(screen.getByRole('button', { name: /pick a page/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save page note/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save progress note/i })).not.toBeInTheDocument();
  });

  it('shows page note saving for coloring page results', () => {
    renderWithProviders(
      <RandomizerResultPanel
        {...baseProps}
        target={pageTarget}
        randomizerNote={{
          onSave: vi.fn(),
          getDefault: vi.fn(() => 'Page note'),
        }}
      />
    );

    expect(screen.getByRole('link', { name: /view page/i })).toHaveAttribute(
      'href',
      '/coloring/book-1/pages/page-1'
    );
    expect(screen.getByRole('button', { name: /save page note/i })).toBeInTheDocument();
  });
});
