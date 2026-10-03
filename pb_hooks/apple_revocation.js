/// <reference path="../pb_data/types.d.ts" />

const pending = 'revocation_pending';

function queue(app, filter, params) {
  const grants = app.findRecordsByFilter('apple_oauth_grants', filter, '', 0, 0, params);
  // A failed save must roll back the enclosing user or link deletion.
  for (const grant of grants) {
    if (grant.getString('state') === pending) continue;
    grant.set('state', pending);
    app.save(grant);
  }
}

function queueOrphanGrants(app, providerNames) {
  const cursorKey = 'apple_revocation_reconcile_cursor';
  const retryKey = 'apple_revocation_reconcile_retry';
  const cursor = app.store().get(cursorKey) || '';
  const retryIds = (app.store().get(retryKey) || '').split(',').filter(Boolean);
  const grants = app.findRecordsByFilter(
    'apple_oauth_grants',
    'state = "active" && id > {:cursor}',
    'id',
    100,
    0,
    { cursor }
  );
  const reconcile = ids => {
    if (ids.length === 0) return;
    app.runInTransaction(txApp => {
      const params = {};
      const records = ids.map((id, index) => {
        params[`id${index}`] = id;
        return `id = {:id${index}}`;
      });
      const currentGrants = txApp.findRecordsByFilter(
        'apple_oauth_grants',
        `state = "active" && (${records.join(' || ')})`,
        '',
        ids.length,
        0,
        params
      );
      const linked = require(`${__hooks}/apple_grant_store.js`).linkedGrantKeys(
        txApp,
        currentGrants,
        providerNames
      );
      for (const current of currentGrants) {
        if (linked.has(`${current.getString('user_id')}:${current.getString('provider_id_hash')}`))
          continue;
        current.set('state', pending);
        txApp.save(current);
      }
    });
  };
  const nextRetryIds = retryIds.slice(100);
  const nextRetrySet = new Set(nextRetryIds);
  const keepForRetry = id => {
    if (nextRetrySet.has(id)) return;
    nextRetrySet.add(id);
    nextRetryIds.push(id);
  };
  for (const retryId of retryIds.slice(0, 100)) {
    try {
      reconcile([retryId]);
    } catch (_) {
      app
        .logger()
        .warn('Apple grant reconciliation failed.', 'reason', 'apple_grant_reconcile_retry');
      keepForRetry(retryId);
    }
  }
  try {
    reconcile(grants.map(grant => grant.id));
  } catch (_) {
    for (const grant of grants) {
      try {
        reconcile([grant.id]);
      } catch (_) {
        app
          .logger()
          .warn('Apple grant reconciliation failed.', 'reason', 'apple_grant_reconcile_retry');
        keepForRetry(grant.id);
      }
    }
  }
  app.store().set(retryKey, nextRetryIds.join(','));
  app.store().set(cursorKey, grants.length === 100 ? grants[grants.length - 1].id : '');
}

module.exports = {
  queueForUser(app, userId) {
    queue(app, 'user_id = {:user}', { user: userId });
  },
  queueForIdentity(app, identityHash, userId) {
    queue(app, 'provider_id_hash = {:identity} && user_id = {:user}', {
      identity: identityHash,
      user: userId,
    });
  },
  processPending(
    app,
    endpoint = 'https://appleid.apple.com/auth/revoke',
    providerNames = ['apple']
  ) {
    queueOrphanGrants(app, providerNames);
    const grants = app.findRecordsByFilter(
      'apple_oauth_grants',
      'state = "revocation_pending"',
      'updated',
      10,
      0
    );
    const result = { attempted: 0, revoked: 0, failed: 0 };
    for (const grant of grants) {
      result.attempted += 1;
      const snapshot = {
        id: grant.id,
        clientId: grant.getString('client_id'),
        ciphertext: grant.getString('ciphertext'),
      };
      let succeeded = false;
      try {
        const config = require(`${__hooks}/apple_config.js`).read(app);
        if (grant.getString('key_version') !== 'v1') throw new Error('Unknown key version.');
        const secret = new AppleClientSecretCreateForm(app);
        secret.clientId = snapshot.clientId;
        secret.teamId = config.teamId;
        secret.keyId = config.keyId;
        secret.privateKey = config.privateKey;
        secret.duration = 300;
        const response = $http.send({
          method: 'POST',
          url: endpoint,
          timeout: 10,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: [
            `client_id=${encodeURIComponent(snapshot.clientId)}`,
            `client_secret=${encodeURIComponent(secret.submit())}`,
            `token=${encodeURIComponent($security.decrypt(snapshot.ciphertext, config.grantEncryptionKey))}`,
            'token_type_hint=refresh_token',
          ].join('&'),
        });
        succeeded = response.statusCode === 200;
      } catch (_) {
        succeeded = false;
      }

      let cleared = false;
      try {
        app.runInTransaction(txApp => {
          const current = txApp.findRecordById('apple_oauth_grants', snapshot.id);
          if (
            current.getString('state') !== pending ||
            current.getString('client_id') !== snapshot.clientId ||
            current.getString('ciphertext') !== snapshot.ciphertext
          )
            return;
          if (succeeded) {
            txApp.delete(current);
            cleared = true;
          } else {
            current.set('state', pending);
            txApp.save(current);
          }
        });
      } catch (_) {
        succeeded = false;
      }
      if (succeeded && cleared) {
        result.revoked += 1;
      } else {
        result.failed += 1;
        app.logger().warn('Apple revocation remains pending.', 'reason', 'apple_revocation_retry');
      }
    }
    return result;
  },
};
