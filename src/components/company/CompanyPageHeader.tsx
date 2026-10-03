/**
 * Company Page Header Component
 * @author @serabi
 * @created 2025-01-09
 */

import React from 'react';
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
    <div className="mb-8 flex flex-col items-start justify-between md:flex-row md:items-center">
      <div>
        <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
          Company List
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Manage your diamond painting companies</p>
      </div>

      <AddCompanyDialog onCompanyAdded={onCompanyAdded} />
    </div>
  );
};

export default React.memo(CompanyPageHeader);
