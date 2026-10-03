import React, { useState, useMemo, useCallback, useEffect } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';
import { logger } from '@/utils/logger';
import FormField from './FormField';

interface EntitySelectExtraField {
  id: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'url';
}

const NO_SELECTION_VALUE = '__none__';
const EMPTY_OPTIONS: string[] = [];
const EMPTY_EXTRA_FIELDS: EntitySelectExtraField[] = [];

interface EntitySelectPreset {
  value: string;
  label: string;
}

export interface EntitySelectProps<TCreateData, TResult extends { name: string }> {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  disabled?: boolean;
  error?: string;
  onEntityAdded?: (newName: string) => Promise<void> | void;
  createDraft?: (data: TCreateData) => void;

  entityName: string;
  entityLabel: string;
  placeholder: string;
  presets: EntitySelectPreset[];
  emptyOptionLabel: string;
  triggerButtonSize?: 'sm' | 'icon';

  dialogTitle: string;
  dialogDescription: string;
  submitLabel: string;

  useCreateMutation: () => UseMutationResult<TResult, Error, TCreateData>;
  buildCreatePayload: (name: string, extras: Record<string, string>) => TCreateData;
  extraFields?: EntitySelectExtraField[];
}

function EntitySelectInner<TCreateData, TResult extends { name: string }>({
  value,
  onChange,
  options = EMPTY_OPTIONS,
  disabled = false,
  error,
  onEntityAdded,
  createDraft,
  entityName,
  entityLabel,
  placeholder,
  presets,
  emptyOptionLabel,
  triggerButtonSize = 'sm',
  dialogTitle,
  dialogDescription,
  submitLabel,
  useCreateMutation,
  buildCreatePayload,
  extraFields = EMPTY_EXTRA_FIELDS,
}: EntitySelectProps<TCreateData, TResult>) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [createdOptions, setCreatedOptions] = useState<string[]>([]);
  const mutation = useCreateMutation();

  useEffect(() => {
    setCreatedOptions(prev => {
      if (!prev.length) return prev;
      const canonical = new Set(options.map(o => o.toLowerCase().trim()));
      const next = prev.filter(c => !canonical.has(c.toLowerCase().trim()));
      return next.length === prev.length ? prev : next;
    });
  }, [options]);

  const isDisabled = useMemo(() => disabled || mutation.isPending, [disabled, mutation.isPending]);

  const normalizedOptions = useMemo(() => {
    if (!Array.isArray(options)) {
      logger.warn(`${entityLabel}Select received invalid options list:`, { options });
      return [];
    }
    return [...options, ...createdOptions].reduce<string[]>((normalized, option) => {
      if (option && typeof option === 'string') {
        normalized.push(option.toLowerCase().trim());
      }
      return normalized;
    }, []);
  }, [options, createdOptions, entityLabel]);

  const deduplicatedOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const o of [...options, ...createdOptions]) {
      if (o && typeof o === 'string') {
        const n = o.toLowerCase().trim();
        if (!seen.has(n)) {
          seen.add(n);
          out.push(o);
        }
      }
    }
    return out;
  }, [options, createdOptions]);

  const resetForm = useCallback(() => {
    setNewName('');
    setExtras({});
  }, []);

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (mutation.isPending) return;

      const name = newName.trim();
      if (!name) return;

      if (normalizedOptions.includes(name.toLowerCase())) return;

      const payload = buildCreatePayload(name, extras);
      if (createDraft) {
        createDraft(payload);
        setCreatedOptions(current => [...current, name]);
        onChange(name);
        resetForm();
        setIsDialogOpen(false);
        return;
      }

      mutation.mutate(payload, {
        onSuccess: created => {
          setCreatedOptions(current => [...current, created.name]);
          onChange(created.name);
          if (onEntityAdded) onEntityAdded(created.name);
          resetForm();
          setIsDialogOpen(false);
        },
      });
    },
    [
      mutation,
      createDraft,
      newName,
      extras,
      normalizedOptions,
      onChange,
      onEntityAdded,
      buildCreatePayload,
      resetForm,
    ]
  );

  return (
    <>
      <FormField id={entityName} label={entityLabel} error={error}>
        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              value={value || NO_SELECTION_VALUE}
              onValueChange={next => onChange(next === NO_SELECTION_VALUE ? '' : next)}
              disabled={isDisabled}
            >
              <SelectTrigger
                id={entityName}
                className="bg-background dark:text-foreground w-full"
                disabled={isDisabled}
                aria-label={entityLabel}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? `${entityName}-error` : undefined}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground">
                <SelectItem value={NO_SELECTION_VALUE}>{placeholder}</SelectItem>
                {presets.map(p => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                {deduplicatedOptions.length > 0 ? (
                  deduplicatedOptions.map(o => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={`no-${entityName}`} disabled>
                    {emptyOptionLabel}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size={triggerButtonSize}
            className={triggerButtonSize === 'sm' ? 'ml-2' : undefined}
            disabled={isDisabled}
            aria-label={`Add ${entityLabel}`}
            onClick={e => {
              e.stopPropagation();
              setIsDialogOpen(true);
            }}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </FormField>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAdd}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor={`new-${entityName}-name`}>{entityLabel} Name</Label>
                <Input
                  id={`new-${entityName}-name`}
                  placeholder={`Enter ${entityLabel.toLowerCase()} name`}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  disabled={mutation.isPending}
                  className="bg-background dark:text-foreground"
                />
              </div>

              {extraFields.map(f => (
                <div key={f.id} className="space-y-2">
                  <Label htmlFor={`new-${entityName}-${f.id}`}>{f.label}</Label>
                  <Input
                    id={`new-${entityName}-${f.id}`}
                    placeholder={f.placeholder}
                    value={extras[f.id] ?? ''}
                    onChange={e => setExtras(prev => ({ ...prev, [f.id]: e.target.value }))}
                    disabled={mutation.isPending}
                    type={f.type ?? 'text'}
                    className="bg-background dark:text-foreground"
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const EntitySelect = React.memo(EntitySelectInner) as typeof EntitySelectInner;
