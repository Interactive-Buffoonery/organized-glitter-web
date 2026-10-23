import { validateArchiveManifest } from '../archiveManifest';
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

  it('dispatches a complete v4 manifest through the real validator', async () => {
    const manifest = {
      schemaVersion: 4,
      source: 'organized-glitter',
      exportedAt: '2026-01-01T00:00:00Z',
      files: [],
      diamondProjects: [],
      coloringMediums: [],
      warnings: [],
      coloringBooks: [
        {
          ref: 'coloring-book:b',
          oldId: 'b',
          title: 'Book',
          totalPages: 1,
          tags: [],
          pages: [
            {
              ref: 'coloring-page:p',
              oldId: 'p',
              pageNumber: 1,
              status: 'not_started',
              mediumRefs: [],
              photoPaths: [],
              progressNotes: [],
              colorKeys: [
                {
                  ref: 'coloring-color-key:k',
                  position: 0,
                  symbol: 'u:0031',
                  code: '',
                  color_name: '',
                  swatch: '',
                  tried: [],
                  note: '',
                  created: '2026-01-01 00:00:00.000Z',
                  updated: '2026-01-01 00:00:00.000Z',
                },
              ],
            },
          ],
        },
      ],
    };
    mocks.importLegacy.mockImplementationOnce(async file => {
      const zip = await JSZip.loadAsync(file);
      const validated = validateArchiveManifest(
        JSON.parse(await zip.file('manifest.json')!.async('string'))
      );
      return { success: true, archiveSchemaVersion: validated.schemaVersion };
    });
    const result = await importOrganizedGlitterArchives([
      await manifestFile(JSON.stringify(manifest)),
    ]);
    expect(result.schemaVersion).toBe(4);
    expect(result.result.success).toBe(true);
  });

  it('preserves the legacy v2 route without requiring a v3-capable server', async () => {
    const file = await schemaFile(2);
    mocks.importLegacy.mockResolvedValue({
      archiveSchemaVersion: 2,
      success: true,
    });

    const controller = new AbortController();

    const result = await importOrganizedGlitterArchives([file], { signal: controller.signal });

    expect(result.schemaVersion).toBe(2);
    expect(mocks.importLegacy).toHaveBeenCalledWith(file, {
      userId: 'user-1',
      signal: controller.signal,
      getCurrentUserId: expect.any(Function),
    });
    const session = mocks.importLegacy.mock.calls[0][1] as { getCurrentUserId(): string | null };
    mocks.getCurrentUser.mockReturnValueOnce({ id: 'user-2' });
    expect(session.getCurrentUserId()).toBe('user-2');
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
    expect(mocks.importV3).not.toHaveBeenCalled();
  });

  it('reports malformed manifest JSON without exposing parser details', async () => {
    const file = await manifestFile('{');

    await expect(importOrganizedGlitterArchives([file])).rejects.toThrow(
      'Invalid archive manifest JSON'
    );

    expect(mocks.importLegacy).not.toHaveBeenCalled();
    expect(mocks.getCapabilities).not.toHaveBeenCalled();
    expect(mocks.importV3).not.toHaveBeenCalled();
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
