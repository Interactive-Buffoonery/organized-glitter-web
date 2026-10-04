import { act } from '@testing-library/react';
import { Suspense, startTransition, useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCropDialog } from '../ImageCropDialog';
import { PROJECT_IMAGE_CROP_PRESETS } from '@/utils/image/imagePolicy';

const { createContainedImageFileMock, createCroppedImageFileMock } = vi.hoisted(() => ({
  createContainedImageFileMock: vi.fn(),
  createCroppedImageFileMock: vi.fn(),
}));

vi.mock('react-easy-crop', () => {
  function MockCropper({
    onCropComplete,
  }: {
    onCropComplete: (_area: unknown, pixels: unknown) => void;
  }) {
    const calledRef = useRef(false);
    useEffect(() => {
      if (calledRef.current) return;
      calledRef.current = true;
      onCropComplete({}, { x: 0, y: 0, width: 400, height: 300 });
    }, [onCropComplete]);
    return <div data-testid="cropper" />;
  }

  return { default: MockCropper };
});

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div role="dialog" className={className}>
      {children}
    </div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/utils/image/imageUtils', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/image/imageUtils')>();
  return {
    ...actual,
    createFilePreviewUrl: () => 'blob:preview',
    revokePreviewUrl: vi.fn(),
    createContainedImageFile: createContainedImageFileMock,
    createCroppedImageFile: createCroppedImageFileMock,
  };
});

