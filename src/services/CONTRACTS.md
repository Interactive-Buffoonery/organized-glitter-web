# Service Layer Contracts

Architectural decisions governing the PocketBase service abstraction.
All code changes in this refactor must conform to these rules.

---

## 1. Service Boundary Rule

**No file outside `src/services/` and `src/lib/pocketbase.ts` may import `pb` or `pocketbase` directly.**

- Hooks, components, pages, and utils interact with data exclusively through services.
- `src/lib/pocketbase.ts` owns the PocketBase client instance, transport-level middleware (`beforeSend`/`afterSend`), and the `resolveFileUrl()` helper.
- Enforced by CI grep guard (Phase 6).

## 2. What Services Return

Services return **domain DTOs**: stable, normalized data objects.

- camelCase field names
- Dates as ISO strings
- IDs as strings
- Relations resolved to IDs (not expanded records)
- **No file URLs**: return raw filename fields only
- **No React Query concerns**: no cache keys, no invalidation, no stale times

## 3. What Hooks Own

Hooks own all React Query integration:

- Query keys and key factories (defined in `queryKeys.ts`)
- Stale times, retry policies
- Optimistic updates and rollback
- Cache invalidation after mutations
- `select` transforms for presentation
- Toast notifications
- File URL resolution (via `resolveFileUrl()` from `src/lib/pocketbase.ts`)

## 4. Error Contract

Services throw `ServiceError` (public name, SDK-agnostic):

```typescript
type ServiceErrorType =
  | 'network'
  | 'validation'
  | 'auth'
  | 'permission'
  | 'not_found'
  | 'server'
  | 'cancelled';

interface ServiceError {
  type: ServiceErrorType;
  message: string;
  status?: number;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  cause?: unknown; // opaque, NOT ClientResponseError
}
```

- `ClientResponseError` stays entirely inside `src/services/`.
- `PocketBaseError` is kept as an internal alias during migration, eventually removed.

## 5. File URL Strategy

- Services return raw file metadata (filename string from the record).
- `resolveFileUrl(collectionNameOrId, recordId, filename, thumb?)` in `src/lib/pocketbase.ts` derives display URLs.
- Hooks and mappers call the helper; services do not.
- This keeps cached DTOs environment-independent.

## 6. Filter Strategy

- `pb.filter()` is banned outside `src/services/`.
- Services expose domain methods for common queries (e.g., `tagService.listByUser(userId)`).
- Services use `filterBuilder.ts` or raw `pb.filter()` internally for complex cases.
- Don't create a bespoke named method for every possible filter combination.

## 7. Service Method Scope

Keep generic service helpers out of domain-specific behavior:

- Specialized services call `pb.collection()` internally for advanced operations.
- Request keys, `skipTotal`, field selection, and collection-specific filters belong in the
  specialized service method that owns the query.

## 8. Request Deduplication Ownership

- **React Query** handles dedupe for query reads (already does this).
- **PocketBase auto-cancellation is disabled globally** via `pb.autoCancellation(false)` in `src/lib/pocketbase.ts` (see #108). With it off, string `requestKey` values are inert; they no longer scope cancellation, so do not add them to new code purely for "deduplication" intent. Pass `requestKey: null` only when an individual call needs to opt back into the legacy behavior.
- `pb.beforeSend`/`afterSend` in `lib/pocketbase.ts` stays as-is (transport-level concern).

## 9. Query Key Inventory

See [QUERY_KEY_INVENTORY.md](./QUERY_KEY_INVENTORY.md) for the full catalog of canonical query keys and their invalidation rules.

## 10. Mutation Replay Policy

Mutations are not retried by default. A create request can persist even when its
response is interrupted, so replaying it can create duplicate records. A hook
may opt into retries only when replay is safe under concurrent writes or has a
durable idempotency key. Repeating the same field values is not sufficient: an
unconditional update can overwrite another client's newer changes. Ambiguous
create failures should refresh the relevant list and
tell the user to check it before trying again.

## 11. Complete List Reads

`listAllPages` takes the page count from the first response and loads the
remaining pages with at most four concurrent requests. Later responses cannot
extend the workload. Complete reads of companies, artists, publishers, and
illustrators have a 5,000-record safeguard; bulk coloring page reads explicitly
allow 100,000 page records. These are complete-read
safeguards, not book or project quotas. Declared items and page requests are
bounded before scheduling later pages, using the returned page size when
available. Overflow stops subsequent batches. Limit errors include a support
contact at contact@organizedglitter.app to request a higher limit. Messages name
the affected records and the current limit.
Archive import limits apply only to imports. Invalid counts, missing records,
and changing pagination totals fail explicitly, with stable error reasons,
instead of returning a truncated list. Offset pagination still cannot detect
a same-count replacement or reordering; it is not a database snapshot.

Complete reads preserve page order and fail if any page fails. CSV export must
not treat failed reads as empty books or publish an incomplete file as a
successful export. Taxonomy selectors also need complete results; a single
500-record page is not a substitute for a complete read.

---

## DTO Types

Domain DTOs live in `src/services/types.ts`. These are the stable shapes that services return and hooks consume.

See [types.ts](./types.ts) for the canonical definitions.
