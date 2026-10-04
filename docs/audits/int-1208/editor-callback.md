# Editor callback lifecycle (INT-1208)

Confirmed: the render-time write to `onChangeRef` routes edits in the visible
editor to a callback from a suspended replacement render. The regression
suspends replacement props, then pastes into the still-visible editor. The old
code calls the speculative callback instead of the committed callback.

Update the callback ref in a layout effect. This publishes the latest callback
at commit without rebuilding the editor or changing correction settings.

Failure modes covered before the fix: speculative callbacks receive user edits;
committed replacement callbacks remain stale; controlled typing duplicates
characters; toolbar actions submit forms or run twice on touch. Existing tests
cover the latter editor behaviors. Component isolation is needed to force a
suspended render while the real TipTap editor remains interactive.

Verification: `pnpm exec vitest run src/components/notes/__tests__/RichTextEditor.test.tsx`.
Mobile browser coverage uses the project-field-clearing flow in iPhone WebKit,
which edits and saves the actual rich text project-notes field.
