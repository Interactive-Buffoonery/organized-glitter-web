import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyTable from '../CompanyTable';
import type { CompanyListItem } from '@/services/pocketbase/companies.service';

const { getProjectCountsMock } = vi.hoisted(() => ({
  getProjectCountsMock: vi.fn(),
}));

vi.mock('@/services/pocketbase/companies.service', () => ({
  CompaniesService: { getProjectCounts: getProjectCountsMock },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAuthenticated: true }),
}));
vi.mock('@/hooks/mutations/useCompanyMutations', () => ({
  useDeleteCompany: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('../EditCompanyDialog', () => ({ default: () => null }));

const company = (id: string, name: string): CompanyListItem =>
  ({ id, name, website_url: '' }) as CompanyListItem;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('CompanyTable', () => {
  beforeEach(() => {
    getProjectCountsMock.mockReset();
  });

  it('ignores project counts from a company list that has been replaced', async () => {
    const firstCount = deferred<Record<string, number>>();
    const secondCount = deferred<Record<string, number>>();
    getProjectCountsMock
      .mockReturnValueOnce(firstCount.promise)
      .mockReturnValueOnce(secondCount.promise);

    const { rerender } = render(
      <MemoryRouter>
        <CompanyTable companies={[company('first', 'First')]} loading={false} />
      </MemoryRouter>
    );

    rerender(
      <MemoryRouter>
        <CompanyTable companies={[company('second', 'Second')]} loading={false} />
      </MemoryRouter>
    );

    await act(async () => {
      secondCount.resolve({ second: 2 });
      await secondCount.promise;
    });
    expect(await screen.findByText('2 projects')).toBeInTheDocument();

    await act(async () => {
      firstCount.resolve({ first: 7 });
      await firstCount.promise;
    });

    expect(screen.getByText('2 projects')).toBeInTheDocument();
  });

  it('shows an unavailable state and retries a failed count request', async () => {
    getProjectCountsMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({});

    render(
      <MemoryRouter>
        <CompanyTable companies={[company('first', 'First')]} loading={false} />
      </MemoryRouter>
    );

    expect(await screen.findByText('Project counts are unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No projects')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry project counts' }));

    expect(await screen.findByText('No projects')).toBeInTheDocument();
    expect(screen.queryByText('Project counts are unavailable.')).not.toBeInTheDocument();
    expect(getProjectCountsMock).toHaveBeenCalledTimes(2);
  });
});
