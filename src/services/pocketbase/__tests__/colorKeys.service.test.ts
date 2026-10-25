import { ClientResponseError } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorKeysService } from '../colorKeys.service';

const mocks = vi.hoisted(() => ({
  getFullList: vi.fn(),
  getList: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getURL: vi.fn(),
  send: vi.fn(),
  collection: vi.fn(),
  userId: 'owner',
}));
vi.mock('@/lib/pocketbase', () => ({
  pb: {
    collection: mocks.collection,
    filter: (raw: string, params: Record<string, unknown>) => `${raw} ${JSON.stringify(params)}`,
    files: { getURL: mocks.getURL },
    send: mocks.send,
  },
}));
vi.mock('@/services/auth', () => ({ getCurrentUserId: () => mocks.userId }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = 'owner';
  mocks.collection.mockReturnValue({
    getFullList: mocks.getFullList,
    getList: mocks.getList,
    create: mocks.create,
    update: mocks.update,
    delete: mocks.delete,
  });
});

describe('ColorKeysService', () => {
  it('lists a page in strip order with ownership in the filter', async () => {
    mocks.getFullList.mockResolvedValue([]);
    await ColorKeysService.list('page-1', 'owner');
    expect(mocks.collection).toHaveBeenCalledWith('coloring_page_color_keys');
    const [options] = mocks.getFullList.mock.calls[0];
    expect(options.sort).toBe('position,created');
    expect(options.filter).toContain('"page":"page-1"');
    expect(options.filter).toContain('"user":"owner"');
  });

  it('fills missing text fields so rows can always be rendered', async () => {
    const sparse = { id: 'key-1', symbol: 'u:0031', code: null };
    mocks.getFullList.mockResolvedValue([sparse]);
    mocks.create.mockResolvedValue(sparse);
    mocks.update.mockResolvedValue(sparse);
    mocks.send.mockResolvedValue({ items: [sparse] });
    const filled = expect.objectContaining({ code: '', color_name: '', swatch: '' });
    expect(await ColorKeysService.list('page-1', 'owner')).toEqual([filled]);
    expect(
      await ColorKeysService.create('page-1', 'owner', { symbol: 'u:0031', position: 0 })
    ).toEqual(filled);
    expect(await ColorKeysService.update('key-1', 'owner', { code: '' })).toEqual(filled);
    expect(await ColorKeysService.setup('page-1', 'owner', ['u:0031'])).toEqual([filled]);
  });

  it('refuses to read after the account changes', async () => {
    mocks.userId = 'someone-else';
    await expect(ColorKeysService.list('page-1', 'owner')).rejects.toThrow('account changed');
    expect(mocks.getFullList).not.toHaveBeenCalled();
  });

  it('creates a trimmed key owned by the user and page', async () => {
    mocks.create.mockResolvedValue({ id: 'key-1' });
    await ColorKeysService.create('page-1', 'owner', {
      symbol: 'u:03C8',
      position: 3,
      code: ' 654 ',
      color_name: ' Lilac ',
      swatch: '#B79AD6',
      tried: [' 650 ', '', '651'],
      note: ' ok ',
    });
    expect(mocks.create).toHaveBeenCalledWith(
      {
        user: 'owner',
        page: 'page-1',
        symbol: 'u:03C8',
        position: 3,
        code: '654',
        color_name: 'Lilac',
        swatch: '#B79AD6',
        tried: ['650', '651'],
        note: 'ok',
      },
      { requestKey: null }
    );
  });

  it.each([
    [{ symbol: 'x', position: 0 }, 'symbol'],
    [{ symbol: 'u:0041', position: -1 }, 'position'],
    [{ symbol: 'u:0041', position: 0, code: 'x'.repeat(101) }, 'Code'],
    [{ symbol: 'u:0041', position: 0, color_name: 'x'.repeat(101) }, 'Color name'],
    [{ symbol: 'u:0041', position: 0, swatch: 'red' }, 'Swatch'],
    [{ symbol: 'u:0041', position: 0, tried: Array(21).fill('1') }, 'Tried'],
    [{ symbol: 'u:0041', position: 0, tried: ['x'.repeat(101)] }, 'Tried'],
    [{ symbol: 'u:0041', position: 0, note: 'x'.repeat(2001) }, 'Note'],
  ])('rejects input outside the backend limits %#', async (input, message) => {
    await expect(ColorKeysService.create('page-1', 'owner', input)).rejects.toThrow(message);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('counts characters, not UTF-16 units, like the backend', async () => {
    mocks.create.mockResolvedValue({ id: 'key-1' });
    await ColorKeysService.create('page-1', 'owner', {
      symbol: 'u:0041',
      position: 0,
      code: '\u{1F600}'.repeat(100),
    });
    expect(mocks.create).toHaveBeenCalled();
  });

  it('updates only the fields given and returns the server record', async () => {
    mocks.update.mockResolvedValue({ id: 'key-1', symbol: 'u:03C8' });
    await expect(
      ColorKeysService.update('key-1', 'owner', { symbol: 'r:abcdefghijklmno', code: '1' })
    ).resolves.toMatchObject({ id: 'key-1', symbol: 'u:03C8' });
    expect(mocks.update).toHaveBeenCalledWith(
      'key-1',
      { symbol: 'r:abcdefghijklmno', code: '1' },
      { requestKey: null }
    );
  });

  it('treats deleting a color that is already gone as done', async () => {
    mocks.delete.mockRejectedValue(new ClientResponseError({ status: 404 }));
    await expect(ColorKeysService.remove('key-1', 'owner')).resolves.toBeUndefined();
    mocks.delete.mockRejectedValue(new ClientResponseError({ status: 500 }));
    await expect(ColorKeysService.remove('key-1', 'owner')).rejects.toBeInstanceOf(
      ClientResponseError
    );
  });

  it('builds code history from recent keys, newest use per code wins', async () => {
    mocks.getList.mockResolvedValue({
      items: [
        { code: 'MB 108', color_name: 'Lilac', swatch: '#B79AD6' },
        { code: 'mb 108', color_name: 'Old name', swatch: '' },
        { code: ' 654 ', color_name: '', swatch: '' },
      ],
    });
    await expect(ColorKeysService.history('owner')).resolves.toEqual([
      { code: 'MB 108', color_name: 'Lilac', swatch: '#B79AD6' },
      { code: '654', color_name: '', swatch: '' },
    ]);
    const [page, perPage, options] = mocks.getList.mock.calls[0];
    expect(page).toBe(1);
    expect(perPage).toBeLessThanOrEqual(500);
    expect(options.sort).toBe('-updated');
    expect(options.filter).toContain('code != ""');
    expect(options.skipTotal).toBe(true);
  });

  it('reads symbol requests with a 96x96f thumbnail and description', async () => {
    const record = { id: 'abcdefghijklmno', photo: 'p.jpg', description: 'Two ws' };
    mocks.getFullList.mockResolvedValue([record]);
    mocks.getURL.mockReturnValue('https://pb/api/files/x/p.jpg?thumb=96x96f');
    await expect(ColorKeysService.requests('owner', ['abcdefghijklmno'])).resolves.toEqual({
      abcdefghijklmno: {
        description: 'Two ws',
        thumbnail: 'https://pb/api/files/x/p.jpg?thumb=96x96f',
      },
    });
    expect(mocks.collection).toHaveBeenCalledWith('coloring_symbol_requests');
    expect(mocks.getURL).toHaveBeenCalledWith(record, 'p.jpg', { thumb: '96x96f' });
  });

  it('bounds request lookups and deduplicates IDs', async () => {
    const ids = Array.from({ length: 65 }, (_, index) => String(index).padStart(15, '0'));
    mocks.getFullList.mockResolvedValue([]);
    await ColorKeysService.requests('owner', [...ids, ...ids]);
    expect(mocks.getFullList).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.getFullList.mock.calls) {
      expect(options.filter.match(/id = /g)?.length).toBeLessThanOrEqual(50);
    }
  });

  it('stops a batched lookup when the account changes', async () => {
    mocks.getFullList.mockImplementationOnce(async () => {
      mocks.userId = 'someone-else';
      return [];
    });
    const ids = Array.from({ length: 65 }, (_, index) => String(index).padStart(15, '0'));
    await expect(ColorKeysService.requests('owner', ids)).rejects.toThrow('account changed');
    expect(mocks.getFullList).toHaveBeenCalledOnce();
  });

  it('skips the request lookup when no rows use a sent symbol', async () => {
    await expect(ColorKeysService.requests('owner', [])).resolves.toEqual({});
    expect(mocks.getFullList).not.toHaveBeenCalled();
  });

  it('sends a symbol request owned by the user with trimmed fields and the photo', async () => {
    const photo = new File(['x'], 'symbol.jpg', { type: 'image/jpeg' });
    mocks.create.mockResolvedValue({ id: 'abcdefghijklmno' });
    const saved = await ColorKeysService.createRequest('owner', {
      page: 'page-1',
      book_label: '  Lost Ocean, page 4 ',
      description: ' Two w stacked ',
      email: ' me@example.test ',
      photo,
    });
    expect(saved.id).toBe('abcdefghijklmno');
    expect(mocks.collection).toHaveBeenCalledWith('coloring_symbol_requests');
    const [data, options] = mocks.create.mock.calls[0];
    expect(data).toEqual({
      user: 'owner',
      page: 'page-1',
      book_label: 'Lost Ocean, page 4',
      description: 'Two w stacked',
      email: 'me@example.test',
      photo,
    });
    expect(options).toEqual({ requestKey: null });
  });

  it.each([
    [{ book_label: ' ' }, 'Enter the book and page.'],
    [{ book_label: 'x'.repeat(201) }, 'Book and page can be up to 200 characters.'],
    [{ description: 'x'.repeat(501) }, 'Description can be up to 500 characters.'],
    [{ email: 'not-an-email' }, 'Enter a valid email address.'],
    [{ photo: undefined }, 'Choose a photo.'],
  ])('rejects an invalid symbol request before sending (%o)', async (change, message) => {
    const input = {
      book_label: 'Lost Ocean, page 4',
      email: 'me@example.test',
      photo: new File(['x'], 'symbol.jpg', { type: 'image/jpeg' }),
      ...change,
    };
    await expect(
      ColorKeysService.createRequest(
        'owner',
        input as Parameters<typeof ColorKeysService.createRequest>[1]
      )
    ).rejects.toThrow(message);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses to send a request after the account changes', async () => {
    mocks.userId = 'someone-else';
    await expect(
      ColorKeysService.createRequest('owner', {
        book_label: 'Lost Ocean',
        email: 'me@example.test',
        photo: new File(['x'], 'symbol.jpg', { type: 'image/jpeg' }),
      })
    ).rejects.toThrow('Your account changed');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
