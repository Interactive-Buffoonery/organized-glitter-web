#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const [path, ...options] = process.argv.slice(2);
if (
  !path ||
  options.length % 2 !== 0 ||
  options.some((option, index) => (index % 2 === 0 ? option !== '--client-id' : !option))
) {
  console.error(
    'Usage: node scripts/audit-apple-grants.mjs <path-to-data.db> [--client-id <native-client-id>]...'
  );
  process.exitCode = 2;
} else {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const users = db.prepare("SELECT options FROM _collections WHERE name = 'users'").get();
    const providers = JSON.parse(users.options).oauth2?.providers ?? [];
    const clientIds = [
      ...new Set(
        [
          ...providers
            .filter(provider => provider.name === 'apple')
            .map(provider => provider.clientId),
          ...options.filter((_, index) => index % 2 === 1),
        ].filter(Boolean)
      ),
    ].sort();
    if (clientIds.length === 0) throw new Error('No Apple client IDs found for the audit.');
    const links = db
      .prepare("SELECT recordRef, providerId FROM _externalAuths WHERE provider = 'apple'")
      .all();
    const grants = db
      .prepare('SELECT user_id, provider_id_hash, client_id, state FROM apple_oauth_grants')
      .all();
    const linked = new Set(
      links.map(
        link => `${link.recordRef}:${createHash('sha256').update(link.providerId).digest('hex')}`
      )
    );
    const stored = new Set(
      grants
        .filter(grant => grant.state === 'active')
        .map(grant => `${grant.user_id}:${grant.provider_id_hash}:${grant.client_id}`)
    );
    const byClientId = clientIds.map(clientId => ({
      clientId,
      linksWithoutActiveGrant: links.filter(
        link =>
          !stored.has(
            `${link.recordRef}:${createHash('sha256').update(link.providerId).digest('hex')}:${clientId}`
          )
      ).length,
    }));
    const orphanActive = grants.filter(
      grant => grant.state === 'active' && !linked.has(`${grant.user_id}:${grant.provider_id_hash}`)
    );
    console.log(
      JSON.stringify(
        {
          appleLinks: links.length,
          linksWithoutGrant: byClientId.reduce(
            (total, client) => total + client.linksWithoutActiveGrant,
            0
          ),
          byClientId,
          activeGrantsWithoutLink: orphanActive.length,
          revocationPending: grants.filter(grant => grant.state === 'revocation_pending').length,
        },
        null,
        2
      )
    );
  } finally {
    db.close();
  }
}
