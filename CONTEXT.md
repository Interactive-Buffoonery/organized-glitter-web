# Context

Domain glossary for Organized Glitter. When code, issues, or refactors name a
concept defined here, use the term as written.

## Craft verticals

Organized Glitter supports two craft verticals: diamond art and
coloring books. Diamond art uses project records for kits and canvases. Coloring
uses book records plus page records so users can track both ownership and
page-level progress.

## Project

A crafter's diamond art kit, tracked through statuses (`wishlist`, `purchased`,
`stash`, `kitted`, `progress`, `onhold`, `completed`, `archived`, `destashed`).
Stored in the `projects` PocketBase collection.

## Coloring book

A coloring book owned or wished for by a crafter. Stored in the `coloring_books`
PocketBase collection. Books track ownership status, publisher, illustrator,
page count, tags, and whether the book is a mystery coloring book.

## Coloring page

A page inside a coloring book. Stored in the `coloring_pages` PocketBase
collection. Pages track page-level status, dates, photos, mediums, progress
notes, and mystery reveal state.

## Color reference

A page-owned record that stores swatch photos and plain-text notes for a
coloring page. Stored in the `coloring_page_color_references` collection with a
unique page index (one reference per page). Photos are protected files requiring
a file token. All mutations go through a single authenticated transactional route
rather than the normal collection APIs. Empty references are removed
automatically. Archive export and restore preserve swatch photos and notes as a
separate file role.

## Recovery checkpoint

Browser-local state that tracks an archive restore's progress so a retry can
resume where it left off. Scoped by account and archive fingerprint. Coloring
page checkpoints store record IDs and metadata per page. Diamond project
checkpoints preserve each archive ref's destination record ID and unfinished tag
work. Completed diamond checkpoints expire after 30 days; checkpoints with
unfinished tag work are retained until that work succeeds. If the checkpoint is
unavailable and multiple existing projects match the same title and source URL,
restore reports the ambiguity instead of merging.

## Tags

Organized Glitter has separate tag vocabularies for diamond projects and
coloring books. Diamond project tags live in `tags` and are attached through
`project_tags`. Coloring book tags live in `coloring_tags` and are attached
through `coloring_book_tags`.

Use separate user-facing management language when the distinction matters, such
as "Diamond tags" and "Coloring book tags", rather than implying there is one
shared cross-craft tag list.

## Mystery coloring book

A coloring book whose `is_mystery` flag is true. Mystery is **book-level
metadata**: the book is sold as a mystery. Reveal state lives at the **page
level** because each page in a mystery book has its own revealed or unrevealed
state. Library cards always show the real cover plus a "Mystery" chip; do not
hide covers behind mystery state. If a page was revealed by mistake, clearing
the page reveal returns it to the unrevealed mystery state without changing the
book's mystery metadata.

## Filter state vs. service filters: the cross-client contract

The app has two filter shapes that look similar and must not be conflated:

- **`FilterState`** (`src/contexts/FilterContext`): the **web UI's** filter
  state. Includes pagination, sort, view toggles, and UI-prefixed names
  (`activeStatus`, `selectedCompany`, `selectedArtist`, `selectedDrillShape`,
  `selectedYearFinished`, `selectedTags`).

- **`ProjectFilters`** (`src/types/projectFilters.ts`): the **service-layer
  contract**. The shape every client (web, iOS) hands to the service when it
  wants a filtered view of projects. Field names match PocketBase
  (`status`, `company`, `artist`, `drillShape`, `yearFinished`, `selectedTags`)
  and include `userId` for data isolation.

`ProjectFilters` is the contract between _any_ client and the project service.
Web's adapter is `toProjectFilters(userId, filterInput)`
(`src/services/pocketbase/projectQueryBuilder.ts`). The iOS port will write its
own equivalent adapter from native UI state to `ProjectFilters`.

`ProjectFilterCriteria` is `Omit<ProjectFilters, 'userId'>`, used for query
keys where the userId is already keyed separately.

## Search term gate

A search term must be at least **2 characters** to reach the service layer.
Single-character searches match almost everything in PocketBase's `~` LIKE
queries, blow the cache, and return useless results. The gate is enforced
inside `toProjectFilterCriteria` (used by `toProjectFilters`) so every filter
consumer inherits it.
The project search field keeps shorter drafts local and explains the minimum;
clearing the field clears the active search. Shared URLs and saved filter
snapshots with shorter terms normalize to an empty search before they reach
the dashboard filter state.

For coloring books, explicit Status selections determine which books appear.
Archived and Destashed switches apply only when no statuses are selected.
Selecting a status clears those switches, including stale values from shared
links and saved filters.

## Freshness profiles

Named caching tiers used by `userScopedQueryOptions`
(`src/hooks/queries/shared/queryUtils.ts`):

- `standard`: 10 min stale / 10 min gc. Stable, user-scoped data
  (companies list, all-companies).
- `frequent`: 5 min stale / 10 min gc. More frequently changing data
  (artists, tags).
- `statusCount`: 2 min stale / 5 min gc. Live dashboard counts and the
  project list.

Pick a profile by name; do not assemble stale/gc fields per call site.

## Berry Cream

The app's color palette family. Berry Cream Light uses warm pink surfaces, a
berry primary, and a purple accent. Berry Cream after dark uses a deep navy
stage (`#151533`), raspberry primary, and lavender accent. Both palettes map
into the same semantic token roles so component code stays appearance-agnostic.
The old Catppuccin palette names (`catppuccin-latte`, `catppuccin-frappe`,
`catppuccin-macchiato`, `catppuccin-mocha`) are legacy values accepted by the
PocketBase schema; they resolve to Light or Dark at read time.

## Appearance modes

