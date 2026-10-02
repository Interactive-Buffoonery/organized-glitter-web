import { Link } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { buttonVariants } from '@/components/ui/variants';

interface ColoringBookDetailActionsProps {
  dashboardPath: string;
  updatePending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export const ColoringBookDetailActions = ({
  dashboardPath,
  updatePending,
  onEdit,
  onDelete,
}: ColoringBookDetailActionsProps) => (
  <div className="flex items-center justify-between gap-3">
    <Button asChild variant="ghost" size="sm" className="pointer-coarse:min-h-11">
      <Link to={dashboardPath}>
        <ChevronLeft className="mr-2 size-4" />
        Coloring books
      </Link>
    </Button>

    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onEdit}
        disabled={updatePending}
        aria-label="Edit coloring book"
        className="text-primary hover:bg-primary/10 hover:text-primary px-2.5 font-medium pointer-coarse:min-h-11"
      >
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="More actions"
            className="text-muted-foreground hover:text-foreground size-9 p-0 pointer-coarse:size-11"
          >
            <MoreHorizontal className="size-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[180px]">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                className="text-destructive-text focus:text-destructive-text"
                onSelect={event => event.preventDefault()}
              >
                Delete book
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this coloring book?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the book and all generated page records.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className={buttonVariants({ variant: 'destructive' })}
                  onClick={onDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
);
