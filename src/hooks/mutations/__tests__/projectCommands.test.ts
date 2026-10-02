import { describe, expect, it } from 'vitest';

import { toCreateProjectInput, toUpdateProjectInput } from '../projectCommands';
import type { ProjectFormValues } from '@/types/project';

const baseForm: ProjectFormValues = {
  userId: 'user-123',
  title: 'Aurora Wolves',
  status: 'progress',
};

describe('toUpdateProjectInput drillShape mapping', () => {
  it('preserves an explicit null so the adapter can clear the PocketBase select', () => {
    const input = toUpdateProjectInput('project-1', { ...baseForm, drillShape: null });

    expect(input.drillShape).toBeNull();
  });

  it('normalizes an unset drillShape to undefined so partial updates leave the field untouched', () => {
    const input = toUpdateProjectInput('project-1', { ...baseForm, drillShape: undefined });

    expect(input.drillShape).toBeUndefined();
  });

  it('preserves a set drillShape value (trimmed)', () => {
    const input = toUpdateProjectInput('project-1', { ...baseForm, drillShape: '  round  ' });

    expect(input.drillShape).toBe('round');
  });

  it('maps an empty string to null so full-form edits clear the select', () => {
    const input = toUpdateProjectInput('project-1', { ...baseForm, drillShape: '' });

    expect(input.drillShape).toBeNull();
  });
});

describe('project command field intent', () => {
  it('maps cleared full-form fields to explicit null update instructions', () => {
    const input = toUpdateProjectInput('project-1', {
      ...baseForm,
      company: '',
      artist: '',
      datePurchased: '',
      dateReceived: '',
      dateStarted: '',
      dateCompleted: '',
      width: '',
      height: '',
      totalDiamonds: null,
      colorCount: null,
      generalNotes: '',
      sourceUrl: '',
    });

    expect(input).toMatchObject({
      companyName: null,
      artistName: null,
      datePurchased: null,
      dateReceived: null,
      dateStarted: null,
      dateCompleted: null,
      width: null,
      height: null,
      totalDiamonds: null,
      colorCount: null,
      generalNotes: null,
      sourceUrl: null,
    });
  });

  it('keeps absent update fields undefined so partial edits leave them unchanged', () => {
    const input = toUpdateProjectInput('project-1', baseForm);

    expect(input.companyName).toBeUndefined();
    expect(input.datePurchased).toBeUndefined();
    expect(input.width).toBeUndefined();
    expect(input.generalNotes).toBeUndefined();
  });

  it('continues to omit empty optional fields when creating a project', () => {
    const input = toCreateProjectInput(
      {
        ...baseForm,
        company: '',
        datePurchased: '',
        width: '',
        generalNotes: '',
      },
      'user-123'
    );

    expect(input.companyName).toBeUndefined();
    expect(input.datePurchased).toBeUndefined();
    expect(input.width).toBeUndefined();
    expect(input.generalNotes).toBeUndefined();
  });
});
