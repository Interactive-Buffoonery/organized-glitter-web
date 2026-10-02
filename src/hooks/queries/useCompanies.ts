/**
 * React Query hook for fetching companies
 * @author @serabi
 * @created 2025-07-08
 */

import { useQuery } from '@tanstack/react-query';
import { allCompaniesOptions } from './shared/queryOptionsFactory';
import { useAuth } from '@/hooks/useAuth';

/**
 * Hook for fetching all companies data (non-paginated)
 * Self-contained hook that automatically handles user authentication
 * @author @serabi
 * @returns React Query result with all companies data
 */
export const useAllCompanies = () => {
  const { user } = useAuth();
  return useQuery(allCompaniesOptions(user?.id || ''));
};
