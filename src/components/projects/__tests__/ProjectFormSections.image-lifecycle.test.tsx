import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectFormValues } from '@/types/project';

import ProjectFormSections from '../ProjectFormSections';

const { compressImageMock } = vi.hoisted(() => ({ compressImageMock: vi.fn() }));

vi.mock('@/hooks/useProjectImageCompression', () => ({
  useProjectImageCompression: () => ({
    compressImage: compressImageMock,
    isCompressing: true,
    compressionProgress: null,
  }),
}));
vi.mock('@/components/tags/InlineTagManager', () => ({ InlineTagManager: () => null }));
vi.mock('@/lib/notifications', () => ({ notify: vi.fn(), notifyError: vi.fn() }));
vi.mock('@/components/projects/form-sections/ProjectTitleSection', () => ({
  ProjectTitleSection: () => null,
}));
vi.mock('@/components/projects/form-sections/ProjectSpecsSection', () => ({
  ProjectSpecsSection: () => null,
}));
vi.mock('@/components/projects/form-sections/ProjectDatesSection', () => ({
  ProjectDatesSection: () => null,
}));
vi.mock('@/components/projects/form-sections/ProjectSourceNotesSection', () => ({
  ProjectSourceNotesSection: () => null,
}));
vi.mock('@/components/projects/form-sections/ProjectStatusSection', () => ({
  ProjectStatusSection: () => null,
}));
vi.mock('@/components/projects/form-sections/ProjectKitInfoSection', () => ({
  ProjectKitInfoSection: () => null,
}));
vi.mock('@/components/projects/form-sections/ProjectCoverImageSection', () => ({
  ProjectCoverImageSection: ({
    imageUrl,
    cropFile,
    isCropDialogOpen,
    onImageChange,
    onImageRemove,
  }: {
    imageUrl: string;
    cropFile: File | null;
    isCropDialogOpen: boolean;
    onImageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onImageRemove: () => void;
  }) => (
    <>
      <img alt="Project preview" src={imageUrl || undefined} />
      <input aria-label="Project image" type="file" onChange={onImageChange} />
      <button type="button" onClick={onImageRemove}>
        Remove image
      </button>
      {isCropDialogOpen ? <div role="dialog">{cropFile?.name}</div> : null}
    </>
  ),
}));

describe('ProjectFormSections image lifecycle', () => {
  beforeEach(() => {
    compressImageMock.mockReset();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:project-preview'),
        revokeObjectURL: vi.fn(),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a restored image removed after the user clears it', () => {
    const file = new File(['image'], 'restored.jpg', { type: 'image/jpeg' });

    function Harness() {
      const [formData, setFormData] = useState<ProjectFormValues>({
        title: 'Project',
        status: 'wishlist',
        company: '',
        artist: '',
        imageFile: file,
        imageRemoved: false,
        tags: [],
      });
      return (
        <ProjectFormSections
          formData={formData}
          companies={[]}
          artists={[]}
          isSubmitting={false}
          onChange={setFormData}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(screen.getByRole('img', { name: 'Project preview' })).not.toHaveAttribute('src');
  });
});
