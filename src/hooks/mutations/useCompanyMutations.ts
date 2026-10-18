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
import { SessionChangedError, isSessionChangedError } from '@/services/auth/sessionRecovery';
import {
  captureSessionIdentity,
  isCurrentSessionIdentity,
  type SessionIdentity,
} from '@/services/auth/sessionIdentity';
import type { MutateOptions, UseMutationResult } from '@tanstack/react-query';

const logger = createLogger('CompanyMutations');

function mergeUpdatedCompanyIntoList(
  companies: CompanyListItem[],
  id: string,
  patch: Pick<CompanyListItem, 'name' | 'website_url'>
): CompanyListItem[] {
  let changed = false;
  const next = companies.map(item => {
    if (item.id === id) {
      changed = true;
      return { ...item, ...patch };
    }
    return item;
  });
  return changed ? next.sort((a, b) => a.name.localeCompare(b.name)) : companies;
}

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
    return mergeUpdatedCompanyIntoList(data as CompanyListItem[], id, patch);
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
    const companies = mergeUpdatedCompanyIntoList(typed.companies, id, patch);
    if (companies === typed.companies) return data;
    return {
      ...typed,
      companies,
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

  type Variables = { data: CreateCompanyData; sessionIdentity: SessionIdentity };
  type Callbacks = MutateOptions<CompanyDTO, Error, CreateCompanyData>;
  const adaptCallbacks = (
    options?: Callbacks
  ): MutateOptions<CompanyDTO, Error, Variables, SessionIdentity> | undefined =>
    options && {
      onSuccess: (data, variables, context, mutationContext) => {
        if (isCurrentSessionIdentity(variables.sessionIdentity))
          return options.onSuccess?.(data, variables.data, context, mutationContext);
      },
      onError: (error, variables, context, mutationContext) => {
        if (isCurrentSessionIdentity(variables.sessionIdentity))
          return options.onError?.(error, variables.data, context, mutationContext);
      },
      onSettled: (data, error, variables, context, mutationContext) => {
        if (isCurrentSessionIdentity(variables.sessionIdentity))
          return options.onSettled?.(data, error, variables.data, context, mutationContext);
      },
    };
  const mutation = useMutation<CompanyDTO, Error, Variables, SessionIdentity>({
    onMutate: variables => variables.sessionIdentity,
    mutationFn: async ({ data, sessionIdentity }): Promise<CompanyDTO> => {
      if (!isCurrentSessionIdentity(sessionIdentity)) throw new SessionChangedError();
      return CompaniesService.create(data, sessionIdentity);
    },
    onSuccess: (created, { sessionIdentity }) => {
      if (!isCurrentSessionIdentity(sessionIdentity)) return;
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
    onError: (error: Error, { sessionIdentity }) => {
      if (!isCurrentSessionIdentity(sessionIdentity) || isSessionChangedError(error)) return;
      logger.error('Failed to create company', error);
      const message =
        isServiceError(error) && error.type === 'validation'
          ? error.message
          : 'Failed to add company';
      notify({ kind: 'error', title: 'Company creation failed', description: message });
    },
  });
  return {
    ...mutation,
    variables: mutation.variables?.data,
    mutate: (data: CreateCompanyData, options?: Callbacks) =>
      mutation.mutate({ data, sessionIdentity: captureSessionIdentity() }, adaptCallbacks(options)),
    mutateAsync: (data: CreateCompanyData, options?: Callbacks) =>
      mutation.mutateAsync(
        { data, sessionIdentity: captureSessionIdentity() },
        adaptCallbacks(options)
      ),
  } as UseMutationResult<CompanyDTO, Error, CreateCompanyData>;
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
