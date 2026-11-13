import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProjectFormState } from '../useProjectFormState';
import type { ProjectFormValues } from '@/types/project';

const initial = {
  title: 'Before',
  status: 'progress',
  tags: [],
  generalNotes: '',
} as ProjectFormValues;

describe('project form state', () => {
  it('composes queued updates and clears only errors for changed fields', () => {
    const { result } = renderHook(() => useProjectFormState(() => initial, true));
    act(() =>
      result.current.setFieldErrors({
        title: 'Required',
        generalNotes: 'Invalid',
        artist: 'Required',
      })
    );
    const change = result.current.changeFormData;
    const imageFile = new File(['image'], 'crop.jpg');
    act(() => {
      change(previous => ({ ...previous, title: 'After' }));
      change(previous => ({ ...previous, generalNotes: 'Edited notes' }));
      change(previous => ({ ...previous, imageFile }));
      change(previous => ({ ...previous, tags: [] }));
    });
    expect(result.current.formData).toEqual(
      expect.objectContaining({ title: 'After', generalNotes: 'Edited notes', imageFile, tags: [] })
    );
    expect(result.current.fieldErrors).toEqual({ artist: 'Required' });
    expect(result.current.missingPhoto).toBe(false);
  });
});
