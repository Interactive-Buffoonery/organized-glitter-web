# Unit test environments and headroom

`pnpm test` runs three Vitest projects from `vitest.config.ts`:

| Project | Environment | Holds                                                                    |
| ------- | ----------- | ------------------------------------------------------------------------ |
| `node`  | Node        | `api/`, `pb_hooks/`, `scripts/`, `server/`, and other server-side tests  |
| `logic` | Node        | Audited pure-logic tests listed in `test/node-logic-test-files.ts`       |
| `dom`   | jsdom       | Everything else under `src/` and `test/`, with `test/setup.ts` (default) |

## Moving a test to the logic project

New `src/` and `test/` tests start in `dom`. Move one to `logic` only when all of
these hold:

- It uses no Testing Library, `@/test-utils`, `renderHook`, or browser globals.
- No repository source it imports, directly or indirectly, reads browser
  globals such as `window`, `document`, `navigator`, or `localStorage`.
- No package it loads changes behavior without a browser. TanStack Query sets
  `isServer` from `window`, React Router sets `isBrowser`, and papaparse needs
  `FileReader`, so tests that load them stay in `dom`.
- It passes with the same test count under jsdom and under Node.

Add its exact path to `test/node-logic-test-files.ts`. The list holds files, not
globs, so a future browser-dependent test cannot join by matching a pattern.
Confirm the owner with `pnpm exec vitest list --filesOnly --json`.

## Long form tests and timeouts

Vitest cannot cancel a timed-out test's pending `userEvent` steps. A late step
that searches the whole document can type into or submit the next test's form,
so a later failure in the same file may be a side effect. Rerun the file alone
before treating it as a separate bug. For long form tests, use the scoped
helpers described in `src/test-utils/README.md`.

## Resource headroom

The unit suite uses four workers, which already fills a two-core, four-thread
laptop. Do not run production builds, browser validation, or another test run
while `pnpm test:pr` runs. The local gate records the load average and CPU
thread count in its report and prints an advisory when the one-minute load is
at or above the thread count. The advisory does not stop the gate.

Load average counts runnable work from every process, including the gate's own
earlier phases, and does not say which process caused it. A busy reading does
not prove that a failure came from load, and a quiet one does not rule it out.
Rerun a timed-out file alone on an idle machine to separate slow tests from
contention.
