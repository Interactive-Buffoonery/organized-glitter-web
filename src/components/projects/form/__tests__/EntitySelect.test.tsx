import { useState } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';

import { EntitySelect } from '@/components/projects/form/EntitySelect';
import { fireEvent, renderWithProviders, screen, userEvent, vi } from '@/test-utils';

type CreateData = { name: string };
type CreatedEntity = { name: string };

const useCreateMutation = () =>
  ({
    isPending: false,
    mutate: (data: CreateData, options: { onSuccess: (created: CreatedEntity) => void }) =>
      options.onSuccess(data),
  }) as unknown as UseMutationResult<CreatedEntity, Error, CreateData>;

const TestEntitySelect = () => {
  const [value, setValue] = useState('');

  return (
    <EntitySelect<CreateData, CreatedEntity>
      value={value}
      onChange={setValue}
      options={[]}
      entityName="artist"
      entityLabel="Artist"
      placeholder="No artist"
      presets={[]}
      emptyOptionLabel="No artists found"
      dialogTitle="Add New Artist"
      dialogDescription="Add an artist."
      submitLabel="Add Artist"
      useCreateMutation={useCreateMutation}
      buildCreatePayload={name => ({ name })}
    />
  );
};

const TestEntitySelectWithMutableOptions = () => {
  const [value, setValue] = useState('');
  const [options, setOptions] = useState<string[]>([]);

  return (
    <>
      <EntitySelect<CreateData, CreatedEntity>
        value={value}
        onChange={setValue}
        options={options}
        entityName="artist"
        entityLabel="Artist"
        placeholder="No artist"
        presets={[]}
        emptyOptionLabel="No artists found"
        dialogTitle="Add New Artist"
        dialogDescription="Add an artist."
        submitLabel="Add Artist"
        useCreateMutation={useCreateMutation}
        buildCreatePayload={name => ({ name })}
      />
      <button type="button" onClick={() => setOptions(['New Artist'])}>
        Sync options
      </button>
      <button type="button" onClick={() => setOptions([])}>
        Clear options
      </button>
    </>
  );
};

describe('EntitySelect', () => {
  it('keeps a new entity as a draft when the form owns creation', async () => {
    const createDraft = vi.fn();
    const write = vi.fn();
    const useDraftMutation = () =>
      ({ isPending: false, mutate: write }) as unknown as UseMutationResult<
        CreatedEntity,
        Error,
        CreateData
      >;
    const user = userEvent.setup();
    renderWithProviders(
      <EntitySelect<CreateData, CreatedEntity>
        value=""
        onChange={() => {}}
        options={[]}
        entityName="artist"
        entityLabel="Artist"
        placeholder="No artist"
        presets={[]}
        emptyOptionLabel="No artists found"
        dialogTitle="Add New Artist"
        dialogDescription="Add an artist."
        submitLabel="Add Artist"
        useCreateMutation={useDraftMutation}
        buildCreatePayload={name => ({ name })}
        createDraft={createDraft}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Add Artist' }));
    await user.type(screen.getByLabelText('Artist Name'), 'New Artist');
    await user.click(screen.getByRole('button', { name: 'Add Artist' }));

    expect(createDraft).toHaveBeenCalledWith({ name: 'New Artist' });
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps a newly created entity in the dropdown while options refresh', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TestEntitySelect />);

    await user.click(screen.getByRole('button', { name: 'Add Artist' }));
    await user.type(screen.getByLabelText('Artist Name'), 'New Artist');
    await user.click(screen.getByRole('button', { name: 'Add Artist' }));

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Artist' }), { key: 'ArrowDown' });

    expect(screen.getByRole('option', { name: 'New Artist' })).toBeInTheDocument();
  });

  it('drops bridged options after canonical options catch up or remove them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TestEntitySelectWithMutableOptions />);

    await user.click(screen.getByRole('button', { name: 'Add Artist' }));
    await user.type(screen.getByLabelText('Artist Name'), 'New Artist');
    await user.click(screen.getByRole('button', { name: 'Add Artist' }));

    await user.click(screen.getByRole('button', { name: 'Sync options' }));
    await user.click(screen.getByRole('button', { name: 'Clear options' }));

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Artist' }), { key: 'ArrowDown' });
    expect(screen.queryByRole('option', { name: 'New Artist' })).not.toBeInTheDocument();
  });
});
