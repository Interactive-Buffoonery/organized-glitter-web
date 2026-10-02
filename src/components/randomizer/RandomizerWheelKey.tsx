import { useState } from 'react';
import { ListOrdered } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { RandomizerTarget } from '@/types/randomizer';

import {
  formatWedgeNumber,
  getRandomizerWheelLabelMode,
  type RandomizerWheelLabelMode,
} from './randomizerWheelGeometry';

interface RandomizerWheelKeyProps {
  targets: RandomizerTarget[];
  getColor: (targetId: string) => string;
  isMobile: boolean;
  labelMode?: RandomizerWheelLabelMode;
}

const RANDOMIZER_WHEEL_KEY_TRIGGER = (
  <Button
    type="button"
    variant="outline"
    size="lg"
    className="gap-2 px-4 py-3 text-lg font-semibold"
    aria-label="Open wheel key"
  >
    <ListOrdered className="size-5" aria-hidden="true" />
    Key
  </Button>
);

export function RandomizerWheelKey({
  targets,
  getColor,
  isMobile,
  labelMode = getRandomizerWheelLabelMode(targets.length, isMobile),
}: RandomizerWheelKeyProps) {
  if (labelMode !== 'number') {
    return null;
  }

  if (isMobile) {
    return <MobileRandomizerWheelKey targets={targets} getColor={getColor} />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>{RANDOMIZER_WHEEL_KEY_TRIGGER}</PopoverTrigger>
      <PopoverContent align="center" className="max-h-[min(28rem,70vh)] w-80 overflow-y-auto p-0">
        <RandomizerWheelKeyContent targets={targets} getColor={getColor} />
      </PopoverContent>
    </Popover>
  );
}

function MobileRandomizerWheelKey({
  targets,
  getColor,
}: Pick<RandomizerWheelKeyProps, 'targets' | 'getColor'>) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="gap-2 px-4 py-3 text-lg font-semibold"
        aria-label="Open wheel key"
        onClick={() => setOpen(true)}
      >
        <ListOrdered className="size-5" aria-hidden="true" />
        Key
      </Button>
      <RandomizerWheelKeyDrawerContent targets={targets} getColor={getColor} />
    </Drawer>
  );
}

function RandomizerWheelKeyDrawerContent({
  targets,
  getColor,
}: Pick<RandomizerWheelKeyProps, 'targets' | 'getColor'>) {
  return (
    <DrawerContent className="max-h-[80vh]">
      <div className="border-border border-b px-4 pt-4 pb-3">
        <DrawerTitle>Wheel key</DrawerTitle>
        <DrawerDescription>Selected items by wheel number.</DrawerDescription>
      </div>
      <div className="overflow-y-auto px-4 py-3">
        <WheelKeyRows targets={targets} getColor={getColor} />
      </div>
    </DrawerContent>
  );
}

function RandomizerWheelKeyContent({
  targets,
  getColor,
}: Pick<RandomizerWheelKeyProps, 'targets' | 'getColor'>) {
  return (
    <div>
      <div className="border-border border-b px-4 py-3">
        <h2 className="text-base font-semibold">Wheel key</h2>
      </div>
      <div className="px-4 py-3">
        <WheelKeyRows targets={targets} getColor={getColor} />
      </div>
    </div>
  );
}

function WheelKeyRows({
  targets,
  getColor,
}: Pick<RandomizerWheelKeyProps, 'targets' | 'getColor'>) {
  return (
    <ol className="space-y-2">
      {targets.map((target, index) => (
        <li
          key={target.id}
          className="grid grid-cols-[2rem_0.875rem_minmax(0,1fr)] items-center gap-3"
        >
          <span className="text-muted-foreground text-right text-sm font-medium tabular-nums">
            {formatWedgeNumber(index)}
          </span>
          <span
            className="border-border size-3.5 rounded-sm border"
            style={{ backgroundColor: getColor(target.id) }}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{target.title}</span>
            {(target.subtitle || target.statusLabel) && (
              <span className="text-muted-foreground block truncate text-xs">
                {[target.subtitle, target.statusLabel].filter(Boolean).join(' | ')}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
