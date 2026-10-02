import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TAG_COLOR_PALETTE } from '@/utils/ui/tagColors';
import { blend, contrast, themeColor } from '@/test-utils/contrast';
import { TagBadge } from '../TagBadge';

describe('TagBadge contrast', () => {
  it.each(TAG_COLOR_PALETTE)('$name keeps normal text readable in both themes', color => {
    const { container } = render(
      <TagBadge
        tag={{
          id: 'tag',
          userId: 'user',
          name: color.name,
          slug: color.name,
          color: color.hex,
          createdAt: '',
          updatedAt: '',
        }}
      />
    );
    const badge = container.firstElementChild as HTMLElement;
    const fillChannels = badge.style.backgroundColor.match(/[\d.]+/g)?.map(Number);
    expect(fillChannels).toHaveLength(4);
    const [red, green, blue, opacity] = fillChannels!;
    const tagFill = [red, green, blue].map(channel => channel / 255);

    for (const theme of ['light', 'dark'] as const) {
      const foreground = themeColor(theme, 'foreground');
      for (const surface of ['card', 'background'] as const) {
        const background = themeColor(theme, surface);
        expect(contrast(foreground, blend(tagFill, background, opacity))).toBeGreaterThanOrEqual(
          4.5
        );
      }
    }
    expect(badge).toHaveClass('text-foreground');
    expect(badge.style.color).toBe('');
  });
});
