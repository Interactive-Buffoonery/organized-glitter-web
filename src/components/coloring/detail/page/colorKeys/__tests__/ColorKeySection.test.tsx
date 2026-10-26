import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClientResponseError } from 'pocketbase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  reorder: vi.fn(),
  loadSortPanel: vi.fn(),
  reorderPending: false,
  refetch: vi.fn(),
  sendRequest: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'owner', email: 'me@example.test' } }),
}));
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
  useReorderColorKeys: () => ({ mutateAsync: state.reorder, isPending: state.reorderPending }),
  useCreateSymbolRequest: () => ({ mutateAsync: state.sendRequest }),
}));
vi.mock('@/utils/image/symbolRequestPhoto', () => ({
  prepareSymbolRequestPhoto: async (file: File) => file,
}));
// jsdom has no layout for dnd-kit; this stand-in reverses the order instead of dragging.
vi.mock('../loadSortPanel', () => ({ loadSortPanel: state.loadSortPanel }));
function SortPanelStandIn({
  order,
  onOrderChange,
  onDone,
}: {
  order: { id: string }[] | null;
  onOrderChange: (order: unknown[]) => void;
  onDone: () => void;
}) {
  return order ? (
    <div role="dialog" aria-label="Sort Color Order">
      <span>{order.map(row => row.id).join(',')}</span>
      <button type="button" onClick={() => onOrderChange([...order].reverse())}>
        Reverse
      </button>
      <button type="button" onClick={onDone}>
        Done
      </button>
    </div>
  ) : null;
}
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
  for (const mock of [
    state.setup,
    state.create,
    state.update,
    state.remove,
    state.reorder,
    state.refetch,
    state.sendRequest,
  ])
    mock.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  state.error.mockReset();
  state.success.mockReset();
  state.reorderPending = false;
  state.loadSortPanel.mockReset().mockResolvedValue({ ColorKeySortPanel: SortPanelStandIn });
});

