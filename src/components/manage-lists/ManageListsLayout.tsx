import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { cn } from '@/lib/utils';
import { useManageListGroups } from './useManageListGroups';

const MANAGE_LISTS_PATH = '/options';

function ManageListsNav() {
  const { groups: visibleGroups, isLoading } = useManageListGroups();

  if (isLoading) {
    return <p className="text-muted-foreground p-2 text-sm">Loading lists…</p>;
  }

  return (
    <nav aria-label="Lists" className="space-y-5">
      {visibleGroups.map(group => (
        <section key={group.title} className="space-y-1">
          <h2 className="text-muted-foreground px-2 text-xs font-medium">{group.title}</h2>
          {group.items.map(item => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'focus-visible:ring-ring flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 pointer-coarse:min-h-11',
                  isActive ? 'bg-muted text-foreground font-medium' : 'hover:bg-muted/40'
                )
              }
            >
              {item.label}
              <ChevronRight className="text-muted-foreground size-4 lg:hidden" aria-hidden="true" />
            </NavLink>
          ))}
        </section>
      ))}
    </nav>
  );
}

interface ManageListHeaderProps {
  title: string;
  action?: ReactNode;
}

export function ManageListHeader({ title, action }: ManageListHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <SectionHeading>{title}</SectionHeading>
      {action}
    </div>
  );
}

export function ManageListsLayout({ children }: { children?: ReactNode }) {
  const isIndex = useLocation().pathname === MANAGE_LISTS_PATH;

  return (
    <MainLayout>
      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-8">
        {!isIndex && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2 gap-1.5 lg:hidden pointer-coarse:min-h-11"
          >
            <Link to={MANAGE_LISTS_PATH}>
              <ChevronLeft className="size-4" />
              All lists
            </Link>
          </Button>
        )}

        <h1 className="font-handwritten mb-6 text-3xl leading-tight tracking-tight md:text-4xl">
          Manage Lists
        </h1>

        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <GlassPanel className={cn('p-3', !isIndex && 'hidden lg:block')}>
            <ManageListsNav />
          </GlassPanel>
          {children && <div className="min-w-0">{children}</div>}
        </div>
      </div>
    </MainLayout>
  );
}
