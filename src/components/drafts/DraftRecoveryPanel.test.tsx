import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DraftPhotoReminder, DraftRecoveryPanel } from './DraftRecoveryPanel';

function RecoveryFixture({ photo }: { photo: boolean }) {
  const [pending, setPending] = useState(true);
  const [needsPhoto, setNeedsPhoto] = useState(photo);
  return (
    <div>
      {pending && (
        <DraftRecoveryPanel
          onRestore={() => setPending(false)}
          onDiscard={() => setPending(false)}
        />
      )}
      {!pending && needsPhoto && <DraftPhotoReminder onContinue={() => setNeedsPhoto(false)} />}
      <label>
        Title
        <input />
      </label>
    </div>
  );
}

describe('DraftRecoveryPanel', () => {
  it('moves focus to the photo reminder after restoring a draft that needs a photo', async () => {
    const user = userEvent.setup();
    render(<RecoveryFixture photo />);

    await user.click(screen.getByRole('button', { name: 'Restore draft' }));

    const reminder = screen.getByRole('status');
    await waitFor(() => expect(reminder).toHaveFocus());
    expect(reminder).toHaveTextContent('Select your photo again before saving.');
  });

  it('moves focus to the first field after discarding a draft', async () => {
    const user = userEvent.setup();
    render(<RecoveryFixture photo={false} />);

    await user.click(screen.getByRole('button', { name: 'Discard draft' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus());
  });

  it('moves focus to the first field after continuing without a new photo', async () => {
    const user = userEvent.setup();
    render(<RecoveryFixture photo />);

    await user.click(screen.getByRole('button', { name: 'Restore draft' }));
    await user.click(screen.getByRole('button', { name: 'Continue without new photo' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus());
  });
});
