import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflinePage } from '@/components/OfflinePage';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type EditorSurfaceKind = 'alert-dialog' | 'dialog' | 'drawer' | 'sheet';

const EditorFields = ({ kind }: { kind: EditorSurfaceKind }) => (
  <>
    <label htmlFor={`${kind}-editor-field`}>Project title</label>
    <input id={`${kind}-editor-field`} defaultValue="Unfinished project" />
  </>
);

const EditorSurface = ({
  kind,
  onOpenChange,
}: {
  kind: EditorSurfaceKind;
  onOpenChange: (open: boolean) => void;
}) => {
  if (kind === 'alert-dialog') {
    return (
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogTitle>Edit project</AlertDialogTitle>
          <AlertDialogDescription>Update the project title.</AlertDialogDescription>
          <EditorFields kind={kind} />
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (kind === 'drawer') {
    return (
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerTitle>Edit project</DrawerTitle>
          <DrawerDescription>Update the project title.</DrawerDescription>
          <EditorFields kind={kind} />
        </DrawerContent>
      </Drawer>
    );
  }

  if (kind === 'sheet') {
    return (
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetTitle>Edit project</SheetTitle>
          <SheetDescription>Update the project title.</SheetDescription>
          <EditorFields kind={kind} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Edit project</DialogTitle>
        <DialogDescription>Update the project title.</DialogDescription>
        <EditorFields kind={kind} />
      </DialogContent>
    </Dialog>
  );
};

describe('OfflinePage', () => {
  it('shows the approved recovery copy without promising offline persistence', async () => {
    render(<OfflinePage onCheckConnection={vi.fn()} isChecking={false} error={null} />);

    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Reconnect to save changes. Unsaved changes may be lost if you refresh or close the app or page.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/saved locally|sync when/i)).not.toBeInTheDocument();
  });

  it('checks the connection from a non-submit button', async () => {
    const onCheckConnection = vi.fn();
    const user = userEvent.setup();
    render(
      <form>
        <OfflinePage onCheckConnection={onCheckConnection} isChecking={false} error={null} />
      </form>
    );

    const button = await screen.findByRole('button', { name: 'Check connection' });
    await user.click(button);

    expect(button).toHaveAttribute('type', 'button');
    expect(onCheckConnection).toHaveBeenCalledTimes(1);
  });

  it('disables repeated checks and exposes the pending state', async () => {
    render(<OfflinePage onCheckConnection={vi.fn()} isChecking error={null} />);

    expect(await screen.findByRole('button', { name: 'Checking…' })).toBeDisabled();
  });

  it('moves keyboard focus to the recovery action', async () => {
    render(<OfflinePage onCheckConnection={vi.fn()} isChecking={false} error={null} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check connection' })).toHaveFocus();
    });
  });

  it('restores focus to the interrupted field after recovery', async () => {
    const props = { onCheckConnection: vi.fn(), isChecking: false, error: null };
    const { rerender } = render(
      <>
        <label htmlFor="interrupted-field">Project title</label>
        <input id="interrupted-field" />
      </>
    );
    const input = screen.getByRole('textbox', { name: 'Project title' });
    input.focus();

    rerender(
      <>
        <label htmlFor="interrupted-field">Project title</label>
        <input id="interrupted-field" />
        <OfflinePage {...props} />
      </>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Check connection' })).toHaveFocus()
    );

    rerender(
      <>
        <label htmlFor="interrupted-field">Project title</label>
        <input id="interrupted-field" />
      </>
    );

    await waitFor(() => expect(input).toHaveFocus());
  });

  it.each<EditorSurfaceKind>(['alert-dialog', 'dialog', 'drawer', 'sheet'])(
    'owns modal interaction above an open %s without unmounting its editor',
    async kind => {
      const onCheckConnection = vi.fn();
      const onEditorOpenChange = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(
        <EditorSurface key="editor" kind={kind} onOpenChange={onEditorOpenChange} />
      );
      const editorInput = document.getElementById(`${kind}-editor-field`) as HTMLInputElement;
      editorInput.focus();

      rerender(
        <>
          <EditorSurface key="editor" kind={kind} onOpenChange={onEditorOpenChange} />
          <OfflinePage
            key="recovery"
            onCheckConnection={onCheckConnection}
            isChecking={false}
            error={null}
          />
        </>
      );

      const recoveryDialog = await screen.findByRole('alertdialog', { name: "You're offline" });
      const recoveryButton = screen.getByRole('button', { name: 'Check connection' });

      expect(recoveryDialog).not.toHaveAttribute('aria-hidden');
      expect(recoveryDialog).toHaveClass('z-[100]', 'pointer-events-auto');
      expect(editorInput).toHaveAttribute('aria-hidden', 'true');
      expect(editorInput.inert).toBe(true);
      expect(editorInput).toHaveValue('Unfinished project');
      await waitFor(() => expect(recoveryButton).toHaveFocus());

      await user.tab();
      expect(recoveryButton).toHaveFocus();
      await user.tab({ shift: true });
      expect(recoveryButton).toHaveFocus();

      await user.keyboard('{Escape}');
      await user.click(recoveryDialog);
      expect(onEditorOpenChange).not.toHaveBeenCalled();

      rerender(
        <>
          <EditorSurface key="editor" kind={kind} onOpenChange={onEditorOpenChange} />
          <OfflinePage
            key="recovery"
            onCheckConnection={onCheckConnection}
            isChecking
            error={null}
          />
        </>
      );

      const pendingButton = screen.getByRole('button', { name: 'Checking…' });
      expect(pendingButton).toBeDisabled();
      await waitFor(() => expect(recoveryDialog).toHaveFocus());
      await user.tab({ shift: true });
      expect(recoveryDialog).toHaveFocus();
      expect(editorInput).toHaveValue('Unfinished project');

      rerender(<EditorSurface key="editor" kind={kind} onOpenChange={onEditorOpenChange} />);
      await waitFor(() => expect(editorInput).toHaveFocus());
      expect(editorInput).not.toHaveAttribute('aria-hidden');
      expect(editorInput.inert).not.toBe(true);
      expect(editorInput).toHaveValue('Unfinished project');
    }
  );

  it('scans for a recovery portal owner at most once per animation frame', async () => {
    render(<OfflinePage onCheckConnection={vi.fn()} isChecking={false} error={null} />);
    await screen.findByRole('alertdialog', { name: "You're offline" });

    const queuedFrames: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        queuedFrames.push(callback);
        return queuedFrames.length;
      });
    const querySelectorAll = vi.spyOn(Document.prototype, 'querySelectorAll');
    const extraNodes = Array.from({ length: 12 }, () => document.createElement('div'));

    try {
      extraNodes.forEach(node => document.body.append(node));

      await waitFor(() => expect(queuedFrames).toHaveLength(1));

      const dialogSelectorCalls = () =>
        querySelectorAll.mock.calls.filter(([selector]) =>
          String(selector).includes('[role="dialog"]')
        );

      expect(dialogSelectorCalls()).toHaveLength(0);

      queuedFrames[0](0);

      expect(dialogSelectorCalls()).toHaveLength(1);
    } finally {
      extraNodes.forEach(node => node.remove());
      requestAnimationFrame.mockRestore();
      querySelectorAll.mockRestore();
    }
  });

  it('keeps recovery connected if its original portal owner closes asynchronously', async () => {
    const props = { onCheckConnection: vi.fn(), isChecking: false, error: null };
    const RecoveryWithOwner = ({
      showOwner,
      showRecovery,
    }: {
      showOwner: boolean;
      showRecovery: boolean;
    }) => (
      <>
        {showOwner && <EditorSurface key="editor" kind="dialog" onOpenChange={vi.fn()} />}
        {showRecovery && <OfflinePage key="recovery" {...props} />}
      </>
    );
    const { container, rerender } = render(<RecoveryWithOwner showOwner showRecovery />);

    const recoveryDialog = await screen.findByRole('alertdialog', { name: "You're offline" });
    expect(recoveryDialog.parentElement).toHaveAttribute('role', 'dialog');

    rerender(<RecoveryWithOwner showOwner={false} showRecovery />);

    await waitFor(() => {
      const rehomedRecovery = screen.getByRole('alertdialog', { name: "You're offline" });
      expect(rehomedRecovery).toBeInTheDocument();
      expect(rehomedRecovery.parentElement).toBe(document.body);
    });

    rerender(<RecoveryWithOwner showOwner={false} showRecovery={false} />);
    await waitFor(() => {
      expect(container).not.toHaveAttribute('aria-hidden');
      expect(container.inert).not.toBe(true);
    });
  });

  it('takes ownership when a dialog opens during recovery and preserves its isolation afterward', async () => {
    const props = { onCheckConnection: vi.fn(), isChecking: false, error: null };
    const RecoveryWithLateOwner = ({
      showOwner,
      showRecovery,
    }: {
      showOwner: boolean;
      showRecovery: boolean;
    }) => (
      <>
        {showOwner && <EditorSurface key="editor" kind="dialog" onOpenChange={vi.fn()} />}
        {showRecovery && <OfflinePage key="recovery" {...props} />}
      </>
    );
    const { container, rerender } = render(
      <RecoveryWithLateOwner showOwner={false} showRecovery />
    );

    await waitFor(() => {
      const recoveryDialog = screen.getByRole('alertdialog', { name: "You're offline" });
      expect(recoveryDialog.parentElement).toBe(document.body);
      expect(screen.getByRole('button', { name: 'Check connection' })).toHaveFocus();
    });

    rerender(<RecoveryWithLateOwner showOwner showRecovery />);

    await waitFor(() => {
      const recoveryDialog = screen.getByRole('alertdialog', { name: "You're offline" });
      expect(recoveryDialog.parentElement).toHaveAttribute('role', 'dialog');
      expect(recoveryDialog).not.toHaveAttribute('aria-hidden');
      expect(recoveryDialog).not.toHaveAttribute('data-aria-hidden');
      expect(screen.getByRole('button', { name: 'Check connection' })).toHaveFocus();
    });

    rerender(<RecoveryWithLateOwner showOwner showRecovery={false} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Project title' })).toHaveValue(
        'Unfinished project'
      );
      expect(container).toHaveAttribute('aria-hidden', 'true');
      expect(container).toHaveAttribute('data-aria-hidden', 'true');
    });
  });

  it('uses safe centering and vertical scrolling for short viewports', async () => {
    render(
      <OfflinePage
        onCheckConnection={vi.fn()}
        isChecking={false}
        error="Still unable to connect. Please try again."
      />
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveClass('overflow-y-auto');
    expect(dialog.firstElementChild?.firstElementChild).toHaveClass('m-auto');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('announces a failed check through a live status region', async () => {
    render(
      <OfflinePage
        onCheckConnection={vi.fn()}
        isChecking={false}
        error="Still unable to connect. Please try again."
      />
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Still unable to connect. Please try again.'
    );
  });
});
