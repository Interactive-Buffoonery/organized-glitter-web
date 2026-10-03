# Backend environment safety

Apply this boundary before browser testing, fixture seeding, PocketBase schema
editing, or migration work.

1. Identify the exact PocketBase URL and, for browser work, the app URL. Confirm
   the environment, account, and records involved. A preview may share
   production data.
2. Use a disposable local PocketBase for routine mutating work. A loopback URL
   alone does not prove the database is disposable; direct developer Playwright
   commands can use persistent local data.
3. Treat hosted exploration as read-only by default. Before a remote write,
   verify explicit authorization for the named backend, the intended records or
   schema, expected impact, and cleanup or recovery. An authorized read-only
   check does not authorize a write.
4. Keep automated localhost guards in place. A guard prevents some remote
   writes; it does not replace environment verification or permission.

The calling skill still defines which runner to use and any stricter rule for
its operation.
