# Logging

Status: current as of 2026-05-07. Source of truth: `src/utils/logger.ts`.

Organized Glitter uses a small console-backed browser logger for diagnostics. It adds module
prefixes, redacts secret-looking values before console output, and keeps production logs quiet
except for errors.

## Public interface

Import logging helpers from `@/utils/logger`.

```ts
import { createLogger } from '@/utils/logger';

const logger = createLogger('ColoringPageProgressNotes');

logger.error('Error adding coloring page progress note:', error);
```

Prefer a module-scoped logger near the imports for new code or when touching an existing file. Use
the component, hook, service, or utility name as the prefix so logs are searchable by codepath.

The named `logger` export remains available for legacy call sites, but scoped loggers are clearer
for feature-specific flows. For example, `ColoringPageProgressNotes` uses
`createLogger('ColoringPageProgressNotes')` so add, update, delete, and image-removal failures can be
distinguished from shared progress note list or service logs.

## Runtime behavior

Each logger exposes:

- `log`, `info`, `warn`, `error`, `debug`
- `secureInfo`
- `group`, `groupCollapsed`, `groupEnd`, `table`
- `criticalError`

Development builds write all logger methods to the browser console. Production builds keep `log`,
`info`, `warn`, `debug`, `secureInfo`, `group`, `groupCollapsed`, `groupEnd`, and `table` as no-ops.
`error` and `criticalError` still call `console.error` in production.

Use `criticalError` only for failures that must be visible in production diagnostics, such as service
worker cleanup failures, app initialization failures, or unrecoverable persistence errors. Use
`debug` or `info` for development-only state tracing.

## Redaction and privacy constraints

Every logger method redacts arguments with `redactSensitiveData` before writing to the console. The
redactor covers:

- object keys such as `key`, `token`, `secret`, `password`, `auth`, and common variants
- nested arrays and objects
- circular references, which are replaced with `[Circular Reference]`
- database connection strings such as PostgreSQL, MySQL, MongoDB, and Redis URLs
- secret-looking strings with key/value syntax

Automatic redaction does not classify every business identifier as sensitive. When logging user IDs,
truncate them explicitly:

```ts
import { createLogger, truncateUserId } from '@/utils/logger';

const logger = createLogger('RandomizerService');

logger.debug('Fetching enhanced spin history', {
  userId: truncateUserId(userId),
  limit,
});
```

When logging PocketBase filter strings that may contain 15-character user IDs, log structured fields
instead of raw filter text. If that is not practical, truncate the user ID before interpolating it
into the filter string.

Do not log raw auth records, tokens, passwords, uploaded file contents, image data, or full
environment objects. If direct `console.*` usage is unavoidable, keep it localized and document why
the shared logger cannot be used.

## Error-handling pattern

UI handlers and service functions should log enough context for debugging while surfacing errors to
users through the existing toast, boundary, or mutation error path.

```ts
const logger = createLogger('ExampleComponent');

try {
  await mutation.mutateAsync(payload);
} catch (error) {
  logger.error('Error saving example record:', error);
}
```

Keep log messages stable and codepath-specific. Avoid using logs as analytics events, use the
analytics capture helpers for product behavior.

## Verification

The focused logger regression tests live in `src/utils/__tests__/logger.test.ts`.

```bash
pnpm test -- src/utils/__tests__/logger.test.ts
```
