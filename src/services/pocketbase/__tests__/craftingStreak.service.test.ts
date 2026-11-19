import { beforeEach, expect, it, vi } from 'vitest';
const { list, filter, create, remove, collection } = vi.hoisted(() => {
  const list = vi.fn();
  const create = vi.fn();
  const remove = vi.fn();
  return {
    list,
    create,
    remove,
    filter: vi.fn((s: string) => s),
    collection: vi.fn(() => ({ getList: list, create, delete: remove })),
  };
});
vi.mock('@/lib/pocketbase', () => ({ pb: { collection, filter } }));
import { CraftingStreakService } from '../craftingStreak.service';
const NOW = new Date('2026-11-14T12:00:00Z');
const rows = (field: string, values: string[], total = values.length, pageNumber = 1) => ({
  page: pageNumber,
  perPage: 500,
  totalItems: total,
  totalPages: Math.ceil(total / 500),
  items: values.map((value, i) => ({ id: `${pageNumber}-${i}`, [field]: value })),
});
const page = (dates: string[], total = dates.length, pageNumber = 1) =>
  rows('date', dates, total, pageNumber);
const empty = () => page([]);
beforeEach(() => {
  vi.resetAllMocks();
  collection.mockImplementation(() => ({ getList: list, create, delete: remove }));
  filter.mockImplementation((s: string) => s);
});
it('reads notes, activity and marks for the user', async () => {
  list
    .mockResolvedValueOnce(page(['2026-10-03 00:00:00.000Z']))
    .mockResolvedValueOnce(page(['2026-10-02']))
    .mockResolvedValueOnce(rows('slot', ['2026-11-14 09:15:00.000Z']))
    .mockResolvedValueOnce(rows('day', ['2026-11-12']));
  expect(await CraftingStreakService.history('user', NOW)).toEqual({
    noteDates: ['2026-10-03', '2026-10-02'],
    slots: ['2026-11-14 09:15:00.000Z'],
    marks: [{ id: '1-0', day: '2026-11-12' }],
  });
  expect(list).toHaveBeenCalledTimes(4);
  expect(list.mock.calls.map(c => c[2].fields)).toEqual([
    'id,date',
    'id,date',
    'id,slot',
    'id,day',
  ]);
  const filters = filter.mock.calls.map(c => c[0]).join(' ');
  expect(filters).toContain('project.user');
  expect(filters).toContain('page.book.user');
  expect(collection.mock.calls.map(c => c[0])).toEqual([
    'progress_notes',
    'coloring_page_progress_notes',
    'crafting_activity',
    'crafting_day_marks',
  ]);
});
it('limits activity to a recent window', async () => {
  list.mockResolvedValue(empty());
  await CraftingStreakService.history('user', NOW);
  const activity = filter.mock.calls.find(c => c[0].includes('slot'));
  expect(activity?.[1]).toEqual({ userId: 'user', since: '2025-10-10 12:00:00.000Z' });
});
it('continues beyond the first page before returning', async () => {
  list
    .mockResolvedValueOnce(page(Array(500).fill('2026-10-03'), 501))
    .mockResolvedValueOnce(page(['2026-10-02'], 501, 2))
    .mockResolvedValue(empty());
  expect((await CraftingStreakService.history('user', NOW)).noteDates).toContain('2026-10-02');
  expect(list).toHaveBeenCalledTimes(5);
});
it.each(['failure', 'partial', 'limit', 'changed', 'duplicate', 'activity'])(
  'rejects %s rather than reporting zero',
  async kind => {
    if (kind === 'failure') list.mockRejectedValue(new Error('unavailable'));
    if (kind === 'partial') list.mockResolvedValue(page([], 2));
    if (kind === 'limit') list.mockResolvedValue(page([], 10001));
    if (kind === 'changed')
      list
        .mockResolvedValueOnce(page(Array(500).fill('2026-10-03'), 501))
        .mockResolvedValueOnce(page(['2026-10-02'], 502, 2));
    if (kind === 'duplicate')
      list.mockResolvedValueOnce(page(Array(500).fill('2026-10-03'), 501)).mockResolvedValueOnce({
        ...page(['2026-10-02'], 501, 2),
        items: [{ id: '1-0', date: '2026-10-02' }],
      });
    if (kind === 'activity')
      list
        .mockResolvedValueOnce(empty())
        .mockResolvedValueOnce(empty())
        .mockRejectedValueOnce(new Error('unavailable'));
    await expect(CraftingStreakService.history('user', NOW)).rejects.toThrow();
  }
);
it('forwards cancellation to every request', async () => {
  const controller = new AbortController();
  list.mockResolvedValue(empty());
  await CraftingStreakService.history('user', NOW, controller.signal);
  expect(list.mock.calls.every(c => c[2].signal === controller.signal)).toBe(true);
  controller.abort();
  await expect(CraftingStreakService.history('user', NOW, controller.signal)).rejects.toThrow();
});
it('creates and deletes marks', async () => {
  create.mockResolvedValue({ id: 'mark1', day: '2026-11-12' });
  expect(await CraftingStreakService.mark('user', '2026-11-12')).toEqual({
    id: 'mark1',
    day: '2026-11-12',
  });
  expect(create).toHaveBeenCalledWith({ user: 'user', day: '2026-11-12' }, { fields: 'id,day' });
  await CraftingStreakService.unmark('mark1');
  expect(remove).toHaveBeenCalledWith('mark1');
});
