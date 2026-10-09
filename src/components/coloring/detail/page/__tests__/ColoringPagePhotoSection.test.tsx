import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '@/test-utils';
import type { ColoringPageDTO } from '@/services/pocketbase/coloring.service';
import { ColoringPagePhotoSection } from '../ColoringPagePhotoSection';

vi.mock('@/components/image/ImageCropDialog', async () => {
  const ReactModule = await import('react');
  return {
    ImageCropDialog: ({ open }: { open: boolean }) =>
      open
        ? ReactModule.createElement('dialog', {
            open: true,
            'aria-label': 'Frame coloring page photo',
          })
        : null,
  };
});

vi.mock('@/components/coloring/ColoringPageProgressNotes', async () => {
  const ReactModule = await import('react');
  return {
    ColoringPageProgressNotes: ({ pageId }: { pageId: string }) =>
      ReactModule.createElement(
        'section',
        { 'aria-label': 'Coloring page progress notes' },
        `Progress timeline for ${pageId}`
      ),
  };
});

const makePage = (overrides: Partial<ColoringPageDTO> = {}): ColoringPageDTO => ({
  id: 'page-1',
  bookId: 'book-1',
  pageNumber: 7,
  status: 'not_started',
  photos: ['main.jpg', 'detail.jpg'],
  mediumIds: [],
  revealedSubject: '',
  revealedAt: '',
  startedAt: '',
  completedAt: '',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

function renderPhotoSection(
  overrides: Partial<React.ComponentProps<typeof ColoringPagePhotoSection>> = {}
) {
  const page = overrides.page ?? makePage();
  const props: React.ComponentProps<typeof ColoringPagePhotoSection> = {
    page,
    pagePhotoUrls: ['/files/main.jpg', '/files/detail.jpg'],
    leadPhotoUrl: '/files/main.jpg',
    disabled: false,
    photoCropFile: null,
    isPhotoCropDialogOpen: false,
    onPhotoUpload: vi.fn(),
    onPhotoCropDialogOpenChange: vi.fn(),
    onPhotoCropComplete: vi.fn(),
    onPhotoUseOriginal: vi.fn(),
    onSetMainPhoto: vi.fn(),
    onPhotoDelete: vi.fn(),
    ...overrides,
  };

  return {
    ...renderWithProviders(<ColoringPagePhotoSection {...props} />),
    props,
  };
}

describe('ColoringPagePhotoSection', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
  });

  it('exposes accessible upload, set-main, and delete actions', async () => {
    const user = userEvent.setup();
    const { props } = renderPhotoSection();

    await user.upload(
      screen.getByLabelText(/add page photos/i),
      new File(['raw'], 'raw-page.png', { type: 'image/png' })
    );
    expect(props.onPhotoUpload).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /set photo 2 as main image/i }));
    expect(props.onSetMainPhoto).toHaveBeenCalledWith('detail.jpg');

    await user.click(screen.getByRole('button', { name: /delete photo 2/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(props.onPhotoDelete).toHaveBeenCalledWith('detail.jpg');
  });

  it('uses image alt text that avoids redundant photo wording', () => {
    renderPhotoSection();

    expect(screen.getByRole('img', { name: 'Page 7 lead artwork' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 7 attachment 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Page 7 attachment 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /manage photos/i })).toBeInTheDocument();

    const imageAlts = screen.getAllByRole('img').map(image => image.getAttribute('alt') ?? '');
    expect(imageAlts).not.toEqual(expect.arrayContaining([expect.stringMatching(/\bphoto\b/i)]));
  });

  it('preserves the whole lead artwork', () => {
    renderPhotoSection();

    const leadArtwork = screen.getByRole('img', { name: 'Page 7 lead artwork' });
    expect(leadArtwork).toHaveClass('object-contain');
    expect(leadArtwork).not.toHaveClass('object-cover');
    expect(screen.getByRole('img', { name: 'Page 7 attachment 1' })).toHaveClass('object-cover');
  });
});
