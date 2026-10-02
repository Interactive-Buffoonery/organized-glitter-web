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

const changeEventFor = (file: File): React.ChangeEvent<HTMLInputElement> =>
  ({
    target: {
      files: [file],
    },
  }) as unknown as React.ChangeEvent<HTMLInputElement>;

describe('useProgressNoteForm image cropping state', () => {
  beforeEach(() => {
    compressImageMock.mockReset();
    submitMock.mockReset().mockResolvedValue(true);
    successMock.mockReset();
  });

  it('opens a square crop step after compressing a selected progress photo', async () => {
    const originalFile = new File(['original'], 'progress.jpg', { type: 'image/jpeg' });
    const compressedFile = new File(['compressed'], 'progress-compressed.jpg', {
      type: 'image/jpeg',
    });
    compressImageMock.mockResolvedValue(compressedFile);

    const { result } = renderHook(() =>
      useProgressNoteForm({ onSubmit: submitMock, onSuccess: successMock })
    );

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(originalFile));
    });

    expect(compressImageMock).toHaveBeenCalledWith(originalFile);
    expect(result.current.imageFile).toBe(compressedFile);
    expect(result.current.cropFile).toBe(compressedFile);
    expect(result.current.isCropDialogOpen).toBe(true);
    expect(result.current.errors.image).toBeUndefined();
  });

  it('submits the cropped file after crop completion', async () => {
    const compressedFile = new File(['compressed'], 'progress-compressed.jpg', {
      type: 'image/jpeg',
    });
    const croppedFile = new File(['cropped'], 'progress-cropped.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(compressedFile);

    const { result } = renderHook(() => useProgressNoteForm({ onSubmit: submitMock }));

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(compressedFile));
    });

    act(() => {
      result.current.handleCropComplete(croppedFile);
    });

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent);
    });

    expect(result.current.imageFile).toBeNull();
    expect(submitMock).toHaveBeenCalledWith({
      date: '2026-04-24',
      content: '',
      imageFile: croppedFile,
    });
  });

  it('keeps the compressed original when Use original is selected', async () => {
    const compressedFile = new File(['compressed'], 'progress-compressed.jpg', {
      type: 'image/jpeg',
    });
    compressImageMock.mockResolvedValue(compressedFile);

    const { result } = renderHook(() => useProgressNoteForm({ onSubmit: submitMock }));

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(compressedFile));
    });

    act(() => {
      result.current.handleUseOriginalImage(compressedFile);
      result.current.setIsCropDialogOpen(false);
    });

    expect(result.current.imageFile).toBe(compressedFile);
    expect(result.current.cropFile).toBe(compressedFile);
    expect(result.current.isCropDialogOpen).toBe(false);
  });

  it('clears the crop dialog state when the selected image is cleared', async () => {
    const compressedFile = new File(['compressed'], 'progress-compressed.jpg', {
      type: 'image/jpeg',
    });
    compressImageMock.mockResolvedValue(compressedFile);

    const { result } = renderHook(() => useProgressNoteForm({ onSubmit: submitMock }));

    await act(async () => {
      await result.current.handleImageChange(changeEventFor(compressedFile));
    });

    act(() => {
      result.current.handleClearImage();
    });

    expect(result.current.imageFile).toBeNull();
    expect(result.current.cropFile).toBeNull();
    expect(result.current.isCropDialogOpen).toBe(false);
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
