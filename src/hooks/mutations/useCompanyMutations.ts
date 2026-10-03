import { notify } from '@/lib/notifications';

/**
 * Company mutation hooks delegating to CompaniesService
 * @author @serabi
 */

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { CompanyDTO } from '@/services/types';
import { CompaniesService, type CompanyListItem } from '@/services/pocketbase/companies.service';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { isRecordInUseError, isServiceError } from '@/services/errors';
import { createLogger } from '@/utils/logger';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';
import { isSessionChangedError } from '@/services/auth/sessionRecovery';

const logger = createLogger('CompanyMutations');

/**
 * Merges an updated company into React Query cache entries shaped like
 * `CompanyListItem[]` (e.g. `useAllCompanies`) or `{ companies: CompanyListItem[] }`
 * (paginated list). Returns the previous reference when nothing matched so React Query
 * does not notify subscribers unnecessarily.
 *
 * Exported for unit tests; keeps the companies table in sync immediately after PATCH
 * when invalidation/refetch alone can leave stale rows (same class as tag metadata #108).
 *
 * The patch intentionally only carries fields present on `CompanyListItem` (`name`,
 * `website_url`). Full `CompanyDTO` fields like `createdAt` don't exist in list rows,
 * so spreading the whole DTO would pollute the cache shape.
 */
