import React from 'react';
import type { DashboardViewType } from '@/contexts/FilterContext/types';
import LibraryViewToggle from '@/components/shared/LibraryViewToggle';

interface ViewToggleProps {
  activeView: DashboardViewType;
  onViewChange: (view: DashboardViewType) => void;
}

const ViewToggle = React.memo<ViewToggleProps>(({ activeView, onViewChange }) => {
  return <LibraryViewToggle activeView={activeView} onViewChange={onViewChange} />;
});

ViewToggle.displayName = 'ViewToggle';

export default ViewToggle;
