import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TimelineDateEditor, { type TimelineDateEditorState } from './TimelineDateEditor';

const TimelineDateEditorHarness = (
  props: Omit<ComponentProps<typeof TimelineDateEditor>, 'editorState' | 'onEditorStateChange'>
) => {
  const [editorState, setEditorState] = useState<TimelineDateEditorState | null>(null);
  return (
    <TimelineDateEditor {...props} editorState={editorState} onEditorStateChange={setEditorState} />
  );
};

const { updateDatesMutationState } = vi.hoisted(() => ({
  updateDatesMutationState: {
    mutate: vi.fn(),
    isPending: false,
  },
}));

vi.mock('@/hooks/mutations/useProjectDetailMutations', () => ({
  useUpdateProjectDatesSectionMutation: () => updateDatesMutationState,
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'UTC',
}));

describe('TimelineDateEditor', () => {
  beforeEach(() => {
    updateDatesMutationState.mutate.mockClear();
    updateDatesMutationState.isPending = false;

    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it('normalizes slash dates before submitting with Enter', async () => {
    const user = userEvent.setup();

    render(
      <TimelineDateEditorHarness
        dateKey="dateStarted"
        label="Started"
        value={null}
        projectId="project-123"
        isSet={false}
        formattedDisplay=""
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit Started date' }));
    await user.type(screen.getByRole('textbox', { name: 'Started date' }), '7/3/2024');
    await user.keyboard('{Enter}');

    expect(updateDatesMutationState.mutate).toHaveBeenCalledWith(
      { projectId: 'project-123', dateStarted: '2024-07-03' },
      { onSuccess: expect.any(Function) }
    );
  });

  it('saves a completion date without sending the displayed status', async () => {
    const user = userEvent.setup();
    render(
      <TimelineDateEditorHarness
        dateKey="dateCompleted"
        label="Completed"
        value={null}
        projectId="project-123"
        currentStatus="progress"
        isSet={false}
        formattedDisplay=""
      />
    );
    await user.click(screen.getByRole('button', { name: 'Edit Completed date' }));
    await user.type(screen.getByRole('textbox', { name: 'Completed date' }), '9/20/2026');
    await user.keyboard('{Enter}');
    expect(updateDatesMutationState.mutate).toHaveBeenCalledWith(
      { projectId: 'project-123', dateCompleted: '2026-09-20' },
      { onSuccess: expect.any(Function) }
    );
  });

  it('keeps the date draft open when the save fails', async () => {
    const user = userEvent.setup();
    updateDatesMutationState.mutate.mockImplementationOnce((_input, options) => {
      options?.onError?.(new Error('Invalid date'));
    });

    render(
      <TimelineDateEditorHarness
        dateKey="dateCompleted"
        label="Completed"
        value={null}
        projectId="project-123"
        isSet={false}
        formattedDisplay=""
      />
    );

    await user.click(screen.getByRole('button', { name: 'Edit Completed date' }));
    await user.type(screen.getByRole('textbox', { name: 'Completed date' }), '9/20/2026');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('textbox', { name: 'Completed date' })).toHaveValue('2026-09-20');
    expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('keeps an unsaved date while resizing across the phone and desktop breakpoint', async () => {
    const user = userEvent.setup();
    let desktop = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
      matches: desktop,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (_type, listener) =>
        listeners.add(listener as (event: MediaQueryListEvent) => void),
      removeEventListener: (_type, listener) =>
        listeners.delete(listener as (event: MediaQueryListEvent) => void),
      dispatchEvent: vi.fn(),
    }));

    render(
      <TimelineDateEditorHarness
        dateKey="dateCompleted"
        label="Completed"
        value={null}
        projectId="project-123"
        isSet={false}
        formattedDisplay=""
      />
    );
    await user.click(screen.getByRole('button', { name: 'Edit Completed date' }));
    await user.type(screen.getByRole('textbox', { name: 'Completed date' }), '9/20/2026');

    act(() => {
      desktop = true;
      listeners.forEach(listener => listener({ matches: true } as MediaQueryListEvent));
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Completed date' })).toHaveValue('9/20/2026');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    act(() => {
      desktop = false;
      listeners.forEach(listener => listener({ matches: false } as MediaQueryListEvent));
    });
    expect(screen.getByRole('textbox', { name: 'Completed date' })).toHaveValue('9/20/2026');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateDatesMutationState.mutate).toHaveBeenCalledWith(
      { projectId: 'project-123', dateCompleted: '2026-09-20' },
      { onSuccess: expect.any(Function) }
    );
  });

  it('does not carry an open date draft to another project', async () => {
    const user = userEvent.setup();
    const props = {
      dateKey: 'dateCompleted' as const,
      label: 'Completed',
      value: null,
      isSet: false,
      formattedDisplay: '',
    };
    const { rerender } = render(<TimelineDateEditorHarness {...props} projectId="project-a" />);
    await user.click(screen.getByRole('button', { name: 'Edit Completed date' }));
    await user.type(screen.getByRole('textbox', { name: 'Completed date' }), '9/20/2026');

    rerender(<TimelineDateEditorHarness {...props} projectId="project-b" />);

    expect(screen.queryByRole('textbox', { name: 'Completed date' })).not.toBeInTheDocument();
  });
});
