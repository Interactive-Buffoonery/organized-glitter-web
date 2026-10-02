import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Heading,
  Italic,
  Link,
  List,
  ListOrdered,
  Strikethrough,
  Unlink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { sanitizeMarkdownUrl } from './markdown-url';

interface EditorToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
  editorId?: string;
}

interface FormattingItem {
  value: string;
  label: string;
  Icon: typeof Bold;
  isActive: (editor: Editor) => boolean;
  toggle: (editor: Editor) => void;
}

const FORMATTING_ITEMS: FormattingItem[] = [
  {
    value: 'bold',
    label: 'Bold',
    Icon: Bold,
    isActive: editor => editor.isActive('bold'),
    toggle: editor => editor.chain().toggleBold().run(),
  },
  {
    value: 'italic',
    label: 'Italic',
    Icon: Italic,
    isActive: editor => editor.isActive('italic'),
    toggle: editor => editor.chain().toggleItalic().run(),
  },
  {
    value: 'strike',
    label: 'Strikethrough',
    Icon: Strikethrough,
    isActive: editor => editor.isActive('strike'),
    toggle: editor => editor.chain().toggleStrike().run(),
  },
  {
    value: 'heading',
    label: 'Heading',
    Icon: Heading,
    isActive: editor => editor.isActive('heading', { level: 3 }),
    toggle: editor => editor.chain().toggleHeading({ level: 3 }).run(),
  },
  {
    value: 'bulletList',
    label: 'Bullet list',
    Icon: List,
    isActive: editor => editor.isActive('bulletList'),
    toggle: editor => editor.chain().toggleBulletList().run(),
  },
  {
    value: 'orderedList',
    label: 'Numbered list',
    Icon: ListOrdered,
    isActive: editor => editor.isActive('orderedList'),
    toggle: editor => editor.chain().toggleOrderedList().run(),
  },
];

const EditorToolbar = ({ editor, disabled = false, editorId }: EditorToolbarProps) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const skipNextClickRef = useRef<HTMLElement | null>(null);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) {
        return null;
      }
      return {
        activeValues: FORMATTING_ITEMS.reduce<string[]>((values, item) => {
          if (item.isActive(e)) {
            values.push(item.value);
          }
          return values;
        }, []),
        linkActive: e.isActive('link'),
        isEditable: e.isEditable,
      };
    },
  });

  if (!editor || !toolbarState) {
    return null;
  }

  const isDisabled = disabled || !toolbarState.isEditable;
  const activeValues = toolbarState.activeValues;

  const preserveEditorSelection = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
  };

  const handleItemPointerDown = (event: PointerEvent<HTMLElement>, action: () => void) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      event.preventDefault();
      skipNextClickRef.current = event.currentTarget;
      action();
    }
  };

  const handleItemClick = (event: MouseEvent<HTMLElement>, action: () => void) => {
    if (skipNextClickRef.current === event.currentTarget) {
      skipNextClickRef.current = null;
      return;
    }
    action();
  };

  const applyLink = () => {
    const href = sanitizeMarkdownUrl(linkUrl);

    if (!href) {
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkUrl('');
    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkUrl('');
    setLinkOpen(false);
  };

  return (
    <div className="sticky top-0 z-10 -mx-3 mb-3 overflow-x-auto border-b border-[hsl(var(--glass-border))] bg-[hsl(var(--glass-bg))] px-3 py-2 shadow-[inset_0_1px_0_hsl(var(--glass-highlight))] backdrop-blur-xl backdrop-saturate-150">
      <div className="flex min-w-max items-center gap-2">
        <ToggleGroup
          type="multiple"
          value={activeValues}
          aria-label="Progress note formatting"
          aria-controls={editorId}
          variant="glass"
          size="icon"
          disabled={isDisabled}
          className="justify-start gap-1"
        >
          {FORMATTING_ITEMS.map(({ value, label, Icon, toggle }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              onPointerDown={event => handleItemPointerDown(event, () => toggle(editor))}
              onMouseDown={preserveEditorSelection}
              onClick={event => handleItemClick(event, () => toggle(editor))}
            >
              <Icon className="size-4" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="glass"
              size="icon"
              aria-label={toolbarState.linkActive ? 'Edit link' : 'Add link'}
              data-active={toolbarState.linkActive || undefined}
              className="data-[active=true]:bg-primary/20 data-[active=true]:text-primary"
              disabled={isDisabled}
              onPointerDown={event =>
                handleItemPointerDown(event, () => {
                  setLinkUrl(editor.getAttributes('link').href || '');
                  setLinkOpen(true);
                })
              }
              onMouseDown={preserveEditorSelection}
              onClick={event =>
                handleItemClick(event, () => {
                  setLinkUrl(editor.getAttributes('link').href || '');
                })
              }
            >
              <Link className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="progress-note-link">Link URL</Label>
                <Input
                  id="progress-note-link"
                  value={linkUrl}
                  onChange={event => setLinkUrl(event.target.value)}
                  placeholder="https://example.com"
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyLink();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                {toolbarState.linkActive ? (
                  <Button
                    type="button"
                    variant="glass"
                    size="sm"
                    onPointerDown={event => handleItemPointerDown(event, removeLink)}
                    onMouseDown={preserveEditorSelection}
                    onClick={event => handleItemClick(event, removeLink)}
                  >
                    <Unlink className="size-4" />
                    Remove
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="glass"
                  size="sm"
                  onPointerDown={event => handleItemPointerDown(event, applyLink)}
                  onMouseDown={preserveEditorSelection}
                  onClick={event => handleItemClick(event, applyLink)}
                  disabled={!sanitizeMarkdownUrl(linkUrl)}
                >
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default EditorToolbar;
