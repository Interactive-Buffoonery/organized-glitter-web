/**
 * Artist Management Table Component
 * @author @serabi
 * @created 2025-01-09
 */

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Trash2, FileText, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';
import { useDeleteArtist } from '@/hooks/mutations/useArtistMutations';
import { useArtistProjectCounts } from '@/hooks/queries/useArtistProjectCounts';
import EditArtistDialog from './EditArtistDialog';
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

/**
 * Props interface for the ArtistTable component
 */
interface ArtistTableProps {
  artists: ArtistListItem[];
  loading: boolean;
}

/**
 * ArtistTable Component
 *
 * Renders a data table displaying user artists with management functionality.
 * Features include editing capabilities and secure deletion.
 */
const ArtistTable = ({ artists, loading }: ArtistTableProps) => {
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [artistToDelete, setArtistToDelete] = useState<ArtistListItem | null>(null);
  const deleteArtistMutation = useDeleteArtist();
  const projectCounts = useArtistProjectCounts();

  const handleDeleteArtist = (artist: ArtistListItem) => {
    setArtistToDelete(artist);
    setShowDeleteConfirmDialog(true);
  };

  const confirmDeleteArtist = async () => {
    if (!artistToDelete) return;

    deleteArtistMutation.mutate(
      { id: artistToDelete.id },
      {
        onSuccess: () => {
          setShowDeleteConfirmDialog(false);
          setArtistToDelete(null);
        },
      }
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="text-primary size-8 animate-spin" />
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">You haven't added any artists yet.</p>
      </div>
    );
  }

  return (
    <>
      {projectCounts.isError ? (
        <div
          className="border-border bg-muted/30 mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          role="alert"
        >
          <span className="text-muted-foreground text-sm">Project counts are unavailable.</span>
          <Button type="button" variant="outline" size="sm" onClick={() => projectCounts.refetch()}>
            Retry project counts
          </Button>
        </div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Artist Name</TableHead>
            <TableHead>Projects</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {artists.map(artist => (
            <TableRow key={artist.id}>
              <TableCell className="font-medium">{artist.name}</TableCell>
              <TableCell>
                {projectCounts.isLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : projectCounts.isError ? (
                  <span className="text-muted-foreground text-sm">Unavailable</span>
                ) : projectCounts.data?.[artist.id] ? (
                  <Link
                    to={`/dashboard?artist=${encodeURIComponent(artist.id)}`}
                    className="text-link flex items-center hover:underline"
                  >
                    <FileText className="mr-1 size-4" />
                    {projectCounts.data[artist.id]}{' '}
                    {projectCounts.data[artist.id] === 1 ? 'project' : 'projects'}
                  </Link>
                ) : (
                  <span className="text-muted-foreground text-sm">No projects</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-x-1">
                  <EditArtistDialog artist={artist} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteArtist(artist)}
                    className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {artistToDelete && (
        <AlertDialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes "{artistToDelete.name}". An artist that is still used by a
                project cannot be deleted; remove it from those projects first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setArtistToDelete(null);
                  setShowDeleteConfirmDialog(false);
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteArtist}
                disabled={deleteArtistMutation.isPending}
              >
                {deleteArtistMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
};

export default ArtistTable;
