# Diamond project mutation architecture

Status: current as of 2026-09-07.

This document describes the layered mutation pattern for diamond project
create and edit flows. It is intended for developers changing project fields,
validation, save behavior, or cache invalidation.

## Layers

Diamond project mutations use three layers that separate concerns:

1. **Commands** (`src/hooks/mutations/projectCommands.ts`): typed input shapes
   and form-to-command mappers. No I/O.
2. **Adapters** (`src/hooks/mutations/projectMutationAdapters.ts`): async
   FormData builders that resolve taxonomy relations and apply the field
   normalization rules.
3. **Mutation hooks**: React Query wrappers that call adapters, manage
   optimistic cache patches, invalidate queries, and handle errors.

```
Form values
  -> projectCommands (toCreateProjectInput / toUpdateProjectInput)
    -> projectMutationAdapters (buildCreateProjectFormData / buildUpdateProjectFormData)
      -> mutation hook (useCreateProject / useProjectUpdateUnified)
        -> projectsService.create / projectsService.update
```

## Command inputs

`projectCommands.ts` exports typed input interfaces and two public mappers:

| Mapper                 | Input               | Output               |
| ---------------------- | ------------------- | -------------------- |
| `toCreateProjectInput` | `ProjectFormValues` | `CreateProjectInput` |
| `toUpdateProjectInput` | `ProjectFormValues` | `UpdateProjectInput` |

Each mapper normalizes form values through internal helpers. Create and update
use separate normalization because empty values have different meanings in each
context.

### Create normalization

`normalizeCreateString` and `normalizeCreateNumber` convert blanks and nulls to
`undefined`. Omitted fields are excluded from the FormData payload so PocketBase
applies its own defaults.

### Update normalization (three-intent model)

`normalizeUpdateString` and `normalizeUpdateNumber` preserve a three-value
contract:

| Form value     | Normalized output | PocketBase effect         |
| -------------- | ----------------- | ------------------------- |
| `undefined`    | `undefined`       | Field omitted; no change. |
| `null` or `''` | `null`            | Field cleared to empty.   |
| Concrete value | Concrete value    | Field replaced.           |

The adapter translates `null` into an empty multipart value (`formData.set(key, '')`)
so PocketBase clears the stored field. This three-intent model lets edit forms
submit only changed fields without accidentally erasing untouched ones.

## Adapter responsibilities

`projectMutationAdapters.ts` converts command inputs into `FormData`:

- **Taxonomy resolution**: `resolveCompanyAndArtistIds` looks up company and
  artist names, even when a name resembles a record ID. Form commands carry
  names; only lookup results become relation IDs. The company and artist
  collections use 15-character lowercase record IDs, but name shape never
  determines input intent. Missing records return null.
  Failed lookups reject the save before the project write starts, with the
  relation and original error preserved. Create omits missing relations; update
  preserves the existing relation unless the command explicitly clears it.
- **Date formatting**: `formatDateForStorage` converts display dates to
  PocketBase storage format, using the user's timezone when available.
- **Image handling**: image files are appended to FormData directly. The update
  adapter delegates to `buildFormDataForUpdate`, which handles the image-removed
  sentinel.
- **Relation clearing**: when an update sends `null` for a relation field
  (company or artist), the adapter sets the field to `clearOptionalRelation()`
  so PocketBase removes the association.

## Mutation hooks

### useCreateProject

`src/hooks/mutations/useCreateProject.ts`

Creates a diamond project and optionally links tags. Key behaviors:

- Does not retry. An interrupted response can leave the save outcome unknown;
  the error handler notifies the user to check the project list.
- Failed company or artist lookups show "Project not saved" with the affected
  relation. Connection/server failures suggest retrying; authentication failures
  ask the user to sign in again. These failures cannot have created a project.
- Tag linking runs after the project create succeeds. Partial tag failures
  produce a warning but the project still exists.
- A new-project draft is retired immediately after the primary project write,
  before tag linking, analytics, cache work, or navigation. Failed or uncertain
  writes keep the local draft. The draft callback cannot turn a confirmed
  server write into a failed create.
- When `redirect: true`, navigates to the new project detail after a brief
  toast settle delay. Cache invalidation runs asynchronously after navigation.

The New Project page keeps companies and artists entered through its Add dialogs
as form drafts. It creates them only when the user saves the project. If artist
creation fails after company creation, it deletes the new company before
stopping the save. It also deletes newly created metadata after a failed
relation lookup or a definite project-write rejection. If cleanup fails, the
page says which record may remain so the user can check metadata before
retrying. It keeps metadata when the project-write response is interrupted or
returns a server error, because the project may have been created. Deferred
metadata creation does not show separate success notifications; the project
result provides the final confirmation. Add dialogs on edit and other pages
still create metadata immediately and notify on success.
The page also checkpoints JSON-safe form fields and staged company/artist
payloads on this device. Restoring a draft repopulates the selected metadata
names. Selected photo files are not stored and must be selected again.

