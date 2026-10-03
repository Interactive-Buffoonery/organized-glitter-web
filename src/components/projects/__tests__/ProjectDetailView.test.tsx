import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockProject, createMockUser, renderWithProviders, screen } from '@/test-utils';
import ProjectDetailView from '../ProjectDetailView';

type ImageGalleryMockProps = {
  imageUrl: string;
  alt: string;
  instagramStyle?: boolean;
  previewFit?: 'cover' | 'contain';
  size?: 'small' | 'medium' | 'large' | 'full';
};

const { imageGalleryProps } = vi.hoisted(() => ({
  imageGalleryProps: [] as ImageGalleryMockProps[],
}));

vi.mock('@/components/projects/ImageGallery', () => ({
  default: (props: ImageGalleryMockProps) => {
    imageGalleryProps.push(props);
    return (
      <img
        src={props.imageUrl}
        alt={props.alt}
        data-testid="project-hero-image"
        data-preview-fit={props.previewFit ?? 'cover'}
      />
    );
  },
}));

vi.mock('@/components/projects/ProjectCoverImageEditor', () => ({
  default: () => <button type="button">Replace cover image</button>,
}));

vi.mock('@/components/projects/ProjectDetails', () => ({
  default: () => <section aria-label="Project details" />,
}));

vi.mock('@/components/projects/form/ProjectNotes', () => ({
  default: () => <section aria-label="Project notes" />,
}));

vi.mock('@/components/projects/ProjectProgressNotes', () => ({
  default: () => <section aria-label="Project progress notes" />,
}));

vi.mock('@/components/projects/timeline/TimelineDateEditor', () => ({
  default: ({ formattedDisplay }: { formattedDisplay: string }) => <span>{formattedDisplay}</span>,
}));

describe('ProjectDetailView', () => {
  beforeEach(() => {
    imageGalleryProps.length = 0;
  });

  it('renders the detail hero image in contain mode so portrait artwork is not cropped', () => {
    const project = createMockProject({
      imageUrl: 'https://cdn.organizedglitter.test/tall-kit.jpg',
      title: 'Tall Portrait Kit',
    });

    renderWithProviders(
      <ProjectDetailView
        project={project}
        isMobile={false}
        onStatusChange={vi.fn()}
        onUpdateNotes={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        navigateToEdit={vi.fn()}
        user={createMockUser()}
      />
    );

    expect(screen.getByTestId('project-hero-image')).toHaveAttribute('data-preview-fit', 'contain');
    expect(imageGalleryProps).toContainEqual(
      expect.objectContaining({
        imageUrl: project.imageUrl,
        alt: project.title,
        previewFit: 'contain',
      })
    );
  });

  it('keeps the project title as the first heading on mobile when the cover is missing', () => {
    const project = createMockProject({ imageUrl: undefined, title: 'Spring flowers' });

    renderWithProviders(
      <ProjectDetailView
        project={project}
        isMobile
        onStatusChange={vi.fn()}
        onUpdateNotes={vi.fn().mockResolvedValue(undefined)}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
        navigateToEdit={vi.fn()}
        user={createMockUser()}
      />
    );

    expect(screen.getAllByRole('heading')[0]).toBe(screen.getByRole('heading', { level: 1 }));
  });
});
