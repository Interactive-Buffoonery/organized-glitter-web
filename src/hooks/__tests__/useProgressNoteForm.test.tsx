import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressNoteForm } from '../useProgressNoteForm';

const { compressImageMock, submitMock, successMock } = vi.hoisted(() => ({
  compressImageMock: vi.fn(),
  submitMock: vi.fn(),
  successMock: vi.fn(),
}));

vi.mock('../useProgressImageCompression', () => ({
  useProgressImageCompression: () => ({
    compressImage: compressImageMock,
    isCompressing: false,
    compressionProgress: null,
    resetCompressionState: vi.fn(),
  }),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));

vi.mock('@/utils/date/timezoneUtils', () => ({
  getCurrentDateInUserTimezone: () => '2026-04-24',
}));

describe('useProgressNoteForm image cropping state', () => {
  beforeEach(() => {
    compressImageMock.mockReset();
    submitMock.mockReset().mockResolvedValue(true);
    successMock.mockReset();
  });

  it('keeps the date, caption, and photo when the parent reports a failed save', async () => {
    const photo = new File(['photo'], 'progress.jpg', { type: 'image/jpeg' });
    submitMock.mockResolvedValue(false);
    const { result } = renderHook(() =>
      useProgressNoteForm({ onSubmit: submitMock, onSuccess: successMock })
    );

    act(() => {
      result.current.handleDateChange('2026-04-20');
      result.current.handleContentChange('Still in progress');
      result.current.handleUseOriginalImage(photo);
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });

    expect(result.current.date).toBe('2026-04-20');
    expect(result.current.content).toBe('Still in progress');
    expect(result.current.imageFile).toBe(photo);
    expect(result.current.errors.form).toBeTruthy();
    expect(result.current.isFormDisabled).toBe(false);
    expect(successMock).not.toHaveBeenCalled();
  });
});
