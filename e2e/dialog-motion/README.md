# Shared dialog motion

Run `pnpm exec playwright test -c playwright.dialog-motion.config.ts`.
The isolated fixture imports the production Dialog wrapper and stylesheet. It
needs no account or backend and never saves data. Chromium and WebKit cover
1071px and 390px widths, both motion preferences, and all three layouts
with 12 cases per browser. Each case attaches animation-time center coordinates
and records video in `.tmp/dialog-motion/`. The test seeks the actual CSS
animations, so the first frame cannot be missed by a fast test runner.

For visual review, run `VITE_APP_VERSION=dialog-review pnpm exec vite --port 4196`
and open `http://localhost:4196/e2e/dialog-motion/index.html`. Query parameters
`layout=keyboard-safe` or `layout=keyboard-safe-sheet` select the other layouts.
Use browser motion emulation for reduced motion. The shortened mobile viewport
checks layout after resize; it is not an actual Safari software-keyboard test.
