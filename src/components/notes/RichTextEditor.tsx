import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';

import { cn } from '@/lib/utils';
import EditorToolbar from './editor-toolbar';
import { progressNoteEditorExtensions } from './editor-extensions';
import { toEditorInitial } from '@/utils/progressNoteContent';
import type { MarkdownString } from '@/types/markdown';

interface RichTextEditorProps {
  value: MarkdownString;
  onChange: (markdown: MarkdownString) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}

const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Add a caption...',
  disabled = false,
  id,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaInvalid = false,
}: RichTextEditorProps) => {
  const generatedId = useId();
  const editorId = id ?? generatedId;
  const lastEmittedValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [isEmpty, setIsEmpty] = useState(!value.trim());

  const editorAttributes: Record<string, string> = {
    id: editorId,
    role: 'textbox',
    'aria-invalid': ariaInvalid ? 'true' : 'false',
    'aria-multiline': 'true',
    autocapitalize: 'off',
    autocorrect: 'on',
    class: 'min-h-[150px] p-3 outline-none focus:outline-none prose-note-content',
    spellcheck: 'true',
  };
  if (ariaLabelledBy) {
    editorAttributes['aria-labelledby'] = ariaLabelledBy;
  } else {
    editorAttributes['aria-label'] = ariaLabel ?? 'Progress note content';
  }
  if (ariaDescribedBy) {
    editorAttributes['aria-describedby'] = ariaDescribedBy;
  }

  const editor = useEditor({
    extensions: progressNoteEditorExtensions,
    content: toEditorInitial(value),
    contentType: 'markdown',
    editable: !disabled,

    editorProps: {
      attributes: editorAttributes,
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      lastEmittedValueRef.current = markdown;
      setIsEmpty(editor.isEmpty);
      onChangeRef.current(markdown);
    },
    onCreate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (value === lastEmittedValueRef.current) {
      return;
    }

    const currentMarkdown = editor.getMarkdown();
    if (value === currentMarkdown) {
      lastEmittedValueRef.current = value;
      setIsEmpty(editor.isEmpty);
      return;
    }

    editor.commands.setContent(toEditorInitial(value), {
      contentType: 'markdown',
      emitUpdate: false,
    });
    lastEmittedValueRef.current = value;
    setIsEmpty(editor.isEmpty);
  }, [editor, value]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-[hsl(var(--glass-border))]',
        'bg-[hsl(var(--glass-bg))] shadow-[inset_0_1px_0_hsl(var(--glass-highlight)),0_2px_8px_rgba(0,0,0,0.08)]',
        'backdrop-blur-xl backdrop-saturate-150',
        'max-h-[400px] [@supports(height:1dvh)]:max-h-[60dvh]',
        'focus-within:border-ring focus-within:ring-ring/40 focus-within:ring-[3px]',
        ariaInvalid && 'border-destructive ring-destructive/20 ring-[3px]',
        disabled && 'opacity-60'
      )}
    >
      <EditorToolbar editor={editor} disabled={disabled} editorId={editorId} />
      <div className="relative flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {isEmpty ? (
          <div className="text-muted-foreground pointer-events-none absolute top-3 left-3 text-sm">
            {placeholder}
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
