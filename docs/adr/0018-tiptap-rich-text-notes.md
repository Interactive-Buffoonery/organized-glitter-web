# ADR-0018: Use TipTap for rich text notes, stored as Markdown

Date: 2026-06-12 (records the editor choice for progress notes; written down
during the 2026-06 ADR backfill)

## Status

Accepted

## Context

Progress notes need formatting (lists, links, emphasis) beyond a plain
textarea, on mobile Safari as much as desktop. The stored format matters more
than the editor: notes must remain portable, renderable outside the editor
(react-markdown is already used for display), and safe to keep for years.

## Decision

TipTap (ProseMirror-based, v3) powers the rich text editor, wrapped in an
app-owned `RichTextEditor` under `src/components/notes/` with a curated
extension set (starter kit, links, lists) and an app toolbar. Content is
stored as Markdown via `@tiptap/markdown`, not as ProseMirror JSON or HTML.

## Rejected Alternatives

### Plain textarea with Markdown syntax

Maximum portability, but raw Markdown editing is hostile on phones, where most
notes are written.

### Storing ProseMirror JSON or HTML

Ties stored data to the editor's schema (JSON) or requires sanitization
forever (HTML). Markdown keeps the data readable, diffable, and
editor-independent.

### Lighter editors (contenteditable wrappers, Lexical)

TipTap's extension model and ProseMirror's mobile maturity outweigh the bundle
cost for the one surface that needs it.

## Consequences

- Notes survive an editor swap: any future editor only needs Markdown in and
  out.
- The editor ships only on note surfaces; it should stay lazy-loaded so the
  ProseMirror weight does not tax the app shell.
- Formatting is bounded by the curated extension set; adding extensions is a
  product decision because each one widens the stored Markdown dialect.
- Editor behavior on mobile Safari stays an explicit test concern
  (ADR-0013, `AGENTS.md`).
