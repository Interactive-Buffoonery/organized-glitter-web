import { Link } from 'react-router-dom';
import { Ellipsis, Flame } from 'lucide-react';
import { useCraftingStreak } from '@/hooks/queries/useCraftingStreak';
import { useStreakMode } from './useStreakMode';

function Indicator({ location }: { location: 'home' | 'notes' }) {
  const { count, isPending } = useCraftingStreak();
  const label =
    count === undefined
      ? isPending
        ? 'Crafting streak loading'
        : 'Crafting streak unavailable'
      : count === 0
        ? 'No current crafting streak'
        : `${count}-day crafting streak`;
  const classes =
    'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold tabular-nums';
  const content =
    count === undefined ? (
      <Ellipsis aria-hidden="true" className="text-muted-foreground size-5" />
    ) : (
      <>
        <Flame
          aria-hidden="true"
          className="text-accent size-5"
          fill={count > 0 ? 'currentColor' : 'none'}
        />
        {count > 0 && <span>{count}</span>}
      </>
    );
  return location === 'home' ? (
    <Link
      to="/notes"
      aria-label={`${label}. Opens Notes.`}
      title={label}
      className={`${classes} hover:bg-secondary focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none`}
    >
      {content}
    </Link>
  ) : (
    <span role="img" aria-label={label} title={label} className={classes}>
      {content}
    </span>
  );
}

export function CraftingStreak({ location }: { location: 'home' | 'notes' }) {
  const { mode } = useStreakMode();
  return mode === location ? <Indicator location={location} /> : null;
}
