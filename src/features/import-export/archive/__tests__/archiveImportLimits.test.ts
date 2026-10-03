import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  assertArchiveManifestRecordLimits,
  assertArchiveCentralDirectoryLimits,
  assertArchiveV3RecordLimits,
  assertArchiveZipMetadataLimits,
  MAX_ARCHIVE_ENTRIES,
} from '@/features/import-export/archive/archiveImportLimits';
import { readBoundedBlob, readBoundedText } from '@/features/import-export/archive/archiveZipRead';

describe('archive import limits', () => {
  it('rejects a highly compressed entry before expanding it', async () => {
    const archive = new JSZip();
    archive.file('manifest.json', '{}');
    archive.file('photos/bomb.jpg', 'a'.repeat(1024 * 1024));
    const bytes = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const loaded = await JSZip.loadAsync(bytes);

    expect(() => assertArchiveZipMetadataLimits(loaded)).toThrow(/compression ratio/i);
  });

  it('rejects excessive central-directory entries before reading any', async () => {
    const archive = new JSZip();
    archive.file('manifest.json', '{}');
    const bytes = await archive.generateAsync({ type: 'uint8array' });
    const loaded = await JSZip.loadAsync(bytes);
    const entry = loaded.file('manifest.json');
    if (!entry) throw new Error('Test ZIP is missing manifest.json');
    for (let index = 0; index < MAX_ARCHIVE_ENTRIES; index++) {
      loaded.files[`extra-${index}.txt`] = entry;
    }

    expect(() => assertArchiveZipMetadataLimits(loaded)).toThrow(/too many entries/i);
  });

  it('rejects a false central-directory count before JSZip parses entries', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    zip.file('extra.txt', 'x');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const end = bytes.length - 22;
    const view = new DataView(bytes.buffer);
    view.setUint16(end + 8, 1, true);
    view.setUint16(end + 10, 1, true);

    await expect(assertArchiveCentralDirectoryLimits(new File([bytes], 'bad.zip'))).rejects.toThrow(
      /central directory count/i
    );
  });

  it('rejects declared excessive entries before JSZip parses the archive', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    const end = bytes.length - 22;
    const view = new DataView(bytes.buffer);
    view.setUint16(end + 8, MAX_ARCHIVE_ENTRIES + 1, true);
    view.setUint16(end + 10, MAX_ARCHIVE_ENTRIES + 1, true);

    await expect(assertArchiveCentralDirectoryLimits(new File([bytes], 'bad.zip'))).rejects.toThrow(
      /too many entries/i
    );
  });

  it('rejects a later end-record signature hidden in a ZIP comment', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    const base = await zip.generateAsync({ type: 'uint8array' });
    const bytes = new Uint8Array(base.length + 23);
    bytes.set(base);
    const end = base.length - 22;
    const view = new DataView(bytes.buffer);
    view.setUint16(end + 20, 23, true);
    bytes.set([0x50, 0x4b, 0x05, 0x06], base.length);

    await expect(
      assertArchiveCentralDirectoryLimits(new File([bytes], 'ambiguous.zip'))
    ).rejects.toThrow(/invalid central directory/i);
  });

  it('rejects a truncated end-record signature at the end of a ZIP comment', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    const base = await zip.generateAsync({ type: 'uint8array' });
    const bytes = new Uint8Array(base.length + 4);
    bytes.set(base);
    new DataView(bytes.buffer).setUint16(base.length - 2, 4, true);
    bytes.set([0x50, 0x4b, 0x05, 0x06], base.length);

    await expect(
      assertArchiveCentralDirectoryLimits(new File([bytes], 'truncated.zip'))
    ).rejects.toThrow(/invalid central directory/i);
  });

  it('rejects excessive top-level records before traversing them', () => {
    expect(() =>
      assertArchiveManifestRecordLimits({
        diamondProjects: Array(10_001).fill(null),
        coloringBooks: [],
        coloringMediums: [],
        files: [],
        warnings: [],
      })
    ).toThrow(/too many diamond projects/i);
  });

  it('rejects excessive nested page records', () => {
    expect(() =>
      assertArchiveManifestRecordLimits({
        diamondProjects: [],
        coloringBooks: [{ pages: Array(100_001).fill(null) }],
        coloringMediums: [],
        files: [],
        warnings: [],
      })
    ).toThrow(/too many coloring pages/i);
  });

  it('rejects nested note floods before legacy restore', () => {
    expect(() =>
      assertArchiveManifestRecordLimits({
        diamondProjects: [{ progressNotes: Array(10_001).fill(null) }],
        coloringBooks: [],
        coloringMediums: [],
        files: [],
        warnings: [],
      })
    ).toThrow(/too many progress notes/i);
  });

  it('rejects v3 warning and metadata array floods before schema parsing', () => {
    expect(() =>
      assertArchiveV3RecordLimits({ items: [], warnings: Array(10_001).fill(null) })
    ).toThrow(/too many warnings/i);
    expect(() =>
      assertArchiveV3RecordLimits({
        items: [
          {
            kind: 'coloring-page',
            assets: [],
            metadata: { mediumItemIds: Array(1_001).fill('x') },
          },
        ],
        warnings: [],
      })
    ).toThrow(/too many mediumItemIds/i);
  });

  it('rejects array-shaped v3 metadata before enumerating members', () => {
    expect(() =>
      assertArchiveV3RecordLimits({
        items: [{ kind: 'diamond-project', assets: [], metadata: Array(1_001).fill('x') }],
        warnings: [],
      })
    ).toThrow(/invalid metadata shape/i);
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

  it('counts streamed manifest text against the shared extraction budget', async () => {
    const archive = new JSZip();
    archive.file('photo-import.json', '123456');
    archive.file('photo.jpg', 'abcdef');
    const loaded = await JSZip.loadAsync(await archive.generateAsync({ type: 'uint8array' }));
    const manifest = loaded.file('photo-import.json');
    const photo = loaded.file('photo.jpg');
    if (!manifest || !photo) throw new Error('Test ZIP is missing entries');
    const budget = { expandedBytes: 0 };

    await expect(readBoundedText(manifest, 8, budget, 10)).resolves.toBe('123456');
    await expect(readBoundedBlob(photo, 8, budget, 10)).rejects.toThrow(/expanded data/i);
  });
});
