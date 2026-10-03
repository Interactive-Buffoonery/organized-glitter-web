import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

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

  it('restores a selected image through the upload hook and releases its preview', () => {
    const file = new File(['image'], 'restored.jpg', { type: 'image/jpeg' });
    const { unmount } = render(
      <ProjectFormSections
        formData={{
          title: 'Project',
          status: 'wishlist',
          company: '',
          artist: '',
          imageFile: file,
          imageRemoved: false,
          tags: [],
        }}
        companies={[]}
        artists={[]}
        isSubmitting={false}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('img', { name: 'Project preview' })).toHaveAttribute(
      'src',
      'blob:project-preview'
    );
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:project-preview');
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

  it('opens cropping after the upload hook publishes its preview', async () => {
    const compression = deferred<File>();
    compressImageMock.mockReturnValue(compression.promise);
    const formData: ProjectFormValues = {
      title: 'Project',
      status: 'wishlist',
      company: '',
      artist: '',
      imageFile: null,
      imageRemoved: false,
      tags: [],
    };

    function Harness() {
      const [currentFormData, setCurrentFormData] = useState(formData);
      return (
        <ProjectFormSections
          formData={currentFormData}
          companies={[]}
          artists={[]}
          isSubmitting={false}
          onChange={setCurrentFormData}
        />
      );
    }

    render(<Harness />);
    const largeBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    const selected = new File([largeBytes], 'selected.jpg', { type: 'image/jpeg' });
    const compressed = new File(['compressed'], 'selected.jpg', { type: 'image/jpeg' });

    fireEvent.change(screen.getByLabelText('Project image'), {
      target: { files: [selected] },
    });
    expect(compressImageMock).toHaveBeenCalledWith(selected);

    await act(async () => {
      compression.resolve(compressed);
      await compression.promise;
    });

    expect(screen.getByRole('dialog')).toHaveTextContent('selected.jpg');
  });
});
