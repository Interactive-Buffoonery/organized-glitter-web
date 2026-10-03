import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-xl p-1',
      'text-muted-foreground border border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))]',
      'shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_1px_3px_rgba(0,0,0,0.06)]',
      'backdrop-blur-xl backdrop-saturate-150',
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5',
      'text-sm font-medium whitespace-nowrap transition-all',
      'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--glass-highlight)/0.5)]',
      'focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[state=active]:text-foreground data-[state=active]:bg-[hsl(var(--primary)/0.18)]',
      'data-[state=active]:ring-1 data-[state=active]:ring-[hsl(var(--primary)/0.35)]',
      'data-[state=active]:shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_1px_4px_rgba(0,0,0,0.08)]',
      'data-[state=active]:hover:bg-[hsl(var(--primary)/0.18)]',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'ring-offset-background focus-visible:ring-ring mt-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
