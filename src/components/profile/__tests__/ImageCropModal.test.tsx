import '@testing-library/jest-dom/vitest';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImageCropModal from '../ImageCropModal';

const { createCroppedImageFileMock, notifyMock } = vi.hoisted(() => ({
  createCroppedImageFileMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock('react-easy-crop', () => ({
  default: function MockCropper({
    onCropAreaChange,
  }: {
    onCropAreaChange: (_area: unknown, pixels: unknown) => void;
  }) {
    useEffect(() => {
      onCropAreaChange({}, { x: 10, y: 20, width: 100, height: 100 });
    }, [onCropAreaChange]);
    return null;
  },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock('@/lib/notifications', () => ({ notify: notifyMock }));
vi.mock('@/utils/image/imageUtils', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/image/imageUtils')>();
  return { ...actual, createCroppedImageFile: createCroppedImageFileMock };
});

describe('ImageCropModal', () => {
  const sourceFile = new File(['source'], 'portrait.png', { type: 'image/png' });
  const croppedFile = new File(['cropped'], 'cropped-portrait.jpg', { type: 'image/jpeg' });

  beforeEach(() => {
    createCroppedImageFileMock.mockReset();
    notifyMock.mockClear();
  });

  it('ignores a crop after changing photos and cancelling, revoking each owned preview once', async () => {
    let finish!: (file: File) => void;
    createCroppedImageFileMock.mockImplementation(
      () =>
        new Promise<File>(resolve => {
          finish = resolve;
        })
    );
    const createPreview = vi.spyOn(URL, 'createObjectURL');
    createPreview
      .mockReturnValueOnce('blob:replacement-a')
      .mockReturnValueOnce('blob:replacement-b');
    const revokePreview = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const onCropComplete = vi.fn();
    const onCancel = vi.fn();
    const { unmount } = render(
      <ImageCropModal
        file={sourceFile}
        imageUrl="blob:parent"
        onCropComplete={onCropComplete}
        onCancel={onCancel}
      />
    );

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Crop & Save' }));
      await waitFor(() => expect(createCroppedImageFileMock).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: /change photo/i }));
      fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
        target: { files: [new File(['a'.repeat(100)], 'a.png', { type: 'image/png' })] },
      });
      fireEvent.click(screen.getByRole('button', { name: /change photo/i }));
      fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
        target: { files: [new File(['b'.repeat(100)], 'b.png', { type: 'image/png' })] },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      unmount();

      await act(async () => {
        finish(new File(['old'], 'old.jpg', { type: 'image/jpeg' }));
      });
      expect(onCropComplete).not.toHaveBeenCalled();
      expect(revokePreview).toHaveBeenCalledTimes(2);
      expect(revokePreview).toHaveBeenCalledWith('blob:replacement-a');
      expect(revokePreview).toHaveBeenCalledWith('blob:replacement-b');
      expect(revokePreview).not.toHaveBeenCalledWith('blob:parent');
    } finally {
      createPreview.mockRestore();
      revokePreview.mockRestore();
    }
  });

  it('returns a 200px JPEG File for the selected square crop', async () => {
    createCroppedImageFileMock.mockResolvedValue(croppedFile);
    const onCropComplete = vi.fn();

    render(
      <ImageCropModal
        file={sourceFile}
        imageUrl="blob:portrait"
        onCropComplete={onCropComplete}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crop & Save' }));

    await waitFor(() => expect(onCropComplete).toHaveBeenCalledWith(croppedFile));
    expect(createCroppedImageFileMock).toHaveBeenCalledWith(
      'blob:portrait',
      { x: 10, y: 20, width: 100, height: 100 },
      {
        fileName: 'cropped-portrait.jpg',
        width: 200,
        height: 200,
        type: 'image/jpeg',
        quality: 0.9,
      }
    );
  });

  it('releases each owned replacement preview once and leaves the parent URL alone', () => {
    const createPreview = vi.spyOn(URL, 'createObjectURL');
    createPreview
      .mockReturnValueOnce('blob:replacement-a')
      .mockReturnValueOnce('blob:replacement-b');
    const revokePreview = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { unmount } = render(
      <ImageCropModal
        file={sourceFile}
        imageUrl="blob:parent"
        onCropComplete={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /change photo/i }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['a'.repeat(100)], 'a.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /change photo/i }));
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(['b'.repeat(100)], 'b.png', { type: 'image/png' })] },
    });
    unmount();

    expect(revokePreview).toHaveBeenCalledTimes(2);
    expect(revokePreview).toHaveBeenCalledWith('blob:replacement-a');
    expect(revokePreview).toHaveBeenCalledWith('blob:replacement-b');
    expect(revokePreview).not.toHaveBeenCalledWith('blob:parent');
    createPreview.mockRestore();
    revokePreview.mockRestore();
  });

  it('reports crop export failures without completing the crop', async () => {
    createCroppedImageFileMock.mockRejectedValue(
      new Error('Failed to convert cropped image to file')
    );
    const onCropComplete = vi.fn();

    render(
      <ImageCropModal
        file={sourceFile}
        imageUrl="blob:portrait"
        onCropComplete={onCropComplete}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Crop & Save' }));

    await waitFor(() => {
      expect(notifyMock).toHaveBeenCalledTimes(1);
      expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
      expect(screen.getByRole('button', { name: 'Crop & Save' })).toBeEnabled();
    });
    expect(onCropComplete).not.toHaveBeenCalled();
  });
});
