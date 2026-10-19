import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SymbolRequestDialog } from '../SymbolRequestDialog';

const state = vi.hoisted(() => ({
  send: vi.fn(),
  prepare: vi.fn(),
  onSent: vi.fn(),
  onOpenChange: vi.fn(),
}));
vi.mock('@/hooks/mutations/coloring/useColorKeyMutations', () => ({
  useCreateSymbolRequest: () => ({ mutateAsync: state.send }),
}));
vi.mock('@/utils/image/symbolRequestPhoto', () => ({ prepareSymbolRequestPhoto: state.prepare }));

const photo = new File(['photo'], 'symbol.jpg', { type: 'image/jpeg' });
const cropped = new File(['cropped'], 'symbol-cropped.jpg', { type: 'image/jpeg' });

// react-easy-crop needs real image layout; the stub drives the dialog's two ways out.
vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: ({
    open,
    file,
    onCropComplete,
    onUseOriginal,
    onOpenChange,
  }: {
    open: boolean;
    file: File | null;
    onCropComplete: (file: File) => void;
    onUseOriginal: (file: File) => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Crop the symbol">
        <span>{file?.name}</span>
        <button
          type="button"
          onClick={() => {
            onCropComplete(cropped);
            onOpenChange(false);
          }}
        >
          Use crop
        </button>
        <button
          type="button"
          onClick={() => {
            if (file) onUseOriginal(file);
            onOpenChange(false);
          }}
        >
          Skip crop
        </button>
      </div>
    ) : null,
}));

function renderDialog() {
  render(
    <SymbolRequestDialog
      open
      onOpenChange={state.onOpenChange}
      userId="owner"
      pageId="page-1"
      bookLabel="Lost Ocean, page 4"
      email="me@example.test"
      onSent={state.onSent}
    />
  );
  return screen.getByRole('dialog', { name: 'Send us a symbol' });
}

async function fillAndSend(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText('Photo'), photo);
  await user.type(screen.getByRole('textbox', { name: /^Description/ }), 'Two w stacked');
  await user.click(screen.getByRole('button', { name: 'Send' }));
}