### useProjectUpdateUnified

`src/hooks/mutations/useProjectUpdateUnified.ts`

Updates any combination of diamond project fields in one request. Key behaviors:

- Builds an optimistic cache patch from the input, applying only fields that
  are not `undefined`.
- Rolls back the optimistic patch on error.
- Invalidates the detail query, project lists, and stats overview on success.
- Does not retry failed mutations automatically.

### useEditProject

`src/hooks/useEditProject.tsx`

Orchestrates the edit page and edit drawer. Not a mutation itself, but the
primary consumer of `useProjectUpdateUnified`. It owns:

- Form state initialization from the loaded project.
- A frozen edit baseline and a local restore/discard choice for both the page
  and edit drawer. Submitting is blocked until the choice and any missing-photo
  choice are resolved. A confirmed update retires the draft before navigation
  or drawer close.
- Save-error notifications for failed lookups and other failures without field
  errors or an image compatibility dialog. Input stays in the form for retry.
  An interrupted update response shows "Save not confirmed" and asks the user to
  check the project before saving again.
- Dirty tracking (field-by-field comparison against the loaded snapshot).
- Field error state with auto-clearing as the user edits changed fields.
- Image MIME rejection detection for the `IncompatibleImageDialog`.
- Navigation protection (unsaved changes warning).
- Archive and delete confirmation dialogs.

### Project deletion

Project deletion verifies ownership and deletes the parent project in one
PocketBase request. The `progress_notes.project` and `project_tags.project`
relations cascade from that parent deletion, so a failed parent delete leaves
the project and its children intact. The `project_tags.tag` relation does not
cascade, so deleting a project preserves the user's tag records.

## Section mutations

The detail page also exposes section-level mutations in
`src/hooks/mutations/useProjectDetailMutations.ts`:

- `useUpdateProjectStatus`: status-only update with optimistic patch.
- `useUpdateProjectOverviewSectionMutation`: title, status, company, artist,
  source URL.
- `useUpdateProjectDatesSectionMutation`: four lifecycle dates.
- `useUpdateProjectSpecsSectionMutation`: dimensions, drill shape, diamonds,
  color count.
- `useUpdateProjectNotesSectionMutation`: general notes.
- `useUpdateProjectTagsSectionMutation`: tag delta sync.
- `useUpdateProjectImageSectionMutation`: cover image replace or remove.

Section mutations use the same `UpdateProjectInput` command shape. They set only
the fields they own, leaving everything else `undefined` (omitted).

## Adding or changing a field

1. Add or update the field in `ProjectFormValues` and `ProjectFormSchema`
   (`src/schemas/project.schema.ts`).
2. Add the field to `ProjectCommandFields` in `projectCommands.ts`.
3. Update `mapCreateProjectFormFields` and `mapUpdateProjectFormFields` with
   the correct normalization (create omits blanks; update preserves the
   three-intent contract).
4. Update the adapter's FormData builder to append the new field.
5. If the field is clearable, add it to the `clearFieldMap` array in
   `buildUpdateProjectFormData`.
6. If the field should appear in the optimistic patch, update
   `useProjectUpdateUnified`'s `onMutate`.
7. Add a focused test at the form, page, or mutation seam that owns the new
   behavior.

## Tests to update

- Form validation: `src/components/projects/__tests__/ProjectFormSections.image-crop.test.tsx`
- Edit hook: `src/hooks/__tests__/useEditProject.test.tsx`
- Command mapping: `src/hooks/mutations/__tests__/projectCommands.test.ts`
- Adapter relations: `src/hooks/mutations/__tests__/projectMutationAdapters.relations.test.ts`
- Unified update: `src/hooks/mutations/__tests__/useProjectUpdateUnified.test.tsx`
- Create mutation: `src/hooks/mutations/__tests__/useCreateProject.test.tsx`

```bash
pnpm test -- src/hooks/__tests__/useEditProject.test.tsx
pnpm test -- src/hooks/mutations/__tests__/projectCommands.test.ts src/hooks/mutations/__tests__/projectMutationAdapters.relations.test.ts
pnpm test -- src/hooks/mutations/__tests__/useProjectUpdateUnified.test.tsx src/hooks/mutations/__tests__/useCreateProject.test.tsx
```
