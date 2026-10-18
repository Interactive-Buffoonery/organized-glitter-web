import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/hooks/queries/coloring/useColorKeys', () => ({
  useColorKeys: () => ({ data: state.rows, isPending: false, isError: false, refetch: vi.fn() }),
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
  for (const mock of [state.setup, state.create, state.update, state.remove]) mock.mockReset();
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

  it('copies symbol and code lines without variation selectors', async () => {
    const user = userEvent.setup();
    state.rows = [
      key('a', 0, 'u:2665', { code: 'FS 609' }),
      key('b', 1, 'c:linked-circles', { code: 'ZC 267' }),
      key('c', 2, 'r:abcdefghijklmno', { code: '12' }),
      key('d', 3, 'r:bbbbbbbbbbbbbbb'),
    ];
    state.requests = { abcdefghijklmno: { description: 'Two ws', thumbnail: '' } };
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
    expect(screen.getByRole('textbox', { name: 'Color name' })).toHaveValue('Lilac');
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
});
