# Security Policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch and
backported to `dev` when practical.

## Reporting a vulnerability

Do not open a public GitHub issue for security reports.

Send details to the contact address listed in the repository README or in your
deployment configuration. Include:

- A description of the issue
- Steps to reproduce
- Impact assessment
- Any suggested fix, if you have one

We aim to acknowledge reports within a few business days.

## Scope

This policy covers:

- The React web application in `src/`
- PocketBase hooks and migrations in `pb_hooks/` and `pb_migrations/`
- Local server adapters in `server/` and `api/`
- Optional hosting adapters in `spacefast/`

The native iOS app lives in a separate repository:
[organized-glitter-app](https://github.com/Interactive-Buffoonery/organized-glitter-app).

## Safe disclosure

Please give us reasonable time to investigate and release a fix before public
disclosure.

## Secrets

Never commit credentials, signing keys, database dumps, or production URLs to
this repository. Use environment variables and your secret store instead.
