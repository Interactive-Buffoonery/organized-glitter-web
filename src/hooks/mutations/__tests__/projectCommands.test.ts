import { describe, expect, it } from 'vitest';

import { toUpdateProjectInput } from '../projectCommands';
import type { ProjectFormValues } from '@/types/project';

const baseForm: ProjectFormValues = {
  userId: 'user-123',
  title: 'Aurora Wolves',
  status: 'progress',
};

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
});