export function mergeUpdatedCompanyIntoCompanyQueriesCache(
  data: unknown,
  id: string,
  patch: Pick<CompanyListItem, 'name' | 'website_url'>
): unknown {
  if (Array.isArray(data)) {
    let changed = false;
    const next = (data as CompanyListItem[]).map(item => {
      if (item.id === id) {
        changed = true;
        return { ...item, ...patch };
      }
      return item;
    });
    if (!changed) return data;
    return next.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (
    data &&
    typeof data === 'object' &&
    'companies' in data &&
    Array.isArray((data as { companies: CompanyListItem[] }).companies)
  ) {
    const typed = data as {
      companies: CompanyListItem[];
      totalItems: number;
      totalPages: number;
    };
    let changed = false;
    const nextCompanies = typed.companies.map(item => {
      if (item.id === id) {
        changed = true;
        return { ...item, ...patch };
      }
      return item;
    });
    if (!changed) return data;
    return {
      ...typed,
      companies: nextCompanies.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  return data;
}

export function insertCreatedCompanyIntoCompanyQueriesCache(
  data: unknown,
  created: CompanyListItem,
  options: { pageSize?: number } = {}
): unknown {
  if (Array.isArray(data)) {
    if ((data as CompanyListItem[]).some(item => item.id === created.id)) return data;
    return [...(data as CompanyListItem[]), created].sort((a, b) => a.name.localeCompare(b.name));
  }

  if (
    data &&
    typeof data === 'object' &&
    'companies' in data &&
    Array.isArray((data as { companies: CompanyListItem[] }).companies)
  ) {
    const typed = data as {
      companies: CompanyListItem[];
      totalItems: number;
      totalPages: number;
    };
    if (typed.companies.some(item => item.id === created.id)) return data;
    if (!options.pageSize) return data;

    const inserted = [...typed.companies, created].sort((a, b) => a.name.localeCompare(b.name));
    const totalItems = typed.totalItems + 1;
    const pageSize = options.pageSize;

    const companies = inserted.length > pageSize ? inserted.slice(0, pageSize) : inserted;
    return {
      ...typed,
      companies,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    };
  }

  return data;
}

function getCompanyListPageSizeFromQueryKey(queryKey: QueryKey): number | undefined {
  if (queryKey[0] !== 'companies' || queryKey[1] !== 'list') return undefined;

  const params = queryKey[3];
  if (!params || typeof params !== 'object' || Array.isArray(params)) return undefined;

  const pageSize = (params as { pageSize?: unknown }).pageSize;
  return Number.isInteger(pageSize) && Number(pageSize) > 0 ? Number(pageSize) : undefined;
}

export function insertCreatedCompanyIntoAllCompanyQueriesCache(
  queryClient: QueryClient,
  created: CompanyListItem
): void {
  queryClient
    .getQueriesData({ queryKey: queryKeys.companies.all })
    .forEach(([queryKey, cached]) => {
      const next = insertCreatedCompanyIntoCompanyQueriesCache(cached, created, {
        pageSize: getCompanyListPageSizeFromQueryKey(queryKey),
      });
      if (next !== cached) {
        queryClient.setQueryData(queryKey, next);
      }
    });
}

function companyDtoToListPatch(dto: CompanyDTO): Pick<CompanyListItem, 'name' | 'website_url'> {
  return {
    name: dto.name,
    website_url: dto.websiteUrl || '',
  };
}

function companyDtoToListItem(dto: CompanyDTO): CompanyListItem {
  return {
    id: dto.id,
    ...companyDtoToListPatch(dto),
  };
}

export interface CreateCompanyData {
  name: string;
  website_url?: string;
}

export interface UpdateCompanyData {
  name?: string;
  website_url?: string;
}

export function useCreateCompany({ notifyOnSuccess = true }: { notifyOnSuccess?: boolean } = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateCompanyData): Promise<CompanyDTO> => {
      return CompaniesService.create(data);
    },
    onSuccess: created => {
      capture(AnalyticsEvent.COMPANY_CREATED);
      insertCreatedCompanyIntoAllCompanyQueriesCache(queryClient, companyDtoToListItem(created));
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (notifyOnSuccess) {
        notify({
          kind: 'success',
          title: 'Company created',
          description: `Company "${created.name}" has been added`,
        });
      }
      logger.info('Company created', { id: created.id });
    },
    onError: (error: Error) => {
      if (isSessionChangedError(error)) return;
      logger.error('Failed to create company', error);
      const message =
        isServiceError(error) && error.type === 'validation'
          ? error.message
          : 'Failed to add company';
      notify({ kind: 'error', title: 'Company creation failed', description: message });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateCompanyData;
    }): Promise<CompanyDTO> => {
      return CompaniesService.update(id, data);
    },
    onSuccess: (updated, { id }) => {
      invalidateStatsQueries(queryClient, 'diamond');
      capture(AnalyticsEvent.COMPANY_UPDATED);
      const listPatch = companyDtoToListPatch(updated);
      queryClient.setQueriesData({ queryKey: queryKeys.companies.all }, cached =>
        mergeUpdatedCompanyIntoCompanyQueriesCache(cached, id, listPatch)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(id) });

      notify({
        kind: 'success',
        title: 'Company updated',
        description: `Company "${updated.name}" has been updated`,
      });
      logger.info('Company updated', { id });
    },
    onError: (error: Error) => {
      logger.error('Failed to update company', error);
      const message =
        isServiceError(error) && (error.type === 'validation' || error.type === 'permission')
          ? error.message
          : 'Failed to update company';
      notify({ kind: 'error', title: 'Company update failed', description: message });
    },
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      return CompaniesService.delete(id);
    },
    onSuccess: (_, { id }) => {
      invalidateStatsQueries(queryClient, 'diamond');
      capture(AnalyticsEvent.COMPANY_DELETED);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(id) });

      notify({
        kind: 'success',
        title: 'Company deleted',
        description: 'Company has been deleted',
      });
      logger.info('Company deleted', { id });
    },
    onError: (error: Error) => {
      logger.error('Failed to delete company', error);
      const isInUse = isRecordInUseError(error);
      const message = isInUse
        ? 'Remove it from projects before deleting it.'
        : isServiceError(error) && error.type === 'permission'
          ? error.message
          : 'Failed to delete company';
      notify({
        kind: 'error',
        title: isInUse ? 'Company is in use' : 'Company deletion failed',
        description: message,
      });
    },
  });
}
