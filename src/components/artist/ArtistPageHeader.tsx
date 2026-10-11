import { notify } from '@/lib/notifications';

/**
 * Artist Page Header Component
 * @author @serabi
 * @created 2025-01-09
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ManageListHeader } from '@/components/manage-lists/ManageListsLayout';
import { useCreateArtist } from '@/hooks/mutations/useArtistMutations';
import type { ArtistListItem } from '@/services/pocketbase/artists.service';

/**
 * Props interface for the ArtistPageHeader component
 */
interface ArtistPageHeaderProps {
  artists: ArtistListItem[];
}

/**
 * ArtistPageHeader Component
 *
 * Renders the header section for the Artist page including breadcrumbs,
 * title, and "Add Artist" dialog functionality.
 */
const ArtistPageHeader = ({ artists }: ArtistPageHeaderProps) => {
  const [newArtistName, setNewArtistName] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createArtistMutation = useCreateArtist();

  const handleAddArtist = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newArtistName.trim()) {
        notify({
          kind: 'error',
          title: 'Artist name required',
          description: 'Artist name cannot be empty',
        });
        return;
      }

      // Check if artist already exists (client-side check)
      const artistNameLower = newArtistName.trim().toLowerCase();
      const existingArtist = artists.find(artist => artist.name.toLowerCase() === artistNameLower);

      if (existingArtist) {
        notify({
          kind: 'error',
          title: 'Artist already exists',
          description: 'An artist with this name already exists',
        });
        return;
      }

      // Create artist using React Query mutation
      createArtistMutation.mutate(
        { name: newArtistName.trim() },
        {
          onSuccess: () => {
            // Reset form and close dialog
            setNewArtistName('');
            setIsDialogOpen(false);
          },
        }
      );
    },
    [newArtistName, artists, createArtistMutation]
  );

  return (
    <ManageListHeader
      title="Artists"
      action={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="glass">
              <Plus className="mr-2 size-4" />
              Add artist
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add artist</DialogTitle>
              <DialogDescription>
                Enter the name of the diamond painting artist you want to add to your list.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddArtist}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="artist-name">Artist Name</Label>
                  <Input
                    id="artist-name"
                    placeholder="Enter artist name"
                    value={newArtistName}
                    onChange={e => setNewArtistName(e.target.value)}
                    disabled={createArtistMutation.isPending}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" variant="glass" disabled={createArtistMutation.isPending}>
                  {createArtistMutation.isPending && (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  )}
                  Add artist
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    />
  );
};

export default React.memo(ArtistPageHeader);
