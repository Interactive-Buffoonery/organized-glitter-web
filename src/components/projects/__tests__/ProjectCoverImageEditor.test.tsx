import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectCoverImageEditor from '../ProjectCoverImageEditor';
import type { ProjectType } from '@/types/project';

const { mutateAsyncMock, isPendingRef, compressImageMock, notifySuccessMock, notifyErrorMock } =
  vi.hoisted(() => ({
    mutateAsyncMock: vi.fn(),
    isPendingRef: { value: false },
    compressImageMock: vi.fn(),
    notifySuccessMock: vi.fn(),
    notifyErrorMock: vi.fn(),
  }));

vi.mock('@/hooks/mutations/useProjectUpdateUnified', () => ({
  useProjectUpdateUnified: () => ({
    mutateAsync: mutateAsyncMock,
    get isPending() {
      return isPendingRef.value;
    },
  }),
}));

vi.mock('@/hooks/useProjectImageCompression', () => ({
  useProjectImageCompression: () => ({
    compressImage: compressImageMock,
  }),
}));

vi.mock('@/lib/notifications/notify', () => ({
  notifySuccess: notifySuccessMock,
  notifyError: notifyErrorMock,
}));

vi.mock('@/components/image/ImageCropDialog', () => ({
  ImageCropDialog: ({
    open,
    file,
    onCropComplete,
    onUseOriginal,
    onOpenChange,
  }: {
    open: boolean;
    file: File | null;
    onCropComplete: (file: File) => void;
    onUseOriginal: (file: File) => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="Crop project image">
        <p>{file?.name}</p>
        <button
          type="button"
          onClick={() =>
            onCropComplete(new File(['cropped'], 'cover-cropped.jpg', { type: 'image/jpeg' }))
          }
        >
          Use crop
        </button>
        <button type="button" onClick={() => file && onUseOriginal(file)}>
          Skip crop
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => (
    <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>
  ),
}));

const baseProject: ProjectType = {
  id: 'proj_123',
  userId: 'user_1',
  title: 'Daydream',
  status: 'progress',
  company: 'Diamond Art Club',
  artist: 'Some Artist',
  drillShape: 'round',
  width: 30,
  height: 40,
  totalDiamonds: 12000,
  datePurchased: '2025-01-02',
  dateReceived: '2025-01-10',
  dateStarted: '2025-02-01',
  dateCompleted: undefined,
  generalNotes: 'Soft palette',
  imageUrl: 'https://example.com/cover.jpg',
  sourceUrl: 'https://example.com/kit',
  kitCategory: 'full',
};

const triggerFileSelection = () => {
  const triggerButton = screen.getByRole('button', { name: 'Replace cover image' });
  fireEvent.click(triggerButton);

  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['raw'], 'phone-photo.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('ProjectCoverImageEditor', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    compressImageMock.mockReset();
    notifySuccessMock.mockReset();
    notifyErrorMock.mockReset();
    isPendingRef.value = false;
    compressImageMock.mockImplementation(async (file: File) => file);
    mutateAsyncMock.mockResolvedValue({ id: baseProject.id });
  });

  it('opens the crop dialog when a file is chosen', async () => {
    render(<ProjectCoverImageEditor project={baseProject} />);
    triggerFileSelection();
    expect(await screen.findByRole('dialog', { name: 'Crop project image' })).toBeInTheDocument();
    expect(screen.getByText('phone-photo.jpg')).toBeInTheDocument();
  });

  it('submits a pass-through update with the cropped image and fires the success toast', async () => {
    render(<ProjectCoverImageEditor project={baseProject} />);
    triggerFileSelection();
    fireEvent.click(await screen.findByRole('button', { name: 'Use crop' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalled());
    const payload = mutateAsyncMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      projectId: baseProject.id,
      title: baseProject.title,
      status: baseProject.status,
      drillShape: baseProject.drillShape,
      kitCategory: baseProject.kitCategory,
      width: baseProject.width,
      height: baseProject.height,
      totalDiamonds: baseProject.totalDiamonds,
      datePurchased: baseProject.datePurchased,
      dateReceived: baseProject.dateReceived,
      dateStarted: baseProject.dateStarted,
      generalNotes: baseProject.generalNotes,
      sourceUrl: baseProject.sourceUrl,
      imageRemoved: false,
    });
    expect(payload.imageFile).toBeInstanceOf(File);
    expect(payload).not.toHaveProperty('companyName');
    expect(payload).not.toHaveProperty('artistName');
    expect((payload.imageFile as File).name).toBe('cover-cropped.jpg');
    expect(compressImageMock).toHaveBeenCalled();
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalledWith('Cover image updated'));
  });

  it('fires the error toast when the mutation rejects', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('network down'));
    render(<ProjectCoverImageEditor project={baseProject} />);
    triggerFileSelection();
    fireEvent.click(await screen.findByRole('button', { name: 'Use crop' }));

    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith('Failed to update cover image', 'network down')
    );
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  it('blocks another cover selection while the current image is processing', async () => {
    const compression = deferred<File>();
    compressImageMock.mockReturnValue(compression.promise);
    render(<ProjectCoverImageEditor project={baseProject} />);
    triggerFileSelection();
    fireEvent.click(await screen.findByRole('button', { name: 'Use crop' }));

    const replaceButton = screen.getByRole('button', { name: 'Replace cover image' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(replaceButton).toBeDisabled();
    expect(input).toBeDisabled();

    fireEvent.change(input, {
      target: { files: [new File(['new'], 'newer.jpg', { type: 'image/jpeg' })] },
    });
    expect(compressImageMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      compression.resolve(new File(['done'], 'cover-cropped.jpg', { type: 'image/jpeg' }));
      await compression.promise;
    });
  });

  it('shows a visible add-cover action when the project has no cover yet', () => {
    render(<ProjectCoverImageEditor project={{ ...baseProject, imageUrl: undefined }} />);
    const addCoverButton = screen.getByRole('button', { name: /add cover/i });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const openFilePicker = vi.spyOn(input, 'click').mockImplementation(() => {});

    expect(addCoverButton).toHaveTextContent(/\S/);
    fireEvent.click(addCoverButton);
    expect(openFilePicker).toHaveBeenCalledOnce();
  });

  it('rejects unsupported file types with an error toast', () => {
    render(<ProjectCoverImageEditor project={baseProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace cover image' }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bogus = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [bogus] } });

    expect(notifyErrorMock).toHaveBeenCalledWith(
      'Unsupported image format',
      'Use JPG, PNG, GIF, WebP, or HEIC for the project cover.'
    );
    expect(screen.queryByRole('dialog', { name: 'Crop project image' })).not.toBeInTheDocument();
  });
});
