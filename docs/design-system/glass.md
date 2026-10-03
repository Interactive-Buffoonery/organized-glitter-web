# Glass design system: style guide

A reference for product app surfaces that use the glass / iOS aesthetic
introduced on the project detail page (PR #263). Read this before starting a
branch that touches the Dashboard, Overview, Randomizer, profile pages,
metadata pages (Companies / Artists / Tags), or any other authenticated
product page-level surface.

This guide is scoped to the product app register. Public home marketing uses
the Paper Register documented in `DESIGN.md` and `overview.md`; `/links` uses
the public utility register. Do not force either public surface into glass.

This is a working document for engineers and Claude sessions; update it as the
system evolves.

## Vocabulary

| Term                                 | Meaning                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Panel**                            | A `<GlassPanel />`, the canonical product app container for grouped content. Replaces `Card`, `SectionCard`, ad-hoc `bg-card rounded-lg` divs inside grouped product regions. |
| **Lozenge**                          | The active segment in a glass `SegmentedControl`, a primary-tinted floating tile inside a glass track.                                                                        |
| **Hairline divider**                 | `border-border/60 border-t pt-6`, the iOS-settings rhythm separator used between groups inside a panel.                                                                       |
| **Atmosphere**                       | Viewport-fixed product page wash (Light) or navy-plus-lavender bloom (Dark), painted on `.page-atmosphere`. Content height must not move it.                                  |
| **Aurora**                           | Deprecated token family. `.aurora-bg` is a transparent layout hook. Do not paint `aurora-*` tokens onto chrome.                                                               |
| **Identity column / details column** | The 4/8 split used on detail and form pages, with image and primary fields on the left and supplementary content on the right.                                                |

## Tokens

All product app glass styling is driven by CSS variables in `src/index.css`.
Don't hardcode glass-y rgba values; use the tokens.

```css
--glass-bg          /* panel fill */
--glass-border      /* hairline panel border */
--glass-highlight   /* inset top-edge highlight */
```

Light-mode values (`:root`):

```css
--glass-bg: 338 67% 98% / 0.85;
--glass-border: 324 17% 24% / 0.1;
--glass-highlight: 0 0% 100% / 0.6;
```

Dark-mode values (`.dark`):

```css
--glass-bg: 250 34% 18% / 0.74;
--glass-border: 300 24% 96% / 0.1;
--glass-highlight: 300 24% 96% / 0.12;
```

The aurora tokens remain in `src/index.css` for legacy callers, but they are not
an active product background system. Product page atmosphere lives on
`.page-atmosphere` via `--page-atmosphere`. Do not add extra product
page-level gradients or new body patterns. Home paper texture gradients
live in `src/styles/scrapbook.css`; `/links` remains flat via `html.utility-register`.

## Primitives

### `<GlassPanel />`: `src/components/ui/glass-panel.tsx`

The canonical product app grouped-region container. Use it for product regions
where you would have used `Card`, `bg-card rounded-lg shadow-sm border`, or
`bg-white/60 backdrop-blur` in the past. Do not use it for every public leaf
link, marketing paper note, result row, or flat content item.

```tsx
import { GlassPanel } from '@/components/ui/glass-panel';

<GlassPanel className="p-6">…content…</GlassPanel>
<GlassPanel className="space-y-5 p-6">…stacked content…</GlassPanel>
<GlassPanel className="p-6 md:p-8">…wider padding on desktop…</GlassPanel>
```

Internal padding is your call (`p-4` for tight panels, `p-6` for default,
`p-8` for hero panels). Don't override the radius (`rounded-2xl`), border,
shadow, or backdrop-blur; those are the consistent visual signature.

### Button variants: `src/components/ui/variants.ts`

Two glass variants exist:

- `variant="glass"`: neutral translucent button. Use for secondary controls
  inside or near a product `<GlassPanel>`, filter chip groups,
  panel-anchored toolbars, and form-footer actions.
- Top-bar page chrome is an exception: Back, Edit, and overflow triggers use
  `variant="ghost"`, not glass, so the page H1 remains the visual anchor.
- `variant="glass-destructive"`: red-tinted glass. Use for explicit
  destructive operations (Remove image, in-line Delete on items). For
  destructive _confirms_ inside `<AlertDialog>`, use the workaround pattern
  documented in the `shadcn-alertdialogaction-variant-prop-ignored` skill;
  the `variant` prop on `AlertDialogAction` is silently dropped.

Sizes available (in addition to default): `xs`, `sm`, `lg`, `icon`, `icon-xs`,
`icon-sm`, `icon-lg`. Floating image-toolbar buttons over a hero image use
`icon-sm` from `sm:` upward and `icon` (=`size-9`) on mobile for touch comfort.

### `<SegmentedControl variant="glass" />`: `src/components/shared/SegmentedControl.tsx`

Use for binary or three-way mutually-exclusive choices inside a panel. The
glass variant renders a single rounded glass track with a soft
primary-tinted lozenge for the active segment.

```tsx
<SegmentedControl
  variant="glass"
  value={kind}
  onValueChange={setKind}
  options={[
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]}
/>
```

The dashboard `ViewToggle` keeps the default `solid` variant because it lives
on a flat (non-glass) background. Use `glass` only inside a product
`GlassPanel`.

## Layout patterns

### Page chrome

Use `container mx-auto px-4 py-6` (no `max-w-6xl`) on product app page-level
wrappers. This is what the detail and form pages use. Avoid arbitrary
max-widths so content rhythm stays consistent across the app.

```tsx
<MainLayout>
  <div className="container mx-auto px-4 py-6">{/* page content */}</div>
</MainLayout>
```

### Page headers

On product app pages, replace `text-2xl font-bold` with handwritten H1, quiet
ghost Back button, optional subtitle, optional right-aligned overflow menu:

```tsx
<div className="mb-6 flex items-start justify-between gap-4">
  <div className="flex items-start gap-4">
    <Button type="button" variant="ghost" size="sm" onClick={onBack}>
      <ArrowLeft className="mr-2 h-4 w-4" /> Back
    </Button>
    <div>
      <h1 className="font-handwritten text-3xl leading-tight tracking-tight md:text-4xl">
        {title}
      </h1>
      {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
    </div>
  </div>

  {/* Optional: kebab menu for low-frequency / destructive actions */}
  <DropdownMenu>…</DropdownMenu>
</div>
```

If the product page has no Back link (top-level pages like Dashboard,
Overview), drop the Back button but keep the handwritten H1 and the kebab
placement.

Project create/edit forms are the exception: keep the small rotated Caveat
state label (`Adding`, `Editing`) above a Karla H1 so user-entered project
titles stay legible and do not become oversized script.

### Two-column 4/8 layout (detail + forms)

```tsx
<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
  <aside className="lg:col-span-4">
    <GlassPanel className="space-y-5 p-6">…identity column…</GlassPanel>
  </aside>
  <main className="lg:col-span-8">
    <GlassPanel className="p-6 md:p-8">…details column…</GlassPanel>
  </main>
</div>
```

Below `lg:` (1024px) this collapses to a single column. The identity column
goes on top; that's what the project detail page does and what users see on
mobile.

### Section rhythm inside a panel

When a product panel holds multiple labeled groups (Tags, Dates, Notes, etc.),
use `SectionHeading` from `src/components/shared/Section.tsx` with the same
divider rhythm used by project and coloring detail pages:

```tsx
const Section = ({ label, isFirst = false, children }) => (
  <section className={cn('space-y-4', !isFirst && 'border-border/60 border-t pt-6')}>
    <SectionHeading as="h3">{label}</SectionHeading>
    {children}
  </section>
);
```

Rules:

- The first group in a panel gets `isFirst` (no top divider). Every other
  group gets the divider above it.
- Section labels are sentence-case Karla, `text-sm font-semibold tracking-tight`,
  prefixed with a 2px by 22px primary dash via `SectionHeading`.
- Inside the panel, wrap groups in a parent `<div className="space-y-6">` for
  the spacing between groups; `Section` adds the `pt-6` itself when `!isFirst`.
- If the panel only holds one logical group (e.g. a single chart, a single
  list), drop the `Section` wrapper entirely. Don't add a single labeled
  section just to fill the slot.

### "Loose top group" pattern

When a panel's first group is the _implicit_ topic of the panel (e.g. kit
fields under "More details"), render those fields without a `Section` wrapper
or label. Field labels speak for themselves; the panel heading frames them.
Apply hairline dividers only between _labeled_ groups below.

