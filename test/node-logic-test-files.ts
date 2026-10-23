// Pure-logic tests that run in the Node "logic" Vitest project instead of jsdom. Each file was
// audited: no DOM or Testing Library use, no browser globals in its source imports, no browser
// global read at runtime that changes behavior, and identical results under jsdom and Node.
// List files explicitly so new tests default to the DOM project until someone checks them.
// See docs/agents/test-environments.md.
export const nodeLogicTestFiles = [
  'src/components/notes-feed/__tests__/groupItemsByMonth.test.ts',
  'src/components/ui/date-field-utils.test.ts',
  'src/contexts/FilterContext/__tests__/diamondPageCorrection.test.ts',
  'src/contexts/FilterContext/__tests__/navigationContextHydration.test.ts',
  'src/features/coloring-progress/__tests__/coloringProgressCommands.test.ts',
  'src/features/randomizer/session/__tests__/randomizerSession.test.ts',
  'src/hooks/drafts/formDraftAdapters.test.ts',
  'src/hooks/mutations/__tests__/projectCommands.test.ts',
  'src/hooks/queries/__tests__/queryKeys.test.ts',
  'src/schemas/coloring/coloringBook.schema.test.ts',
  'src/services/pocketbase/__tests__/batchDelete.test.ts',
  'src/services/pocketbase/base/__tests__/listAllPages.test.ts',
  'src/services/pocketbase/base/__tests__/mapWithConcurrency.test.ts',
  'src/utils/__tests__/logger.test.ts',
  'src/utils/__tests__/progressNoteContent.test.ts',
  'src/utils/analytics/__tests__/sanitizeEvent.test.ts',
  'src/utils/auth/__tests__/passwordValidation.test.ts',
  'src/utils/auth/__tests__/resetLink.test.ts',
  'src/utils/csv/__tests__/csvValidation.test.ts',
  'src/utils/date/timezoneUtils.test.ts',
  'src/utils/error/__tests__/structuredErrorReason.test.ts',
];
