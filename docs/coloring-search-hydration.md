# Coloring search hydration

The coloring dashboard restores saved filters only when the URL supplies no
filters and the user has not interacted. Typing in the search field registers
interaction immediately, before the 350 ms debounce applies the search to the
provider. Saved filters arriving during that delay must not replace the draft.

Search still applies after the debounce, or immediately on submit or blur.
External filter resets continue to synchronize the displayed search value.

The integration regression in
`src/contexts/ColoringFilterContext/__tests__/ColoringFilterContext.test.tsx`
mounts the real controls and provider, types while saved settings are loading,
then delivers a different saved search before the debounce finishes. It checks
both the visible draft and the eventual applied filter.
