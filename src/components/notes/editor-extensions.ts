import { Markdown } from '@tiptap/markdown';
import { OrderedList } from '@tiptap/extension-list';
import Link from '@tiptap/extension-link';
import StarterKit from '@tiptap/starter-kit';

import { sanitizeMarkdownUrl } from './markdown-url';

const ManualOrderedList = OrderedList.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
});

export const progressNoteEditorExtensions = [
  StarterKit.configure({
    blockquote: false,
    code: false,
    codeBlock: false,
    heading: { levels: [3] },
    horizontalRule: false,
    link: false,
    orderedList: false,
    underline: false,
  }),
  ManualOrderedList,
  Link.configure({
    autolink: true,
    linkOnPaste: true,
    openOnClick: false,
    defaultProtocol: 'https',
    protocols: ['http', 'https', 'mailto', 'tel'],
    isAllowedUri: url => Boolean(sanitizeMarkdownUrl(url)),
    HTMLAttributes: {
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    },
  }),
  Markdown.configure({
    indentation: {
      style: 'space',
      size: 2,
    },
  }),
];
