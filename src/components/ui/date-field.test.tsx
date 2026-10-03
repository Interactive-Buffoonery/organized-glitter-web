import * as React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getLocalTimeZone, today } from '@internationalized/date';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DateField } from './date-field';

type ControlledDateFieldOptions = Omit<
  React.ComponentProps<typeof DateField>,
  'value' | 'onChange'
> & {
  initialValue?: string;
  onValueChange?: (value: string) => void;
};

function renderControlledDateField(
  { initialValue = '', onValueChange, ...props }: ControlledDateFieldOptions,
  wrapper?: (children: React.ReactElement) => React.ReactElement
) {
  function ControlledDateField() {
    const [value, setValue] = React.useState(initialValue);

    return (
      <DateField
        value={value}
        onChange={nextValue => {
          setValue(nextValue);
          onValueChange?.(nextValue);
        }}
        {...props}
      />
    );
  }

  return render(wrapper ? wrapper(<ControlledDateField />) : <ControlledDateField />);
}

function narrowDateFieldWrapper(children: React.ReactElement) {
  return <div style={{ width: '16rem' }}>{children}</div>;
}

describe('DateField', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
  });

  it('keeps manual typing as exact strings', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'progress note date',
      'aria-label': 'progress note date',
      onValueChange,
    });

    await user.type(screen.getByLabelText('progress note date'), '2026-05-16');

    expect(screen.getByLabelText('progress note date')).toHaveValue('2026-05-16');
    expect(onValueChange).toHaveBeenLastCalledWith('2026-05-16');
  });

  it('preserves invalid typed text instead of coercing it', async () => {
    const user = userEvent.setup();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
    });

    await user.type(screen.getByLabelText('project date'), 'soon-ish');

    expect(screen.getByLabelText('project date')).toHaveValue('soon-ish');
  });

  it('normalizes common slash dates on blur', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
      onValueChange,
    });

    await user.type(screen.getByLabelText('project date'), '7/3/2024');
    await user.tab();

    expect(screen.getByLabelText('project date')).toHaveValue('2024-07-03');
    expect(onValueChange).toHaveBeenLastCalledWith('2024-07-03');
  });

  it('emits canonical YYYY-MM-DD strings when selecting from the calendar', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
      initialValue: '2026-05-09',
      onValueChange,
    });

    await user.click(screen.getByRole('button', { name: 'Choose project date' }));
    await user.click(within(screen.getByRole('grid')).getByText('15'));

    expect(onValueChange).toHaveBeenLastCalledWith('2026-05-15');
    expect(screen.getByLabelText('project date')).toHaveValue('2026-05-15');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('marks today with a circle while keeping the selected day filled', async () => {
    const user = userEvent.setup();
    const currentDate = today(getLocalTimeZone()).toString();
    const first = renderControlledDateField({
      id: 'today-date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
    });

    await user.click(screen.getByRole('button', { name: 'Choose project date' }));
    const todayCell = document.querySelector('[data-today]');
    expect(todayCell).toHaveClass('border-primary', 'text-primary');
    expect(todayCell).not.toHaveAttribute('data-selected');

    first.unmount();
    renderControlledDateField({
      id: 'selected-today-date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
      initialValue: currentDate,
    });
    await user.click(screen.getByRole('button', { name: 'Choose project date' }));
    const selectedToday = document.querySelector('[data-today]');
    expect(selectedToday).toHaveAttribute('data-selected');
    expect(selectedToday).toHaveClass('bg-primary');
  });

  it('opens the calendar on a valid slash date before blur normalization', async () => {
    const user = userEvent.setup();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
      initialValue: '7/3/2024',
    });

    await user.click(screen.getByRole('button', { name: 'Choose project date' }));

    expect(screen.getByRole('combobox', { name: 'Calendar month' })).toHaveTextContent('July');
    expect(screen.getByRole('combobox', { name: 'Calendar year' })).toHaveTextContent('2024');
  });

  it('changes the visible calendar year without changing the typed value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
      initialValue: '2024-07-03',
      onValueChange,
    });

    await user.click(screen.getByRole('button', { name: 'Choose project date' }));
    await user.click(screen.getByRole('combobox', { name: 'Calendar year' }));
    await user.click(screen.getByRole('option', { name: '2025' }));

    expect(screen.getByLabelText('project date')).toHaveValue('2024-07-03');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Calendar month' })).toHaveTextContent('July');
    expect(screen.getByRole('combobox', { name: 'Calendar year' })).toHaveTextContent('2025');
  });

  it('applies width guards to inline calendar month and year controls', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    renderControlledDateField(
      {
        id: 'date',
        calendarLabel: 'started date',
        'aria-label': 'Started date',
        calendarPlacement: 'inline',
        initialValue: '2026-09-09',
        onValueChange,
      },
      narrowDateFieldWrapper
    );

    const input = screen.getByLabelText('Started date');
    const calendar = screen.getByRole('application', { name: /Choose started date/ });
    const month = screen.getByRole('combobox', { name: 'Calendar month' });
    const year = screen.getByRole('combobox', { name: 'Calendar year' });

    expect(within(calendar).getByText('Sep 2026')).toBeInTheDocument();
    expect(month).toHaveTextContent('September');
    // jsdom cannot compute the actual flex layout; the visual regression is covered by
    // the Vite harness.
    expect(month).toHaveClass('min-w-[6rem]');
    expect(year).toHaveTextContent('2026');
    expect(year).toHaveClass('min-w-[5.25rem]');

    await user.click(month);
    await user.click(screen.getByRole('option', { name: 'May' }));

    expect(input).toHaveValue('2026-09-09');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(month).toHaveTextContent('May');
    expect(within(calendar).getByText('May 2026')).toBeInTheDocument();
  });

  it('announces the popover trigger as a dialog control while open', async () => {
    const user = userEvent.setup();

    renderControlledDateField({
      id: 'date',
      calendarLabel: 'project date',
      'aria-label': 'project date',
      initialValue: '2026-05-09',
    });

    const trigger = screen.getByRole('button', { name: 'Choose project date' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).not.toHaveAttribute('aria-controls');

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls');
    expect(
      document.getElementById(trigger.getAttribute('aria-controls') ?? '')
    ).toBeInTheDocument();
  });

  it('shows a clear button only for enabled clearable fields with a value', async () => {
    const user = userEvent.setup();

    const { unmount } = renderControlledDateField({
      id: 'date',
      calendarLabel: 'received date',
      'aria-label': 'received date',
      clearable: true,
      initialValue: '2026-05-09',
    });

    await user.click(screen.getByRole('button', { name: 'Clear received date' }));

    expect(screen.getByLabelText('received date')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear received date' })).not.toBeInTheDocument();

    unmount();
    renderControlledDateField({
      id: 'disabled-date',
      calendarLabel: 'received date',
      'aria-label': 'received date',
      clearable: true,
      disabled: true,
      initialValue: '2026-05-09',
    });

    expect(screen.queryByRole('button', { name: 'Clear received date' })).not.toBeInTheDocument();
  });

  it('disables the input, trigger, and inline calendar controls', () => {
    renderControlledDateField({
      id: 'date',
      calendarLabel: 'timeline date',
      'aria-label': 'timeline date',
      calendarPlacement: 'inline',
      disabled: true,
      initialValue: '2026-05-09',
    });

    expect(screen.getByLabelText('timeline date')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('wires native form and ARIA attributes to the text input', () => {
    renderControlledDateField({
      id: 'progress-date',
      calendarLabel: 'progress note date',
      'aria-label': 'progress note date',
      required: true,
      'aria-invalid': 'true',
      'aria-describedby': 'progress-date-error',
    });

    const input = screen.getByLabelText('progress note date');

    expect(input).toHaveAttribute('id', 'progress-date');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'progress-date-error');
  });
});
