import type { Ref } from 'react';
import type { MarkdownString } from '@/types/markdown';

export interface ProgressNoteFormProps {
  onSubmit: (note: { date: string; content: MarkdownString; imageFile?: File }) => Promise<boolean>;
  onSuccess?: () => void;
  composerInputRef?: Ref<HTMLTextAreaElement>;
  disabled?: boolean;
  variant?: 'default' | 'dialog-sheet' | 'composer';
}

export interface ProgressNoteFormErrors {
  date?: string;
  content?: string;
  image?: string;
  form?: string; // Added for general form errors
}