beforeEach(() => {
  for (const mock of Object.values(state)) mock.mockReset();
  state.prepare.mockImplementation(async (file: File) => file);
  state.onSent.mockResolvedValue(true);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('SymbolRequestDialog', () => {
  it('prefills the book, page and account email, with the photo placeholder on', () => {
    renderDialog();
    expect(screen.getByRole('textbox', { name: 'Book and page' })).toHaveValue(
      'Lost Ocean, page 4'
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('me@example.test');
    expect(
      screen.getByRole('checkbox', { name: 'Use my photo as the symbol on this page for now' })
    ).toBeChecked();
    for (const button of screen.getAllByRole('button'))
      expect(button).toHaveAttribute('type', expect.stringMatching(/button|submit/));
  });

  it('asks for a photo before sending anything', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a photo.');
    expect(state.send).not.toHaveBeenCalled();
  });

  it('requires a valid email', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.clear(screen.getByRole('textbox', { name: 'Email' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'nope');
    await fillAndSend(user);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(state.send).not.toHaveBeenCalled();
  });

  it('sends the prepared photo with the typed fields and reports the new request', async () => {
    const user = userEvent.setup();
    const prepared = new File(['small'], 'symbol.jpg', { type: 'image/jpeg' });
    state.prepare.mockResolvedValue(prepared);
    state.send.mockResolvedValue({ id: 'abcdefghijklmno' });
    renderDialog();
    await fillAndSend(user);
    expect(state.prepare).toHaveBeenCalledWith(photo);
    expect(state.send).toHaveBeenCalledWith({
      page: 'page-1',
      book_label: 'Lost Ocean, page 4',
      description: 'Two w stacked',
      email: 'me@example.test',
      photo: prepared,
    });
    await waitFor(() => expect(state.onSent).toHaveBeenCalledWith('abcdefghijklmno', true));
  });

  it('reports when the photo should not stand in for the symbol', async () => {
    const user = userEvent.setup();
    state.send.mockResolvedValue({ id: 'abcdefghijklmno' });
    renderDialog();
    await user.click(
      screen.getByRole('checkbox', { name: 'Use my photo as the symbol on this page for now' })
    );
    await fillAndSend(user);
    await waitFor(() => expect(state.onSent).toHaveBeenCalledWith('abcdefghijklmno', false));
  });

  it.each([
    [429, "You've sent a few requests. Try again in a little while."],
    [503, "We're getting a lot of requests right now. Try again in a few minutes."],
    [500, 'Could not send your photo. Try again.'],
  ])('shows a friendly message for HTTP %i and keeps everything typed', async (status, message) => {
    const user = userEvent.setup();
    state.send.mockRejectedValueOnce(new ClientResponseError({ status }));
    renderDialog();
    await fillAndSend(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(state.onSent).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /^Description/ })).toHaveValue('Two w stacked');
    expect(screen.getByRole('img', { name: 'Chosen symbol' })).toBeInTheDocument();

    state.send.mockResolvedValueOnce({ id: 'abcdefghijklmno' });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(state.send).toHaveBeenLastCalledWith(expect.objectContaining({ photo }));
    await waitFor(() => expect(state.onSent).toHaveBeenCalled());
  });

  it.each([
    ['email', 'Enter a valid email address.'],
    ['photo', 'Choose a JPG, PNG, or WebP photo under 10 MB.'],
    ['book_label', 'Check the book and page.'],
  ])('explains a rejected %s field', async (field, message) => {
    const user = userEvent.setup();
    state.send.mockRejectedValue(
      new ClientResponseError({
        status: 400,
        response: { data: { [field]: { code: 'validation_invalid', message: 'Invalid' } } },
      })
    );
    renderDialog();
    await fillAndSend(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows a photo that could not be prepared and keeps it chosen', async () => {
    const user = userEvent.setup();
    state.prepare.mockRejectedValue(new Error('Choose a JPG, PNG, or WebP photo under 10 MB.'));
    renderDialog();
    await fillAndSend(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a JPG, PNG, or WebP photo under 10 MB.'
    );
    expect(screen.getByRole('img', { name: 'Chosen symbol' })).toBeInTheDocument();
    expect(state.send).not.toHaveBeenCalled();
  });

  it('marks the photo and book as required', () => {
    renderDialog();
    expect(screen.getByLabelText('Photo')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('textbox', { name: 'Book and page' })).toBeRequired();
  });

  it('points the failed field at the error', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const alert = screen.getByRole('alert');
    const input = screen.getByLabelText('Photo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);

    await user.upload(input, photo);
    const email = screen.getByRole('textbox', { name: 'Email' });
    await user.clear(email);
    await user.type(email, 'nope');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription(
      "We'll email you when it's added. Enter a valid email address."
    );
  });

  it('cannot be dismissed while sending, and shows the error after', async () => {
    const user = userEvent.setup();
    let reject: (error: unknown) => void = () => {};
    state.send.mockReturnValue(new Promise((_, fail) => (reject = fail)));
    renderDialog();
    await fillAndSend(user);
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(state.onOpenChange).not.toHaveBeenCalledWith(false);

    reject(new ClientResponseError({ status: 429 }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You've sent a few requests. Try again in a little while."
    );
    expect(screen.getByRole('textbox', { name: /^Description/ })).toHaveValue('Two w stacked');
    await user.keyboard('{Escape}');
    expect(state.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('retries only the placement after the request was created', async () => {
    const user = userEvent.setup();
    state.send.mockResolvedValue({ id: 'abcdefghijklmno' });
    state.onSent.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderDialog();
    await fillAndSend(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We got your photo, but couldn't add it to this page."
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(state.onSent).toHaveBeenCalledTimes(2));
    expect(state.onSent).toHaveBeenLastCalledWith('abcdefghijklmno', true);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it('sends a cropped photo, and the original after skipping the crop', async () => {
    const user = userEvent.setup();
    state.send.mockResolvedValue({ id: 'abcdefghijklmno' });
    renderDialog();
    await user.upload(screen.getByLabelText('Photo'), photo);
    await user.click(screen.getByRole('button', { name: 'Crop photo' }));
    await user.click(screen.getByRole('button', { name: 'Use crop' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(state.prepare).toHaveBeenCalledWith(cropped));

    await user.click(screen.getByRole('button', { name: 'Crop photo' }));
    expect(screen.getByRole('dialog', { name: 'Crop the symbol' })).toHaveTextContent('symbol.jpg');
    await user.click(screen.getByRole('button', { name: 'Skip crop' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(state.prepare).toHaveBeenLastCalledWith(photo));
  });
});
