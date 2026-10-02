import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Hash, Plus } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { TagBadge } from '@/components/tags/TagBadge';
import { notify } from '@/lib/notifications';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { ColoringTagService } from '@/services/pocketbase/coloringTags.service';
import type { Tag } from '@/types/tag';
import { Section } from './ColoringBookFormPrimitives';

interface ColoringBookTagManagerProps {
  selectedTags: Tag[];
  disabled?: boolean;
  onTagsChange: (tags: Tag[]) => void;
  withSection?: boolean;
  emptyText?: string;
}

export function ColoringBookTagManager({
  selectedTags,
  disabled = false,
  onTagsChange,
  withSection = true,
  emptyText,
}: ColoringBookTagManagerProps) {
  const queryClient = useQueryClient();
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const loadTags = useCallback(async () => {
    const response = await ColoringTagService.listColoringTags({ search: searchQuery });
    if (response.status === 'success') {
      const byId = new Map([...response.data, ...selectedTags].map(tag => [tag.id, tag]));
      setAvailableTags(Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name)));
      return;
    }

    notify({
      kind: 'error',
      title: 'Tag load failed',
      description: response.error?.message || 'Could not load tags.',
    });
  }, [searchQuery, selectedTags]);

  useEffect(() => {
    if (isOpen) void loadTags();
  }, [isOpen, loadTags]);

  const suggestions = useMemo(
    () => availableTags.filter(tag => !selectedTags.some(selected => selected.id === tag.id)),
    [availableTags, selectedTags]
  );

  const setTags = (nextTags: Tag[]) => {
    onTagsChange(nextTags);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleAddTag = (tag: Tag) => {
    if (selectedTags.some(selected => selected.id === tag.id)) {
      setSearchQuery('');
      setIsOpen(false);
      return;
    }
    setTags([...selectedTags, tag]);
  };

  const handleRemoveTag = (tagToRemove: Tag) => {
    onTagsChange(selectedTags.filter(tag => tag.id !== tagToRemove.id));
  };

  const handleCreateAndAddTag = async () => {
    const trimmedName = searchQuery.trim();
    if (!trimmedName || isCreating) return;

    if (selectedTags.some(tag => tag.name.toLowerCase() === trimmedName.toLowerCase())) {
      notify({
        kind: 'error',
        title: 'Tag already added',
        description: 'This tag is already added to the coloring book.',
      });
      setSearchQuery('');
      setIsOpen(false);
      return;
    }

    setIsCreating(true);
    const response = await ColoringTagService.createColoringTag({ name: trimmedName });
    if (response.status === 'success') {
      await queryClient.invalidateQueries({ queryKey: queryKeys.coloring.tags.all });
      setAvailableTags(current =>
        [...current.filter(tag => tag.id !== response.data.id), response.data].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setTags([...selectedTags, response.data]);
      setIsCreating(false);
      return;
    }

    notify({
      kind: 'error',
      title: 'Tag creation failed',
      description: response.error?.message || 'Could not create tag.',
    });
    setIsCreating(false);
  };

  const content = (
    <div className="space-y-2">
      {selectedTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map(tag => (
            <TagBadge
              key={tag.id}
              tag={tag}
              removable={!disabled}
              onRemove={() => handleRemoveTag(tag)}
            />
          ))}
        </div>
      ) : emptyText ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : null}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground h-8 border-dashed text-xs"
            disabled={disabled}
          >
            <Plus className="mr-1 size-3" />
            Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search or create tags..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              onKeyDown={event => {
                if (event.key === ' ') event.stopPropagation();
              }}
            />
            <CommandList>
              {suggestions.length > 0 ? (
                <CommandGroup heading="Existing Tags">
                  {suggestions.map(tag => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => handleAddTag(tag)}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                        aria-hidden="true"
                      />
                      {tag.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}

              {searchQuery.trim() &&
              !suggestions.some(tag => tag.name.toLowerCase() === searchQuery.toLowerCase()) ? (
                <CommandGroup heading="Create New">
                  <CommandItem
                    key="create-new-coloring-tag-command-item"
                    onSelect={() => void handleCreateAndAddTag()}
                    className="flex cursor-pointer items-center gap-2"
                    disabled={isCreating}
                  >
                    <Hash className="size-3" />
                    <span className="truncate">
                      Create "
                      {searchQuery.trim().length > 20
                        ? `${searchQuery.trim().substring(0, 20)}...`
                        : searchQuery.trim()}
                      "
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}

              {suggestions.length === 0 && !searchQuery.trim() ? (
                <CommandEmpty>No tags found. Start typing to create one.</CommandEmpty>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  if (!withSection) return content;

  return <Section label="Tags">{content}</Section>;
}
