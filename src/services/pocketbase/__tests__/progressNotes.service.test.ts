import { fetchLatestNotes } from '../base/latestNotes';
/**
 * Tests for ProgressNotesService
 * Covers: CRUD operations and batched deletes for project deletion
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const pbMock = vi.hoisted(() => {
  const collectionMethods = {
    getOne: vi.fn(),
    getList: vi.fn().mockResolvedValue({
      page: 1,
      perPage: 20,
      totalItems: 0,
      totalPages: 0,
      items: [],
    }),
    getFullList: vi.fn().mockResolvedValue([]),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
  };

  return {
    pb: {
      collection: vi.fn(() => collectionMethods),
      filter: vi.fn((expr: string) => expr),
    },
    collectionMethods,
    reset: () => {
      Object.values(collectionMethods).forEach(m => m.mockReset());
      collectionMethods.getFullList.mockResolvedValue([]);
      collectionMethods.getList.mockResolvedValue({
        page: 1,
        perPage: 20,
        totalItems: 0,
        totalPages: 0,
        items: [],
      });
      collectionMethods.delete.mockResolvedValue(true);
    },
  };
});

vi.mock('../base/latestNotes', () => ({ fetchLatestNotes: vi.fn().mockResolvedValue(null) }));

vi.mock('@/lib/pocketbase', () => ({
  pb: pbMock.pb,
  getFileUrl: vi.fn((record: { id: string }, filename: string) =>
    record.id && filename ? `https://files.test/${record.id}/${filename}` : ''
  ),
}));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ProgressNotesService } from '../progressNotes.service';

describe('ProgressNotesService', () => {
  beforeEach(() => {
    pbMock.reset();
  });

  describe('listByProject()', () => {
    it('queries with project filter and sort order', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([
        {
          id: 'n1',
          project: 'p1',
          content: 'Note 1',
          date: '2024-01-01',
          image: '',
          created: '',
          updated: '',
        },
      ]);

      const notes = await ProgressNotesService.listByProject('p1');

      expect(pbMock.pb.filter).toHaveBeenCalledWith('project = {:projectId}', { projectId: 'p1' });
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('n1');
      expect(notes[0].imageUrl).toBeUndefined();
    });
  });

  describe('listByDateRange()', () => {
    it('queries by user + date range, expands project relations, and maps image URLs', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([
        {
          id: 'n1',
          project: 'p1',
          content: 'Note 1',
          date: '2024-03-15',
          image: 'note.png',
          created: '2024-03-15T01:00:00.000Z',
          updated: '2024-03-15T01:00:00.000Z',
          expand: {
            project: {
              id: 'p1',
              title: 'Aurora Kit',
              expand: {
                company: { id: 'c1', name: 'Diamond Art Club' },
                artist: { id: 'a1', name: 'Jane Doe' },
              },
            },
          },
        },
      ]);

      const notes = await ProgressNotesService.listByDateRange(
        'user-123',
        new Date('2024-03-01T12:00:00.000Z'),
        new Date('2024-03-31T12:00:00.000Z')
      );

      expect(pbMock.pb.filter).toHaveBeenCalledWith('project.user = {:userId}', {
        userId: 'user-123',
      });
      expect(pbMock.pb.filter).toHaveBeenCalledWith('date >= {:startDate} && date <= {:endDate}', {
        startDate: '2024-03-01',
        endDate: '2024-03-31',
      });
      expect(pbMock.collectionMethods.getFullList).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: '-date,-created',
          expand: 'project,project.company,project.artist',
        })
      );
      expect(notes).toEqual([
        expect.objectContaining({
          id: 'n1',
          imageUrl: 'https://files.test/n1/note.png',
          project: {
            id: 'p1',
            title: 'Aurora Kit',
            company: 'Diamond Art Club',
            artist: 'Jane Doe',
          },
        }),
      ]);
    });
  });

  describe('listForUser()', () => {
    it('builds paginated filters with optional params and maps expanded project metadata', async () => {
      pbMock.collectionMethods.getList.mockResolvedValue({
        page: 2,
        perPage: 10,
        totalItems: 12,
        totalPages: 2,
        items: [
          {
            id: 'n2',
            project: 'p2',
            content: 'Feed note',
            date: '2024-07-04 00:00:00.000Z',
            image: 'feed.png',
            created: '2024-07-04T01:00:00.000Z',
            updated: '2024-07-04T01:00:00.000Z',
            expand: {
              project: {
                id: 'p2',
                title: 'Fireworks',
                expand: {
                  company: { id: 'c2', name: 'Dreamer Designs' },
                  artist: { id: 'a2', name: 'Artist Two' },
                },
              },
            },
          },
        ],
      });

      const result = await ProgressNotesService.listForUser({
        userId: 'user-123',
        page: 2,
        perPage: 10,
        projectId: 'p2',
        year: 2024,
        hasImage: true,
        cursor: {
          id: 'cursor-note',
          date: '2024-07-04',
          createdAt: '2024-07-04T01:00:00.000Z',
        },
      });

      expect(pbMock.pb.filter).toHaveBeenCalledWith('project.user = {:userId}', {
        userId: 'user-123',
      });
      expect(pbMock.pb.filter).toHaveBeenCalledWith('project = {:projectId}', {
        projectId: 'p2',
      });
      expect(pbMock.pb.filter).toHaveBeenCalledWith('date >= {:startDate} && date <= {:endDate}', {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      expect(pbMock.pb.filter).toHaveBeenCalledWith('image != {:image}', { image: '' });
      expect(pbMock.pb.filter).toHaveBeenCalledWith(
        '(date < {:cursorDate} || (date = {:cursorDate} && created < {:cursorCreated}) || (date = {:cursorDate} && created = {:cursorCreated} && id < {:cursorId}))',
        {
          cursorDate: '2024-07-04',
          cursorCreated: '2024-07-04T01:00:00.000Z',
          cursorId: 'cursor-note',
        }
      );
      expect(pbMock.collectionMethods.getList).toHaveBeenCalledWith(
        2,
        10,
        expect.objectContaining({
          sort: '-date,-created,-id',
          expand: 'project,project.company,project.artist',
          skipTotal: true,
        })
      );
      expect(result).toEqual({
        page: 2,
        perPage: 10,
        totalItems: 12,
        totalPages: 2,
        items: [
          expect.objectContaining({
            id: 'n2',
            imageUrl: 'https://files.test/n2/feed.png',
            project: {
              id: 'p2',
              title: 'Fireworks',
              company: 'Dreamer Designs',
              artist: 'Artist Two',
            },
          }),
        ],
        nextCursor: {
          id: 'n2',
          date: '2024-07-04 00:00:00.000Z',
          createdAt: '2024-07-04T01:00:00.000Z',
        },
      });
    });
  });

  describe('listLatestForProjects()', () => {
    it('transfers at most one summary row per requested project as history grows', async () => {
      let requestIndex = 0;
      pbMock.collectionMethods.getList.mockImplementation(
        async (_page: number, _perPage: number, _options: { filter: string }) => {
          requestIndex += 1;
          const projectId = requestIndex === 1 ? 'p1' : 'p2';
          return {
            page: 1,
            perPage: 1,
            totalItems: projectId === 'p1' ? 1_000 : 2_000,
            totalPages: projectId === 'p1' ? 1_000 : 2_000,
            items: [
              {
                id: `latest-${projectId}`,
                project: projectId,
                content: '',
                date: '2026-05-05',
                image: '',
                created: '2026-05-05T12:00:00.000Z',
                updated: '',
              },
            ],
          };
        }
      );

      const notesByProject = await ProgressNotesService.listLatestForProjects({
        userId: 'user-123',
        projectIds: ['p1', 'p2'],
      });

      expect(pbMock.collectionMethods.getList).toHaveBeenCalledTimes(2);
      expect(pbMock.collectionMethods.getList).toHaveBeenNthCalledWith(
        1,
        1,
        1,
        expect.objectContaining({
          filter: 'project.user = {:userId} && project = {:projectId}',
          fields: 'id,project,date,created',
          requestKey: null,
          sort: '-date,-created,-id',
        })
      );
      expect(notesByProject).toEqual({
        p1: expect.objectContaining({ id: 'latest-p1' }),
        p2: expect.objectContaining({ id: 'latest-p2' }),
      });
      expect(pbMock.collectionMethods.getFullList).not.toHaveBeenCalled();
    });

    it('propagates a latest-note request failure', async () => {
      pbMock.collectionMethods.getList.mockRejectedValueOnce(new Error('request failed'));

      await expect(
        ProgressNotesService.listLatestForProjects({ userId: 'user-123', projectIds: ['p1'] })
      ).rejects.toThrow();
    });

    it('bounds concurrent latest-note requests', async () => {
      let activeRequests = 0;
      let peakRequests = 0;
      pbMock.collectionMethods.getList.mockImplementation(async () => {
        activeRequests += 1;
        peakRequests = Math.max(peakRequests, activeRequests);
        await Promise.resolve();
        activeRequests -= 1;
        return { page: 1, perPage: 1, totalItems: 0, totalPages: 0, items: [] };
      });

      await ProgressNotesService.listLatestForProjects({
        userId: 'user-123',
        projectIds: Array.from({ length: 12 }, (_, index) => `p${index}`),
      });

      expect(peakRequests).toBe(6);
    });

    it('does not query latest notes when no project ids are provided', async () => {
      await expect(
        ProgressNotesService.listLatestForProjects({ userId: 'user-123', projectIds: [] })
      ).resolves.toEqual({});

      expect(pbMock.collectionMethods.getList).not.toHaveBeenCalled();
    });
  });

  describe('create()', () => {
    it('creates a note with image file', async () => {
      const mockFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      pbMock.collectionMethods.create.mockResolvedValue({
        id: 'new-1',
        project: 'p1',
        content: 'Test',
        date: '2024-01-01',
        image: 'photo.jpg',
      });

      const result = await ProgressNotesService.create({
        project: 'p1',
        content: 'Test',
        date: '2024-01-01',
        imageFile: mockFile,
      });

      expect(pbMock.collectionMethods.create).toHaveBeenCalledWith(
        expect.objectContaining({
          project: 'p1',
          content: 'Test',
          image: mockFile,
        })
      );
      expect(result.id).toBe('new-1');
    });

    it('creates a note without image', async () => {
      pbMock.collectionMethods.create.mockResolvedValue({
        id: 'new-2',
        project: 'p1',
        content: 'No image',
        date: '2024-01-01',
        image: '',
      });

      await ProgressNotesService.create({
        project: 'p1',
        content: 'No image',
        date: '2024-01-01',
      });

      const callArg = pbMock.collectionMethods.create.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('image');
    });
  });

  describe('deleteAllForProject()', () => {
    it('deletes all notes for a project using bounded concurrency', async () => {
      const notes = Array.from({ length: 20 }, (_, i) => ({ id: `n-${i}` }));
      pbMock.collectionMethods.getFullList.mockResolvedValue(notes);

      await ProgressNotesService.deleteAllForProject('p1');

      expect(pbMock.collectionMethods.delete).toHaveBeenCalledTimes(20);
    });

    it('continues deleting remaining project notes when one note delete fails', async () => {
      pbMock.collectionMethods.getFullList.mockResolvedValue([
        { id: 'n-1' },
        { id: 'n-2' },
        { id: 'n-3' },
      ]);
      pbMock.collectionMethods.delete
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce(true);

      // Should not throw
      await ProgressNotesService.deleteAllForProject('p1');
      expect(pbMock.collectionMethods.delete).toHaveBeenCalledTimes(3);
    });
  });
  describe('removeImage()', () => {
    it('sets image to null', async () => {
      pbMock.collectionMethods.update.mockResolvedValue({
        id: 'n1',
        project: 'p1',
        content: 'test',
        date: '2024-01-01',
        image: '',
      });

      await ProgressNotesService.removeImage('n1');

      expect(pbMock.collectionMethods.update).toHaveBeenCalledWith('n1', { image: null });
    });
  });
});

describe('batched diamond summary mapping', () => {
  it('uses hook summaries without per-target requests', async () => {
    pbMock.reset();
    vi.mocked(fetchLatestNotes).mockResolvedValueOnce([
      {
        id: 'note1',
        targetId: 'target1',
        date: '2026-09-06',
        created: '2026-09-06T12:00:00Z',
      },
    ]);
    const result = await ProgressNotesService.listLatestForProjects({
      userId: 'user1',
      projectIds: ['target1'],
    });
    expect(result.target1).toEqual({
      id: 'note1',
      projectId: 'target1',
      date: '2026-09-06',
      createdAt: '2026-09-06T12:00:00Z',
    });
    expect(pbMock.collectionMethods.getList).not.toHaveBeenCalled();
  });
});