This is what the form's "More details" panel does: kit fields at top
(unlabeled), then `Tags`, `Dates`, `Source URL`, and `Notes` as labeled
sections with dividers.

### Sticky footers

Use `<ProjectFormFooter />` as the template for pages with a primary action
that lives at the bottom (forms, multi-step flows). The component exposes
`{ submitting, disabled, onCancel, onSubmit, submitLabel, submittingLabel }`
and renders the iOS safe-area inset correctly so the footer never disappears
behind the mobile bottom nav.
New mobile sticky chrome should prefer `bottom-[var(--bottom-nav-total-height)]`
so it stays aligned with `<BottomNavigation />` and `<MainLayout />`.

If you need a sticky toolbar that's not a save bar (e.g. a bulk-action bar on
the dashboard), copy the same outer markup:

```tsx
<div className="border-border bg-background/95 sticky bottom-0 z-10 mt-6 border-t pt-4 pb-4 backdrop-blur max-lg:bottom-[var(--bottom-nav-total-height)] lg:pb-[calc(1rem+env(safe-area-inset-bottom))]">
  …toolbar contents…
</div>
```

## Destructive actions

The detail and edit pages use a **kebab `DropdownMenu`** in the page header
for low-frequency destructive actions (Archive, Delete). The pattern:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button type="button" variant="ghost" size="icon" disabled={busy} aria-label="More actions">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-48">
    <DropdownMenuItem onClick={onArchive} disabled={busy}>
      <Archive className="mr-2 h-4 w-4" /> Archive
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onClick={onDelete}
      disabled={busy}
      className="text-destructive-text focus:text-destructive-text focus:bg-destructive/10"
    >
      <Trash2 className="mr-2 h-4 w-4" /> Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

