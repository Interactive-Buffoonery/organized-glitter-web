import '@testing-library/jest-dom/vitest';
import { StrictMode, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    const unregister = registerSessionDraft(key, () => ({ title: 'Unsent work' }));
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

  it('restores a draft when the account becomes available after mount', () => {
    const key = 'project-edit:one:page';
    const unregister = registerSessionDraft(key, () => ({ title: 'Unsent work' }));
    captureSessionDrafts('account-a', 'token-b');
    unregister();

    function DraftForm() {
      const [accountId, setAccountId] = useState<string>();
      const restored = useSessionDraft<{ title: string }>(
        key,
        accountId,
        () => draft,
        value => setDraft(value)
      );
      const [draft, setDraft] = useState(restored);
      return (
        <>
          <output>{draft?.title}</output>
          <button type="button" onClick={() => setAccountId('account-a')}>
            Load account
          </button>
        </>
      );
    }

    render(<DraftForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Load account' }));

    expect(screen.getByText('Unsent work')).toBeInTheDocument();
    expect(hasSessionDraft(key, 'account-a')).toBe(false);
  });
});
