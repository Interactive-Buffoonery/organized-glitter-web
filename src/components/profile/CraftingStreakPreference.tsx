import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStreakMode } from '@/features/crafting-streak/useStreakMode';
import type { StreakMode } from '@/features/crafting-streak/preference';

export function CraftingStreakPreference() {
  const { mode, setMode } = useStreakMode();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span id="crafting-streak-label" className="text-sm font-medium">
            Crafting streak
          </span>
          <span className="border-primary/40 text-primary rounded-sm border px-1.5 py-px font-mono text-[10px] leading-4 font-semibold tracking-wider uppercase">
            Beta
          </span>
        </div>
        <p id="crafting-streak-description" className="text-muted-foreground text-sm">
          Lets you track your consecutive crafting days!
        </p>
      </div>
      <Select value={mode} onValueChange={value => setMode(value as StreakMode)}>
        <SelectTrigger
          aria-labelledby="crafting-streak-label"
          aria-describedby="crafting-streak-description"
          className="min-h-11 w-full sm:w-48"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="off">Off</SelectItem>
          <SelectItem value="home">Show on Home</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
