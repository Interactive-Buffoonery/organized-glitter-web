import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { assertArchiveZipMetadataLimits } from '@/features/import-export/archive/archiveImportLimits';
import { readBoundedBlob } from '@/features/import-export/archive/archiveZipRead';

describe('archive import limits', () => {
  it('rejects a highly compressed entry before expanding it', async () => {
    const archive = new JSZip();
    archive.file('manifest.json', '{}');
    archive.file('photos/bomb.jpg', 'a'.repeat(1024 * 1024));
    const bytes = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const loaded = await JSZip.loadAsync(bytes);

    expect(() => assertArchiveZipMetadataLimits(loaded)).toThrow(/compression ratio/i);
  });

  it('bounds cumulative expanded bytes while streaming entries', async () => {
    const archive = new JSZip();
    archive.file('first.jpg', '123456');
    archive.file('second.jpg', 'abcdef');
    const loaded = await JSZip.loadAsync(await archive.generateAsync({ type: 'uint8array' }));
    const first = loaded.file('first.jpg');
    const second = loaded.file('second.jpg');
    if (!first || !second) throw new Error('Test ZIP is missing photos');
    const budget = { expandedBytes: 0 };

    await expect(readBoundedBlob(first, 8, budget, 10)).resolves.toBeInstanceOf(Blob);
    await expect(readBoundedBlob(second, 8, budget, 10)).rejects.toThrow(/expanded data/i);
  });
});
