import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeSection } from '../WelcomeSection';

vi.mock('@/components/profile/AvatarDisplay', () => ({ default: () => null }));

describe('WelcomeSection', () => {
  it.each([
    ['example', 'example'],
    ['Sarah Milligan', 'Sarah'],
    ['', 'friend'],
    ['   ', 'friend'],
  ])('greets %s with %s', (displayName, name) => {
    render(
      <WelcomeSection displayName={displayName} avatarUrl={null} avatarType={null} email="" />
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`Welcome back, ${name}`);
  });
});
