import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Edit2, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/variants';
import { notify } from '@/lib/notifications';
import { useAuth } from '@/hooks/useAuth';
import { useBookIllustrators } from '@/hooks/queries/coloring/useBookIllustrators';
import { useBookPublishers } from '@/hooks/queries/coloring/useBookPublishers';
import { useCreateBookIllustrator } from '@/hooks/mutations/coloring/useCreateBookIllustrator';
import { useCreateBookPublisher } from '@/hooks/mutations/coloring/useCreateBookPublisher';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';
import { runPostWriteEffect } from '@/hooks/mutations/runPostWriteEffect';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { isRecordInUseError } from '@/services/errors';
import { BookIllustratorsService } from '@/services/pocketbase/bookIllustrators.service';
import { BookPublishersService } from '@/services/pocketbase/bookPublishers.service';
import { getSafeHref } from '@/utils/ui/urlSanitizer';
import { createLogger } from '@/utils/logger';

const logger = createLogger('BookTaxonomyListTab');

type TaxonomyKind = 'publishers' | 'illustrators';

interface BookTaxonomyListTabProps {
  kind: TaxonomyKind;
}

interface EditingState {
  id?: string;
  name: string;
  websiteUrl: string;
}

const copy = {
  publishers: {
    title: 'Book Publisher Management',
    description: 'Add, edit or remove coloring book publishers.',
    empty: "You haven't added any book publishers yet.",
    singular: 'publisher',
  },
  illustrators: {
    title: 'Book Illustrator Management',
    description: 'Add, edit or remove coloring book illustrators.',
    empty: "You haven't added any book illustrators yet.",
    singular: 'illustrator',
  },
} as const;

export function BookTaxonomyListTab({ kind }: BookTaxonomyListTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const publishersQuery = useBookPublishers(kind === 'publishers' ? user?.id : undefined);
  const illustratorsQuery = useBookIllustrators(kind === 'illustrators' ? user?.id : undefined);
  const createPublisher = useCreateBookPublisher();
  const createIllustrator = useCreateBookIllustrator();
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const items =
    kind === 'publishers'
      ? (publishersQuery.data?.items ?? []).map(item => ({
          id: item.id,
          name: item.name,
          websiteUrl: item.website_url,
        }))
      : (illustratorsQuery.data?.items ?? []).map(item => ({
          id: item.id,
          name: item.name,
          websiteUrl: '',
        }));

  const isLoading = kind === 'publishers' ? publishersQuery.isLoading : illustratorsQuery.isLoading;
  const strings = copy[kind];

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey:
        kind === 'publishers'
          ? queryKeys.coloring.publishers.all
          : queryKeys.coloring.illustrators.all,
    });
  };

  const openNewDialog = () => setEditing({ name: '', websiteUrl: '' });

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.name.trim()) return;
    const renamed = Boolean(
      editing.id && items.find(item => item.id === editing.id)?.name !== editing.name
    );

    setIsSaving(true);
    try {
      if (kind === 'publishers') {
        if (editing.id) {
          await BookPublishersService.update(editing.id, {
            name: editing.name,
            website_url: editing.websiteUrl,
          });
        } else {
          await createPublisher.mutateAsync({
            name: editing.name,
            website_url: editing.websiteUrl || undefined,
          });
        }
      } else if (editing.id) {
        await BookIllustratorsService.update(editing.id, { name: editing.name });
      } else {
        await createIllustrator.mutateAsync({ name: editing.name });
      }

      setEditing(null);
      if (renamed) {
        runPostWriteEffect(logger, 'Could not refresh Stats after taxonomy rename', () =>
          invalidateStatsQueries(queryClient, 'coloring')
        );
      }
      runPostWriteEffect(logger, 'Could not refresh taxonomy after save', invalidate);
    } catch (error) {
      notify({
        kind: 'error',
        title: `Could not save ${strings.singular}`,
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      if (kind === 'publishers') {
        await BookPublishersService.delete(id);
      } else {
        await BookIllustratorsService.delete(id);
      }
      invalidate();
    } catch (error) {
      const isInUse = isRecordInUseError(error);
      notify({
        kind: 'error',
        title: isInUse
          ? `This ${strings.singular} is in use`
          : `Could not delete ${strings.singular}`,
        description: isInUse
          ? 'Remove it from coloring books before deleting it.'
          : error instanceof Error
            ? error.message
            : 'Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="dark:glass-card border-border bg-card text-card-foreground rounded-lg border shadow">
      <div className="border-border flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{strings.title}</h2>
          <p className="text-muted-foreground">{strings.description}</p>
        </div>
        <Button type="button" variant="glass" onClick={openNewDialog}>
          <Plus className="mr-2 size-4" />
          Add {strings.singular}
        </Button>
      </div>

      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-primary size-8 animate-spin" />
          </div>
        ) : items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                {kind === 'publishers' && <TableHead>Website</TableHead>}
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  {kind === 'publishers' && (
                    <TableCell>
                      {getSafeHref(item.websiteUrl) ? (
                        <a
                          href={getSafeHref(item.websiteUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link hover:underline"
                        >
                          {item.websiteUrl}
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">No website provided</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() =>
                          setEditing({
                            id: item.id,
                            name: item.name,
                            websiteUrl: item.websiteUrl,
                          })
                        }
                        aria-label={`Edit ${item.name}`}
                      >
                        <Edit2 className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This permanently deletes the {strings.singular}. An item that is still
                              used by a coloring book cannot be deleted; remove it from those books
                              first.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className={buttonVariants({ variant: 'destructive' })}
                              disabled={isDeleting}
                              onClick={() => handleDelete(item.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-4 text-center">
            <p className="text-muted-foreground">{strings.empty}</p>
          </div>
        )}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? 'Edit' : 'Add'} book {strings.singular}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`book-${kind}-name`}>Name</Label>
                <Input
                  id={`book-${kind}-name`}
                  value={editing.name}
                  onChange={event =>
                    setEditing(current =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                  disabled={isSaving}
                />
              </div>
              {kind === 'publishers' && (
                <div className="space-y-2">
                  <Label htmlFor="book-publisher-website">Website</Label>
                  <Input
                    id="book-publisher-website"
                    value={editing.websiteUrl}
                    onChange={event =>
                      setEditing(current =>
                        current ? { ...current, websiteUrl: event.target.value } : current
                      )
                    }
                    disabled={isSaving}
                    type="url"
                  />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!editing.name.trim() || isSaving}>
                  {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
