# Design system overview

This overview is the source of truth for high-level Organized Glitter design-system decisions. `AGENTS.md` should link here instead of duplicating detailed design rules.

## Status

Working document. Update it whenever typography, color, glass, or page-surface rules change.

## Typography

Current implementation in `src/index.css` defines these Tailwind font tokens:

- `font-sans`: Karla, used as the default body family.
- `font-handwritten`: Caveat, used as a friendly accent. Default use is the page H1; project create/edit forms may instead use it for the small rotated `Adding`/`Editing` label above a Karla H1.
- `font-mono`: JetBrains Mono, used for verbatim technical strings.

### Decision: no Quicksand/display font

The audit found stale guidance saying Quicksand Variable / `font-display` exists and is applied to headings. Current code does not define `font-display`, and dependencies do not include Quicksand.

Decision: do not restore Quicksand. The canonical app font stack is Karla + Caveat + JetBrains Mono.

Do not add new `font-display` usage unless a future design-system decision reintroduces a display font.

## Fonts and external CDNs

App UI fonts should be self-hosted through `@fontsource` / `@fontsource-variable` packages. Do not add Google Fonts `<link>` tags or third-party font CDNs to the React app shell.

Transactional email templates may need separate compatibility decisions. If remote email fonts are retained, document that as an explicit exception.

## Color tokens

Use semantic Tailwind utilities backed by HSL CSS custom properties in `src/index.css`:

- surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`
- text: `text-foreground`, `text-muted-foreground`, semantic status text
- borders: `border-border`, `border-input`
- actions: `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-accent-foreground`

Use `text-link` for readable link text on public surfaces. Inline links in prose
also need a persistent underline; the decorative `text-primary` color alone is
not a sufficient text-link treatment in Berry Cream Light.

Light uses the Berry Cream palette for warm pink surfaces and berry actions. Dark uses Berry Cream after dark: a deep navy stage, raspberry actions, and a lavender accent. Both palettes map into the same semantic token roles and component language. System follows the device's light or dark appearance.

New visitors start in System mode (matching the device light or dark appearance), including on public marketing, auth, and `/links` pages. Visitors can choose Light, Dark, or System, and the browser remembers their choice. Signing in applies the saved account preference; accounts without a saved preference use System. Browser preferences do not overwrite account preferences.

In Light, quiet interactive hover and highlighted option surfaces use `secondary` with `secondary-foreground`. Reserve the stronger purple `accent` for selected states and deliberate emphasis, not generic mouse-over feedback.

Avoid hardcoded gray/white surface classes unless an explicit implementation exception applies. Product code should prefer semantic tokens such as `bg-card`, `bg-background`, `text-foreground`, and `border-border`; glass surfaces should prefer `GlassPanel` and the glass variables below.

## Surface Registers

Choose the register before applying design-system rules:

- **Product app register:** Authenticated product pages, dashboards, project/detail/edit flows, settings, and product overlays. Use semantic tokens, strict glass rules for grouped regions, the product Caveat H1 rule, product `SectionHeading` markers, flat content lists, and restrained berry accents. The page atmosphere (Light wash, Dark bloom) is the documented product-body exception. Decorative gradients stay out of chrome except for documented utility exceptions such as image scrims and progressive placeholder shimmer.
- **Marketing paper register:** Public home marketing surfaces may use Paper Register tokens, washi tape, scrapbook composition, Caveat accents beyond the H1, and texture gradients in `src/styles/scrapbook.css`. Keep this register inside `src/components/marketing/**`, `src/styles/scrapbook.css`, and marketing preview assets explicitly referenced by the home page.
- **Public utility register:** `/links` uses the selected site palette with semantic tokens, flat semantic link blocks, Karla typography, and clear focus/touch states. It does not use `GlassPanel`, paper/washi materials, Caveat accents, or gradients. `html.utility-register` keeps the app shell opaque so safe-area padding cannot leak the product atmosphere.

Berry Cream after dark is the Dark semantic palette. It does not define a separate component language or a general page-design direction.

The public Astro blog at `/updates/` also uses the marketing paper register,
scoped to `blog/src/`. It matches the site's signed-out header and footer and
the existing WordPress blog's editorial layout. This explicit extension uses
the approved craft image, Caveat display headings, cream paper sections, and
Karla reading text. It does not change the product or `/links` registers.

## Feedback notifications

The app uses Sonner through a small local notification layer:

- `src/components/ui/sonner.tsx`: the global `<Toaster />` wrapper mounted once
  in `src/components/layout/AppProviders.tsx`.
- `src/lib/notifications/index.ts`: the public app-facing barrel for feature
  code.
- `src/lib/notifications/notify.ts`: routes app notifications to Sonner and
  owns default durations.

Feature code should import from the `@/lib/notifications` barrel and call
`notify()` or the `notifySuccess`, `notifyWarning`, `notifyError`, and
`notifyInfo` helpers instead of importing `toast` from `sonner` directly. This
keeps durations, kind routing, and copy shape consistent.

Treat the barrel as the public boundary. Direct relative imports from
`notify.ts` or `types.ts` are for files inside `src/lib/notifications/**`, such
as implementation tests.

```ts
import { notify } from '@/lib/notifications';

notify({
  kind: 'success',
  title: 'Project saved',
  description: 'Everything synced correctly.',
});
```

`notify()` accepts the `AppNotification` shape from
`src/lib/notifications/types.ts`:

```ts
type NotificationKind = 'success' | 'warning' | 'error' | 'info';

interface AppNotification {
  kind: NotificationKind;
  title: string;
  description?: string;
  durationMs?: number;
}
```

The convenience helpers use the same optional description and duration
arguments:

```ts
import { notifyError, notifyInfo } from '@/lib/notifications';

notifyError('Could not save project', 'Please review the highlighted fields.');
notifyInfo('Import complete', '12 projects were added.', 7000);
```

Use `notify()` when the call site already has a structured object or needs to
branch on `kind`. Use the convenience helpers for simple title, description,
and duration calls. Pass `durationMs` only when the copy needs a deliberate
override from the shared default.

Current default durations are defined in `notify.ts`:

- success: `4000`
- warning: `5000`
- error: `6000`
- info: `4000`

The global toaster is intentionally a solid overlay surface, not a glass panel:

- position is `top-right`
- `closeButton` is enabled for dismissibility
- `richColors` is disabled so local class names control contrast
- app themes are mapped to Sonner's supported `light`/`dark` color schemes
  before they reach Sonner; legacy Catppuccin preference names must never be
  passed through as Sonner's `theme` prop
- base toast styling uses forced `bg-card`, `text-card-foreground`,
  `border-border`, and explicit title/description colors
- success and warning use readable emerald/amber status surfaces
- error uses the destructive token pair (filled surfaces use `bg-destructive`;
  standalone danger text uses `text-destructive-text`, which is the same red in
  Light but a lighter readable red in Dark)
- info stays neutral on the card surface

Sonner's default close control is restyled in `src/index.css` with
`[data-sonner-*]` selectors so it sits on the **right** inside toast padding:
transparent background, no border or shadow, bare X glyph (not Sonner's
floating chrome). The CSS contract is asserted in `test/sonner-toast-css.test.ts`
together with `src/components/ui/sonner.test.tsx`. If you change the close control,
keep those checks and this section aligned.

When adding a notification kind, update `NotificationKind`, `DEFAULT_DURATION_MS`,
the `notify()` switch, `toastClassNames` and icons in `sonner.tsx`, the
notification and toaster tests, and this section.

## Glass system

See [`glass.md`](./glass.md) for the detailed glass style guide, including the
Dialog close-button contract (glass icon button, coarse-pointer sizing, and the
`showCloseButton` opt-out for media dialogs).

Canonical product app glass surfaces should use existing primitives/tokens such as:

- `GlassPanel` from `src/components/ui/glass-panel.tsx`
- `--glass-bg`
- `--glass-border`
- `--glass-highlight`

### Decision: no alpha-white glass utilities

The audit found `bg-white/*` classes used for glass-like highlights/surfaces. These can create a frosted look, but they hardcode white opacity values and can drift across themes.

Decision: do not use alpha-white utilities for product app glass surfaces or highlights. Use semantic glass primitives and variables instead:

- `GlassPanel`
- `--glass-bg`
- `--glass-border`
- `--glass-highlight`

Avoid new `bg-white/*`, `border-white/*`, `shadow-white/*`, or equivalent `rgba(255, 255, 255, …)` glass styling in app UI. Existing usages should be migrated case-by-case to semantic surface or glass tokens. Public home paper surfaces and `/links` should not be converted to glass to satisfy this rule.

## Page layout direction

Prefer the modern glass/iOS page patterns documented in `glass.md` when working on product app page-level surfaces:

- `container mx-auto px-4 py-6` page chrome
- handwritten/friendly H1 treatment where appropriate, with the project create/edit label exception documented in `DESIGN.md`
- `GlassPanel` for grouped content
- consistent section rhythm inside panels
- ghost Back/Edit/overflow buttons in sticky top bars, so the page H1 stays the visual anchor
- `SectionHeading` for page-region markers: sentence case Karla plus the 2px primary dash, not uppercase eyebrow labels

## Mobile touch targets

`src/index.css` applies a global mobile-only rule that forces a `min-height: 44px` floor on raw `<button>`, `input[type="submit"]`, and `input[type="button"]` elements (Apple HIG / Material tap-target guidance). The rule lives inside the mobile `@media` block and is intentional; it should not be removed or weakened.

Consequences to be aware of when authoring components:

- Any `<button>` rendered inline (inside a badge, chip, table cell, breadcrumb, etc.) will inflate to at least 44px tall on phones, which can stretch its container. This includes the shared `Button` when it renders a native button.
- The rule has a narrow opt-out: `[data-close-button]`. This was carved out for Sonner toast close affordances and is reused by the X button inside `TagBadge` (`src/components/tags/TagBadge.tsx`) for the same reason: a destructive-adjacent inline icon where a 44px hit area would visually dominate the surrounding chip. Use `data-close-button` only for similar incidental dismiss/remove icons inline in text, never for primary actions.
- For standalone primary actions (e.g. "Add tag" in `InlineTagManager`), let the 44px floor apply on mobile even if the desktop styling is smaller (`h-8`, `text-xs`). The asymmetry is correct: desktop stays compact, phones get a reliable hit target.
- `Button asChild` renders its child element, often an anchor, so the global `button` selector cannot size it. The shared `Button` gives these links a 44px minimum height and width on coarse pointers. Keep compact desktop sizes such as `size="sm"` for quiet chrome; the shared touch rule covers the link.

If a future inline button looks unexpectedly tall on phones, this rule is the first place to look.

## UI primitive choices

shadcn/Radix remains the default foundation for simple primitives, app chrome, and composed
surfaces. Use the app-owned wrappers in `src/components/ui` before importing a third-party
primitive directly into product code.

React Aria may be used behind app-owned wrappers for interaction-heavy primitives where it provides
stronger behavior than the available shadcn/Radix wrapper. Good candidates include calendars,
date/time inputs, comboboxes, and advanced selection widgets. Keep the wrapper API app-shaped so
callers do not depend on React Aria types unless the public contract explicitly needs them.

## Date fields

Product UI should use `DateField` from `src/components/ui/date-field.tsx` instead of native
`input[type="date"]`. The shared field keeps manual `YYYY-MM-DD` entry for fast desktop editing,
normalizes common US slash dates like `7/3/2024` on blur, and opens an app-styled React Aria
calendar with month/year navigation so mobile users do not see the browser-native date picker.
Product code should not import React Aria date primitives directly.

Date values remain date-only strings. Do not convert them through `new Date(value)` before storage
or form submission; use the shared date-field helpers or existing date-only helpers in
`src/utils/date/timezoneUtils.ts` when a date object is needed for display or calendar selection.

## Current product surfaces

- Library (`/dashboard`): shared project collection shell with craft segmented control, one primary New project action, glass filter sidebars on desktop, and flat result grids/lists.
- Project edit: opens as a drawer over the detail page rather than a route navigation. Desktop uses a right-side Radix `Sheet`; phones use a vaul `Drawer` at full viewport height. The `/projects/:id/edit` route remains as a direct-link fallback. See `glass.md` for the layout contract.
- Coloring book edit: follows the same drawer-first pattern from `/coloring/:id`, with `/coloring/:id/edit` preserved as the direct-link fallback. Archive and Delete sit in the drawer footer alongside Cancel and Save changes.
- Randomizer: wheel-first two-column layout. On phones the numbered wheel and result lead; on desktop the selection list sits on the left with the wheel on the right. Craft mode and status eligibility checkboxes sit above the target list. The wheel uses numbered segments with a text key mapping numbers to target names; it is the only full-palette data-visualization exception and must keep its pattern/key/reduced-motion support. Spin history lives in a collapsible accordion below the wheel.
- Coloring books: cover-led detail pages with quiet chrome, dense page grids, mystery chips, and inline notes/tags. Publisher and illustrator taxonomy belongs to the coloring vertical, but the page still follows the shared library model.
- Coloring pages: large flat artwork/photo canvas plus one right-rail glass panel for status, dates, mediums, and mystery reveal. Page photos preserve the whole artwork by default.

## Maintenance rules

- Keep detailed design guidance in `docs/design-system/`.
- Keep `AGENTS.md` concise and link here for design-system specifics.
- When implementation and docs disagree, update this overview or file a follow-up before continuing design-system work.

## App icon

The app icon uses Sarah's hand-drawn pink and lilac pieces with a raspberry diamond on a navy tile, without an added outer border. See [App icon](./app-icon.md) for the approved colors, editable source, and export command.

Coloring page Color Codes & Swatches uses the existing control panel below
Mediums, with the usual section heading and divider. Thumbnails and plain-text
notes remain flat within that region. No additional panel or navigation is added.

## Page-not-found recovery

`public/404.html` is the server's standalone recovery page, styled by
`public/css/not-found.css`. It uses the flat public utility register, the approved
app icon, and a self-hosted Karla font. Keep its Light and Dark colors aligned
with the semantic palette. It follows System without JavaScript and reads an
explicit saved Light or Dark preference when JavaScript is available.

`src/pages/NotFound.tsx` handles unmatched client-side routes inside the product
shell, with the product Caveat H1. Both versions offer a primary Back to home
link and a quieter Open your library link. Their copy and destinations come
from `src/content/not-found.json`. The build generates `public/404.html` from
`scripts/templates/404.html` with `scripts/generate-not-found.mjs`. After changing
the shared content or template, run `node scripts/generate-not-found.mjs` and
commit the generated page. The server version must remain usable without React, JavaScript, or PocketBase.

Run `pnpm exec playwright test --config playwright.not-found.config.ts` for
recovery links, narrow layouts, saved appearance, no-JavaScript support, and
keyboard focus on both surfaces. The suite checks a built server response for
HTTP 404, then reaches the client fallback through browser history without a
document reload. Assertions use accessible heading and link roles. The suite
also verifies generated HTML is current and both pages expose the heading and
recovery actions from the shared content.
Results are written to `.tmp/not-found-qa/report/`.
