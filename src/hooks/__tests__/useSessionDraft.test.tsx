import '@testing-library/jest-dom/vitest';
import { StrictMode, useState } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSessionDraft } from '../useSessionDraft';
import {
  captureSessionDrafts,
  clearSessionDrafts,
  hasSessionDraft,
  registerSessionDraft,
} from '@/services/auth/sessionRecovery';

afterEach(clearSessionDrafts);

describe('useSessionDraft', () => {
  it('restores through StrictMode double initialization before consuming the draft', () => {
    const key = 'project-edit:one:page';
    const unregister = registerSessionDraft(key, 'account-a', () => ({ title: 'Unsent work' }));
    captureSessionDrafts('account-a', 'token-a');
    unregister();

    function DraftForm() {
      const restored = useSessionDraft<{ title: string }>(key, 'account-a', () => draft);
      const [draft] = useState(restored);
      return <output>{draft?.title}</output>;
    }

    render(
      <StrictMode>
        <DraftForm />
      </StrictMode>
    );

    expect(screen.getByText('Unsent work')).toBeInTheDocument();
    expect(hasSessionDraft(key, 'account-a')).toBe(false);
  });
});
