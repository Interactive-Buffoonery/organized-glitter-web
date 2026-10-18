import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';
import { useMobileDevice } from '@/hooks/use-mobile';
import { useKeyboardSafeViewportStyle } from '@/hooks/useKeyboardSafeViewportStyle';

/** Bottom drawer on phones, dialog elsewhere, matching the coloring edit drawer. */
export function ColorKeySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  fill = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: string;
  children: ReactNode;
  /** Keeps a fixed height so filtering content does not resize the sheet. */
  fill?: boolean;
}) {
  const { isPhone } = useMobileDevice();
  const drawerStyle = useKeyboardSafeViewportStyle(isPhone && open);
  if (isPhone) {
    return (
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        shouldScaleBackground={false}
        repositionInputs={false}
      >
        <DrawerContent className={fill ? 'h-[92dvh]' : 'max-h-[92dvh]'} style={drawerStyle}>
          <div className="space-y-1 px-4 pt-3">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{description}</DrawerDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[85dvh] flex-col overflow-hidden [&>button:last-child]:size-11',
          fill && 'h-[min(85dvh,44rem)]'
        )}
      >
        <DialogHeader className="pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