For the actual confirmation dialog, **keep the existing
`useConfirmationDialog` hook** if the page already uses one (it does on Edit).
The kebab item just calls the existing handler; the page-level
`<ConfirmationDialog />` still fires unchanged. Don't reimplement the dialog.

For destructive _primary_ actions on a page (e.g. "Delete project" as the
hero CTA on a "really gone forever" confirmation page, rare), use
`variant="glass-destructive"` directly.

For _inline_ destructive controls (Remove image, Remove tag, Delete progress
note), use `variant="glass-destructive"` in `icon-sm` size.

For destructive confirms inside `<AlertDialog>`, use the
`buttonVariants({ variant: 'glass-destructive' })` workaround on
`AlertDialogAction` because shadcn drops the `variant` prop. See the
`shadcn-alertdialogaction-variant-prop-ignored` skill.

Never use the old "footer Danger Zone strip" pattern. It's been replaced
everywhere.

## Image surfaces

The `ProjectImageDropzone` is the template for any page that lets users upload
or change an image. Key elements:

- Use the shared image policy/crop presets instead of hard-coding file types,
  max sizes, or crop dimensions in each form.
- Domain defaults:
  - Project covers: `Rectangle crop` (4:3) by default, with `Square crop` and
    `Fit whole image` available.
  - Progress notes: `Fit whole image` by default, with rectangle/square crop
    options available. Notes are documentary, so preserve context first.
  - Coloring book covers: `Book cover crop` (3:4) by default, with square and
    fit options available.
  - Coloring page photos: `Fit whole page` by default; page photos are usually
    portrait and should not silently lose artwork at the edges.
- Empty state: `<label htmlFor>` wrapping the upload UI for keyboard
  accessibility, never a clickable `<div>`.
