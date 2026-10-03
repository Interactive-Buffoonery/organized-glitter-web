import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderWithProviders, screen, userEvent, waitFor } from '@/test-utils';
import { DiamondSectionHelper } from '../DiamondSectionHelper';
import { RandomizerResultPanel } from '../RandomizerResultPanel';
import type { RandomizerSection, RandomizerTarget } from '@/types/randomizer';

const diamondTarget: RandomizerTarget = {
  id: 'project-123456789',
  mode: 'diamond',
  targetType: 'diamond_project',
  title: 'Aurora Wolves',
  subtitle: 'Moonlight Co.',
  href: '/projects/project-123456789',
  statusLabel: 'In progress',
  selectedMetadata: {},
  width: 40,
  height: 50,
  totalDiamonds: 80000,
};

describe('DiamondSectionHelper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('picks only entered numbers without requiring canvas dimensions', async () => {
    const onSectionChange = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    renderWithProviders(
      <DiamondSectionHelper
        target={{ ...diamondTarget, width: undefined, height: undefined }}
        section={null}
        onSectionChange={onSectionChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
    fireEvent.change(screen.getByLabelText('Numbers to pick from'), {
      target: { value: '2, 2, 8, 19' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pick number' }));
    await waitFor(() =>
      expect(onSectionChange).toHaveBeenCalledWith({
        kind: 'number',
        number: 8,
        candidates: [2, 8, 19],
      })
    );
    expect(
      screen.queryByText('Add canvas dimensions to pick section sizes.')
    ).not.toBeInTheDocument();
  });

  it.each(['', '1, nope, 3', '0, 2', '-1, 5', '2.5, 3', '9007199254740992'])(
    'rejects invalid number choices: %s',
    async value => {
      const onSectionChange = vi.fn();
      renderWithProviders(
        <DiamondSectionHelper
          target={diamondTarget}
          section={null}
          onSectionChange={onSectionChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
      fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
      fireEvent.change(screen.getByLabelText('Numbers to pick from'), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Pick number' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Enter whole numbers greater than zero');
      expect(onSectionChange).not.toHaveBeenCalled();
    }
  );

  it('preserves an unsaved number list across section mode changes', async () => {
    const onSectionChange = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={null}
        onSectionChange={onSectionChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
    fireEvent.change(screen.getByLabelText('Numbers to pick from'), {
      target: { value: '2, 5, 8, 12' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Size' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
    expect(screen.getByLabelText('Numbers to pick from')).toHaveValue('2, 5, 8, 12');
    fireEvent.click(screen.getByRole('button', { name: 'Pick number' }));
    await waitFor(() =>
      expect(onSectionChange).toHaveBeenCalledWith({
        kind: 'number',
        number: 8,
        candidates: [2, 5, 8, 12],
      })
    );
  });

  it('preserves custom dimensions and included sizes across mode changes', async () => {
    const onSectionChange = vi.fn();
    renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={null}
        onSectionChange={onSectionChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    for (const name of ['3 x 3', '4 x 4', '5 x 5', 'Custom']) {
      fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    fireEvent.change(screen.getByLabelText('Width in cm'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Height in cm'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Number' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Size' }));
    expect(screen.getByRole('checkbox', { name: 'Custom' })).toBeChecked();
    for (const name of ['3 x 3', '4 x 4', '5 x 5']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
    }
    expect(screen.getByLabelText('Width in cm')).toHaveValue(12);
    expect(screen.getByLabelText('Height in cm')).toHaveValue(8);
    fireEvent.click(screen.getByRole('button', { name: 'Pick size' }));
    await waitFor(() =>
      expect(onSectionChange).toHaveBeenCalledWith({
        widthCm: 12,
        heightCm: 8,
        estimatedDiamonds: 3840,
      })
    );
  });

  it('restores saved number choices and permits switching back to sizes', () => {
    renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={{ kind: 'number', number: 8, candidates: [2, 8, 19] }}
        onSectionChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    expect(screen.getByRole('radio', { name: 'Number' })).toBeChecked();
    expect(screen.getByLabelText('Numbers to pick from')).toHaveValue('2, 8, 19');
    expect(screen.getByRole('status')).toHaveTextContent('Number picked: 8');
    fireEvent.click(screen.getByRole('radio', { name: 'Size' }));
    expect(screen.getByRole('checkbox', { name: '3 x 3' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Pick size' })).toBeInTheDocument();
  });

  it('is not rendered for non-diamond randomizer results', () => {
    renderWithProviders(
      <RandomizerResultPanel
        target={{
          id: 'book-12345678901',
          mode: 'coloring-book',
          targetType: 'coloring_book',
          title: 'Garden Pages',
          subtitle: 'Indie Press',
          href: '/coloring/book-12345678901',
          statusLabel: 'Started',
          selectedMetadata: {},
        }}
        section={null}
        onSectionChange={vi.fn()}
        onSaveDiamondProgressNote={vi.fn()}
        getDefaultDiamondProgressNote={vi.fn(() => '')}
        onClear={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /pick a section/i })).not.toBeInTheDocument();
  });

  it('shows a dimensions message when project dimensions are missing', () => {
    renderWithProviders(
      <DiamondSectionHelper
        target={{ ...diamondTarget, width: undefined, height: undefined }}
        section={null}
        onSectionChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));

    expect(screen.getByText(/add canvas dimensions/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /edit project dimensions/i })).toHaveAttribute(
      'href',
      '/projects/project-123456789/edit'
    );
  });

  it('shows section size as an obvious next step without helper copy', () => {
    renderWithProviders(
      <DiamondSectionHelper target={diamondTarget} section={null} onSectionChange={vi.fn()} />
    );

    expect(screen.getByText('Want to pick a section?')).toBeInTheDocument();
    expect(screen.queryByText(/optional helper/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));

    expect(screen.getByRole('heading', { name: 'Pick a section' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /^3 x 3$/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^4 x 4$/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /^5 x 5$/i })).toBeChecked();
    expect(screen.queryByText(/optional helper/i)).not.toBeInTheDocument();
  });

  it('validates custom sizes and picks a custom section without coordinates', async () => {
    const onSectionChange = vi.fn();
    const savedSection: RandomizerSection = {
      widthCm: 12,
      heightCm: 8,
      estimatedDiamonds: 3840,
    };

    const { rerender } = renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={null}
        onSectionChange={onSectionChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^3 x 3$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^4 x 4$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^5 x 5$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /custom/i }));
    fireEvent.change(screen.getByLabelText(/width in cm/i), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /pick size/i }));

    expect(screen.getByText(/must fit inside/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/width in cm/i), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/height in cm/i), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /pick size/i }));

    await waitFor(() => {
      expect(onSectionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          widthCm: 12,
          heightCm: 8,
          estimatedDiamonds: 3840,
        })
      );
    });
    expect(onSectionChange.mock.calls[0][0]).not.toHaveProperty('xCm');
    expect(onSectionChange.mock.calls[0][0]).not.toHaveProperty('yCm');

    rerender(
      <DiamondSectionHelper
        target={diamondTarget}
        section={savedSection}
        onSectionChange={onSectionChange}
      />
    );

    expect(screen.getByText('Size randomly picked:')).toBeInTheDocument();
    expect(screen.getByText('12 x 8 cm')).toBeInTheDocument();
    expect(screen.getByText('Estimated diamonds (approx.): 3,840')).toBeInTheDocument();
    expect(screen.queryByText(/start .*from left/i)).not.toBeInTheDocument();
  });

  it('keeps the initial size pick pending until its save finishes', async () => {
    let finishSave!: () => void;
    const save = new Promise<void>(resolve => {
      finishSave = resolve;
    });
    const onSectionChange = vi.fn(() => save);

    renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={null}
        onSectionChange={onSectionChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pick a section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick size' }));

    const pendingButton = screen.getByRole('button', { name: 'Picking...' });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '3 x 3' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Number' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Number' }));
    expect(screen.getByRole('radio', { name: 'Size' })).toBeChecked();
    fireEvent.click(pendingButton);
    expect(onSectionChange).toHaveBeenCalledTimes(1);

    await act(async () => finishSave());
    expect(screen.getByRole('button', { name: 'Pick size' })).toBeEnabled();
  });

  it('shows a delayed reroll state when trying another section size', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const onSectionChange = vi.fn();
    const savedSection: RandomizerSection = {
      widthCm: 4,
      heightCm: 4,
      estimatedDiamonds: 640,
    };

    const { rerender } = renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={null}
        onSectionChange={onSectionChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));

    rerender(
      <DiamondSectionHelper
        target={diamondTarget}
        section={savedSection}
        onSectionChange={onSectionChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByRole('button', { name: /picking/i })).toBeDisabled();
    expect(onSectionChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onSectionChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(onSectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        widthCm: 4,
        heightCm: 4,
        estimatedDiamonds: 640,
      })
    );
  });

  it('cancels a delayed reroll when the result target changes', async () => {
    vi.useFakeTimers();
    const onSectionChange = vi.fn();
    const savedSection: RandomizerSection = {
      widthCm: 4,
      heightCm: 4,
      estimatedDiamonds: 640,
    };
    const progressNote = {
      onSave: vi.fn(),
      getDefault: vi.fn(() => ''),
    };

    const { rerender } = renderWithProviders(
      <RandomizerResultPanel
        target={diamondTarget}
        section={savedSection}
        onSectionChange={onSectionChange}
        progressNote={progressNote}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    rerender(
      <RandomizerResultPanel
        target={{ ...diamondTarget, id: 'project-987654321', title: 'Evening Lake' }}
        section={null}
        onSectionChange={onSectionChange}
        progressNote={progressNote}
        onClear={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /pick a section/i })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(onSectionChange).not.toHaveBeenCalled();
  });

  it('picks from selected preset sizes only', async () => {
    const onSectionChange = vi.fn();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    renderWithProviders(
      <DiamondSectionHelper
        target={diamondTarget}
        section={null}
        onSectionChange={onSectionChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    fireEvent.click(screen.getByRole('button', { name: /pick size/i }));

    await waitFor(() => {
      expect(onSectionChange).toHaveBeenCalledWith(
        expect.objectContaining({
          widthCm: 5,
          heightCm: 5,
          estimatedDiamonds: 1000,
        })
      );
    });
  });

  it('shows an error when selected sizes cannot fit', () => {
    renderWithProviders(
      <DiamondSectionHelper
        target={{ ...diamondTarget, width: 4, height: 4 }}
        section={null}
        onSectionChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /pick a section/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^3 x 3$/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /^4 x 4$/i }));
    fireEvent.click(screen.getByRole('button', { name: /pick size/i }));

    expect(screen.getByText(/selected section sizes must fit/i)).toBeInTheDocument();
  });
});
