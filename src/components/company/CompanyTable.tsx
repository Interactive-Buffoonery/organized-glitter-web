/**
 * @fileoverview Company Management Table Component
 *
 * Displays a comprehensive table of user companies with management capabilities
 * including viewing, editing, and deleting companies. Uses user-scoped service
 * queries to count projects and ensure data integrity.
 *
 * @author @serabi
 * @version 1.0.0
 * @since 2024-06-29
 */

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, Link2, Loader2, FileText } from 'lucide-react';
import { CompaniesService } from '@/services/pocketbase/companies.service';
import { createLogger } from '@/utils/logger';
import { useAuth } from '@/hooks/useAuth';
import EditCompanyDialog from './EditCompanyDialog';
import { Link } from 'react-router-dom';
import type { CompanyListItem } from '@/services/pocketbase/companies.service';
import { getSafeHref } from '@/utils/ui/urlSanitizer';
import { useDeleteCompany } from '@/hooks/mutations/useCompanyMutations';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const logger = createLogger('CompanyTable');

/**
 * Props interface for the CompanyTable component
 *
 * @interface CompanyTableProps
 * @property {CompanyListItem[]} companies - Array of company records from PocketBase
 * @property {boolean} loading - Whether the companies data is currently loading
 */
interface CompanyTableProps {
  companies: CompanyListItem[];
  loading: boolean;
}

/**
 * CompanyTable Component
 *
 * Renders a data table displaying user companies with management functionality.
 * Features include project count display, editing capabilities, and secure deletion.
 *
 * Key Features:
 * - Displays company name, project count, and management actions
 * - Uses user-scoped service queries for project counting
 * - Provides edit and delete functionality with confirmation dialogs
 * - Handles loading states and error scenarios gracefully
 *
 * Security Features:
 * - Uses parameterized PocketBase queries
 * - Prevents SQL injection through parameterized filtering
 * - Ensures user-scoped data access only
 *
 * @component
 * @param {CompanyTableProps} props - Component properties
 * @returns {JSX.Element} Rendered company management table
 *
 * @example
 * ```tsx
 * <CompanyTable companies={companiesData} loading={false} />
 * ```
 */
const CompanyTable = ({ companies, loading }: CompanyTableProps) => {
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [countsError, setCountsError] = useState(false);
  const [countsRefreshKey, setCountsRefreshKey] = useState(0);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState<CompanyListItem | null>(null);
  const { user, isAuthenticated } = useAuth();
  const deleteCompanyMutation = useDeleteCompany();

  useEffect(() => {
    let isCurrent = true;

    /**
     * Fetches all company project counts in one authenticated request
     *
     * Efficiently retrieves the number of projects associated with each company
     * using server-side user scoping to ensure data security.
     *
     * Security Features:
     * - Uses the authenticated aggregate route
     * - Ensures users can only see their own data
     *
     * Performance Features:
     * - One request regardless of the number of companies
     * - Minimal data transfer (company IDs and counts only)
     *
     * @async
     * @function
     * @returns {Promise<void>} Resolves when all project counts are fetched
     *
     * @example
     * // Called automatically when companies array changes
     * // Updates projectCounts state with company ID -> count mapping
     */
    const fetchProjectCounts = async () => {
      if (!companies.length || !isAuthenticated || !user?.id) {
        setProjectCounts({});
        setCountsError(false);
        setLoadingCounts(false);
        return;
      }

      try {
        setLoadingCounts(true);
        setCountsError(false);

        const aggregateCounts = await CompaniesService.getProjectCounts();
        const counts = Object.fromEntries(
          companies.map(company => [company.id, aggregateCounts[company.id] ?? 0])
        );

        if (isCurrent) {
          setProjectCounts(counts);
        }
      } catch (error) {
        logger.error('Error fetching project counts:', error);
        if (isCurrent) {
          setCountsError(true);
        }
      } finally {
        if (isCurrent) {
          setLoadingCounts(false);
        }
      }
    };

    void fetchProjectCounts();

    return () => {
      isCurrent = false;
    };
  }, [companies, countsRefreshKey, isAuthenticated, user?.id]);

  const handleDeleteCompany = (company: CompanyListItem) => {
    setCompanyToDelete(company);
    setShowDeleteConfirmDialog(true);
  };

  const confirmDeleteCompany = async () => {
    if (!companyToDelete) return;

    deleteCompanyMutation.mutate(
      { id: companyToDelete.id },
      {
        onSettled: () => {
          setShowDeleteConfirmDialog(false);
          setCompanyToDelete(null);
        },
      }
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="text-primary size-8 animate-spin" />
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">You haven't added any companies yet.</p>
      </div>
    );
  }

  return (
    <>
      {countsError ? (
        <div
          className="border-border bg-muted/30 mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          role="alert"
        >
          <span className="text-muted-foreground text-sm">Project counts are unavailable.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCountsRefreshKey(current => current + 1)}
          >
            Retry project counts
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company Name</TableHead>
            <TableHead className="hidden sm:table-cell">Website</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map(company => (
            <TableRow key={company.id}>
              <TableCell className="font-medium">{company.name}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {getSafeHref(company.website_url) ? (
                  <a
                    href={getSafeHref(company.website_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link flex items-center hover:underline"
                  >
                    <Link2 className="mr-1 size-4" />
                    {company.website_url}
                  </a>
                ) : (
                  <span className="text-muted-foreground text-sm">No website provided</span>
                )}
              </TableCell>
              <TableCell>
                {loadingCounts ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : countsError ? (
                  <span className="text-muted-foreground text-sm">Unavailable</span>
                ) : projectCounts[company.id] ? (
                  <Link
                    to={`/dashboard?company=${encodeURIComponent(company.id)}`}
                    className="text-link flex items-center hover:underline"
                  >
                    <FileText className="mr-1 size-4" />
                    {projectCounts[company.id]}{' '}
                    {projectCounts[company.id] === 1 ? 'project' : 'projects'}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-sm">No projects</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-x-1">
                  <EditCompanyDialog company={company} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteCompany(company)}
                    className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {companyToDelete && (
        <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes "{companyToDelete.name}". A company that is still used by a
                project cannot be deleted; remove it from those projects first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setCompanyToDelete(null);
                  setShowDeleteConfirmDialog(false);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteCompany}
                disabled={deleteCompanyMutation.isPending}
              >
                {deleteCompanyMutation.isPending && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default CompanyTable;
