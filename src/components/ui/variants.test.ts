import { describe, expect, it } from 'vitest';

import { buttonVariants } from '@/components/ui/variants';

describe('buttonVariants', () => {
  it('uses quiet secondary hover colors for light-mode buttons', () => {
    const outline = buttonVariants({ variant: 'outline' });
    const ghost = buttonVariants({ variant: 'ghost' });

    expect(outline).toContain('hover:bg-secondary');
    expect(outline).toContain('hover:text-secondary-foreground');
    expect(ghost).toContain('hover:bg-secondary');
    expect(ghost).toContain('hover:text-secondary-foreground');
    expect(outline).not.toMatch(/(?<!dark:)hover:bg-accent(?:[\s/]|$)/);
    expect(ghost).not.toMatch(/(?<!dark:)hover:bg-accent(?:[\s/]|$)/);
  });
});
