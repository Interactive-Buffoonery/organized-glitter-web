import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { GlassPanel } from '@/components/ui/glass-panel';
import { useAppReady } from '@/hooks/useAppReady';
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

export default function Options() {
  useAppReady();
  const { user } = useAuth();
  const { diamond_painting, coloring_books, isLoading } = useEnabledVerticals(user?.id);
  const visibleGroups = groups.filter(
    group =>
      (group.craft !== 'diamond' || diamond_painting) &&
      (group.craft !== 'coloring' || coloring_books)
  );
  return (
    <MainLayout>
      <div className="container mx-auto max-w-5xl p-4 md:py-8">
        <GlassPanel className="p-5 md:p-8">
          <div className="space-y-8">
            <header>
              <h1 className="font-handwritten text-foreground text-4xl leading-tight md:text-5xl">
                Manage Lists
              </h1>
            </header>

            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading options…</p>
            ) : (
              <div className="grid gap-8 md:grid-cols-2">
                {visibleGroups.map(group => (
                  <section key={group.title} className="space-y-3">
                    <h2 className="text-foreground text-sm font-semibold tracking-tight">
                      {group.title}
                    </h2>
                    <div className="border-border/70 divide-border/70 divide-y rounded-lg border">
                      {group.items.map(item => (
                        <Link
                          key={item.href}
                          to={item.href}
                          className="hover:bg-muted/40 focus-visible:ring-ring flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors outline-none focus-visible:ring-2"
                        >
                          <span className="font-medium">{item.label}</span>
                          <ArrowRight className="text-muted-foreground size-4" aria-hidden="true" />
                        </Link>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </MainLayout>
  );
}