- Filled state: prefer previews that match the default framing for that domain.
  Use floating glass icon-buttons (Replace, Crop, Remove) over a
  `bg-gradient-to-b from-black/35 via-black/10 to-transparent` scrim for
  contrast when controls sit on top of imagery.
- Drag-and-drop via the `DataTransfer` shim pattern (see `dispatchSyntheticChange`
  in `ProjectImageDropzone.tsx`) so you don't have to refactor `useImageUpload`.

If you build a new image-bearing component (e.g. company logo, artist photo,
user avatar), start from the shared image policy and choose a domain-specific
presentation default. Covers are presentation-first; notes/pages are
preservation-first.

## Forms

- Field labels: lowercase first word, no period (e.g. "Project title", not
  "Project Title" or "Project title."). `required: true` should add a single
  ` *` suffix on the label, not a separate "(required)" pill.
- Inputs: keep the shadcn `Input` defaults; they already pick up the glass
  context from their wrapping panel.
- Date inputs: product UI uses the shared `DateField` wrapper instead of native
  `<input type="date">`. It keeps manual `YYYY-MM-DD` entry, normalizes common
  US slash dates on blur, and uses an app-styled React Aria calendar with
  month/year navigation for picker behavior.
- Number inputs: use the `useNumberInput` hook so the empty state is "" not
  `0`.
- Validation: currently surfaces via `notify()` toast on submit. Inline field
  errors are out of scope for the glass system PR; track separately.

## Surfaces NOT to glass-ify

- Login / register / password-reset pages: keep the existing layout. These
  are auth chrome, not part of the app surface, and the gradients/marketing
  on them serve a different purpose.
- Public home marketing paper surfaces: use the Paper Register in `DESIGN.md`
  and `overview.md`. Paper notes, washi tape, and marketing scrapbook surfaces
  should not be converted to `<GlassPanel>`.
- `/links` public utility page: use the selected site palette and flat
  anchor blocks. Do not add glass, paper, or gradients.
- Design preview artifacts under `docs/design-previews`: previews may use
  prototype-only CSS and hardcoded colors. They are not shipped glass rules.
