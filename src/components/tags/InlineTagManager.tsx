import { notify } from '@/lib/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback, useEffectEvent, useRef } from 'react';
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
import { Plus, Hash } from 'lucide-react';
import { TagBadge } from './TagBadge';
import { TagService } from '@/services/pocketbase/tags.service';
import { Tag } from '@/types/tag';

import { cn } from '@/lib/utils';
import { logger } from '@/utils/logger';
import { invalidateStatsQueries } from '@/hooks/mutations/statsInvalidation';

const EMPTY_INITIAL_TAGS: Tag[] = [];

interface InlineTagManagerProps {
  projectId?: string | null | undefined;
  initialTags?: Tag[];
  onTagsChange?: (tags: Tag[]) => void;
  className?: string;
  maxTags?: number;
}

export function InlineTagManager({
  projectId,
  initialTags = EMPTY_INITIAL_TAGS,
  onTagsChange,
  className,
  maxTags = 10,
}: InlineTagManagerProps) {
  const queryClient = useQueryClient();
  const [projectTags, setProjectTags] = useState<Tag[]>(initialTags);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Define loadAvailableTags before using it in useEffect
  const loadAvailableTags = useEffectEvent(async () => {
    try {
      const response = await TagService.getUserTags({ search: searchQuery });
      if (response.status === 'success') {
        setAvailableTags(response.data);
      } else {
        // Handle service-level errors (response.status === 'error')
        notify({
          kind: 'error',
          title: 'Tag load failed',
          description: response.error?.message || 'Failed to load tags. Please try again.',
        });
        // Don't clear existing availableTags state to preserve previous suggestions
      }
    } catch (error) {
      // Handle unexpected errors (network issues, etc.)
      logger.error('Error loading available tags:', { error });
      notify({
        kind: 'error',
        title: 'Tag load failed',
        description: 'Failed to load tags. Please try again.',
      });
      // Don't clear existing availableTags state to preserve previous suggestions
    }
  });

  // Bubble tag changes up to the parent via a stable ref to onTagsChange.
  // Calling onTagsChange from a useEffect keyed on `projectTags` + `onTagsChange`
  // creates an infinite feedback loop under React 19 when the parent derives
  // `onTagsChange` from an unstable closure: every bubble re-renders the parent,
  // which re-creates onTagsChange, which re-fires the effect. Instead, route
  // each mutation through a helper that updates local state AND notifies the
  // parent exactly once.
  //
  // The helper takes an already-resolved next array (not a state updater) so
  // that the parent notification stays outside the setState callback. State
  // updater functions can be replayed by React (StrictMode, concurrent
  // rendering), and side effects inside them run once per replay, which
  // would double-fire onTagsChange on every mutation.
  const onTagsChangeRef = useRef(onTagsChange);
  useEffect(() => {
    onTagsChangeRef.current = onTagsChange;
  }, [onTagsChange]);

  const updateProjectTags = useCallback((nextTags: Tag[]) => {
    setProjectTags(nextTags);
    onTagsChangeRef.current?.(nextTags);
  }, []);

  // Load available tags with debouncing
  useEffect(() => {
    if (isOpen) {
      // Clear existing timeout
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      // Set new timeout for debounced search
      debounceTimeoutRef.current = setTimeout(
        () => {
          loadAvailableTags();
        },
        searchQuery ? 300 : 0
      ); // 300ms delay for search, immediate for initial load
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- useEffectEvent callbacks are intentionally omitted from dependencies.
  }, [isOpen, searchQuery]);

  // Filter suggestions (exclude already selected tags)
  const suggestions = availableTags.filter(tag => !projectTags.some(pt => pt.id === tag.id));

  const handleAddTag = async (tag: Tag) => {
    if (projectTags.length >= maxTags) {
      notify({
        kind: 'error',
        title: 'Tag Limit Reached',
        description: `You can add up to ${maxTags} tags per project.`,
      });
      return;
    }

    setIsLoading(true);

    // Optimistic update - capture state before update for potential revert
    const originalTagsSnapshot = projectTags;
    const optimisticTags = [...originalTagsSnapshot, tag];
    updateProjectTags(optimisticTags);

    // Only call service if projectId is valid (i.e., for existing projects)
    if (projectId) {
      try {
        const response = await TagService.addTagToProject(projectId, tag.id);

        if (response.status === 'error') {
          // Revert optimistic update if service call failed
          updateProjectTags(originalTagsSnapshot);
          notify({
            kind: 'error',
            title: 'Add tag failed',
            description: 'Failed to add tag to project. Please try again.',
          });
        } else {
          invalidateStatsQueries(queryClient, 'diamond');
          // Success - no need for toast, operation was successful
          // Tag synchronization on save provides additional safety
        }
      } catch (error) {
        // Handle unexpected errors (network issues, service exceptions, etc.)
        logger.error('Error adding tag to project:', { error });
        // Revert optimistic update if service call threw an exception
        updateProjectTags(originalTagsSnapshot);

        // Check if this is an auto-cancellation error
        const errorMessage = error instanceof Error ? error.message : '';
        const isCancelledError =
          errorMessage.includes('autocancelled') || errorMessage.includes('cancelled');

        if (isCancelledError) {
          notify({
            kind: 'info',
            title: 'Tag will be saved with project',
            description:
              'The tag operation was cancelled due to rapid changes, but it will be properly saved when you save the project.',
          });
          // Keep the tag in the UI since it will be saved with the project.
          // We just reverted to `originalTagsSnapshot`, so re-apply the add
          // on top of that known state.
          updateProjectTags([...originalTagsSnapshot, tag]);
        } else {
          notify({
            kind: 'error',
            title: 'Failed to add tag',
            description:
              'The tag is visible but may not be saved. It will be synchronized when you save the project.',
          });
        }
      }
    }
    // For new projects (no projectId), tags are managed locally and will be saved when project is created

    setIsLoading(false);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleCreateAndAddTag = async () => {
    if (!searchQuery.trim()) return;

    // Prevent multiple rapid calls
    if (isCreating) {
      return;
    }

    // Check character limit (100 characters max as per database constraint)
    if (searchQuery.trim().length > 100) {
      notify({
        kind: 'error',
        title: 'Tag name too long',
        description: 'Tag names must be 100 characters or less.',
      });
      return;
    }

    // Check if tag name already exists in current project tags (case-insensitive)
    const trimmedQuery = searchQuery.trim();
    const existsInProject = projectTags.some(
      tag => tag.name.toLowerCase() === trimmedQuery.toLowerCase()
    );

    if (existsInProject) {
      notify({
        kind: 'error',
        title: 'Tag already added',
        description: 'This tag is already added to the project.',
      });
      setSearchQuery('');
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setIsCreating(true);

    // Set default color to teal (#14b8a6) for new tags created on project pages
    const createResponse = await TagService.createTag({
      name: trimmedQuery,
      color: '#14b8a6', // Use teal as the default color
    });

    if (createResponse.status === 'success') {
      await handleAddTag(createResponse.data);
      setAvailableTags(prev => [...prev, createResponse.data]);
    } else {
      notify({
        kind: 'error',
        title: 'Tag creation failed',
        description: createResponse.error?.message || 'Failed to create tag. Please try again.',
      });
    }

    setIsLoading(false);
    setIsCreating(false);
  };

  const handleRemoveTag = async (tagToRemove: Tag) => {
    setIsLoading(true);

    // Optimistic update - capture state before update for potential revert
    const originalTagsSnapshot = projectTags;
    updateProjectTags(originalTagsSnapshot.filter(t => t.id !== tagToRemove.id));

    // Only call service if projectId is valid
    if (projectId) {
      try {
        const response = await TagService.removeTagFromProject(projectId, tagToRemove.id);

        if (response.status === 'error') {
          // Revert optimistic update if service call failed
          updateProjectTags(originalTagsSnapshot);
          notify({
            kind: 'error',
            title: 'Remove tag failed',
            description: 'Failed to remove tag from project. Please try again.',
          });
        } else {
          invalidateStatsQueries(queryClient, 'diamond');
          // Success - no need for toast, operation was successful
          // Tag synchronization on save provides additional safety
        }
      } catch (error) {
        logger.error('Error removing tag from project:', { error });
        // Revert optimistic update if service call threw an exception
        updateProjectTags(originalTagsSnapshot);

        // Check if this is an auto-cancellation error
        const errorMessage = error instanceof Error ? error.message : '';
        const isCancelledError =
          errorMessage.includes('autocancelled') || errorMessage.includes('cancelled');

        if (isCancelledError) {
          notify({
            kind: 'info',
            title: 'Tag removal will be saved with project',
            description:
              'The tag removal was cancelled due to rapid changes, but will be properly saved when you save the project.',
          });
          // Don't revert the UI since the change will be saved with the project
        } else {
          notify({
            kind: 'error',
            title: 'Failed to remove tag',
            description:
              'The tag appears removed but may not be saved. It will be synchronized when you save the project.',
          });
        }
      }
    }
    // For new projects, tags are managed locally and will be saved when project is created

    setIsLoading(false);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Current Tags */}
      {projectTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {projectTags.map((tag, index) => (
            <TagBadge
              key={tag?.id || `temp-tag-${index}`}
              tag={tag}
              removable
              onRemove={() => handleRemoveTag(tag)}
            />
          ))}
        </div>
      )}

      {/* Add Tag Interface */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-muted-foreground h-8 border-dashed text-xs"
            disabled={isLoading || projectTags.length >= maxTags}
          >
            <Plus className="mr-1 size-3" />
            Add tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <div className="relative">
              <CommandInput
                placeholder="Search or create tags..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                onKeyDown={e => {
                  // Prevent the popover from closing when space is pressed
                  if (e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
              />

              {/* Character count indicator */}
              {searchQuery.length > 0 && (
                <div
                  className={`absolute top-1/2 right-2 -translate-y-1/2 transform text-xs ${
                    searchQuery.length > 100 ? 'text-destructive-text' : 'text-muted-foreground'
                  }`}
                >
                  {searchQuery.length}/100
                </div>
              )}
            </div>
            <CommandList>
              {suggestions.length > 0 && (
                <CommandGroup heading="Existing Tags">
                  {suggestions.map(tag => (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => handleAddTag(tag)}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <div className="size-3 rounded-full" style={{ backgroundColor: tag.color }} />

                      {tag.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {searchQuery.trim() &&
                !suggestions.some(tag => tag.name.toLowerCase() === searchQuery.toLowerCase()) && (
                  <CommandGroup heading="Create New">
                    <CommandItem
                      key="create-new-tag-command-item"
                      onSelect={handleCreateAndAddTag}
                      className={`flex cursor-pointer items-center gap-2 ${
                        searchQuery.trim().length > 100 || isCreating
                          ? 'cursor-not-allowed opacity-50'
                          : ''
                      }`}
                      disabled={searchQuery.trim().length > 100 || isCreating}
                    >
                      <Hash className="size-3" />
                      <span className="truncate">
                        Create "
                        {searchQuery.trim().length > 20
                          ? searchQuery.trim().substring(0, 20) + '...'
                          : searchQuery.trim()}
                        "
                      </span>
                      {searchQuery.trim().length > 100 && (
                        <span className="text-destructive-text ml-auto text-xs">Too long</span>
                      )}
                    </CommandItem>
                  </CommandGroup>
                )}

              {suggestions.length === 0 && !searchQuery.trim() && (
                <CommandEmpty>No tags found. Start typing to create one.</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
