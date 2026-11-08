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
        <span id="crafting-streak-label" className="text-sm font-medium">
          Crafting streak
        </span>
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
          <SelectItem value="notes">Show in Notes</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
