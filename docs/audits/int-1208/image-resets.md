# Image reset lifecycle (INT-1208)

Both reset-key ref findings are confirmed in the existing web implementation.

- `ImageCropDialog`: abandoning a suspended default-preset change resets a
  user-selected portrait crop to the original default. The web app already
  uses the shared image session for crop coordinates and image processing, so
  this finding concerns the remaining preset-selection bookkeeping.
- `AvatarManager`: abandoning a suspended current-avatar change discards the
  processed upload and disables Save Avatar in the visible dialog.

Store the previous reset key in React state, with guarded updates during render.
React can then discard speculative reset bookkeeping together with the state
updates. Real identity changes still reset before children commit. File
signatures, preset signatures, and avatar reset conditions stay the same.

Failure modes covered before the fix: abandoned transitions erase selected crop
shapes or processed uploads; real file, preset, avatar, or open-state changes
fail to reset; equivalent signatures unnecessarily reset edits; closing leaks
preview URLs. Suspense component regressions cover abandoned renders; existing
reset and cleanup tests cover the other conditions. Browser tests exercise
actual image processing and saved files in Chromium and iPhone WebKit.

Verification:

```sh
pnpm exec vitest run src/components/image/__tests__/ImageCropDialog.test.tsx src/components/profile/__tests__/AvatarManager.test.tsx
pnpm qa:release:local -- --suite=full --project=authenticated-chromium-full --project=authenticated-webkit-full e2e/authenticated/avatar-crop-local.spec.ts --retries=0
```

The older image-selection spec uploads and crops successfully, but its raw
PocketBase file download omits the required protected-file token and fails.
It is outside the curated inventory. Use the maintained project-cover creation
flow for the saved-file verification:

```sh
pnpm qa:release:local -- --suite=full --project=authenticated-webkit-full e2e/authenticated/project-create-cover-local.spec.ts e2e/authenticated/project-field-clearing.spec.ts --retries=0
```
