import { describe, expect, it } from 'vitest';
import type { ProjectFormValues } from '@/types/project';
import type { ColoringBookFormValues } from '@/schemas/coloring/coloringBook.schema';
import {
  coloringBookDraftValues,
  isColoringBookDraftValues,
  isProjectDraftValues,
  projectDraftValues,
  restoreProjectDraft,
} from './formDraftAdapters';

const project: ProjectFormValues = {
  userId: 'account-a',
  title: 'Unfinished painting',
  status: 'wishlist',
  imageUrl: 'https://private.example.test/photo?token=secret',
  imageFile: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
  tags: [
    {
      id: 'tag-1',
      userId: 'account-a',
      name: 'Spring',
      slug: 'spring',
      color: '#ffffff',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ],
};

describe('form draft adapters', () => {
  it('saves project text and tags without account IDs, files, or protected URLs', () => {
    const values = projectDraftValues(project);
    const serialized = JSON.stringify(values);
    expect(serialized).toContain('Unfinished painting');
    expect(serialized).not.toContain('account-a');
    expect(serialized).not.toContain('private.example.test');
    expect(serialized).not.toContain('photo.jpg');
    expect(values.hadNewPhoto).toBe(true);
    expect(isProjectDraftValues(JSON.parse(serialized))).toBe(true);
    expect(
      restoreProjectDraft({ ...project, imageFile: null }, values, 'account-a').tags?.[0]?.userId
    ).toBe('account-a');
  });

  it('rejects a project payload with extra private fields', () => {
    const values = projectDraftValues(project);
    expect(isProjectDraftValues({ ...values, fields: { ...values.fields, userId: 'other' } })).toBe(
      false
    );
  });

  it('keeps incomplete coloring input without saving a selected cover file', () => {
    const values = coloringBookDraftValues({
      title: '',
      totalPages: '',
      status: 'purchased',
      coverImage: new File(['x'], 'cover.jpg'),
      tags: [],
    } as ColoringBookFormValues);
    expect(isColoringBookDraftValues(values)).toBe(true);
    expect(values.hadNewPhoto).toBe(true);
    expect(JSON.stringify(values)).not.toContain('cover.jpg');
  });

  it('keeps the prior status when a completion date auto-completes a recoverable draft', () => {
    const projectDraft = projectDraftValues(
      { ...project, status: 'completed', dateCompleted: '2026-09-20' },
      false,
      undefined,
      'wishlist'
    );
    expect(isProjectDraftValues(projectDraft)).toBe(true);
    expect(projectDraft.statusBeforeDateChange).toBe('wishlist');
    expect(isProjectDraftValues({ ...projectDraft, statusBeforeDateChange: 'bogus' })).toBe(false);
    expect(isProjectDraftValues({ ...projectDraft, statusBeforeDateChange: 'completed' })).toBe(
      false
    );

    const bookDraft = coloringBookDraftValues(
      {
        title: 'Book',
        totalPages: 10,
        status: 'completed',
        dateCompleted: '2026-09-20',
        coverImage: null,
        tags: [],
      } as ColoringBookFormValues,
      false,
      'purchased'
    );
    expect(isColoringBookDraftValues(bookDraft)).toBe(true);
    expect(bookDraft.statusBeforeDateChange).toBe('purchased');
    expect(isColoringBookDraftValues({ ...bookDraft, statusBeforeDateChange: 'bogus' })).toBe(
      false
    );
    expect(isColoringBookDraftValues({ ...bookDraft, statusBeforeDateChange: 'archived' })).toBe(
      false
    );
  });
});
