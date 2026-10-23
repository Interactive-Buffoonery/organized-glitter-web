# Symbolication evidence review

Never generate a fake production error, run a capture in CI, or use real account
data in a fixture.

## Production evidence review, without a new error

After an authorized release, an owner can use existing release build logs to
confirm injection/upload success and the exact release identifier. In the
existing project's Error Tracking interface, inspect an already received,
privacy-reviewed exception from that release. Verify original file, function
and line resolution against the same commit, and confirm no `.map` files are
publicly served. Keep exception details and stacks in the private project.
Report only release match and symbolication passed/failed/unavailable.

No existing suitable exception means hosted symbolication is unavailable,
not passed. A build that succeeded after an uploader warning is also not
upload evidence. Release enrichment and error-redaction changes belong to
their separate PRs. Missing release correlation blocks the hosted conclusion.
