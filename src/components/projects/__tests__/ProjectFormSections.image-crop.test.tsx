import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrivateFileTokenContext } from '@/contexts/privateFileTokenState';
import ProjectFormSections from '../ProjectFormSections';
import { buildUpdateProjectFormData } from '@/hooks/mutations/projectMutationAdapters';
import { toUpdateProjectInput } from '@/hooks/mutations/projectCommands';
import type { ProjectFormValues } from '@/types/project';

const {
  handleImageChangeMock,
  handleImageRemoveMock,
  applyProcessedImageMock,
  onChangeMock,
  imageUploadState,
  resolveCompanyAndArtistIdsMock,
} = vi.hoisted(() => ({
  handleImageChangeMock: vi.fn(),
  handleImageRemoveMock: vi.fn(),
  applyProcessedImageMock: vi.fn(),
  onChangeMock: vi.fn(),
  imageUploadState: {
    preview: null as string | null,
    file: null as File | null,
    processedFile: null as File | null,
    uploading: false,
    error: null as string | null,
  },
  resolveCompanyAndArtistIdsMock: vi.fn(),
}));

vi.mock('@/utils/project/field-mapping', () => ({
  resolveCompanyAndArtistIds: resolveCompanyAndArtistIdsMock,
}));

vi.mock('@/services/pocketbase/privateFiles.service', () => ({
  PrivateFilesService: {
    getBaseUrl: () => 'https://backend.example.test',
    getCurrentUserId: () => 'test-user',
  },
}));

vi.mock('@/hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    ...imageUploadState,
    handleImageChange: handleImageChangeMock,
    handleImageRemove: handleImageRemoveMock,
    applyProcessedImage: applyProcessedImageMock,
  }),
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
      <dialog open aria-label="Crop project image">
        <p>{file?.name}</p>
        <button
          type="button"
          onClick={() =>
            onCropComplete(new File(['cropped'], 'project-cropped.jpg', { type: 'image/jpeg' }))
          }
        >
          Use crop
        </button>
        <button type="button" onClick={() => file && onUseOriginal(file)}>
          Use original
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </dialog>
    ) : null,
}));

