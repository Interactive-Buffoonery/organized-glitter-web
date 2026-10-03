import type { MarkdownString } from '@/types/markdown';

export interface ProgressNoteFormProps {
  onSubmit: (note: { date: string; content: MarkdownString; imageFile?: File }) => Promise<boolean>;
  onSuccess?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'dialog-sheet';
}

export interface ProgressNoteFormErrors {
  date?: string;
  content?: string;
  image?: string;
  form?: string; // Added for general form errors
}
