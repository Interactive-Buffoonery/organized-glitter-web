import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TagOption {
  label: string;
  value: string;
}

interface MultiSelectItemLabel {
  singular: string;
  plural: string;
}

const DEFAULT_ITEM_LABEL: MultiSelectItemLabel = { singular: 'tag', plural: 'tags' };

interface TagMultiSelectFilterProps {
  label: string;
  options: TagOption[];
  selectedValues: string[];
  onChange: (selectedValues: string[]) => void;
  placeholder?: string;
  inline?: boolean;
  itemLabel?: MultiSelectItemLabel;
}

const getTriggerLabel = (
  selectedValues: string[],
  optionsByValue: Map<string, string>,
  placeholder: string,
  itemPlural: string
) => {
  if (selectedValues.length === 0) {
    return placeholder;
  }

  const selectedLabels = selectedValues.map(value => optionsByValue.get(value) || value);

  if (selectedLabels.length <= 2) {
    return selectedLabels.join(', ');
  }

  return `${selectedLabels.length} ${itemPlural} selected`;
};

const TagMultiSelectFilter = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder,
  inline = false,
  itemLabel = DEFAULT_ITEM_LABEL,
}: TagMultiSelectFilterProps) => {
  const resolvedPlaceholder = placeholder ?? `All ${itemLabel.plural}`;
  const optionIdPrefix = React.useId();
  const [inlineOpen, setInlineOpen] = React.useState(false);
  const optionsByValue = React.useMemo(
    () => new Map(options.map(option => [option.value, option.label])),
    [options]
  );

  const triggerLabel = React.useMemo(
    () => getTriggerLabel(selectedValues, optionsByValue, resolvedPlaceholder, itemLabel.plural),
    [selectedValues, optionsByValue, resolvedPlaceholder, itemLabel.plural]
  );

  const handleCheckedChange = React.useCallback(
    (value: string, checked: boolean) => {
      if (checked) {
        onChange(selectedValues.includes(value) ? selectedValues : [...selectedValues, value]);
        return;
      }

      onChange(selectedValues.filter(selectedValue => selectedValue !== value));
    },
    [onChange, selectedValues]
  );

  const clearTags = React.useCallback(() => {
    onChange([]);
  }, [onChange]);

  const renderTagOptions = React.useCallback(
    (maxHeightClassName: string) => (
      <div className={cn('overflow-y-auto overscroll-contain', maxHeightClassName)}>
        {options.length === 0 ? (
          <p className="text-muted-foreground px-3 py-2 text-sm">No {itemLabel.plural} available</p>
        ) : (
          <div className="space-y-1 p-1">
            {options.map(option => {
              const checkboxId = `${optionIdPrefix}-${option.value}`;

              return (
                <label
                  key={option.value}
                  htmlFor={checkboxId}
                  className="hover:bg-muted/60 active:bg-muted flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2.5 py-2 text-sm transition-colors"
                >
                  <Checkbox
                    id={checkboxId}
                    checked={selectedValues.includes(option.value)}
                    onCheckedChange={checked => handleCheckedChange(option.value, Boolean(checked))}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    ),
    [handleCheckedChange, itemLabel.plural, optionIdPrefix, options, selectedValues]
  );

  if (inline) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{label}</h3>

        <div className="bg-background overflow-hidden rounded-md border">
          {inlineOpen && (
            <div className="border-b" data-testid="tag-multi-select-panel">
              <div className="flex items-center justify-between gap-3 px-3 py-2">
                <p className="text-muted-foreground text-xs">
                  {selectedValues.length === 0
                    ? `Choose one or more ${itemLabel.plural}`
                    : `${selectedValues.length} ${selectedValues.length === 1 ? itemLabel.singular : itemLabel.plural} selected`}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={selectedValues.length === 0}
                  onClick={clearTags}
                >
                  Clear
                </Button>
              </div>
              {renderTagOptions('max-h-[min(20rem,40dvh)]')}
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 w-full justify-between rounded-none px-3 py-2 text-left font-normal hover:bg-transparent"
            aria-expanded={inlineOpen}
            aria-label={
              selectedValues.length > 0
                ? `${label} filter. ${selectedValues.length} ${itemLabel.plural} selected.`
                : `${label} filter. No ${itemLabel.plural} selected.`
            }
            data-testid="tag-multi-select-trigger"
            onClick={() => setInlineOpen(open => !open)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-3">
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  selectedValues.length === 0 && 'text-muted-foreground'
                )}
              >
                {triggerLabel}
              </span>
              {selectedValues.length > 1 && (
                <Badge variant="secondary">{selectedValues.length}</Badge>
              )}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('shrink-0 transition-transform', inlineOpen && 'rotate-180')}
            />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{label}</h3>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="bg-background w-full justify-between text-left font-normal"
            aria-label={
              selectedValues.length > 0
                ? `${label} filter. ${selectedValues.length} ${itemLabel.plural} selected.`
                : `${label} filter. No ${itemLabel.plural} selected.`
            }
            data-testid="tag-multi-select-trigger"
          >
            <span
              className={cn('truncate', selectedValues.length === 0 && 'text-muted-foreground')}
            >
              {triggerLabel}
            </span>
            <span className="flex items-center gap-2">
              {selectedValues.length > 1 && (
                <Badge variant="secondary">{selectedValues.length}</Badge>
              )}
              <ChevronDown aria-hidden="true" />
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-[min(calc(100vw-2rem),var(--radix-popover-trigger-width))] min-w-56 p-0"
        >
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <h4 className="text-sm font-semibold">{label}</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selectedValues.length === 0}
              onClick={clearTags}
            >
              Clear
            </Button>
          </div>
          {renderTagOptions('max-h-[min(20rem,50vh)]')}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default React.memo(TagMultiSelectFilter);