describe('ImageCropDialog', () => {
  beforeEach(() => {
    createContainedImageFileMock.mockReset();
    createCroppedImageFileMock.mockReset();
    createContainedImageFileMock.mockResolvedValue(
      new File(['contained'], 'project-cropped.jpg', { type: 'image/jpeg' })
    );
    createCroppedImageFileMock.mockResolvedValue(
      new File(['cropped'], 'project-cropped.jpg', { type: 'image/jpeg' })
    );
  });

  it('lets users switch crop presets before confirming', async () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    const onCropComplete = vi.fn();

    render(
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={PROJECT_IMAGE_CROP_PRESETS}
        defaultPresetId="rectangle-4-3"
        onOpenChange={vi.fn()}
        onCropComplete={onCropComplete}
        onUseOriginal={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /fit whole image/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rectangle crop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /portrait crop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /square crop/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /square/i }));
    fireEvent.click(screen.getByRole('button', { name: /use crop/i }));

    await waitFor(() => expect(onCropComplete).toHaveBeenCalled());
    expect(createCroppedImageFileMock).toHaveBeenCalledWith(
      'blob:preview',
      expect.objectContaining({ width: 400, height: 300 }),
      expect.objectContaining({ width: 1200, height: 1200, type: 'image/jpeg' })
    );
  });

  it('emits a portrait-sized file when the portrait preset is selected', async () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    const onCropComplete = vi.fn();

    render(
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={PROJECT_IMAGE_CROP_PRESETS}
        defaultPresetId="rectangle-4-3"
        onOpenChange={vi.fn()}
        onCropComplete={onCropComplete}
        onUseOriginal={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /portrait/i }));
    fireEvent.click(screen.getByRole('button', { name: /use crop/i }));

    await waitFor(() => expect(onCropComplete).toHaveBeenCalled());
    expect(createCroppedImageFileMock).toHaveBeenCalledWith(
      'blob:preview',
      expect.objectContaining({ width: 400, height: 300 }),
      expect.objectContaining({ width: 900, height: 1200, type: 'image/jpeg' })
    );
  });

  it('creates a fitted image without requiring crop pixels', async () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    const onCropComplete = vi.fn();

    render(
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={PROJECT_IMAGE_CROP_PRESETS}
        defaultPresetId="fit-4-3"
        onOpenChange={vi.fn()}
        onCropComplete={onCropComplete}
        onUseOriginal={vi.fn()}
      />
    );

    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use fitted image/i }));

    await waitFor(() => expect(onCropComplete).toHaveBeenCalled());
    expect(createContainedImageFileMock).toHaveBeenCalledWith(
      'blob:preview',
      expect.objectContaining({ width: 1200, height: 900, type: 'image/jpeg' })
    );
    expect(createCroppedImageFileMock).not.toHaveBeenCalled();
  });

  it('labels the bypass action as skipping the crop', () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    const onUseOriginal = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        onOpenChange={onOpenChange}
        onCropComplete={vi.fn()}
        onUseOriginal={onUseOriginal}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /skip crop/i }));

    expect(onUseOriginal).toHaveBeenCalledWith(file);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets crop state when the file changes and revokes the preview URL', async () => {
    const { revokePreviewUrl } = await import('@/utils/image/imageUtils');
    vi.mocked(revokePreviewUrl).mockClear();
    const fileA = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const fileB = new File(['b'], 'b.jpg', { type: 'image/jpeg' });

    const renderDialog = (file: File) => (
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        onOpenChange={vi.fn()}
        onCropComplete={vi.fn()}
        onUseOriginal={vi.fn()}
      />
    );

    const { rerender, unmount } = render(renderDialog(fileA));

    const zoomSlider = screen.getByLabelText<HTMLInputElement>(/zoom/i);
    fireEvent.change(zoomSlider, { target: { value: '2' } });
    expect(screen.getByText('2.0x')).toBeInTheDocument();

    rerender(renderDialog(fileB));

    expect(screen.getByText('1.0x')).toBeInTheDocument();
    expect(vi.mocked(revokePreviewUrl)).toHaveBeenCalledWith('blob:preview');

    unmount();
    expect(vi.mocked(revokePreviewUrl)).toHaveBeenCalledTimes(2);
  });

  it('keeps crop state when the file prop is recreated with the same file signature', async () => {
    const { revokePreviewUrl } = await import('@/utils/image/imageUtils');
    vi.mocked(revokePreviewUrl).mockClear();
    const fileA = new File(['same'], 'project.jpg', {
      type: 'image/jpeg',
      lastModified: 1234,
    });
    const fileB = new File(['same'], 'project.jpg', {
      type: 'image/jpeg',
      lastModified: 1234,
    });

    const renderDialog = (file: File) => (
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        onOpenChange={vi.fn()}
        onCropComplete={vi.fn()}
        onUseOriginal={vi.fn()}
      />
    );

    const { rerender } = render(renderDialog(fileA));

    const zoomSlider = screen.getByLabelText<HTMLInputElement>(/zoom/i);
    fireEvent.change(zoomSlider, { target: { value: '2' } });
    expect(screen.getByText('2.0x')).toBeInTheDocument();

    rerender(renderDialog(fileB));

    expect(screen.getByText('2.0x')).toBeInTheDocument();
    expect(vi.mocked(revokePreviewUrl)).toHaveBeenCalledWith('blob:preview');
  });

  it('resets crop state when the default preset changes', async () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    const onCropComplete = vi.fn();

    const renderDialog = (defaultPresetId: string) => (
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={PROJECT_IMAGE_CROP_PRESETS}
        defaultPresetId={defaultPresetId}
        onOpenChange={vi.fn()}
        onCropComplete={onCropComplete}
        onUseOriginal={vi.fn()}
      />
    );

    const { rerender } = render(renderDialog('rectangle-4-3'));

    const zoomSlider = screen.getByLabelText<HTMLInputElement>(/zoom/i);
    fireEvent.change(zoomSlider, { target: { value: '2' } });
    expect(screen.getByText('2.0x')).toBeInTheDocument();

    rerender(renderDialog('square-1-1'));

    expect(screen.getByText('1.0x')).toBeInTheDocument();
    expect(screen.getAllByText('Square crop')).toHaveLength(2);
    expect(
      screen.getByText((_, element) => element?.textContent === '1200 x 1200')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /use crop/i }));

    await waitFor(() =>
      expect(createCroppedImageFileMock).toHaveBeenCalledWith(
        'blob:preview',
        expect.objectContaining({ width: 400, height: 300 }),
        expect.objectContaining({ width: 1200, height: 1200, type: 'image/jpeg' })
      )
    );
  });

  it('resets crop state when the preset signature changes while open', () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    const initialPresets = [
      {
        id: 'default',
        label: 'Default rectangle',
        aspect: 4 / 3,
        outputWidth: 1200,
        outputHeight: 900,
      },
      {
        id: 'wide',
        label: 'Wide crop',
        aspect: 16 / 9,
        outputWidth: 1600,
        outputHeight: 900,
      },
    ];
    const updatedPresets = [
      {
        id: 'default',
        label: 'Updated square',
        aspect: 1,
        outputWidth: 800,
        outputHeight: 800,
      },
      {
        id: 'wide',
        label: 'Wide crop',
        aspect: 16 / 9,
        outputWidth: 1600,
        outputHeight: 900,
      },
    ];

    const renderDialog = (presets: typeof initialPresets) => (
      <ImageCropDialog
        open
        file={file}
        title="Crop project image"
        description="Crop it"
        aspect={4 / 3}
        outputWidth={1200}
        outputHeight={900}
        presets={presets}
        defaultPresetId="default"
        onOpenChange={vi.fn()}
        onCropComplete={vi.fn()}
        onUseOriginal={vi.fn()}
      />
    );

    const { rerender } = render(renderDialog(initialPresets));

    fireEvent.click(screen.getByRole('button', { name: /wide crop/i }));
    const zoomSlider = screen.getByLabelText<HTMLInputElement>(/zoom/i);
    fireEvent.change(zoomSlider, { target: { value: '2' } });
    expect(screen.getByText('2.0x')).toBeInTheDocument();
    expect(screen.getByText('1600 x 900')).toBeInTheDocument();

    rerender(renderDialog(updatedPresets));

    expect(screen.getByText('1.0x')).toBeInTheDocument();
    expect(screen.getAllByText('Updated square')).toHaveLength(2);
    expect(
      screen.getByText((_, element) => element?.textContent === '800 x 800')
    ).toBeInTheDocument();
  });

  it('ignores a crop that finishes after the dialog closes', async () => {
    const file = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    let finishCrop: ((file: File) => void) | undefined;
    createCroppedImageFileMock.mockImplementation(
      () =>
        new Promise<File>(resolve => {
          finishCrop = resolve;
        })
    );
    const onCropComplete = vi.fn();
    const props = {
      file,
      title: 'Crop project image',
      description: 'Crop it',
      aspect: 1,
      outputWidth: 200,
      outputHeight: 200,
      onOpenChange: vi.fn(),
      onCropComplete,
      onUseOriginal: vi.fn(),
    };
    const { rerender } = render(<ImageCropDialog open {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /use crop/i }));
    rerender(<ImageCropDialog open={false} {...props} />);
    finishCrop?.(new File(['done'], 'done.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(createCroppedImageFileMock).toHaveBeenCalledOnce());
    expect(onCropComplete).not.toHaveBeenCalled();
  });

  it('preserves the selected crop shape after abandoning a suspended preset reset', async () => {
    const pending = new Promise<void>(() => {});
    const file = new File(['image'], 'crop.jpg', { type: 'image/jpeg' });
    let update!: (value: { preset: string; suspended: boolean }) => void;
    let attempted = false;
    const Suspend = ({ active }: { active: boolean }) => {
      if (active) {
        attempted = true;
        throw pending;
      }
      return null;
    };
    const Harness = () => {
      const [state, setState] = useState({ preset: 'rectangle-4-3', suspended: false });
      update = setState;
      return (
        <>
          <ImageCropDialog
            open
            file={file}
            title="Crop"
            description="Crop image"
            aspect={4 / 3}
            outputWidth={1200}
            outputHeight={900}
            presets={PROJECT_IMAGE_CROP_PRESETS}
            defaultPresetId={state.preset}
            onOpenChange={vi.fn()}
            onCropComplete={vi.fn()}
            onUseOriginal={vi.fn()}
          />
          <Suspend active={state.suspended} />
        </>
      );
    };
    render(
      <Suspense fallback="Loading">
        <Harness />
      </Suspense>
    );
    fireEvent.click(screen.getByRole('button', { name: /portrait crop/i }));
    await act(async () => {
      startTransition(() => update({ preset: 'square-1-1', suspended: true }));
    });
    expect(attempted).toBe(true);
    act(() => update({ preset: 'rectangle-4-3', suspended: false }));
    expect(screen.getByText('900 x 1200')).toBeInTheDocument();
  });
});
