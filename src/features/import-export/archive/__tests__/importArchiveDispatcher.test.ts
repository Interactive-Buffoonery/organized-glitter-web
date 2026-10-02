import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  importLegacy: vi.fn(),
  importV3: vi.fn(),
  getCapabilities: vi.fn(),
  restoreItem: vi.fn(),
  getCurrentUser: vi.fn(() => ({ id: 'user-1' })),
}));

vi.mock('@/services/auth', () => ({
  isAuthenticated: () => true,
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock('@/features/import-export/archive/importArchive', () => ({
  importOrganizedGlitterArchive: mocks.importLegacy,
  withArchiveImportLock: (_name: string, work: () => unknown) => work(),
}));
vi.mock('@/services/pocketbase/archiveRestoreV3.service', () => ({
  ArchiveRestoreV3Service: {
    getCapabilities: mocks.getCapabilities,
    restoreItem: mocks.restoreItem,
  },
}));
vi.mock('@/features/import-export/archive/v3/import', () => ({
  importArchiveV3Parts: mocks.importV3,
}));

const { importOrganizedGlitterArchives } =
  await import('@/features/import-export/archive/importArchiveDispatcher');

async function schemaFile(schemaVersion: number, name = 'archive.zip'): Promise<File> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ schemaVersion }));
  return zipFile(zip, name);
}

async function manifestFile(manifest: string, name = 'archive.zip'): Promise<File> {
  const zip = new JSZip();
  zip.file('manifest.json', manifest);
  return zipFile(zip, name);
}

async function zipFile(zip: JSZip, name: string): Promise<File> {
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([bytes], name, { type: 'application/zip' });
}

describe('archive import dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCapabilities.mockResolvedValue({
      restoreSchemaVersions: [1, 2, 3],
      multipartRestore: true,
      maxPartBytes: 536870912,
      maxAssetBytesByRole: {
        'project-cover': 52428800,
        'project-progress-note': 52428800,
        'coloring-book-cover': 52428800,
        'coloring-page-photo': 52428800,
        'coloring-page-progress-note': 52428800,
        'coloring-swatch-photo': 52428800,
      },
      maxRestoreRequestChars: 500000,
      maxMetadataStringChars: 100000,
      maxMetadataListEntries: 1000,
      maxMetadataListEntryChars: 255,
      maxMetadataNumber: 1000000000,
      maxAssetPosition: 1000000,
      receiptVersion: 1,
    });
    mocks.importV3.mockResolvedValue({ success: true });
  });

  it('preserves the legacy v2 route without requiring a v3-capable server', async () => {
    const file = await schemaFile(2);
    mocks.importLegacy.mockResolvedValue({
      archiveSchemaVersion: 2,
      success: true,
    });

    const result = await importOrganizedGlitterArchives([file]);

    expect(result.schemaVersion).toBe(2);
    expect(mocks.importLegacy).toHaveBeenCalledWith(file);
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
    expect(mocks.importV3).not.toHaveBeenCalled();
  });

  it.each(['null', '[]', '"manifest"', '42', 'true', '{}', '{"schemaVersion":99}'])(
    'rejects invalid manifest root or schema version %s before requesting a restore',
    async manifest => {
      const file = await manifestFile(manifest);

      await expect(importOrganizedGlitterArchives([file])).rejects.toThrow(
        'Unsupported or invalid archive schema version'
      );

      expect(mocks.importLegacy).not.toHaveBeenCalled();
      expect(mocks.getCapabilities).not.toHaveBeenCalled();
      expect(mocks.importV3).not.toHaveBeenCalled();
    }
  );

  it('reports malformed manifest JSON without exposing parser details', async () => {
    const file = await manifestFile('{');

    await expect(importOrganizedGlitterArchives([file])).rejects.toThrow(
      'Invalid archive manifest JSON'
    );

    expect(mocks.importLegacy).not.toHaveBeenCalled();
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
    expect(mocks.importV3).not.toHaveBeenCalled();
  });

  it('capability-gates a one-part v3 restore before entering the shared v3 pipeline', async () => {
    const file = await schemaFile(3);

    await importOrganizedGlitterArchives([file]);

    expect(mocks.getCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.getCapabilities.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.importV3.mock.invocationCallOrder[0]
    );
    expect(mocks.importV3).toHaveBeenCalledWith(
      [file],
      expect.objectContaining({
        adapter: expect.objectContaining({ restoreItem: mocks.restoreItem }),
        session: expect.objectContaining({ userId: 'user-1' }),
      })
    );
  });

  it('capability-gates multiple selected files before the v3 importer opens them', async () => {
    const files = [await schemaFile(3, 'part-1.zip'), await schemaFile(3, 'part-2.zip')];

    await importOrganizedGlitterArchives(files);

    expect(mocks.getCapabilities).toHaveBeenCalledTimes(1);
    expect(mocks.importV3).toHaveBeenCalledWith(files, expect.any(Object));
  });

  it('does not open a v3 archive when the capability request fails', async () => {
    mocks.getCapabilities.mockRejectedValue(
      new Error('This server must be updated before multipart backups can be restored.')
    );
    const file = await schemaFile(3);

    await expect(importOrganizedGlitterArchives([file])).rejects.toThrow(/server must be updated/i);

    expect(mocks.importV3).not.toHaveBeenCalled();
  });
});
