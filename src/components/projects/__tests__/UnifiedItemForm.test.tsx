import '@testing-library/jest-dom/vitest';
import { within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils';
import { ColoringBookForm } from '@/components/coloring/ColoringBookForm';
import type { ProjectFormValues } from '@/types/project';
import { ProjectFormFooter } from '../form/ProjectFormFooter';
import ProjectFormSections from '../ProjectFormSections';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, initialCheckComplete: true }),
}));
vi.mock('@/components/notes/RichTextEditor.lazy', () => ({
  default: () => <textarea aria-label="Project notes" />,
}));
vi.mock('@/components/image/ImageCropDialog', () => ({ ImageCropDialog: () => null }));

const sections = ['Basics', 'Cover', 'Status', 'Tags', 'Details', 'Dates', 'Source and notes'];

describe('unified item form layout', () => {
  it.each(['Create project', 'Add book', 'Save changes'])(
    'uses one primary action for %s',
    submitLabel => {
      const { container } = renderWithProviders(
        <ProjectFormFooter
          submitting={false}
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          submitLabel={submitLabel}
          submittingLabel="Saving…"
        />
      );
      const footer = within(container);
      expect(footer.getByRole('button', { name: submitLabel })).toHaveAttribute(
        'data-variant',
        'default'
      );
      expect(footer.getByRole('button', { name: submitLabel })).toBeEnabled();
      expect(footer.getByRole('button', { name: 'Cancel' })).toHaveAttribute(
        'data-variant',
        'outline'
      );
      expect(footer.getAllByRole('button')).toHaveLength(2);
    }
  );
  it.each([
    ['project', 'page'],
    ['project', 'drawer'],
    ['book', 'page'],
    ['book', 'drawer'],
  ] as const)('orders the %s %s sections', (kind, layout) => {
    const { container } = renderWithProviders(
      kind === 'project' ? (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <ProjectFormSections
            formData={{ title: '', status: 'wishlist', tags: [] } as ProjectFormValues}
            layout={layout}
            companies={[]}
            artists={[]}
            isSubmitting={false}
            onChange={vi.fn()}
          />
        </div>
      ) : (
        <ColoringBookForm
          layout={layout}
          publishers={[]}
          illustrators={[]}
          submitLabel="Add book"
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          onCreatePublisher={vi.fn()}
          onCreateIllustrator={vi.fn()}
        />
      )
    );
    const form = within(container);
    expect(form.getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(
      sections
    );
    const basics = form.getByRole('heading', { name: 'Basics' }).closest('section')!;
    expect(within(basics).getByLabelText('Title *')).toBeInTheDocument();
    for (const label of kind === 'project' ? ['Company', 'Artist'] : ['Publisher', 'Illustrator']) {
      expect(within(basics).getByText(label)).toBeInTheDocument();
    }
    const sidebar = form.getByRole('complementary');
    expect(
      within(sidebar)
        .getAllByRole('heading')
        .map(node => node.textContent)
    ).toEqual(['Cover', 'Status', 'Tags']);
    if (layout === 'page') {
      expect(sidebar).toHaveClass('lg:col-start-2', 'lg:row-span-2');
    }
    expect(
      form.getByRole('combobox', { name: 'Status' }).querySelector('span.rounded-full')
    ).toHaveClass(kind === 'project' ? 'bg-rose-500' : 'bg-sky-500');
    const dates = form.getByRole('heading', { name: 'Dates' }).closest('section')!;
    for (const label of ['Purchased', 'Received', 'Started', 'Completed']) {
      expect(within(dates).getByLabelText(label)).toBeInTheDocument();
    }
    expect(dates.firstElementChild?.nextElementSibling).toHaveClass(
      'grid-cols-2',
      'lg:grid-cols-4'
    );
  });
});