vi.mock('@/components/notes/RichTextEditor.lazy', () => ({
  default: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (value: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/tags/InlineTagManager', () => ({
  InlineTagManager: () => <div data-testid="inline-tag-manager" />,
}));

vi.mock('@/components/projects/form/EntitySelect', () => ({
  EntitySelect: ({ entityLabel, error }: { entityLabel: string; error?: string }) => (
    <div>
      <span>{entityLabel}</span>
      {error && <p>{error}</p>}
    </div>
  ),
}));

vi.mock('@/hooks/mutations/useCompanyMutations', () => ({
  useCreateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/mutations/useArtistMutations', () => ({
  useCreateArtist: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const baseFormData: ProjectFormValues = {
  title: '',
  status: 'wishlist',
  company: '',
  artist: '',
  imageFile: null,
  imageRemoved: false,
  tags: [],
};

const renderProjectForm = (
  formData: ProjectFormValues = baseFormData,
  fieldErrors: Partial<Record<keyof ProjectFormValues, string>> = {},
  savedDateCompleted?: string
) => {
  const ProjectFormHarness = () => {
    const [currentFormData, setCurrentFormData] = useState(formData);

    const handleChange = (nextFormData: ProjectFormValues) => {
      onChangeMock(nextFormData);
      setCurrentFormData(nextFormData);
    };

    return (
      <ProjectFormSections
        formData={currentFormData}
        companies={[]}
        artists={[]}
        isSubmitting={false}
        onChange={handleChange}
        fieldErrors={fieldErrors}
        savedDateCompleted={savedDateCompleted}
      />
    );
  };

  return render(<ProjectFormHarness />);
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('ProjectFormSections project image cropping', () => {
  beforeEach(() => {
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
    Element.prototype.scrollIntoView ??= vi.fn();
    handleImageChangeMock.mockReset();
    handleImageRemoveMock.mockReset();
    applyProcessedImageMock.mockReset();
    onChangeMock.mockReset();
    imageUploadState.preview = null;
    imageUploadState.file = null;
    imageUploadState.processedFile = null;
    imageUploadState.uploading = false;
    imageUploadState.error = null;
    resolveCompanyAndArtistIdsMock.mockReset().mockResolvedValue({
      companyId: null,
      artistId: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves the main landmark to the page layout', () => {
    renderProjectForm();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('loads a protected existing cover with the current file token before cropping', async () => {
    const url = 'https://backend.example.test/api/files/projects/example/cover.jpg';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['image'], { type: 'image/jpeg' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PrivateFileTokenContext.Provider
        value={{ userId: 'test-user', value: 'synthetic-file-token', issuedAt: 1 }}
      >
        <ProjectFormSections
          formData={{ ...baseFormData, imageUrl: url }}
          companies={[]}
          artists={[]}
          isSubmitting={false}
          onChange={onChangeMock}
        />
      </PrivateFileTokenContext.Provider>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Crop image' }));
    await screen.findByRole('dialog', { name: 'Crop project image' });
    expect(fetchMock).toHaveBeenCalledWith(`${url}?token=synthetic-file-token`);
    expect(onChangeMock).not.toHaveBeenCalled();
  });

  it('restores the saved prior status after a draft is recovered and its date is cleared', () => {
    render(
      <ProjectFormSections
        formData={{ ...baseFormData, status: 'completed', dateCompleted: '2026-09-20' }}
        companies={[]}
        artists={[]}
        isSubmitting={false}
        onChange={onChangeMock}
        savedDateCompleted=""
        statusBeforeDateChange="progress"
      />
    );

    fireEvent.change(screen.getByLabelText('Completed'), { target: { value: '' } });
    expect(onChangeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateCompleted: '', status: 'progress' })
    );
  });

  it('sends real full-form clear controls through the update mapper and adapter', async () => {
    let submittedFormData: FormData | undefined;

    const ProjectFormHarness = () => {
      const [currentFormData, setCurrentFormData] = useState<ProjectFormValues>({
        ...baseFormData,
        userId: 'user-123',
        title: 'Project',
        datePurchased: '2026-08-15',
        totalDiamonds: 12000,
        sourceUrl: 'https://example.com/project',
      });

      const handleSubmit = async () => {
        submittedFormData = await buildUpdateProjectFormData(
          toUpdateProjectInput('project-1', currentFormData),
          'user-123'
        );
      };

      return (
        <>
          <ProjectFormSections
            formData={currentFormData}
            companies={[]}
            artists={[]}
            isSubmitting={false}
            onChange={setCurrentFormData}
          />
          <button type="button" onClick={handleSubmit}>
            Save project
          </button>
        </>
      );
    };

    render(<ProjectFormHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear date purchased' }));
    fireEvent.change(screen.getByLabelText('Total diamonds'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Source URL'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));

    await waitFor(() => expect(submittedFormData).toBeDefined());
    expect(submittedFormData?.get('date_purchased')).toBe('');
    expect(submittedFormData?.get('total_diamonds')).toBe('');
    expect(submittedFormData?.get('source_url')).toBe('');
  });

  it('preserves edits made while the selected image is processing', async () => {
    const imageProcessing = deferred<File>();
    const selectedFile = new File(['original'], 'project.jpg', { type: 'image/jpeg' });
    handleImageChangeMock.mockReturnValue(imageProcessing.promise);

    const { container } = renderProjectForm({ ...baseFormData, title: 'Before' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [selectedFile] } });
    fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'After' } });

    await act(async () => {
      imageProcessing.resolve(selectedFile);
      await imageProcessing.promise;
    });

    expect(onChangeMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'After',
        imageFile: selectedFile,
        imageRemoved: false,
      })
    );
  });

  it('ignores a crop source that finishes loading after image removal', async () => {
    const imageResponse = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => imageResponse.promise)
    );
    renderProjectForm({ ...baseFormData, imageUrl: 'https://example.test/project.jpg' });

    fireEvent.click(screen.getByRole('button', { name: 'Crop image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));

    await act(async () => {
      imageResponse.resolve({
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob(['old image'], { type: 'image/jpeg' })),
      } as unknown as Response);
      await imageResponse.promise;
    });

    expect(screen.queryByRole('dialog', { name: 'Crop project image' })).not.toBeInTheDocument();
  });
});
