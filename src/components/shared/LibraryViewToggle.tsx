import React from 'react';
import { Grid, List, Table } from 'lucide-react';
import SegmentedControl from '@/components/shared/SegmentedControl';

type LibraryViewType = 'grid' | 'list' | 'table';

interface LibraryViewToggleProps<T extends LibraryViewType = LibraryViewType> {
  activeView: T;
  onViewChange: (view: T) => void;
}

const viewOptions = [
  { value: 'grid' as const, label: 'Grid', icon: Grid },
  { value: 'list' as const, label: 'List', icon: List },
  { value: 'table' as const, label: 'Table', icon: Table },
] as const;

function LibraryViewToggleComponent<T extends LibraryViewType>({
  activeView,
  onViewChange,
}: LibraryViewToggleProps<T>) {
  return (
    <SegmentedControl
      variant="glass"
      value={activeView}
      options={viewOptions.map(option => ({
        value: option.value as T,
        label: option.label,
        icon: option.icon,
        srOnlyLabel: true,
      }))}
      onValueChange={onViewChange}
    />
  );
}

const LibraryViewToggle = React.memo(
  LibraryViewToggleComponent
) as typeof LibraryViewToggleComponent;

export default LibraryViewToggle;
