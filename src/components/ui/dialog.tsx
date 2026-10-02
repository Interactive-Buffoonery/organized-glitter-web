import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80',
        className
      )}
      {...props}
    />
  );
}
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentLayout = 'centered' | 'keyboard-safe' | 'keyboard-safe-sheet';
type DialogMotion = 'default' | 'fade';

interface DialogContentProps extends React.ComponentPropsWithRef<typeof DialogPrimitive.Content> {
  motion?: DialogMotion;
  layout?: DialogContentLayout;
  /**
   * When true (default), injects the standard glass icon close button.
   * Set false for custom/full-bleed/media dialogs that provide another
   * discoverable close path (toolbar control, Escape, or outside click).
   */
  showCloseButton?: boolean;
}

const centeredLayoutClasses =
  'fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg';

const keyboardSafeLayoutClasses =
  'keyboard-safe-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-lg gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg';

const keyboardSafeSheetLayoutClasses =
  'keyboard-safe-sheet-dialog-content fixed inset-0 z-50 grid h-[100dvh] w-screen max-w-none gap-4 border p-6 shadow-lg duration-200 sm:left-[50%] sm:top-[50%] sm:h-auto sm:w-full sm:max-w-lg sm:rounded-lg';

const getLayoutClasses = (layout: DialogContentLayout) => {
  if (layout === 'keyboard-safe') {
    return keyboardSafeLayoutClasses;
  }

  if (layout === 'keyboard-safe-sheet') {
    return keyboardSafeSheetLayoutClasses;
  }

  return centeredLayoutClasses;
};

function DialogContent({
  className,
  children,
  motion = 'default',
  layout = 'centered',
  showCloseButton = true,
  ref,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          getLayoutClasses(layout),
          motion === 'default' &&
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="glass"
              size="icon-sm"
              className="absolute top-4 right-4 pointer-coarse:size-11"
            >
              <X aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

function DialogTitle({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg leading-none font-semibold tracking-tight', className)}
      {...props}
    />
  );
}
DialogTitle.displayName = DialogPrimitive.Title.displayName;

function DialogDescription({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
