import { notify } from '@/lib/notifications';

/**
 * Company List page component
 * @author @serabi
 * @created 2025-01-09
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';

import CompanyPageHeader from '@/components/company/CompanyPageHeader';
import CompanyTable from '@/components/company/CompanyTable';
import { Button } from '@/components/ui/button';
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
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 pointer-coarse:min-h-11"
          >
            <Link to="/options">
              <ChevronLeft className="size-4" />
              Back to Manage Lists
            </Link>
          </Button>
        </div>

        <CompanyPageHeader onCompanyAdded={handleCompanyAdded} />

        <div className="mt-6">
          <CompanyTable companies={companies} loading={loading} />
        </div>
      </div>
    </MainLayout>
  );
};

export default CompanyList;
