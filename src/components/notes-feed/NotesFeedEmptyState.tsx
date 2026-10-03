import { Link } from 'react-router-dom';
import { BookOpenText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';

type NotesFeedEmptyStateCraft = 'all' | 'diamond' | 'coloring';

const emptyStateCopy: Record<NotesFeedEmptyStateCraft, string> = {
  all: 'Add a progress note to a diamond painting or coloring page, and it will show up here, also.',
  diamond: 'Add a progress note to a diamond painting, and it will show up here, also.',
  coloring: 'Add a progress note to a coloring page, and it will show up here, also.',
};

interface NotesFeedEmptyStateProps {
  craft: NotesFeedEmptyStateCraft;
}

export function NotesFeedEmptyState({ craft }: NotesFeedEmptyStateProps) {
  return (
    <GlassPanel className="flex flex-col items-center px-6 py-12 text-center">
      <div className="bg-primary/10 text-primary mb-4 grid size-12 place-items-center rounded-full">
        <BookOpenText className="size-6" aria-hidden />
      </div>
      <h2 className="text-foreground text-lg font-semibold">Start logging progress!</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">{emptyStateCopy[craft]}</p>
      <Button asChild className="mt-6">
        <Link to="/dashboard">Find something to work on</Link>
      </Button>
    </GlassPanel>
  );
}
