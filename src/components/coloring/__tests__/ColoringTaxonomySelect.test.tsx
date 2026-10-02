import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import {
  act,
  describe,
  expect,
  fireEvent,
  it,
  renderWithProviders,
  screen,
  userEvent,
  vi,
} from '@/test-utils';
import { ColoringTaxonomySelect } from '../ColoringTaxonomySelect';

describe('ColoringTaxonomySelect', () => {
  it('includes an inline-created option immediately so the select value matches an item', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue({ id: 'ill-new', name: 'Pat Lee' });

    function Harness() {
      const [value, setValue] = useState('');
      return (
        <ColoringTaxonomySelect
          id="taxonomy-inline-test"
          label="Illustrator"
          value={value}
          options={[]}
          placeholder="No illustrator"
          createTitle="Add illustrator"
          createLabel="Add illustrator"
          onChange={setValue}
          onCreate={onCreate}
        />
      );
    }

    renderWithProviders(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Add illustrator' }));
    await user.type(screen.getByLabelText('Name'), 'Pat Lee');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('Pat Lee')).toBeVisible();
    expect(onCreate).toHaveBeenCalledWith('Pat Lee');
  });

  it('submits one create request when the form is submitted twice before rendering', async () => {
    let resolveCreate!: (value: { id: string; name: string }) => void;
    const onCreate = vi.fn(
      () =>
        new Promise<{ id: string; name: string }>(resolve => {
          resolveCreate = resolve;
        })
    );
    const user = userEvent.setup();

    renderWithProviders(
      <ColoringTaxonomySelect
        id="taxonomy-submit-lock-test"
        label="Illustrator"
        options={[]}
        placeholder="No illustrator"
        createTitle="Add illustrator"
        createLabel="Add illustrator"
        onChange={vi.fn()}
        onCreate={onCreate}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add illustrator' }));
    await user.type(screen.getByLabelText('Name'), 'Pat Lee');
    const form = screen.getByRole('button', { name: 'Create' }).closest('form');
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ id: 'ill-new', name: 'Pat Lee' });
    });
  });

  it('does not select a created value after its dialog was dismissed', async () => {
    let resolveCreate!: (value: { id: string; name: string }) => void;
    const onCreate = vi.fn(
      () =>
        new Promise<{ id: string; name: string }>(resolve => {
          resolveCreate = resolve;
        })
    );
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <ColoringTaxonomySelect
        id="taxonomy-cancel-test"
        label="Illustrator"
        options={[]}
        placeholder="No illustrator"
        createTitle="Add illustrator"
        createLabel="Add illustrator"
        onChange={onChange}
        onCreate={onCreate}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add illustrator' }));
    await user.type(screen.getByLabelText('Name'), 'Pat Lee');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await act(async () => {
      resolveCreate({ id: 'ill-new', name: 'Pat Lee' });
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Pat Lee')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add illustrator' })).toBeEnabled();
  });

  it('keeps creation locked after dismissing and reopening a pending request', async () => {
    let resolveCreate!: (value: { id: string; name: string }) => void;
    const onCreate = vi.fn(
      () =>
        new Promise<{ id: string; name: string }>(resolve => {
          resolveCreate = resolve;
        })
    );
    const user = userEvent.setup();

    renderWithProviders(
      <ColoringTaxonomySelect
        id="taxonomy-reopen-test"
        label="Illustrator"
        options={[]}
        placeholder="No illustrator"
        createTitle="Add illustrator"
        createLabel="Add illustrator"
        onChange={vi.fn()}
        onCreate={onCreate}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add illustrator' }));
    await user.type(screen.getByLabelText('Name'), 'First request');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Add illustrator' }));
    await user.type(screen.getByLabelText('Name'), 'Second draft');

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();
    fireEvent.submit(createButton.closest('form')!);
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate({ id: 'ill-old', name: 'First request' });
    });

    expect(screen.getByLabelText('Name')).toHaveValue('Second draft');
    expect(createButton).toBeEnabled();
  });
});
