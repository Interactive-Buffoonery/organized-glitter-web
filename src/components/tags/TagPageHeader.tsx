/**
 * Tag Page Header Component
 * @author @serabi
 * @created 2025-01-09
 */

import React from 'react';
import AddTagDialog from './AddTagDialog';

/**
 * TagPageHeader Component
 *
 * Renders the header section for the Tag page including title and "Add Tag" dialog.
 */
const TagPageHeader = () => {
  return (
    <div className="mb-8 flex flex-col items-start justify-between md:flex-row md:items-center">
      <div>
        <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
          Tag List
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage diamond tags and review coloring tag usage.
        </p>
      </div>

      <AddTagDialog />
    </div>
  );
};

export default React.memo(TagPageHeader);