describe('Color key setup', () => {
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
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Color key' })).toHaveFocus());
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

describe('Color key record', () => {
  it('never puts an unexpected swatch value into a style', () => {
    state.rows = [key('a', 0, 'u:0031', { code: '1', swatch: 'url(https://example.test/x)' })];
    const { container } = render(<ColorKeySection pageId="page-1" />);
    expect(container.innerHTML).not.toContain('example.test');
  });
});

describe('Color key sort', () => {
  const three = () => [key('a', 0, 'u:0031'), key('b', 1, 'u:0032'), key('c', 2, 'u:0033')];
  const openSort = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    return screen.findByRole('dialog', { name: 'Sort Color Order' });
  };

  it('offers Sort only once there are two colors', () => {
    state.rows = [key('a', 0, 'u:0031')];
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    expect(screen.queryByRole('button', { name: 'Sort' })).not.toBeInTheDocument();
    state.rows = three();
    rerender(<ColorKeySection pageId="page-1" />);
    expect(screen.getByRole('button', { name: 'Sort' })).toBeEnabled();
  });

  it('saves nothing when the order did not change', async () => {
    const user = userEvent.setup();
    state.rows = three();
    render(<ColorKeySection pageId="page-1" />);
    await openSort(user);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.reorder).not.toHaveBeenCalled();
  });

  it('keeps the panel closed and asks to try again when it cannot load', async () => {
    const user = userEvent.setup();
    state.rows = three();
    state.loadSortPanel.mockRejectedValue(
      new TypeError('Failed to fetch dynamically imported module')
    );
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Sort' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t open Sort Color Order. Please try again.'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add symbol' })).toBeEnabled();
  });

  it('disables Sort, the rows and Add symbol while an order is saving', () => {
    state.rows = three();
    state.reorderPending = true;
    render(<ColorKeySection pageId="page-1" />);
    expect(screen.getByRole('button', { name: 'Sort' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add symbol' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Two,/ })).toBeDisabled();
  });

  it('asks to try again when saving the order fails', async () => {
    const user = userEvent.setup();
    state.rows = three();
    state.reorder.mockRejectedValue(new Error('busy'));
    render(<ColorKeySection pageId="page-1" />);
    await openSort(user);
    await user.click(screen.getByRole('button', { name: 'Reverse' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save the updated order. Please try again.'
    );
  });

  it('does not save when a color arrived while the panel was open', async () => {
    const user = userEvent.setup();
    state.rows = three();
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await openSort(user);
    await user.click(screen.getByRole('button', { name: 'Reverse' }));
    state.rows = [...three(), key('d', 3, 'u:0034')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(state.reorder).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save the updated order.');
  });

  describe('offline', () => {
    const setOnline = (value: boolean) => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
      window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    };
    afterEach(() => setOnline(true));

    it('disables Sort', () => {
      setOnline(false);
      state.rows = three();
      render(<ColorKeySection pageId="page-1" />);
      expect(screen.getByRole('button', { name: 'Sort' })).toBeDisabled();
    });

    it('says sorting needs a connection when the save fails offline', async () => {
      const user = userEvent.setup();
      state.rows = three();
      state.reorder.mockImplementation(async () => {
        setOnline(false);
        throw new Error('Failed to fetch');
      });
      render(<ColorKeySection pageId="page-1" />);
      await openSort(user);
      await user.click(screen.getByRole('button', { name: 'Reverse' }));
      await user.click(screen.getByRole('button', { name: 'Done' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Sorting colors needs a connection. Reconnect and try again.'
      );
    });
  });
});

describe('Color key entry', () => {
  it('edits a color in place and returns focus to its row on Cancel or Escape', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    const [first, second] = screen.getAllByRole('listitem');
    const form = within(first).getByRole('form', { name: 'Edit color: One' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(form).getByRole('combobox', { name: 'Code' })).toHaveFocus();
    expect(within(second).getByRole('button', { name: /^Two,/ })).toBeInTheDocument();

    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: /^One,/ })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: /^Two,/ })).toHaveFocus();
  });

  it('saves the open draft before opening another row', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, 'u:0031', input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    expect(await screen.findByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ code: '654' }),
    });
  });

  it('opens another row without saving when nothing changed', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031', { tried: ['650'] }), key('b', 1, 'u:0032')];
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    expect(await screen.findByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(state.update).not.toHaveBeenCalled();
  });

  it('stays on the draft when saving it before a switch fails', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    state.update.mockRejectedValue(new Error('Swatch must be a color like #A1B2C3.'));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('textbox', { name: 'Swatch hex' }), 'red');
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Swatch must be a color');
    expect(screen.getByRole('form', { name: 'Edit color: One' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Swatch hex' })).toHaveValue('red');
  });

  it('keeps the draft when a second tap lands during a save that fails', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032'), key('c', 2, 'u:0033')];
    let reject: (error: Error) => void = () => {};
    state.update.mockReturnValueOnce(new Promise((_, fail) => (reject = fail)));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    await user.click(screen.getByRole('button', { name: /^Three,/ }));
    reject(new Error('Could not save. Try again.'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('form', { name: 'Edit color: One' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it('opens the last row tapped once a slow save finishes', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032'), key('c', 2, 'u:0033')];
    let resolve: (value: unknown) => void = () => {};
    state.update.mockReturnValueOnce(new Promise(done => (resolve = done)));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    await user.click(screen.getByRole('button', { name: /^Three,/ }));
    resolve(key('a', 0, 'u:0031', { code: '654' }));
    expect(await screen.findByRole('form', { name: 'Edit color: Three' })).toBeInTheDocument();
  });

  it('locks the draft while it saves, keeping focus where it was', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    let resolve: (value: unknown) => void = () => {};
    state.update.mockReturnValueOnce(new Promise(done => (resolve = done)));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    const code = screen.getByRole('combobox', { name: 'Code' });
    await user.type(code, '654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await user.click(code);
    await user.keyboard('7');
    expect(code).toHaveValue('654');
    expect(code).toHaveFocus();
    for (const name of ['Change symbol', 'Save', 'Delete'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    resolve(key('a', 0, 'u:0031', { code: '654' }));
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
  });

  it('saves the open draft before adding a symbol', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.update.mockImplementation(async ({ id, input }) => key(id, 0, 'u:0031', input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
    await user.click(screen.getByRole('option', { name: 'Yen sign' }));
    expect(await screen.findByRole('form', { name: 'Add a color: Yen sign' })).toBeInTheDocument();
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ code: '654' }),
    });
  });

  it('does not add back an unchanged row that was removed elsewhere when switching', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    state.rows = [key('b', 1, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    expect(await screen.findByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });

  it('keeps the draft when another device removes the last row', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    state.rows = [];
    rerender(<ColorKeySection pageId="page-1" />);
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
    expect(screen.queryByRole('group', { name: 'Symbols on this page' })).toBeNull();
  });

  it('keeps a newer draft open when an earlier save finishes', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    let resolve: (value: unknown) => void = () => {};
    state.update.mockReturnValueOnce(new Promise(done => (resolve = done)));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '700');
    resolve(key('a', 0, 'u:0031'));
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
    await new Promise(done => setTimeout(done, 0));
    expect(screen.getByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('700');
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it('saves a replacement form too when the symbol changed during a save', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    let resolve: (value: unknown) => void = () => {};
    state.update.mockReturnValueOnce(new Promise(done => (resolve = done)));
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: 'Save and next: Two' }));
    state.rows = [key('a', 0, 'u:00A5'), key('b', 1, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '800');
    resolve(key('a', 0, 'u:00A5'));
    expect(await screen.findByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(state.update).toHaveBeenLastCalledWith({
      id: 'a',
      input: expect.objectContaining({ symbol: 'u:00A5', code: '800' }),
    });
  });

  it('saves every form replaced while a save runs before moving on', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    let resolveFirst: (value: unknown) => void = () => {};
    let resolveSecond: (value: unknown) => void = () => {};
    state.update
      .mockReturnValueOnce(new Promise(done => (resolveFirst = done)))
      .mockReturnValueOnce(new Promise(done => (resolveSecond = done)));
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: 'Save and next: Two' }));
    state.rows = [key('a', 0, 'u:00A5'), key('b', 1, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '800');
    resolveFirst(key('a', 0, 'u:00A5'));
    await waitFor(() => expect(state.update).toHaveBeenCalledTimes(2));
    state.rows = [key('a', 0, 'u:0033'), key('b', 1, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '900');
    resolveSecond(key('a', 0, 'u:0033'));
    expect(await screen.findByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(state.update).toHaveBeenLastCalledWith({
      id: 'a',
      input: expect.objectContaining({ symbol: 'u:0033', code: '900' }),
    });
  });

  it.each([
    ['Save', null],
    ['Save and next: Two', 'Edit color: Two'],
  ])(
    'finishes %s when the saved symbol reaches the list before the save resolves',
    async (button, after) => {
      const user = userEvent.setup();
      state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
      const view = render(<ColorKeySection pageId="page-1" />);
      state.update.mockImplementation(async ({ id, input }) => {
        state.rows = [key('a', 0, input.symbol), key('b', 1, 'u:0032')];
        act(() => view.rerender(<ColorKeySection pageId="page-1" />));
        return key(id, 0, input.symbol, input);
      });
      await user.click(screen.getByRole('button', { name: /^One,/ }));
      await user.click(screen.getByRole('button', { name: 'Change symbol' }));
      await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
      await user.click(screen.getByRole('option', { name: 'Yen sign' }));
      await user.click(screen.getByRole('button', { name: button }));
      if (after) expect(await screen.findByRole('form', { name: after })).toBeInTheDocument();
      else await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
      expect(screen.queryByRole('form', { name: 'Edit color: Yen sign' })).toBeNull();
    }
  );

  it('focuses the heading when closing the last row after it was removed elsewhere', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    state.rows = [];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Color key' })).toHaveFocus();
  });

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

  it('shows the validation message and keeps the entry open', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.update.mockRejectedValue(new Error('Swatch must be a color like #A1B2C3.'));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('textbox', { name: 'Swatch hex' }), 'red');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Swatch must be a color');
    expect(screen.getByRole('form', { name: 'Edit color: One' })).toBeInTheDocument();
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

  it('unlocks a new color after a failed save so it can be retried', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.create
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async input => key('c', input.position, input.symbol, input));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
    await user.click(screen.getByRole('option', { name: 'Yen sign' }));
    const code = screen.getByRole('combobox', { name: 'Code' });
    await user.type(code, 'PU');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    await user.type(code, '306');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
    expect(state.create).toHaveBeenCalledTimes(2);
    expect(state.create).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'PU306' }));
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

  it('stays on the draft with the gone message when a switch finds the row deleted', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    state.update.mockRejectedValue(new ClientResponseError({ status: 404 }));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Two,/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This color is no longer on this page. Save again to add it back.'
    );
    expect(screen.getByRole('form', { name: 'Add a color: One' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
  });

  it('opens the row tapped while a Save was still finishing', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032'), key('c', 2, 'u:0033')];
    let resolve: (value: unknown) => void = () => {};
    state.update.mockReturnValueOnce(new Promise(done => (resolve = done)));
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Save and next/ }));
    await user.click(screen.getByRole('button', { name: /^Three,/ }));
    resolve(key('a', 0, 'u:0031', { code: '654' }));
    expect(await screen.findByRole('form', { name: 'Edit color: Three' })).toBeInTheDocument();
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it('closes only the symbol picker on Escape, keeping the draft open', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search symbols' }), 'yen');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('searchbox')).toBeNull());
    expect(screen.getByRole('form', { name: 'Edit color: One' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
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
    expect(screen.getByRole('form', { name: 'Add a color: One' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: 'u:0031', position: 4, code: '654' })
    );
    expect(state.update).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
  });

  it('recreates a vanished row after the latest live position', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031'), key('b', 1, 'u:0032')];
    state.update.mockRejectedValue(new ClientResponseError({ status: 404 }));
    state.create.mockResolvedValue(key('c', 8, 'u:0031'));
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    state.rows = [key('b', 0, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save again to add it back');
    state.rows = [key('b', 0, 'u:0032'), key('d', 7, 'u:0034')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({ position: 8, code: '654', symbol: 'u:0031' })
    );
  });

  it('keeps Save and next available after the edited row vanishes', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 2, 'u:0031'), key('b', 5, 'u:0032')];
    state.update.mockRejectedValue(new ClientResponseError({ status: 404 }));
    state.create.mockResolvedValue(key('c', 6, 'u:0031'));
    const { rerender } = render(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    state.rows = [key('d', 0, 'u:0034'), key('b', 5, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" />);
    await user.click(screen.getByRole('button', { name: 'Save and next: Two' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save again to add it back');
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
    await user.click(screen.getByRole('button', { name: 'Save and next: Two' }));
    expect(await screen.findByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveFocus();
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
    expect(screen.getByRole('form', { name: 'Edit color: Yen sign' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull());

    await user.click(screen.getByRole('button', { name: /^One,/ }));
    expect(screen.getByRole('form', { name: 'Edit color: One' })).toBeInTheDocument();
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ symbol: 'u:0031' }),
    });
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
});

describe('Symbol requests', () => {
  const REQUEST = 'abcdefghijklmno';

  async function sendPhoto(user: ReturnType<typeof userEvent.setup>, usePhoto = true) {
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    const dialog = screen.getByRole('dialog', { name: 'Send us a symbol' });
    await user.upload(
      within(dialog).getByLabelText('Photo'),
      new File(['photo'], 'symbol.jpg', { type: 'image/jpeg' })
    );
    if (!usePhoto)
      await user.click(
        within(dialog).getByRole('checkbox', {
          name: 'Use my photo as the symbol on this page for now',
        })
      );
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Send us a symbol' })).toBeNull()
    );
  }

  it('prefills the book and page from the page being colored', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    expect(screen.queryByRole('dialog', { name: 'Add a symbol' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Book and page' })).toHaveValue(
      'Lost Ocean, page 4'
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('me@example.test');
  });

  it('only sends the photo when it should not stand in for the symbol', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.sendRequest.mockResolvedValue({ id: REQUEST });
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await sendPhoto(user, false);
    expect(state.create).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.success).toHaveBeenCalled();
  });

  it('retries adding the row without sending the photo again', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.sendRequest.mockResolvedValue({ id: REQUEST });
    state.create
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(key('r', 1, `r:${REQUEST}`));
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    const dialog = screen.getByRole('dialog', { name: 'Send us a symbol' });
    await user.upload(
      within(dialog).getByLabelText('Photo'),
      new File(['photo'], 'symbol.jpg', { type: 'image/jpeg' })
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We got your photo, but couldn't add it to this page."
    );
    expect(state.success).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('form', { name: 'Edit color: Sent symbol' })
    ).toBeInTheDocument();
    expect(state.sendRequest).toHaveBeenCalledTimes(1);
    expect(state.create).toHaveBeenCalledTimes(2);
    expect(state.create).toHaveBeenLastCalledWith({ symbol: `r:${REQUEST}`, position: 1 });
    expect(state.success).toHaveBeenCalledTimes(1);
  });

  it('closes after a failed placement without sending or adding again', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.sendRequest.mockResolvedValue({ id: REQUEST });
    state.create.mockRejectedValue(new Error('offline'));
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    const dialog = screen.getByRole('dialog', { name: 'Send us a symbol' });
    await user.upload(
      within(dialog).getByLabelText('Photo'),
      new File(['photo'], 'symbol.jpg', { type: 'image/jpeg' })
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We got your photo, but couldn't add it to this page."
    );
    // The form's Close button; the sheet's own close control shares the name.
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Send us a symbol' })).toBeNull()
    );
    expect(state.sendRequest).toHaveBeenCalledTimes(1);
    expect(state.create).toHaveBeenCalledTimes(1);
  });

  it('places the row after rows that arrived while sending', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    let resolve: (value: unknown) => void = () => {};
    state.sendRequest.mockReturnValue(new Promise(done => (resolve = done)));
    state.create.mockResolvedValue(key('r', 6, `r:${REQUEST}`));
    const { rerender } = render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    await user.upload(
      screen.getByLabelText('Photo'),
      new File(['photo'], 'symbol.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    state.rows = [key('a', 0, 'u:0031'), key('b', 5, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    resolve({ id: REQUEST });
    await waitFor(() =>
      expect(state.create).toHaveBeenCalledWith({ symbol: `r:${REQUEST}`, position: 6 })
    );
  });

  it('returns focus to Add symbol after closing the request', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add symbol' })).toHaveFocus());
  });

  it('returns focus to Change symbol after closing a request from the entry', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change symbol' })).toHaveFocus()
    );
  });

  it('does not claim the photo was used when the entry changed while sending', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    let resolve: (value: unknown) => void = () => {};
    state.sendRequest.mockReturnValue(new Promise(done => (resolve = done)));
    const { rerender } = render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    await user.click(screen.getByRole('button', { name: /Can't find your symbol/ }));
    await user.upload(
      screen.getByLabelText('Photo'),
      new File(['photo'], 'symbol.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    // Another device changed this row's symbol, so the open form is a different one now.
    state.rows = [key('a', 0, 'u:0032')];
    rerender(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    resolve({ id: REQUEST });
    await waitFor(() =>
      expect(state.success).toHaveBeenCalledWith(
        "Thanks for the photo. We'll email you when it's added.",
        "It wasn't used on this color because the color changed."
      )
    );
    expect(screen.getByRole('form', { name: 'Edit color: Two' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Change symbol' })).toHaveFocus()
    );
  });

  it('adds the photo to the setup list', async () => {
    const user = userEvent.setup();
    state.sendRequest.mockResolvedValue({ id: REQUEST });
    state.setup.mockResolvedValue([]);
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: 'Add symbols after z' }));
    await sendPhoto(user);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add symbols after z' })).toHaveFocus()
    );
    const group = screen.getByRole('group', { name: 'Symbols on this page' });
    expect(within(group).getByRole('button', { name: 'Sent symbol' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(state.setup.mock.calls[0][0].at(-1)).toBe(`r:${REQUEST}`);
  });

  it('replaces the symbol from Change symbol and saves it with the row', async () => {
    const user = userEvent.setup();
    state.rows = [key('a', 0, 'u:0031')];
    state.sendRequest.mockResolvedValue({ id: REQUEST });
    state.update.mockResolvedValue(key('a', 0, `r:${REQUEST}`));
    render(<ColorKeySection pageId="page-1" bookLabel="Lost Ocean, page 4" />);
    await user.click(screen.getByRole('button', { name: /^One,/ }));
    await user.type(screen.getByRole('combobox', { name: 'Code' }), '654');
    await user.click(screen.getByRole('button', { name: 'Change symbol' }));
    await sendPhoto(user);
    expect(screen.getByRole('form', { name: 'Edit color: Sent symbol' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Code' })).toHaveValue('654');
    expect(state.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(state.update).toHaveBeenCalledWith({
      id: 'a',
      input: expect.objectContaining({ symbol: `r:${REQUEST}`, code: '654' }),
    });
  });
});
