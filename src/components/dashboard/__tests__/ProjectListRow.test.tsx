import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { createMockProject, renderWithProviders } from '@/test-utils';
import ProjectListRow from '../ProjectListRow';

describe('ProjectListRow metadata', () => {
  it('omits missing metadata without adding placeholder lines', () => {
    renderWithProviders(
      <ProjectListRow
        project={createMockProject({
          company: undefined,
          artist: undefined,
          width: undefined,
          height: undefined,
          drillShape: undefined,
          createdAt: '',
          datePurchased: undefined,
        })}
      />
    );
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });

  it('keeps known company and artist names', () => {
    renderWithProviders(
      <ProjectListRow
        project={createMockProject({ company: 'Studio Spark', artist: 'Jane Artist' })}
      />
    );
    expect(screen.getByText('Studio Spark · Jane Artist')).toBeInTheDocument();
  });
});
