import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProgressNoteForm from '../ProgressNoteForm';

const { compressImageMock, createCroppedImageFileMock } = vi.hoisted(() => ({
  compressImageMock: vi.fn(),
  createCroppedImageFileMock: vi.fn(),
}));

vi.mock('@/hooks/useUserTimezone', () => ({
  useUserTimezone: () => 'America/New_York',
}));

vi.mock('@/utils/date/timezoneUtils', () => ({
  getCurrentDateInUserTimezone: () => '2026-04-24',
  parseDateOnlyAsLocalDate: () => new Date(2026, 3, 24),
}));

vi.mock('@/hooks/useProgressImageCompression', () => ({
  useProgressImageCompression: () => ({
    compressImage: compressImageMock,
    isCompressing: false,
    compressionProgress: null,
    resetCompressionState: vi.fn(),
  }),
}));

vi.mock('@/components/notes/RichTextEditor.lazy', () => ({
  default: () => <textarea aria-label="Progress note content" />,
}));

vi.mock('react-easy-crop', () => {
  function MockCropper({
    onCropComplete,
  }: {
    onCropComplete: (area: unknown, pixels: unknown) => void;
  }) {
    const didComplete = useRef(false);
    useEffect(() => {
      if (didComplete.current) return;
      didComplete.current = true;
      onCropComplete({}, { x: 0, y: 0, width: 400, height: 300 });
    }, [onCropComplete]);
    return <div data-testid="cropper" />;
  }

  return { default: MockCropper };
});

vi.mock('@/utils/image/imageUtils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/image/imageUtils')>()),
  createFilePreviewUrl: () => 'blob:crop-preview',
  revokePreviewUrl: vi.fn(),
  createCroppedImageFile: createCroppedImageFileMock,
}));

describe('ProgressNoteForm photo announcement', () => {
  beforeEach(() => {
    compressImageMock.mockReset();
    createCroppedImageFileMock.mockReset();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:photo-preview'),
      revokeObjectURL: vi.fn(),
    });
  });

  it.each([
    { action: 'Skip crop', selectedName: 'progress.jpg' },
    { action: 'Use crop', selectedName: 'progress-cropped.jpg' },
    { action: 'Cancel', selectedName: 'progress.jpg' },
  ])('announces $action only after the crop dialog closes', async ({ action, selectedName }) => {
    const original = new File(['photo'], 'progress.jpg', { type: 'image/jpeg' });
    const cropped = new File(['crop'], 'progress-cropped.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(original);
    createCroppedImageFileMock.mockResolvedValue(cropped);

    const { container } = render(<ProgressNoteForm onSubmit={vi.fn()} />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeEmptyDOMElement();

    fireEvent.change(screen.getByLabelText('Photo (optional)'), { target: { files: [original] } });
    await screen.findByRole('dialog', { name: 'Crop progress photo' });
    expect(container).toHaveAttribute('aria-hidden', 'true');
    expect(status).toBeEmptyDOMElement();

    if (action === 'Use crop') {
      fireEvent.click(screen.getByRole('button', { name: /Rectangle crop/ }));
      await waitFor(() => expect(screen.getByRole('button', { name: action })).toBeEnabled());
    }
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Crop progress photo' })).not.toBeInTheDocument();
      expect(container).not.toHaveAttribute('aria-hidden');
      expect(status).toHaveTextContent(selectedName);
    });
  });

  it('announces the same filename after reopening the crop dialog', async () => {
    const original = new File(['photo'], 'progress.jpg', { type: 'image/jpeg' });
    compressImageMock.mockResolvedValue(original);

    const { container } = render(<ProgressNoteForm onSubmit={vi.fn()} />);
    const status = container.querySelector('[role="status"]');

    fireEvent.change(screen.getByLabelText('Photo (optional)'), { target: { files: [original] } });
    await screen.findByRole('dialog', { name: 'Crop progress photo' });
    fireEvent.click(screen.getByRole('button', { name: 'Skip crop' }));
    await waitFor(() => expect(status).toHaveTextContent(original.name));

    fireEvent.click(screen.getByRole('button', { name: 'Crop image' }));
    await screen.findByRole('dialog', { name: 'Crop progress photo' });
    expect(status).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole('button', { name: 'Skip crop' }));
    await waitFor(() => {
      expect(container).not.toHaveAttribute('aria-hidden');
      expect(status).toHaveTextContent(original.name);
    });
  });
});
