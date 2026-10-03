/**
 * Regression tests for EditCompanyDialog after #108 fix.
 *
 * Locks in:
 *   - The component no longer imports or calls `useMetadataCompanies` (the workaround).
 *   - The component no longer requires the `onCompanyUpdated` prop (the no-op chain
 *     was removed alongside the workaround).
 *   - On successful mutation, the dialog closes.
 *   - The mutation is invoked with the form values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditCompanyDialog from '../EditCompanyDialog';

// useUpdateCompany returns a mutation object with mutateAsync. The dialog
// awaits mutateAsync and then calls setIsDialogOpen(false). We make
// mutateAsync resolve (or reject) on demand via these handles.
let mutateResolver: ((value: unknown) => void) | null = null;
let mutateRejecter: ((err: unknown) => void) | null = null;
const mutateAsyncMock = vi.fn(
  () =>
    new Promise((resolve, reject) => {
      mutateResolver = resolve;
      mutateRejecter = reject;
    })
);
let mutationIsPending = false;
vi.mock('@/hooks/mutations/useCompanyMutations', () => ({
  useUpdateCompany: () => ({
    mutateAsync: mutateAsyncMock,
    get isPending() {
      return mutationIsPending;
    },
  }),
}));

const useMetadataCompaniesSpy = vi.fn(() => ({
  companies: [],
  companyNames: [],
  isLoading: false,
  error: null,
  refresh: vi.fn(),
  hasCompanies: false,
  companiesCount: 0,
}));
vi.mock('@/contexts/MetadataContext', () => ({
  useMetadataCompanies: useMetadataCompaniesSpy,
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));
vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
  notifySuccess: toastMock,
  notifyWarning: toastMock,
  notifyError: toastMock,
  notifyInfo: toastMock,
}));

const mockCompany = {
  id: 'company-1',
  name: 'Diamond Dotz',
  website_url: 'https://diamonddotz.example',
};

const openDialog = () => {
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
};

describe('EditCompanyDialog (post-#108 fix)', () => {
  beforeEach(() => {
    mutateAsyncMock.mockClear();
    toastMock.mockReset();
    useMetadataCompaniesSpy.mockClear();
    mutateResolver = null;
    mutateRejecter = null;
    mutationIsPending = false;
  });

  it('renders an Edit trigger button without requiring onCompanyUpdated prop', () => {
    // Type-level check: this render call would not compile if EditCompanyDialog
    // still required `onCompanyUpdated`. Runtime check: it renders cleanly.
    render(<EditCompanyDialog company={mockCompany} />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('does NOT call useMetadataCompanies (the workaround for #108 was removed)', () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    expect(useMetadataCompaniesSpy).not.toHaveBeenCalled();
  });

  it('opens the dialog with company name and URL pre-filled', () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Diamond Dotz');
    expect(screen.getByLabelText(/website url/i)).toHaveValue('https://diamonddotz.example');
  });

  it('shows an error toast and does not call the mutation when name is empty', () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/company name/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /update company/i }));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ kind: 'error' }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('does not submit when website URL is invalid', () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: 'not a url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update company/i }));
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('submits the form values via mutateAsync and closes on success', async () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: 'New Diamond Co' },
    });
    fireEvent.change(screen.getByLabelText(/website url/i), {
      target: { value: 'https://newco.example' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update company/i }));

    expect(mutateAsyncMock).toHaveBeenCalledWith({
      id: 'company-1',
      data: {
        name: 'New Diamond Co',
        website_url: 'https://newco.example',
      },
    });

    // Resolve the mutation; dialog should close.
    mutateResolver?.({ id: 'company-1', name: 'New Diamond Co' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('ignores a second submit while the update is starting', () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    const form = screen.getByRole('button', { name: /update company/i }).closest('form');

    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(mutateAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('blocks reopening until an update is reflected in company data', async () => {
    const renderDialog = (company = mockCompany) => <EditCompanyDialog company={company} />;
    const { rerender } = render(renderDialog());
    openDialog();
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: 'Updated Diamond Co' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update company/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await act(async () => {
      mutateResolver?.({ id: 'company-1', name: 'Updated Diamond Co' });
      await Promise.resolve();
    });

    rerender(renderDialog({ ...mockCompany, name: 'Updated Diamond Co' }));
    openDialog();
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Updated Diamond Co');
  });

  it('keeps the dialog open if the mutation rejects', async () => {
    render(<EditCompanyDialog company={mockCompany} />);
    openDialog();
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: 'Will Fail' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update company/i }));

    mutateRejecter?.(new Error('boom'));
    // Microtask flush: dialog should still be open.
    await Promise.resolve();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
