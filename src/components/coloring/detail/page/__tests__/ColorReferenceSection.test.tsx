import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorReferenceSection } from '../ColorReferenceSection';

const state = vi.hoisted(() => ({
  user: { id: 'owner' },
  reference: null as null | { notes: string; photos: string[] },
  save: vi.fn(),
  prepare: vi.fn(),
  error: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('@/hooks/queries/coloring/useColorReference', () => ({
  useColorReference: () => ({
    data: state.reference,
    isPending: false,
    isError: false,
    refetch: state.refetch,
  }),
  useColorReferenceImages: () => ({ data: [] }),
}));
vi.mock('@/hooks/mutations/coloring/useSaveColorReference', () => ({
  useSaveColorReference: (pageId: string, userId: string) => ({
    mutateAsync: (change: unknown) => state.save(pageId, userId, change),
    isPending: false,
  }),
}));
vi.mock('@/utils/image/colorReferenceImage', () => ({ prepareColorReferenceImage: state.prepare }));
vi.mock('@/lib/notifications', () => ({ notifyError: state.error, notifySuccess: vi.fn() }));

describe('Color strip', () => {
  beforeEach(() => {
    state.user = { id: 'owner' };
    state.reference = null;
    state.refetch.mockReset().mockResolvedValue({});
    state.error.mockReset();
    state.save.mockReset().mockResolvedValue(null);
    state.prepare.mockReset().mockImplementation(async (file: File) => file);
    let previewId = 0;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:fixture-${++previewId}`),
        revokeObjectURL: vi.fn(),
      })
    );
  });
  it('offers one Add photo button that opens the photo dialog, with or without photos', async () => {
    const user = userEvent.setup();
    const view = render(<ColorReferenceSection pageId="page-a" />);
    expect(screen.getByText('No photo of the strip yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add photo' }));
    expect(screen.getByRole('dialog', { name: 'Add swatch photos' })).toBeInTheDocument();
    view.unmount();
    state.reference = { notes: '', photos: ['sheet.jpg'] };
    render(<ColorReferenceSection pageId="page-a" />);
    expect(screen.queryByText('No photo of the strip yet')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add photo' })).toHaveLength(1);
  });
  it('saves notes alone without rewriting color codes and allows clearing notes', async () => {
    state.reference = { notes: 'Existing', photos: ['sheet.jpg'] };
    const user = userEvent.setup();
    render(<ColorReferenceSection pageId="page-a" />);
    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    const field = screen.getByRole('textbox', { name: 'Color notes' });
    fireEvent.change(field, { target: { value: '  001\nBR 709 + #  ' } });
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(state.save).toHaveBeenCalledWith('page-a', 'owner', {
      action: 'notes',
      notes: '  001\nBR 709 + #  ',
      baselineNotes: 'Existing',
    });
    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    await user.clear(screen.getByRole('textbox'));
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(state.save).toHaveBeenLastCalledWith('page-a', 'owner', {
      action: 'notes',
      notes: '',
      baselineNotes: 'Existing',
    });
  });
  it('freezes an unconfirmed upload and retries the same batch even after the saved count reaches 100', async () => {
    state.reference = { notes: '', photos: Array.from({ length: 98 }, (_, i) => `p${i}.png`) };
    state.save.mockImplementationOnce(async () => {
      state.reference = { notes: '', photos: Array.from({ length: 100 }, (_, i) => `p${i}.png`) };
      throw new Error('Response lost');
    });
    state.save.mockRejectedValueOnce(Object.assign(new Error('Rate limited'), { status: 429 }));
    const user = userEvent.setup();
    render(<ColorReferenceSection pageId="page-a" />);
    await user.click(screen.getByRole('button', { name: 'Add photo' }));
    const files = [
      new File(['one'], 'one.png', { type: 'image/png' }),
      new File(['two'], 'two.png', { type: 'image/png' }),
    ];
    fireEvent.change(screen.getByLabelText('Choose swatch photos'), { target: { files } });
    await screen.findByAltText('Selected swatch sheet 2');
    await user.click(screen.getByRole('button', { name: 'Save photos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost');
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove selected photo 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry photos' }));
    expect(state.save).toHaveBeenCalledTimes(2);
    expect(state.save.mock.calls[1]).toEqual(state.save.mock.calls[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Rate limited');
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove selected photo 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry photos' }));
    expect(state.save.mock.calls[2]).toEqual(state.save.mock.calls[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('allows correcting a batch after a definitive server rejection', async () => {
    state.save.mockRejectedValueOnce(Object.assign(new Error('Invalid photo'), { status: 400 }));
    const user = userEvent.setup();
    render(<ColorReferenceSection pageId="page-a" />);
    await user.click(screen.getByRole('button', { name: 'Add photo' }));
    fireEvent.change(screen.getByLabelText('Choose swatch photos'), {
      target: { files: [new File(['one'], 'one.png', { type: 'image/png' })] },
    });
    await screen.findByAltText('Selected swatch sheet 1');
    await user.click(screen.getByRole('button', { name: 'Save photos' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove selected photo 1' })).toBeEnabled();
  });
  it('retains note text after a failed save and Cancel restores the saved value', async () => {
    state.save.mockRejectedValue(new Error('Offline'));
    state.reference = { notes: 'Saved', photos: [] };
    const user = userEvent.setup();
    render(<ColorReferenceSection pageId="page-a" />);
    await user.click(screen.getByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft 001' } });
    await user.click(screen.getByRole('button', { name: 'Save', exact: true }));
    expect(screen.getByRole('textbox')).toHaveValue('Draft 001');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
  it('discards page and account drafts instead of attaching them to the next page', async () => {
    const user = userEvent.setup();
    const view = render(<ColorReferenceSection pageId="page-a" />);
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByRole('textbox'), 'Private 001');
    view.rerender(<ColorReferenceSection pageId="page-b" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    state.user = { id: 'other' };
    view.rerender(<ColorReferenceSection pageId="page-b" />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
});