- Toasts / notifications: use the app's Sonner wrapper in
  `src/components/ui/sonner.tsx`. Toasts are overlay feedback, not page regions,
  so do not wrap them in `GlassPanel`, add blur, or add alpha-white glass
  utilities. Keep the solid semantic surfaces documented in
  [`overview.md`](./overview.md#feedback-notifications).
- The shadcn `<Dialog>` and `<AlertDialog>` content backdrops: the existing
  scrim is correct. The dialog _content_ surface can carry glass tokens
  (the progress-note dialog does this with `bg-[hsl(var(--glass-bg))]
backdrop-blur-2xl backdrop-saturate-150` on `DialogContent`).

## Dialogs

`DialogContent` in `src/components/ui/dialog.tsx` owns the injected close
button. Do not restyle that X per screen.

### Default close button

Keep `showCloseButton` at its default (`true`) for ordinary solid and glass
dialogs (forms, progress notes, metadata editors, account settings).

The injected control is a glass icon button:

- `variant="glass"` and `size="icon-sm"` from `buttonVariants`
- `pointer-coarse:size-11` so coarse pointers get a 44px square target
- Absolute `top-4 right-4`
- Token fill, border, highlight, and focus-visible ring from the shared Button
  glass treatment

Leave room in the header with `pr-12` / `pr-14` so titles do not collide with
the X. Prefer that padding over moving or restyling the injected button.

### When to opt out

Set `showCloseButton={false}` only for custom, full-bleed, or media dialogs
where the injected X competes with image chrome or a custom toolbar. Example:
`ImageGallery`.

When you opt out, the dialog must still provide a clear close path:

1. A visible close or dismiss control in the dialog chrome, or
2. Documented Escape and outside-click behavior that remains available
   (announce it in `DialogDescription` when the surface is otherwise silent)

`ImageGallery` is the canonical example. It opts out and places a
`variant="glass"` `size="icon-sm"` Close button in an absolute-positioned
toolbar overlay alongside the open-in-new-tab and retry actions. The toolbar
uses `pointer-coarse:size-11` on every action so coarse pointers get a 44px
tap target. Escape and outside-click remain available as secondary paths.

Do not fork `DialogContent` to hide the X. Do not add one-off CSS that
restyles `[data-radix-dialog-close]` for a single caller.

`AlertDialog` is out of scope here: it has no injected close X and uses
footer actions only.

## Current page patterns

### Public home marketing

The public home page is not a glass page. It uses the marketing paper register
to introduce the product before authentication.

- Use Paper Register tokens and `src/styles/scrapbook.css` for paper, washi,
  material texture gradients, and scrapbook composition.
- Keep the Paper Register scoped to `src/components/marketing/**`,
  `src/styles/scrapbook.css`, and marketing preview assets explicitly
  referenced by the home page.
- Caveat may appear on overlines, tape labels, feature titles, scribble
  accents, and Sarah note text in this register.
- Literal product preview assets may show product UI, including the randomizer
  wheel palette. Do not turn wheel colors into generic marketing decoration.
- Do not add `<GlassPanel>` to paper notes or marketing feature blocks to make
  them match product app surfaces.

### Links page

`/links` is a public utility page for Sarah/brand links, not a product profile
or social surface.

- Use the selected site theme’s semantic tokens.
- Keep link entries as flat semantic anchor blocks with strong focus, hover,
  and touch states.
- Use Karla typography. Do not add Caveat labels or home paper styling.
- Do not use `<GlassPanel>`, paper tokens, washi tape, aurora tokens, or
  gradients.
- Do not reuse this register as a general Dark component language for
  product pages.

### Randomizer

The randomizer follows the approved Wheel first direction. Craft selection sits
above a flat two-column layout. At 768px and wider, status filters and the
searchable item list sit on the left; the wheel, result, active craft's Next up,
and collapsed Spin History sit on the right. On narrower screens, the wheel
comes before the selection region. These content regions do not use GlassPanel.

The wheel is fluid within its column and capped at 320px, including empty states.
Keep patterned wedges, outlined labels, the numbered key, keyboard controls,
announcements, and reduced-motion support. Selection rows use a separate check
indicator, unobscured thumbnails, wrapping titles, and status icon plus label.
Search filters only the visible list; it never removes selected items from the
wheel or changes their wheel numbers. Craft changes clear the local search.

Status filters and section-size choices use labeled checkboxes: checked means
included. Labels are clickable with a minimum 44px tap height. Status groups
explain which projects, books, or pages are included; section sizes say
"Choose the sizes the randomizer can pick."

The diamond section picker offers Size and Number radio options. Size uses the
existing canvas dimensions and presets. Number accepts a comma-separated list
of positive whole section numbers and works without canvas dimensions. Duplicate
numbers count once. Keep the entered number list when switching between Size
and Number for the current result. Save the picked number and candidate list in spin metadata;
progress-note suggestions use "Section number" for number picks. Existing saved
size metadata remains supported.

Use Projects, Books, and Pages as list headings. Page copy is:
"Pick some or all of your in-progress projects and spin the wheel!"
Do not restore the discarded "one spin away" subtitle or "in the draw" headings.
The empty Next up hint uses small italic text: "Run the randomizer and save a
choice. It will appear here." Allow the hint to wrap on phones.

The wheel uses a dedicated purple-and-cream data-visualization palette, from
pale lavender to deep violet with warm cream slices. Labels retain automatic
contrast selection and patterns supplement color. Do not reuse these colors as
ordinary app chrome, marketing decoration, or public utility styling.
Result actions sit below the wheel: view the project, book, or page; set next up;
save a note; or use the craft-specific section/page picker. For diamond paintings,
Save progress note sits below the section picker and remains available when
section picking is skipped. Clear result stays a quiet ghost action.

### Library

The Library at `/dashboard` is the shared project collection shell across diamond paintings,
coloring books, and coloring pages.

- `DashboardShell` owns the Caveat H1, craft `SegmentedControl`, and the single
  New project action. Do not add per-vertical page titles that compete with it.
- Desktop filters use one sidebar `<GlassPanel>` per active pane. On mobile,
  filters move to the drawer/sheet surface and should not add a second glass
  wrapper inside the drawer.
- Project cards, coloring book cards, coloring page cards, list rows, and table
  rows are leaf surfaces. They stay flat on the page surface; do not wrap each
  item in `<GlassPanel>`.
- Status segments and summary bars sit directly above the result grid/list and
  should use hairline, token-backed surfaces rather than decorative panels.
- Keep diamond, coloring book, and coloring page panes structurally parallel:
  sidebar for filters, content column for status segments, summary, and results.

### Project and coloring book edit drawers

Project and coloring book edit open as overlays on the detail page rather than
route pushes. The components are `src/components/projects/ProjectEditDrawer.tsx`
and `src/components/coloring/ColoringBookEditDrawer.tsx`; both pick their
primitive at runtime via `useMobileDevice().isPhone`:

- **Desktop and tablet**: Radix `Sheet` (`@/components/ui/sheet`) with
  `side="right"`, sized `sm:max-w-xl md:max-w-2xl lg:max-w-3xl`. The body is
  the same form component the matching `/edit` route renders, wrapped in a
  single scrollable region with a sticky header and footer.
- **Phones** (`const { isPhone } = useMobileDevice()`): vaul `Drawer`
  (`@/components/ui/drawer`) sized by `useKeyboardSafeViewportStyle`.
  The drawer passes `repositionInputs={false}` and applies the hook style to
  `DrawerContent`, which sets `height`, `maxHeight`, and `bottom` from
  `window.visualViewport`. This keeps the footer attached to the usable
  viewport while the software keyboard is open, without letting vaul apply a
  second keyboard offset. This intentionally overrides the project's default
  70dvh quick-action drawer height because the edit form is form-heavy and
  benefits from full vertical space; quick-action drawers elsewhere should
  still default to 70dvh.
- Drawers are conditionally mounted on their detail pages so vaul's body-style
  observers do not run while the drawer is closed. Closing the drawer relies on
  `onOpenChange` so animations finish cleanly.
- Save uses `useEditProject(projectId, { navigateOnSubmit: false })`. On
  success the drawer invalidates `queryKeys.projects.detail(projectId)` and
  closes itself; it never navigates. The `/projects/:id/edit` route stays as
  a direct-link fallback.
- Coloring book save uses `useSaveColoringBookEdit()`. On success the drawer
  refreshes the coloring book caches and closes itself; it never navigates.
  The `/coloring/:id/edit` route stays as a direct-link fallback.

Footer layout diverges from the kebab-in-header pattern documented under
**Destructive actions** because the drawer surface already provides a sticky
footer. The footer is a single horizontal row:

- Left: `Archive` and `Delete` as `size="icon"` ghost buttons with
  `aria-label`s. Coloring book Archive sets status to `archived`; Delete keeps
  the destructive token color.
- Right: `Cancel` (ghost) and `Save changes` (default), pushed with `ml-auto`.

Do not stack these vertically on mobile and do not reintroduce the kebab in
the drawer header. The footer row is the canonical placement for this surface.
Pages that are not the edit drawer continue to use the kebab
pattern from **Destructive actions**.

### Overview

A personalized start page with a mixed in-progress activity list, quick links,
and a library snapshot. Mostly flat; glass is reserved for the right rail.

- Layout: two-column grid (`lg:grid-cols-[minmax(0,1fr)_360px]`); the mixed
  diamond painting / coloring activity list stays on the left, and the quick
  links + library snapshot rail sits on the right.
- Section heading ("In progress") follows the **Section-Heading-Style Rule**:
  lowercase `text-sm font-semibold` with a 2px primary dash. No glass wrappers
  around the activity list or list rows.
- `OverviewRightRail` is the one glass region on the page (sidebar / grouped
  quick links and snapshot, per **Glass-As-Region-Not-Card**).
- Activity rows render directly on the page with hairline
  `border-border/60` dividers. Status uses dot + label, never hue alone.
- Craft filters use a compact connected slider (`All`, `Diamond paintings`,
  `Coloring books`) with a contained active segment.

### Coloring book detail

Coloring book detail is a cover-led library page.

- Top chrome uses `variant="ghost"` for Back, Edit, and More actions.
- The book cover is a flat bordered image surface, not a glass panel. Mystery
  status is a small primary chip on the cover.
- The Pages grid is dense and flat. Page cards are small navigation affordances,
  not standalone panels.
- Details, tags, and notes use `SectionHeading` region markers plus hairline
  lists or inline editing, not nested cards.

### Coloring page detail

Coloring page detail is a progress-capture page.

- The artwork/photo canvas stays large and flat. It should not sit inside a
  glass panel because the photo is the content.
- One right-rail `<GlassPanel>` groups status, dates, mediums, and mystery
  reveal controls. Use internal dividers instead of sub-panels.
- Page photos default to preserving the whole artwork. Thumbnail management can
  use flat bordered image groups with quiet outline/ghost actions.

## Verification checklist for new pages

Before opening a PR that adopts the product glass system on a new page:

- [ ] Page wrapper is `container mx-auto px-4 py-6` (no `max-w-6xl`)
- [ ] H1 uses `font-handwritten text-3xl md:text-4xl`, except project create/edit forms where the `Adding`/`Editing` label is handwritten and the H1 is Karla
- [ ] Back/Edit/overflow buttons in page top bars use `variant="ghost"`
- [ ] Grouped controls use one `<GlassPanel>` per region; content lists and
      result grids stay flat unless a documented page pattern says otherwise
- [ ] Solid-color "info pills" inside panels removed (e.g. `bg-secondary`
      empty states); they break the panel's glass read
- [ ] Destructive actions use `variant="glass-destructive"` (or the
      `AlertDialogAction` className workaround)
- [ ] If the page has a SegmentedControl inside a panel, it uses
      `variant="glass"`
- [ ] Visual smoke test in **both** light and dark mode at 1440 / 900 / 375
- [ ] Console: no errors after navigation, only the pre-existing favicon 404
      from `gstatic.com/faviconV2` if a stored Source URL is involved

For public marketing and utility surfaces:

- [ ] Public home marketing uses Paper Register tokens and
      `src/styles/scrapbook.css`, with no `<GlassPanel>` requirement
- [ ] Public home paper/washi/Caveat accents stay in
      `src/components/marketing/**`, `src/styles/scrapbook.css`, or marketing
      preview assets explicitly referenced by the home page
- [ ] `/links` uses the selected site palette, flat
      anchor blocks, Karla typography, and no glass, paper, or gradients
- [ ] Design preview artifacts under `docs/design-previews` are not cited as
      shipped UI rules unless the matching exception is documented in
      `DESIGN.md`

## See also

- PR #263: the original glass design system landing
- `.agents/skills/shadcn-alertdialogaction-variant-prop-ignored/`: the
  destructive-confirm workaround

Coloring page Color Codes & Swatches uses the existing control panel below
Mediums, with the usual section heading and divider. Thumbnails and plain-text
notes remain flat within that region. No additional panel or navigation is added.

## Destructive colors in Dark mode

Filled destructive controls use `bg-destructive` with
`text-destructive-foreground`: deeper red (HSL 0 65% 48%, approximately
`#ca2b2b`) and pale text (`#f7f2f7`). Error messages, destructive text actions,
and danger icons use `text-destructive-text`: lighter red (HSL 0 80% 72%,
approximately `#f17e7e`). Do not use the fill token for standalone danger text.
Light mode retains its existing red for both roles.

The Dark solid button pair measures 4.90:1, and the lighter danger text
measures 6.05:1 against the card surface. Shared destructive buttons use the
foreground token; glass destructive buttons use an opaque fill in both themes.
The Light solid button pair measures 5.40:1 against its white label.
