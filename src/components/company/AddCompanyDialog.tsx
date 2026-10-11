import { notify } from '@/lib/notifications';

/**
 * @fileoverview Add Company Dialog Component
 *
 * Modal dialog for adding new companies to the user's collection.
 * Features secure duplicate validation and URL validation with user-friendly
 * error handling. Uses parameterized PocketBase queries.
 *
 * @author serabi
 * @version 1.0.0
 * @since 2024-06-29
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus } from 'lucide-react';

import { useCreateCompany } from '@/hooks/mutations/useCompanyMutations';
import FormField from '@/components/projects/form/FormField';

/**
 * Props interface for the AddCompanyDialog component
 *
 * @interface AddCompanyDialogProps
 * @property {() => void} onCompanyAdded - Callback function triggered when a company is successfully added
 */
interface AddCompanyDialogProps {
  onCompanyAdded: () => void;
}

/**
 * AddCompanyDialog Component
 *
 * Modal dialog component for adding new companies to the user's account.
 * Provides form validation, duplicate checking, and secure data submission.
 *
 * Key Features:
 * - Company name and optional URL input fields
 * - Real-time URL validation with user feedback
 * - Secure duplicate company name validation
 * - User-friendly error handling and loading states
 * - Automatic dialog closure on successful submission
 *
 * Security Features:
 * - Uses parameterized PocketBase queries
 * - Prevents SQL injection through parameterized filtering
 * - User-scoped duplicate validation (only checks user's companies)
 *
 * @component
 * @param {AddCompanyDialogProps} props - Component properties
 * @returns {JSX.Element} Rendered add company modal dialog
 *
 * @example
 * ```tsx
 * <AddCompanyDialog
 *   onCompanyAdded={() => {
 *     // Refresh companies list
 *     refetchCompanies();
 *   }}
 * />
 * ```
 */
const AddCompanyDialog = ({ onCompanyAdded }: AddCompanyDialogProps) => {
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyUrl, setNewCompanyUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const createCompanyMutation = useCreateCompany();

  const validateUrl = (url: string) => {
    if (!url) return true; // Empty URL is valid (optional field)

    try {
      new URL(url);
      setUrlError('');
      return true;
    } catch {
      setUrlError('Please enter a valid URL (e.g., https://example.com)');
      return false;
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setNewCompanyUrl(url);
    if (url) validateUrl(url);
    else setUrlError('');
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    if (createCompanyMutation.isPending) return;

    if (!newCompanyName.trim()) {
      notify({
        kind: 'error',
        title: 'Company name required',
        description: 'Company name cannot be empty',
      });
      return;
    }

    if (newCompanyUrl && !validateUrl(newCompanyUrl)) {
      return;
    }

    try {
      await createCompanyMutation.mutateAsync({
        name: newCompanyName.trim(),
        website_url: newCompanyUrl.trim() || undefined,
      });

      setNewCompanyName('');
      setNewCompanyUrl('');
      setUrlError('');
      setIsDialogOpen(false);
      onCompanyAdded();
    } catch {
      // Error toast is handled by the mutation hook's onError
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="glass">
          <Plus className="mr-2 size-4" />
          Add company
        </Button>
      </DialogTrigger>
      <DialogContent layout="keyboard-safe">
        <DialogHeader>
          <DialogTitle>Add company</DialogTitle>
          <DialogDescription>
            Enter the name and website URL of the diamond painting company you want to add to your
            list.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAddCompany}>
          <div className="space-y-4 py-4">
            <FormField id="company-name" label="Company Name" required={true}>
              <Input
                id="company-name"
                placeholder="Enter company name"
                value={newCompanyName}
                onChange={e => setNewCompanyName(e.target.value)}
                disabled={createCompanyMutation.isPending}
              />
            </FormField>

            <FormField id="company-url" label="Website URL" error={urlError}>
              <Input
                id="company-url"
                placeholder="https://www.example.com"
                value={newCompanyUrl}
                onChange={handleUrlChange}
                disabled={createCompanyMutation.isPending}
                type="url"
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" variant="glass" disabled={createCompanyMutation.isPending}>
              {createCompanyMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddCompanyDialog;
