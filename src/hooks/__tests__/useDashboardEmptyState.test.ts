import { describe, expect, it } from 'vitest';
import { getDefaultFilters } from '../../contexts/FilterContext/types';
import { buildDashboardEmptyState } from '../dashboardEmptyState';

describe('buildDashboardEmptyState', () => {
  it('returns a dedicated unfiltered empty state for new users', () => {
    const result = buildDashboardEmptyState(getDefaultFilters());

    expect(result).toEqual({
      title: 'No projects yet',
      description: 'Add your first project to start tracking your collection.',
      isUnfiltered: true,
    });
  });

  it('describes the active status and most relevant filters in human terms', () => {
    const filters = {
      ...getDefaultFilters(),
      activeStatus: 'completed' as const,
      selectedDrillShape: 'square',
      includeMiniKits: false,
    };

    const result = buildDashboardEmptyState(filters);

    expect(result).toEqual({
      title: 'No matching projects',
      description: 'No completed kits match square drills + full-size kits.',
      isUnfiltered: false,
    });
  });

  it('resolves metadata ids into human-readable names', () => {
    const filters = {
      ...getDefaultFilters(),
      selectedCompany: 'company-1',
      selectedTags: ['tag-1'],
    };

    const result = buildDashboardEmptyState(filters, {
      companies: [{ id: 'company-1', name: 'Diamond Art Club' }],
      tags: [{ id: 'tag-1', name: 'Landscapes' }],
    });

    expect(result).toEqual({
      title: 'No matching projects',
      description: 'No projects match tag “Landscapes” + company “Diamond Art Club”.',
      isUnfiltered: false,
    });
  });

  it('uses tailored copy for completed kits filtered only by finish year', () => {
    const filters = {
      ...getDefaultFilters(),
      activeStatus: 'completed' as const,
      selectedYearFinished: '2026',
    };

    const result = buildDashboardEmptyState(filters);

    expect(result).toEqual({
      title: 'No matching projects',
      description: 'No kits completed yet in 2026',
      isUnfiltered: false,
    });
  });

  it('falls back to a status-only message when no narrower filter reason exists', () => {
    const filters = {
      ...getDefaultFilters(),
      activeStatus: 'archived' as const,
    };

    const result = buildDashboardEmptyState(filters);

    expect(result).toEqual({
      title: 'No archived kits',
      description: 'No archived kits yet.',
      isUnfiltered: false,
    });
  });

  it('uses the custom kitted empty-state copy', () => {
    const filters = {
      ...getDefaultFilters(),
      activeStatus: 'kitted' as const,
    };

    const result = buildDashboardEmptyState(filters);

    expect(result).toEqual({
      title: 'No kitted-up kits',
      description: 'No kits currently kitted up and not started!',
      isUnfiltered: false,
    });
  });
});
