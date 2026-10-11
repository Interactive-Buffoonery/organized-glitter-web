import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SettingsSection } from '../SettingsSection';

describe('SettingsSection', () => {
  it('explains a collapsed danger section without exposing its action', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SettingsSection title="Danger zone" description="Account deletion" tone="danger" collapsible>
        <a href="/delete-account">Delete my account</a>
      </SettingsSection>
    );

    const disclosure = container.querySelector('details');
    const summary = container.querySelector('summary');

    expect(disclosure).not.toHaveAttribute('open');
    expect(summary).toHaveAccessibleName('Danger zone Account deletion');
    expect(summary).not.toHaveTextContent('▶');
    expect(screen.getByRole('link', { name: 'Delete my account' })).not.toBeVisible();

    await user.click(summary!);

    expect(disclosure).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: 'Delete my account' })).toBeVisible();

    await user.click(summary!);

    expect(disclosure).not.toHaveAttribute('open');
  });
});