The user picks Light, Dark, or System in the theme chooser (`src/lib/theme.ts`).
Unset preference and first launch default to System. Light uses Berry Cream Light.
Dark uses Berry Cream after dark. System follows the device preference. The
PocketBase `theme_preference` select still accepts legacy Catppuccin values for
existing records; new writes use `light`, `dark`, or `system`.

## Page atmosphere

The product page body is not a flat fill. A viewport-fixed `div.page-atmosphere`
(`index.html`) paints `--page-atmosphere` behind the app: a blush-to-lilac wash
in Light and a quiet lavender bloom over the navy stage in Dark. Content height
does not move or stretch it. Sticky header and bottom nav stay translucent so
the atmosphere reads through chrome. The `/links` page suppresses the atmosphere
by adding `utility-register` on `<html>`.

## Registers

Design-system contexts that scope which visual rules apply. They are mutually
exclusive; choose one before applying design rules:

- **Product app register:** Authenticated product pages, dashboards, detail/edit
  flows, settings. Uses semantic tokens, glass panels, the Caveat H1 rule,
  section rhythm, and the page atmosphere.
- **Marketing paper register:** Public home marketing surfaces. Uses paper,
  washi tape, scrapbook composition, and Caveat accents inside the marketing
  subtree and `src/styles/scrapbook.css`.
- **Public utility register:** `/links`. Uses the selected palette through
  semantic tokens, flat link blocks, and Karla typography. Does not use glass,
  paper, gradients, or the page atmosphere. Adds `html.utility-register` so the
  app shell stays opaque.

See [`DESIGN.md`](./DESIGN.md) and
[`docs/design-system/overview.md`](./docs/design-system/overview.md) for the
full register contracts.

## Randomizer

The randomizer (`/randomizer`) lets a crafter spin a numbered wheel over
a filtered and selected pool of diamond projects, coloring books, or coloring
pages to decide what to work on next. It uses a wheel-first layout with
numbered segments, a split section picker, and craft-specific result actions.
See [`docs/design-system/glass.md`](./docs/design-system/glass.md) for the
approved layout direction.

### Section picking

After the wheel picks a diamond project, the crafter can optionally pick
a section of the canvas to work on. DiamondSectionHelper offers two modes:

- **Size mode**: select preset square sizes (3x3, 4x4, 5x5 cm) or enter custom
  dimensions, then roll. The picker estimates a diamond count from the project's
  total dimensions and area. Multiple presets can be selected at once; the roll
  picks one at random.
- **Number mode**: enter section numbers separated by commas (e.g. canvas grid
  labels printed on the kit), then pick one at random.

Both modes persist the chosen section into the spin record's metadata
(`RandomizerSection`, a discriminated union with `kind: 'size'` and
`kind: 'number'`). The section feeds into the default progress-note text.

### Complete taxonomy reads

`useAllCompanies` and diamond tag consumers retrieve the complete owner-scoped
list through bounded requests. A later-page failure rejects the complete read
instead of presenting the earlier pages as a successful, incomplete list. See
[`docs/codebase/README.md`](./docs/codebase/README.md) for the full contract.

### Pool identity and spin lifecycle

A target pool belongs to one account, craft mode, and eligibility selection.
Changing that identity cancels an active wheel session and gates new spins, but
preserves the completed result, section draft, saved spin ID, and pending result
operations. Explicit selection, account, mode, and eligibility changes reset the
result. Background membership changes also preserve the completed result and
section draft, even when the picked target leaves the eligible pool. See
[`docs/codebase/README.md`](./docs/codebase/README.md) for the full lifecycle
contract.

## Mobile

For mobile app scope, navigation model, and timer plans, see
`docs/mobile/mobile-v1-scope.md` (historical reference outside this extraction).

## Diamond catalog

A shared, server-controlled collection of kit metadata (title, company, drill
shape, dimensions, variant identifiers, cover image). Users search the catalog
or scan a barcode to prefill Add Project instead of typing everything manually.
The catalog is maintained by curator review; normal users cannot alter shared
catalog rows. See
[ADR-0022](./docs/adr/0022-free-catalog-and-optional-tips.md) for the
launch model.

## Catalog add

A save of a private project using shared catalog data from a scan or search.
Catalog search, scanning, and import are free. The saved project remains
private and editable; later catalog corrections do not silently replace the
user's edits. Manual project entry is also free.

## Developer tips

Optional, repeatable one-time "Support Organized Glitter" purchases through
Apple in-app purchases and RevenueCat. Tips grant no feature access or promise
of future paid access.

## Curator review

Sarah's internal review workflow for kit-fact suggestions submitted by users
through the URL kit import opt-in flow. Pending suggestions are not searchable
in the catalog. Only accepted rows become live catalog entries. Rejected rows
leave the queue without notifying the submitter in v1. See
`docs/plans/url-kit-import.md` (historical reference outside this extraction) phase 2.

## URL kit import

A paste-a-product-URL flow on Add Project. The user pastes a shop listing URL,
the backend fetches structured product data, and the form prefills with editable
metadata. The saved project is private. This is not a catalog crawl and not
order-history import. See
`docs/plans/url-kit-import.md` (historical reference outside this extraction).

## Work session

Timed crafting activity recorded against a progress unit. Diamond work sessions
attach to a Project. Coloring work sessions attach to a Coloring page, not the
parent Coloring book.

Work sessions are stored as individual session entries rather than only as an
accumulated total. Totals can be derived from sessions, but individual sessions
cannot be reconstructed from one total.

Saving a work session does not require a progress note. At stop/save time, the
user may save the session alone or save it with an optional progress note
companion record.

For the full timer feature spec, see
`docs/mobile/mobile-v1-scope.md` (historical reference outside this extraction).
