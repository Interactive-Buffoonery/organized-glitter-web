import { vi } from 'vitest';
import { describe, it, expect } from '@/test-utils';
import { renderWithProviders, screen, createMockProject } from '@/test-utils';
import ProjectDetails from '../ProjectDetails';

// Mock child components to isolate ProjectDetails logic
vi.mock('../StatusDropdown', () => ({
  default: ({
    currentStatus,
    onStatusChange,
  }: {
    currentStatus: string;
    onStatusChange: (status: string) => void;
  }) => (
    <button type="button" data-testid="status-dropdown" onClick={() => onStatusChange('completed')}>
      Status: {currentStatus}
    </button>
  ),
}));

vi.mock('../RichUrlComponent', () => ({
  default: ({ url }: { url: string }) => (
    <a href={url} data-testid="rich-url">
      {url}
    </a>
  ),
}));

vi.mock('@/components/tags/TagBadge', () => ({
  TagBadge: ({ tag }: { tag: { name: string } }) => <span data-testid="tag-badge">{tag.name}</span>,
}));

vi.mock('@/components/tags/InlineTagManager', () => ({
  InlineTagManager: ({ initialTags }: { initialTags: { id: string; name: string }[] }) => (
    <div data-testid="inline-tag-manager">
      {initialTags.map(t => (
        <span key={t.id} data-testid="tag-badge">
          {t.name}
        </span>
      ))}
    </div>
  ),
}));

describe('ProjectDetails', () => {
  const baseProject = createMockProject({
    company: 'Diamond Dotz',
    artist: 'Van Gogh',
    width: 40,
    height: 50,
    drillShape: 'round',
    kitCategory: 'full',
    totalDiamonds: 45000,
    colorCount: 48,
    sourceUrl: 'https://example.com/product',
  });

  describe('Field display', () => {
    it('displays company name', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('Diamond Dotz')).toBeInTheDocument();
    });

    it('displays artist name', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('Van Gogh')).toBeInTheDocument();
    });

    it('displays dimensions as width x height cm', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('40 x 50 cm')).toBeInTheDocument();
    });

    it('displays drill shape', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('Round')).toBeInTheDocument();
    });

    it('displays kit category as human-readable label', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('Full Sized Kit')).toBeInTheDocument();
    });

    it('displays total diamonds with locale formatting', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('45,000')).toBeInTheDocument();
    });

    it('displays color count with locale formatting', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByText('Colors')).toBeInTheDocument();
      expect(screen.getByText('48')).toBeInTheDocument();
    });
  });

  describe('Missing data handling', () => {
    it('shows "Not specified" for missing company', () => {
      const project = createMockProject({ company: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('Not specified')).toBeInTheDocument();
    });

    it('shows "Not specified" for missing artist', () => {
      const project = createMockProject({ artist: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      // Both company and artist use getDisplayName
      expect(screen.getAllByText('Not specified').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "Not specified" for missing dimensions', () => {
      const project = createMockProject({ width: undefined, height: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getAllByText('Not specified').length).toBeGreaterThanOrEqual(1);
    });

    it('shows partial dimensions when only width is provided', () => {
      const project = createMockProject({ width: 40, height: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('40 cm (width)')).toBeInTheDocument();
    });

    it('shows partial dimensions when only height is provided', () => {
      const project = createMockProject({ width: undefined, height: 50 });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('50 cm (height)')).toBeInTheDocument();
    });

    it('handles "undefined" string company as not specified', () => {
      const project = createMockProject({ company: 'undefined' });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('Company not specified')).toBeInTheDocument();
    });

    it('handles "null" string company as not specified', () => {
      const project = createMockProject({ company: 'null' });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('Company not specified')).toBeInTheDocument();
    });
  });

  describe('Kit category display', () => {
    it('displays "Mini Kit" for mini category', () => {
      const project = createMockProject({ kitCategory: 'mini' });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('Mini Kit')).toBeInTheDocument();
    });

    it('displays "Not specified" when no kit category', () => {
      const project = createMockProject({ kitCategory: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getAllByText('Not specified').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Tags display', () => {
    it('renders tags when present', () => {
      const project = createMockProject({
        tags: [
          {
            id: '1',
            userId: 'u1',
            name: 'Landscape',
            slug: 'landscape',
            color: '#FF0000',
            createdAt: '',
            updatedAt: '',
          },
          {
            id: '2',
            userId: 'u1',
            name: 'Animals',
            slug: 'animals',
            color: '#00FF00',
            createdAt: '',
            updatedAt: '',
          },
        ],
      });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.getByText('Landscape')).toBeInTheDocument();
      expect(screen.getByText('Animals')).toBeInTheDocument();
    });

    it('does not render tags section when tags array is empty', () => {
      const project = createMockProject({ tags: [] });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.queryByTestId('tag-badge')).not.toBeInTheDocument();
    });

    it('does not render tags section when tags is undefined', () => {
      const project = createMockProject({ tags: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.queryByTestId('tag-badge')).not.toBeInTheDocument();
    });
  });

  describe('Source URL display', () => {
    it('renders source URL when present', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.getByTestId('rich-url')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/product')).toBeInTheDocument();
    });

    it('does not render source URL section when missing', () => {
      const project = createMockProject({ sourceUrl: undefined });
      renderWithProviders(<ProjectDetails project={project} />);

      expect(screen.queryByTestId('rich-url')).not.toBeInTheDocument();
    });
  });

  describe('Status dropdown', () => {
    it('renders when onStatusChange is provided', () => {
      const mockOnStatusChange = vi.fn();
      renderWithProviders(
        <ProjectDetails project={baseProject} onStatusChange={mockOnStatusChange} />
      );

      expect(screen.getByTestId('status-dropdown')).toBeInTheDocument();
    });

    it('does not render when onStatusChange is not provided', () => {
      renderWithProviders(<ProjectDetails project={baseProject} />);

      expect(screen.queryByTestId('status-dropdown')).not.toBeInTheDocument();
    });
  });
});
