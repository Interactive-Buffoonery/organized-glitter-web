import { notify } from '@/lib/notifications';
import React, { useRef, useState } from 'react';
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
import { Loader2, Pencil } from 'lucide-react';

import { useUpdateCompany } from '@/hooks/mutations/useCompanyMutations';
import FormField from '@/components/projects/form/FormField';

interface EditCompanyDialogProps {
  company: {
    id: string;
    name: string;
    website_url: string | null;
  };
}

const EditCompanyDialog = ({ company }: EditCompanyDialogProps) => {
  const [companyName, setCompanyName] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const isUpdatingRef = useRef(false);
  const editSessionRef = useRef(0);
  const updateCompanyMutation = useUpdateCompany();
  const isUpdatePending = isUpdating || updateCompanyMutation.isPending;

  const handleOpenChange = (open: boolean) => {
    if (open && (isUpdatingRef.current || updateCompanyMutation.isPending)) return;
    editSessionRef.current += 1;
    if (open) {
      setCompanyName(company.name);
      setCompanyUrl(company.website_url || '');
      setUrlError('');
    }
    setIsDialogOpen(open);
  };

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
    setCompanyUrl(url);
    if (url) validateUrl(url);
    else setUrlError('');
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      notify({
        kind: 'error',
        title: 'Company name required',
        description: 'Company name cannot be empty',
      });
      return;
    }

    // Validate URL if provided
    if (companyUrl && !validateUrl(companyUrl)) {
      return;
    }

    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    setIsUpdating(true);
    const editSession = editSessionRef.current;

    try {
      await updateCompanyMutation.mutateAsync({
        id: company.id,
        data: {
          name: companyName,
          website_url: companyUrl || undefined,
        },
      });

      if (editSession === editSessionRef.current) {
        handleOpenChange(false);
      }
    } catch {
      // Error handling is done in the mutation hook
    } finally {
      isUpdatingRef.current = false;
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isUpdatePending}
          className="text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Pencil className="size-4" />
          <span className="sr-only">Edit</span>
        </Button>
      </DialogTrigger>
      <DialogContent layout="keyboard-safe">
        <DialogHeader>
          <DialogTitle>Edit Company</DialogTitle>
          <DialogDescription>
            Update the name and website URL of this diamond painting company.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUpdateCompany}>
          <div className="space-y-4 py-4">
            <FormField id="edit-company-name" label="Company Name" required={true}>
              <Input
                id="edit-company-name"
                placeholder="Enter company name"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                disabled={isUpdatePending}
              />
            </FormField>

            <FormField id="edit-company-url" label="Website URL" error={urlError}>
              <Input
                id="edit-company-url"
                placeholder="https://www.example.com"
                value={companyUrl}
                onChange={handleUrlChange}
                disabled={isUpdatePending}
                type="url"
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" variant="glass" disabled={isUpdatePending}>
              {isUpdatePending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Update Company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditCompanyDialog;
