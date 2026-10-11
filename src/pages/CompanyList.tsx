import { notify } from '@/lib/notifications';

/**
 * Company List page component
 * @author @serabi
 * @created 2025-01-09
 */

import { useEffect } from 'react';
import { ManageListsLayout } from '@/components/manage-lists/ManageListsLayout';

import CompanyPageHeader from '@/components/company/CompanyPageHeader';
import CompanyTable from '@/components/company/CompanyTable';
import { useAllCompanies } from '@/hooks/queries/useCompanies';
import { useAppReady } from '@/hooks/useAppReady';

/**
 * CompanyList Component
 *
 * Main page component for managing companies. Uses useAllCompanies hook
 * for data fetching, consistent with ArtistList's useArtists pattern.
 */
const CompanyList = () => {
  useAppReady();

  const { data: companies = [], isLoading: loading, error } = useAllCompanies();

  // Handle errors from React Query - only fire toast when error state changes
  useEffect(() => {
    if (error) {
      notify({
        kind: 'error',
        title: 'Companies unavailable',
        description: 'Could not load companies',
      });
    }
  }, [error]);

  const handleCompanyAdded = () => {
    // React Query will automatically refetch when invalidated by the mutation
  };
  return (
    <ManageListsLayout>
      <CompanyPageHeader onCompanyAdded={handleCompanyAdded} />

      <div className="mt-6">
        <CompanyTable companies={companies} loading={loading} />
      </div>
    </ManageListsLayout>
  );
};

export default CompanyList;
