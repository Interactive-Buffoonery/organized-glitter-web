# App icon

The approved icon is Sarah's supplied 2048px PNG: hand-drawn pink and lilac
squares, a white center square, and a raspberry diamond on navy.

- Preserve the supplied artwork, highlights, spacing, and colors. Do not redraw
  or replace it with the earlier vector interpretation.
- Keep the same navy tile in light and dark mode, without adding an outer border.
- The icon background is `#05051A`; the current dark page background is `#151533`.
- The header shows the tile at 40px, inside its 44px home link. The tile edge
  is close to the dark header color, so the artwork carries the mark there.
  Keep it at 40px rather than adding a border, ring, or resting shadow.

## Source and regeneration

[app-icon-source.png](../icons/app-icon-source.png) is the unchanged 2048px
master supplied by Sarah. app-icon.html (historical reference outside this extraction) previews it.
The renderer trims seven pixels from every edge to remove a gray fringe at the
top and right while keeping the crop square. It then resizes the artwork,
rounds web tiles, and adds navy safe-area padding to the maskable export.

From the repository root, with dependencies and Playwright Chromium installed:

```bash
node scripts/generate-app-icons.mjs
```

The existing renderer exports each asset at its intended pixel size. It does
not require a development server or a font. Keep generated files committed.

| Asset                                 | Treatment                                                           |
| ------------------------------------- | ------------------------------------------------------------------- |
| `docs/icons/app-icon-1024.png`        | Opaque square for the native app icon; iOS supplies the corner mask |
| `public/images/logo.png`              | 512px rounded tile for the header, loading screen, and links page   |
| `public/android-chrome-192x192.png`   | 192px rounded install icon                                          |
| `public/android-chrome-512x512.png`   | 512px rounded install icon                                          |
| `public/android-maskable-512x512.png` | Opaque square, with artwork scaled to fit the central safe circle   |
| `public/apple-touch-icon.png`         | 180px opaque square; the device supplies the corner mask            |
| `public/favicon-32x32.png`            | 32px rounded icon                                                   |
| `public/favicon-16x16.png`            | 16px rounded icon                                                   |
| `public/favicon.ico`                  | The exact 16px and 32px PNG renders packaged as ICO entries         |
| `public/site-icon-16x16.png`          | Served favicon under a distinct path on Spacefast                   |
| `public/site-icon-32x32.png`          | Served favicon under a distinct path on Spacefast                   |
| `public/site-icon.ico`                | ICO fallback under a distinct path on Spacefast                     |
| `public/site-touch-icon.png`          | Served Apple touch icon under a distinct path on Spacefast          |

The native repository receives the approved square and rounded artwork as
static assets, with no application-code dependency between the repositories.
Social sharing screenshots and the Caveat wordmark are separate artwork.

When changing favicon artwork, update `APP_ICON_VERSION` in
`scripts/app-icon-links.mjs`. Vite replaces the `<!-- og-app-icons -->` marker
in all five HTML entries with the shared favicon and Apple touch icon links,
both in development and in production builds. Do not add per-page icon URLs.
Spacefast reserves the root `favicon.ico` and `apple-touch-icon.png` paths, so
the shared links and install manifest use the `site-*` copies instead.

The renderer names the corner radius, maskable inset, and source edge trim at
the top of `scripts/generate-app-icons.mjs`. Revisit the source-specific crop
when replacing the master; a clean image may need no trim.
