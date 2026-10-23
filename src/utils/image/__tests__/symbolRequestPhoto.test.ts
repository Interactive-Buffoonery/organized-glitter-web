import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareSymbolRequestPhoto } from '../symbolRequestPhoto';

const compress = vi.hoisted(() => vi.fn());
vi.mock('@/utils/image/sharedImageCompression', () => ({ compressUserImage: compress }));

const file = (type: string, size = 10, name = 'photo') =>
  new File([new Uint8Array(size)], name, { type });

beforeEach(() => compress.mockReset());

describe('prepareSymbolRequestPhoto', () => {
  it('returns the compressed photo when the backend accepts it', async () => {
    const out = file('image/jpeg');
    compress.mockResolvedValue(out);
    await expect(prepareSymbolRequestPhoto(file('image/webp'))).resolves.toBe(out);
  });

  it('infers the type from the file name before compressing', async () => {
    compress.mockImplementation(async (input: File) => input);
    const prepared = await prepareSymbolRequestPhoto(file('', 10, 'symbol.png'));
    expect(prepared.type).toBe('image/png');
  });

  it.each([
    ['a type the backend does not take', file('image/gif')],
    ['a photo over 10 MB', file('image/jpeg', 10 * 1024 * 1024 + 1)],
  ])('rejects %s', async (_label, out) => {
    compress.mockResolvedValue(out);
    await expect(prepareSymbolRequestPhoto(file('image/jpeg'))).rejects.toThrow(
      'Choose a JPG, PNG, or WebP photo under 10 MB.'
    );
  });
});
