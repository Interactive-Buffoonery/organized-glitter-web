import type { Ref } from 'react';
import type { MarkdownString } from '@/types/markdown';

export interface ProgressNoteFormProps {
  onSubmit: (note: { date: string; content: MarkdownString; imageFile?: File }) => Promise<boolean>;
  onSuccess?: () => void;
  composerInputRef?: Ref<HTMLTextAreaElement>;
  disabled?: boolean;
  /** Day the form starts on and resets to. Defaults to today in the user's timezone. */
  initialDate?: string;
  variant?: 'default' | 'dialog-sheet' | 'composer';
}

export interface ProgressNoteFormErrors {
  date?: string;
  content?: string;
  image?: string;
  form?: string; // Added for general form errors
}
