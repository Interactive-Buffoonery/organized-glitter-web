import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { NotesFeedItem } from '@/hooks/queries/useNotesFeed';

type NotesFeedTab = 'all' | 'diamond' | 'coloring';

interface NotesFeedFiltersProps {
  craft: NotesFeedTab;
  canUseDiamond: boolean;
  canUseColoring: boolean;
  year: string;
  sourceId: string;
  sources: Array<Pick<NotesFeedItem['source'], 'id' | 'title'>>;
  onCraftChange: (craft: NotesFeedTab) => void;
  onYearChange: (year: string) => void;
  onSourceChange: (sourceId: string) => void;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 8 }, (_, index) => String(currentYear - index));

export function NotesFeedFilters({
  craft,
  canUseDiamond,
  canUseColoring,
  year,
  sourceId,
  sources,
  onCraftChange,
  onYearChange,
  onSourceChange,
}: NotesFeedFiltersProps) {
  const showCraftTabs = canUseDiamond && canUseColoring;

  return (
    <div className="space-y-3">
      {showCraftTabs ? (
        <Tabs value={craft} onValueChange={value => onCraftChange(value as NotesFeedTab)}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="diamond">Diamond paintings</TabsTrigger>
            <TabsTrigger value="coloring">Coloring pages</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={year} onValueChange={onYearChange}>
          <SelectTrigger aria-label="Filter notes by year">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.map(option => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceId} onValueChange={onSourceChange}>
          <SelectTrigger aria-label="Filter notes by project or book">
            <SelectValue placeholder="Project or book" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects and books</SelectItem>
            {sources.map(source => (
              <SelectItem key={source.id} value={source.id}>
                {source.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
