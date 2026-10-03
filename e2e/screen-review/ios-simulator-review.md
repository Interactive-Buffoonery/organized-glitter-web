# iOS Simulator Review

Use this when a free, closer-to-iPhone review is more useful than Playwright's
desktop WebKit mobile emulation.

This workflow opens Organized Glitter in real Safari inside Xcode's iOS
Simulator and captures screenshots with `xcrun simctl`. It is intentionally a
visual review harness, not a replacement for Playwright assertions.

## Prerequisites

- Xcode with at least one iOS Simulator runtime installed.
- Organized Glitter running locally, usually with `pnpm dev:local`.
- If reviewing authenticated screens, sign in once inside Simulator Safari.

The seeded local account is documented in `AGENTS.md`:

- Email: `sarah-local@example.test`
- Password: `local-test-password-123`

## Quick Start

Start the app:

```bash
pnpm dev:local
```

In another terminal, boot the default iPhone simulator, open the app, and capture
the home screen:

```bash
pnpm mobile:ios-sim
```

Capture a small mobile review set:

```bash
pnpm mobile:ios-sim -- \
  --route /overview \
  --route /dashboard \
  --route '/dashboard?craft=coloring' \
  --route /randomizer \
  --route /profile
```

Screenshots are saved to:

```text
playwright-artifacts/ios-simulator-review/
```

## Device Selection

List installed simulators:

```bash
pnpm mobile:ios-sim -- --list-devices
```

Run on a specific device:

```bash
pnpm mobile:ios-sim -- --device "iPhone 16e" --route /randomizer
```

If Safari is still settling after a fresh simulator boot, increase the capture
delay:

```bash
pnpm mobile:ios-sim -- --route / --delay 8000
```

## Review Loop

1. Run the Playwright screen review first for fast repeatable coverage:

   ```bash
   pnpm test:e2e:screen-review
   ```

2. Use this simulator harness for screens where iOS Safari behavior matters:

   ```bash
   pnpm mobile:ios-sim -- --route /randomizer
   ```

3. Inspect the live simulator manually for touch feel, scroll behavior, keyboard
   behavior, safe-area issues, and installed-PWA quirks.

4. Capture screenshots after each fix and compare them with the Playwright
   mobile review artifacts.

## Notes

- iOS Simulator Safari can inspect local web content through Safari's Develop
  menu on macOS.
- For full automated Safari assertions inside the iOS Simulator, use Appium with
  the XCUITest driver. That is a larger dependency than this harness and should
  be added only if the visual review loop is not enough.
- Android has a separate free path through Android Emulator plus Playwright's
  experimental Android support or normal Chrome DevTools/ADB workflows.
