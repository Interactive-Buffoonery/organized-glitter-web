/**
 * Company Page Header Component
 * @author @serabi
 * @created 2025-01-09
 */

import React from 'react';
import { ManageListHeader } from '@/components/manage-lists/ManageListsLayout';
import AddCompanyDialog from './AddCompanyDialog';

/**
 * Props interface for the CompanyPageHeader component
 */
interface CompanyPageHeaderProps {
  onCompanyAdded: () => void;
}

/**
 * CompanyPageHeader Component
 *
 * Renders the header section for the Company page including title and "Add Company" dialog.
 */
const CompanyPageHeader = ({ onCompanyAdded }: CompanyPageHeaderProps) => {
  return (
    <ManageListHeader
      title="Companies"
      action={<AddCompanyDialog onCompanyAdded={onCompanyAdded} />}
    />
  );
};

export default React.memo(CompanyPageHeader);
