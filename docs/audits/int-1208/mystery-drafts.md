# Mystery reveal draft lifecycle (INT-1208)

Confirmed: resetting the draft ref during render overwrites the visible page's
draft when a different page render suspends. Saving through the committed page's
handler then writes the other page's subject to the visible page.

Keep the synchronous state reset on page-ID changes, but synchronize the draft
ref in a layout effect after commit. Event handlers still write the ref before
setting state, preserving edit-then-save within one event.

Failure modes covered before the fix: suspended page navigation overwrites the
visible draft; committed page changes submit the old draft; same-tick edit then
save loses the latest text; cancel and clear leave stale text. Existing tests
cover real navigation, same-tick edits, cancel, and clear. A component harness
publishes handlers only after commit to model the still-visible Save button
while the replacement page suspends.

Verification: `pnpm exec vitest run src/hooks/coloring/__tests__/useColoringPageMysteryReveal.test.tsx`.
