import { useAuth } from '@/hooks/useAuth';
import { useEnabledVerticals } from '@/hooks/useEnabledVerticals';

const groups = [
  {
    craft: 'diamond',
    title: 'Diamond painting',
    items: [
      { label: 'Companies', href: '/options/companies' },
      { label: 'Artists', href: '/options/artists' },
      { label: 'Tags', href: '/options/tags' },
    ],
  },
  {
    craft: 'coloring',
    title: 'Coloring',
    items: [
      { label: 'Publishers', href: '/options/publishers' },
      { label: 'Illustrators', href: '/options/illustrators' },
      { label: 'Coloring mediums', href: '/options/coloring-mediums' },
    ],
  },
] as const;

export function useManageListGroups() {
  const { user } = useAuth();
  const { diamond_painting, coloring_books, isLoading } = useEnabledVerticals(user?.id);
  const visibleGroups = groups.filter(
    group =>
      (group.craft !== 'diamond' || diamond_painting) &&
      (group.craft !== 'coloring' || coloring_books)
  );
  return { groups: visibleGroups, isLoading };
}
