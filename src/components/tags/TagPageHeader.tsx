/**
 * Tag Page Header Component
 * @author @serabi
 * @created 2025-01-09
 */

import React from 'react';
import { ManageListHeader } from '@/components/manage-lists/ManageListsLayout';
import AddTagDialog from './AddTagDialog';

/**
 * TagPageHeader Component
 *
 * Renders the header section for the Tag page including title and "Add Tag" dialog.
 */
const TagPageHeader = () => {
  return <ManageListHeader title="Tags" action={<AddTagDialog />} />;
};

export default React.memo(TagPageHeader);
