import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Edit2, Loader2, Plus, Trash2 } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useAppReady } from '@/hooks/useAppReady';
import { useColoringMediums } from '@/hooks/queries/coloring/useColoringMediums';
import {
  useCreateColoringMedium,
  useDeleteColoringMedium,
  useUpdateColoringMedium,
} from '@/hooks/mutations/coloring/useColoringMediumMutations';
import {
  ColoringMediumTypeOptions,
  type ColoringMediumFormValues,
  type ColoringMediumRecord,
  type ColoringMediumType,
} from '@/types/coloringMedium';

const TYPE_LABELS: Record<ColoringMediumType, string> = {
  colored_pencil: 'Colored pencil',
  alcohol_marker: 'Alcohol marker',
  water_based_marker: 'Water based marker',
  gel_pen: 'Gel pen',
  watercolor: 'Watercolor',
  pastel: 'Pastel',
  acrylic_paint_pen: 'Acrylic paint pen',
  other: 'Other',
};

const emptyValues: ColoringMediumFormValues = {
  name: '',
  type: ColoringMediumTypeOptions.colored_pencil,
  brand: '',
  colorCount: '',
  notes: '',
};

export default function ColoringMediumList() {
  useAppReady();
  const { user } = useAuth();
  const mediumsQuery = useColoringMediums(user?.id);
  const createMedium = useCreateColoringMedium();
  const updateMedium = useUpdateColoringMedium();
  const deleteMedium = useDeleteColoringMedium();
  const [editing, setEditing] = useState<
    { id?: string; values: ColoringMediumFormValues } | undefined
  >();
  const [mediumToDelete, setMediumToDelete] = useState<ColoringMediumRecord | null>(null);
  const [isSavingLocally, setIsSavingLocally] = useState(false);
  const isSavingRef = useRef(false);
  const editSessionRef = useRef(0);

  const isSaving = isSavingLocally || createMedium.isPending || updateMedium.isPending;
  const isEditorLocked = isSaving || mediumsQuery.isFetching;

  const openEdit = (medium: ColoringMediumRecord) => {
    if (isEditorLocked || isSavingRef.current) return;
    editSessionRef.current += 1;
    setEditing({
      id: medium.id,
      values: {
        name: medium.name,
        type: medium.type,
        brand: medium.brand,
        colorCount: medium.colorCount ? String(medium.colorCount) : '',
        notes: medium.notes,
      },
    });
  };

  const openCreate = () => {
    if (isEditorLocked || isSavingRef.current) return;
    editSessionRef.current += 1;
    setEditing({ values: emptyValues });
  };

  const closeEditor = () => {
    editSessionRef.current += 1;
    setEditing(undefined);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.values.name.trim() || isSaving) return;
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSavingLocally(true);
    const editSession = editSessionRef.current;

    try {
      if (editing.id) {
        await updateMedium.mutateAsync({ id: editing.id, input: editing.values });
      } else {
        await createMedium.mutateAsync(editing.values);
      }
      if (editSession === editSessionRef.current) {
        closeEditor();
      }
    } catch (error) {
      if (editSession === editSessionRef.current) {
        notify({
          kind: 'error',
          title: 'Could not save coloring medium',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      }
    } finally {
      isSavingRef.current = false;
      setIsSavingLocally(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!mediumToDelete) return;

    deleteMedium.mutate(mediumToDelete.id, {
      onSettled: () => {
        setMediumToDelete(null);
      },
    });
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1.5 pointer-coarse:min-h-11"
          >
            <Link to="/options">
              <ChevronLeft className="size-4" />
              Back to Manage Lists
            </Link>
          </Button>
        </div>

        <div className="dark:glass-card border-border bg-card text-card-foreground rounded-lg border shadow">
          <div className="border-border flex flex-col gap-4 border-b p-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold">Coloring medium management</h1>
              <p className="text-muted-foreground">Add, edit or remove coloring mediums.</p>
            </div>
            <Button type="button" variant="glass" onClick={openCreate} disabled={isEditorLocked}>
              <Plus className="mr-2 size-4" />
              Add coloring medium
            </Button>
          </div>

          <div className="p-6">
            {mediumsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="text-primary size-8 animate-spin" />
              </div>
            ) : mediumsQuery.data?.items.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Colors</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mediumsQuery.data.items.map(medium => (
                    <TableRow key={medium.id}>
                      <TableCell className="font-medium">{medium.name}</TableCell>
                      <TableCell>{TYPE_LABELS[medium.type]}</TableCell>
                      <TableCell>{medium.brand || 'No brand'}</TableCell>
                      <TableCell>{medium.colorCount || 'Not recorded'}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => openEdit(medium)}
                            disabled={isEditorLocked}
                            aria-label={`Edit ${medium.name}`}
                          >
                            <Edit2 className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setMediumToDelete(medium)}
                            disabled={deleteMedium.isPending}
                            aria-label={`Delete ${medium.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground py-8 text-center">
                You haven't added any coloring mediums yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <AlertDialog
        open={Boolean(mediumToDelete)}
        onOpenChange={open => {
          if (!open) setMediumToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {mediumToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the coloring medium. A medium that is still used by a
              coloring page cannot be deleted; remove it from those pages first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={deleteMedium.isPending}
              onClick={handleConfirmDelete}
            >
              {deleteMedium.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(editing)} onOpenChange={open => !open && closeEditor()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? 'Edit coloring medium' : 'Add coloring medium'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="medium-name">Name</Label>
              <Input
                id="medium-name"
                value={editing?.values.name ?? ''}
                onChange={event =>
                  setEditing(current =>
                    current
                      ? { ...current, values: { ...current.values, name: event.target.value } }
                      : current
                  )
                }
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="medium-type">Type</Label>
              <Select
                value={editing?.values.type ?? ColoringMediumTypeOptions.colored_pencil}
                onValueChange={value =>
                  setEditing(current =>
                    current
                      ? {
                          ...current,
                          values: { ...current.values, type: value as ColoringMediumType },
                        }
                      : current
                  )
                }
                disabled={isSaving}
              >
                <SelectTrigger id="medium-type" aria-label="Medium type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ColoringMediumTypeOptions).map(type => (
                    <SelectItem key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="medium-brand">Brand</Label>
                <Input
                  id="medium-brand"
                  value={editing?.values.brand ?? ''}
                  onChange={event =>
                    setEditing(current =>
                      current
                        ? { ...current, values: { ...current.values, brand: event.target.value } }
                        : current
                    )
                  }
                  disabled={isSaving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medium-color-count">Color count</Label>
                <Input
                  id="medium-color-count"
                  type="number"
                  min="0"
                  value={editing?.values.colorCount ?? ''}
                  onChange={event =>
                    setEditing(current =>
                      current
                        ? {
                            ...current,
                            values: { ...current.values, colorCount: event.target.value },
                          }
                        : current
                    )
                  }
                  disabled={isSaving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="medium-notes">Notes</Label>
              <Input
                id="medium-notes"
                value={editing?.values.notes ?? ''}
                onChange={event =>
                  setEditing(current =>
                    current
                      ? { ...current, values: { ...current.values, notes: event.target.value } }
                      : current
                  )
                }
                disabled={isSaving}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditor}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || !editing?.values.name.trim()}>
                {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
