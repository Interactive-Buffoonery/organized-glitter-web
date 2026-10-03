# Feedback on SpaceFast

The web client sends feedback directly to
`POST https://data.organizedglitter.app/api/organized-glitter/feedback` with its
PocketBase session. The SpaceFast Function no longer handles feedback or needs
Resend variables. The same PocketBase route is the intended iOS contract.

The route requires a verified `users` session, derives account identity from
PocketBase, validates the message and optional reply address, and limits each
account to five attempts in 15 minutes. PocketBase sends through its configured
mail client. The counter resets on a PocketBase restart.

The reviewed hook is deployed. A controlled request to the production route
returned success and delivered an email. After PR #307 merged into `dev`, Sarah
submitted through the Railway preview form and confirmed that the email
arrived with the expected reply address and message. This verifies the web
client and PocketBase path together on Railway.

## SpaceFast preview result

The guarded workflow published `dev` commit `7ed41e8c04bb14b013ae0955fa4405f8331940e3`
as `ver_ac9bd0076b504604999a670dcc2c8954`. A signed-in Chromium session
submitted one labeled message from Profile → Support. PocketBase returned 200,
the form reported success, and Sarah confirmed inbox delivery. A request
without a session returned 401. Keep these checks in the final candidate
acceptance pass. Do not use the old `/api/send-feedback` Function route.

The earlier Function candidate failed because the preview worker did not receive
its declared outbound fetch capability or feedback variables. Its design and
probe results remain in the
IP investigation record (historical reference outside this extraction).
Outbound fetch is still needed by the separate PostHog proxy; see
[PostHog on SpaceFast](./spacefast-posthog.md).
