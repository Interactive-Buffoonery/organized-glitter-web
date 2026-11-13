import { beforeEach, expect, it, vi } from 'vitest';
const { list, filter } = vi.hoisted(() => ({ list: vi.fn(), filter: vi.fn((s: string) => s) }));
vi.mock('@/lib/pocketbase', () => ({ pb: { collection: () => ({ getList: list }), filter } }));
import { CraftingStreakService } from '../craftingStreak.service';
const page = (dates: string[], total = dates.length, pageNumber = 1) => ({
  page: pageNumber,
  perPage: 500,
  totalItems: total,
  totalPages: Math.ceil(total / 500),
  items: dates.map((date, i) => ({ id: `${pageNumber}-${i}`, date })),
});
beforeEach(() => vi.resetAllMocks());
it('reads both crafts without feed filters and preserves named days', async () => {
  list
    .mockResolvedValueOnce(page(['2026-10-03 00:00:00.000Z']))
    .mockResolvedValueOnce(page(['2026-10-02']));
  expect(await CraftingStreakService.dates('user')).toEqual(['2026-10-03', '2026-10-02']);
  expect(list).toHaveBeenCalledTimes(2);
  expect(list.mock.calls[0][2].fields).toBe('id,date');
  expect(filter.mock.calls.map(c => c[0]).join(' ')).toContain('project.user');
  expect(filter.mock.calls.map(c => c[0]).join(' ')).toContain('page.book.user');
});
it('continues beyond the first page before returning', async () => {
  list
    .mockResolvedValueOnce(page(Array(500).fill('2026-10-03'), 501))
    .mockResolvedValueOnce(page(['2026-10-02'], 501, 2))
    .mockResolvedValueOnce(page([]));
  expect(await CraftingStreakService.dates('user')).toContain('2026-10-02');
  expect(list).toHaveBeenCalledTimes(3);
});
it.each(['failure', 'partial', 'limit', 'changed', 'duplicate'])(
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
    await expect(CraftingStreakService.dates('user')).rejects.toThrow();
  }
);
it('forwards cancellation to every request', async () => {
  const controller = new AbortController();
  list.mockResolvedValue(page([]));
  await CraftingStreakService.dates('user', controller.signal);
  expect(list.mock.calls.every(c => c[2].signal === controller.signal)).toBe(true);
  controller.abort();
  await expect(CraftingStreakService.dates('user', controller.signal)).rejects.toThrow();
});
