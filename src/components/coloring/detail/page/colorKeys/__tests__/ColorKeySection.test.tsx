import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColorKey } from '@/services/pocketbase/colorKeys.service';
import { ColorKeySection } from '../ColorKeySection';

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  history: [] as unknown[],
  requests: {} as Record<string, unknown>,
  setup: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refetch: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/queries/coloring/useColorKeys', () => ({
  useColorKeys: () => ({
    data: state.rows,
    isPending: false,
    isError: false,
    refetch: state.refetch,
  }),
  useColorKeyHistory: () => ({ data: state.history }),
  useSymbolRequests: () => ({ data: state.requests }),
}));
vi.mock('@/hooks/mutations/coloring/useColorKeyMutations', () => ({
  useSetupColorKeys: () => ({ mutateAsync: state.setup, isPending: false }),
  useCreateColorKey: () => ({ mutateAsync: state.create, isPending: false }),
  useUpdateColorKey: () => ({ mutateAsync: state.update, isPending: false }),
  useDeleteColorKey: () => ({ mutateAsync: state.remove, isPending: false }),
}));
vi.mock('@/lib/notifications', () => ({ notifyError: state.error, notifySuccess: state.success }));
vi.mock('@/components/image/PrivateFileImage', () => ({
  PrivateFileImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const key = (id: string, position: number, symbol: string, extra: Partial<ColorKey> = {}) =>
  ({
    id,
    position,
    symbol,
    code: '',
    color_name: '',
    swatch: '',
    tried: [],
    note: '',
    created: `2026-01-01 00:00:0${position}`,
    ...extra,
  }) as ColorKey;

beforeEach(() => {
  window.localStorage.clear();
  state.rows = [];
  state.history = [];
  state.requests = {};
  for (const mock of [state.setup, state.create, state.update, state.remove, state.refetch])
    mock.mockReset();
  state.error.mockReset();
  state.success.mockReset();
});

describe('Colors used setup', () => {
  it('starts with 1-9, 0 and a-z on, and saves what is left after toggling', async () => {
    const user = userEvent.setup();
    state.setup.mockResolvedValue([]);
    render(<ColorKeySection pageId="page-1" />);
    const group = screen.getByRole('group', { name: 'Symbols on this page' });
    const toggles = within(group).getAllByRole('button', { pressed: true });
    expect(toggles).toHaveLength(36);
    expect(toggles[0]).toHaveAccessibleName('One');
    expect(toggles[9]).toHaveAccessibleName('Zero');
    await user.click(within(group).getByRole('button', { name: 'Lowercase g' }));
    expect(within(group).getByRole('button', { name: 'Lowercase g' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    await user.click(screen.getByRole('button', { name: 'Start' }));
    const saved: string[] = state.setup.mock.calls[0][0];
    expect(saved).toHaveLength(35);
    expect(saved).not.toContain('u:0067');
    expect(saved.slice(0, 2)).toEqual(['u:0031', 'u:0032']);
  });

  it('moves focus to the section heading after a successful start', async () => {
    const user = userEvent.setup();
    state.setup.mockResolvedValue([]);
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Colors used' })).toHaveFocus());
  });

  it('adds symbols after z from the picker', async () => {
    const user = userEvent.setup();
    state.setup.mockResolvedValue([]);
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Add symbols after z' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'psi');
    await user.click(screen.getByRole('option', { name: 'Psi' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(state.setup.mock.calls[0][0].at(-1)).toBe('u:03C8');
  });

  it('can be skipped', async () => {
    const user = userEvent.setup();
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(screen.queryByRole('group', { name: 'Symbols on this page' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add symbol' })).toBeInTheDocument();
    expect(state.setup).not.toHaveBeenCalled();
  });

  it('keeps setup choices and reports an error when saving fails', async () => {
    const user = userEvent.setup();
    state.setup.mockRejectedValue(new Error('offline'));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(screen.getByRole('group', { name: 'Symbols on this page' })).toBeInTheDocument();
  });

  it('stays quiet and focuses the heading when another device already set up the page', async () => {
    const user = userEvent.setup();
    state.setup.mockRejectedValue(new ClientResponseError({ status: 409 }));
    state.refetch.mockResolvedValue({ isError: false, data: [key('a', 0, 'u:0031')] });
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Colors used' })).toHaveFocus());
    expect(state.error).not.toHaveBeenCalled();
  });

  it('reports the usual error when the 409 refetch finds no rows', async () => {
    const user = userEvent.setup();
    state.setup.mockRejectedValue(new ClientResponseError({ status: 409 }));
    state.refetch.mockResolvedValue({ isError: false, data: [] });
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() =>
      expect(state.error).toHaveBeenCalledWith('Could not save the symbols. Try again.')
    );
  });
});

describe('Colors used record', () => {
  it('lists rows in order and marks an unknown custom shape', () => {
    state.rows = [
      key('a', 0, 'u:0031', { code: '654', color_name: 'Lilac', swatch: '#B79AD6' }),
      key('b', 1, 'c:not-in-catalog'),
    ];
    render(<ColorKeySection pageId="page-1" />);
    expect(screen.getByRole('button', { name: 'One, 654, Lilac' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Unknown symbol' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 filled in')).toBeInTheDocument();
  });

  it('never puts an unexpected swatch value into a style', () => {
    state.rows = [key('a', 0, 'u:0031', { code: '1', swatch: 'url(https://example.test/x)' })];
    const { container } = render(<ColorKeySection pageId="page-1" />);
    expect(container.innerHTML).not.toContain('example.test');
  });

  it('copies symbol and code lines without variation selectors', async () => {
    const user = userEvent.setup();
    state.rows = [
      key('a', 0, 'u:2665', { code: ' FS\n 609 ' }),
      key('b', 1, 'c:linked-circles', { code: 'ZC 267' }),
      key('c', 2, 'r:abcdefghijklmno', { code: '12' }),
      key('d', 3, 'r:bbbbbbbbbbbbbbb'),
    ];
    state.requests = { abcdefghijklmno: { description: 'Two\r\n\tws', thumbnail: '' } };
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await expect(navigator.clipboard.readText()).resolves.toBe(
      '♥ FS 609\nLinked circles ZC 267\nTwo ws 12\nSent symbol'
    );
    expect(state.success).toHaveBeenCalled();
  });
});

describe('Colors used entry', () => {
  it('fills color name and swatch from an earlier code', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:03C8')];
    state.history = [
      { code: 'MB 108', color_name: 'Lilac', swatch: '#B79AD6' },
      { code: 'MB 109', color_name: 'Violet mist', swatch: '' },
      { code: '654', color_name: '', swatch: '' },
    ];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, 'u:03C8', input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^Psi,/ }));
    const code = screen.getByRole('combobox', { name: 'Code' });
    await user.type(code, 'mb');
    const suggestions = screen.getByRole('listbox', { name: 'Earlier codes' });
    expect(within(suggestions).getAllByRole('option')).toHaveLength(2);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(code).toHaveValue('MB 108');
    expect(screen.getByRole('textbox', { name: /^Color name/ })).toHaveValue('Lilac');
    expect(screen.getByRole('textbox', { name: 'Swatch hex' })).toHaveValue('#B79AD6');
    expect(screen.queryByRole('listbox', { name: 'Earlier codes' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({
        symbol: 'u:03C8',
        code: 'MB 108',
        color_name: 'Lilac',
        swatch: '#B79AD6',
      }),
    });
  });

  it('saves and moves to the next symbol on the strip', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, 'u:0031', input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.type(screen.getByRole('textbox', { name: 'Add a code you tried' }), '650{Enter}');
    expect(screen.getByRole('button', { name: 'Remove 650' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Save and next/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ code: '654', tried: ['650'] }),
    });
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Two')).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('');
  });

  it('shows the validation message and keeps the entry open', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.update.mockRejectedValue(new Error('Swatch must be a color like #A1B2C3.'));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('textbox', { name: 'Swatch hex' }), 'red');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Swatch must be a color');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('creates a new row after the last one from Add symbol', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 4, 'u:0032')];
    state.create.mockImplementation(async input => key('c', input.position, input.symbol, input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
    await user.click(screen.getByRole('option', { name: 'Yen sign' }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), 'PU306');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'u:00A5', position: 5, code: 'PU306' })
    );
  });

  it('deletes a row after confirming', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.remove.mockResolvedValue(undefined);
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: /Delete/ })
    );
    expect(state.remove).toHaveBeenCalledWith('a');
  });

  it('names the symbol in the title and focuses Code after Save and next', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032'), key('c', 2, 'u:0033')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, input.symbol, input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    expect(screen.getByRole('dialog', { name: 'Edit color: One' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save and next: Two' }));
    await screen.findByRole('dialog', { name: 'Edit color: Two' });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Code' })).toHaveFocus());
  });

  it('closes only the suggestions when Escape is pressed while they are open', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.history = [{ code: 'MB 108', color_name: 'Lilac', swatch: '#B79AD6' }];
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), 'mb');
    expect(screen.getByRole('listbox', { name: 'Earlier codes' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: 'Earlier codes' })).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('saves a typed tried code even when Add was not pressed', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031', { tried: ['650'] }), key('b', 1, 'u:0032')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, 'u:0031', input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('textbox', { name: 'Add a code you tried' }), ' 651 ');
    await user.click(screen.getByRole('button', { name: /Save and next/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ tried: ['650', '651'] }),
    });
  });

  it('saves the latest position when another device reorders during an edit', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    state.update.mockImplementation(async ({ id, input }) => key(id, input.position, 'u:0031'));
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    state.rows = [key('b', 0, 'u:0032'), key('a', 1, 'u:0031')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ position: 1, code: '654' }),
    });
  });

  it('keeps the draft when the row is gone and adds it back on the next save', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 3, 'u:0031')];
    state.update.mockRejectedValue(new ClientResponseError({ status: 404 }));
    state.create.mockImplementation(async input => key('z', input.position, input.symbol, input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This color is no longer on this page. Save again to add it back.'
    );
    expect(screen.getByRole('dialog', { name: 'Add a color: One' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'u:0031', position: 3, code: '654' })
    );
    expect(state.update).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('forgets a changed symbol when the entry is cancelled', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, input.symbol, input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
    await user.click(screen.getByRole('option', { name: 'Yen sign' }));
    expect(screen.getByRole('dialog', { name: 'Edit color: Yen sign' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: /^One,/ }));
    expect(screen.getByRole('dialog', { name: 'Edit color: One' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ symbol: 'u:0031' }),
    });
  });

  it('forgets a changed symbol for a new color when it is cancelled', async () => {
    const user = userEvent.setup();
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    const addYen = async () => {
      await user.click(screen.getByRole('button', { name: 'Add symbol' }));
      await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
      await user.click(screen.getByRole('option', { name: 'Yen sign' }));
    };
    await addYen();
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'psi');
    await user.click(screen.getAllByRole('option')[0]);
    expect(screen.queryByRole('dialog', { name: 'Add a color: Yen sign' })).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await addYen();
    expect(screen.getByRole('dialog', { name: 'Add a color: Yen sign' })).toBeInTheDocument();
  });

  it('tidies a typed hex swatch when Enter saves without leaving the field', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, input.symbol, input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('textbox', { name: 'Swatch hex' }), 'b79ad6{Enter}');
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ swatch: '#B79AD6' }),
    });
  });

  it('shows symbols outside the catalog in text presentation', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:260E')];
    render(<ColorKeySection pageId="page-1" />);
    expect(screen.getByRole('button', { name: /^☎,/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    expect(screen.getByRole('button', { name: 'Save and next: \u260E\uFE0E' })).toBeInTheDocument();
  });

  it('tidies a typed hex swatch when leaving the field', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    const hex = screen.getByRole('textbox', { name: 'Swatch hex' });
    expect(hex).toHaveAttribute('placeholder', 'Like #A1B2C3');
    await user.type(hex, 'b79ad6');
    await user.tab();
    expect(hex).toHaveValue('#B79AD6');
  });

  it('moves focus to the next tried code, then the input, when removing codes', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031', { tried: ['650', '651'] })];
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: 'Remove 650' }));
    expect(screen.getByRole('button', { name: 'Remove 651' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remove 651' }));
    expect(screen.getByRole('textbox', { name: 'Add a code you tried' })).toHaveFocus();
  });

  it('offers the send-a-photo row when changing the symbol', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    render(<ColorKeySection pageId="page-1" onRequestSymbol={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    expect(screen.getByRole('button', { name: /Can't find your symbol/ })).toBeInTheDocument();
  });
});
