import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE_VALUE = '__none__';

interface ColoringTaxonomyOption {
  id: string;
  name: string;
}

interface ColoringTaxonomySelectProps {
  id: string;
  label: string;
  value?: string;
  options: ColoringTaxonomyOption[];
  disabled?: boolean;
  placeholder: string;
  createTitle: string;
  createDescription?: string;
  createLabel: string;
  onChange: (value: string) => void;
  onCreate: (name: string) => Promise<ColoringTaxonomyOption>;
}

export function ColoringTaxonomySelect({
  id,
  label,
  value = '',
  options,
  disabled = false,
  placeholder,
  createTitle,
  createDescription,
  createLabel,
  onChange,
  onCreate,
}: ColoringTaxonomySelectProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const creationSessionRef = useRef(0);
  /** Holds options created inline until the parent query list includes them. */
  const [pendingCreated, setPendingCreated] = useState<ColoringTaxonomyOption[]>([]);

  useEffect(() => {
    setPendingCreated(previous => {
      if (previous.length === 0) return previous;

      const knownIds = new Set(options.map(option => option.id));
      const next = previous.filter(option => !knownIds.has(option.id));

      return next.length === previous.length ? previous : next;
    });
  }, [options]);

  useEffect(
    () => () => {
      creationSessionRef.current += 1;
    },
    []
  );

  const displayOptions = useMemo(() => {
    const byId = new Map<string, ColoringTaxonomyOption>();
    for (const option of options) byId.set(option.id, option);
    for (const option of pendingCreated) {
      if (!byId.has(option.id)) byId.set(option.id, option);
    }
    return Array.from(byId.values());
  }, [options, pendingCreated]);

  const handleDialogOpenChange = (open: boolean) => {
    creationSessionRef.current += 1;
    if (open) setNewName('');
    setIsDialogOpen(open);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isCreatingRef.current) return;

    const trimmed = newName.trim();
    if (!trimmed) return;

    isCreatingRef.current = true;
    const creationSession = creationSessionRef.current;
    setIsCreating(true);
    try {
      const created = await onCreate(trimmed);
      if (creationSession !== creationSessionRef.current) return;
      setPendingCreated(previous => [...previous, { id: created.id, name: created.name }]);
      onChange(created.id);
      setNewName('');
      handleDialogOpenChange(false);
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Select
          value={value || NONE_VALUE}
          onValueChange={next => onChange(next === NONE_VALUE ? '' : next)}
          disabled={disabled || isCreating}
        >
          <SelectTrigger id={id} className="min-w-0 flex-1 pointer-coarse:h-11" aria-label={label}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{placeholder}</SelectItem>
            {displayOptions.map(option => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon-touch"
          onClick={() => handleDialogOpenChange(true)}
          disabled={disabled}
          aria-label={createLabel}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createTitle}</DialogTitle>
            {createDescription ? <DialogDescription>{createDescription}</DialogDescription> : null}
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id}-new-name`}>Name</Label>
              <Input
                id={`${id}-new-name`}
                value={newName}
                onChange={event => setNewName(event.target.value)}
                disabled={disabled}
                className="pointer-coarse:h-11"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="pointer-coarse:min-h-11"
                onClick={() => handleDialogOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="pointer-coarse:min-h-11"
                disabled={disabled || !newName.trim() || isCreating}
              >
                {isCreating && <Loader2 className="mr-2 size-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
