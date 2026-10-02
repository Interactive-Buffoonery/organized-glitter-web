/// <reference path="../pb_data/types.d.ts" />

function linkedGrantKeys(app, grants, providerNames) {
  const userIds = [...new Set(grants.map(grant => grant.getString('user_id')))];
  if (userIds.length === 0) return new Set();
  const params = { collection: app.findCollectionByNameOrId('users').id };
  const users = userIds.map((userId, index) => {
    params[`user${index}`] = userId;
    return `recordRef = {:user${index}}`;
  });
  const providers = providerNames.map((provider, index) => {
    params[`provider${index}`] = provider;
    return `provider = {:provider${index}}`;
  });
  const links = app.findRecordsByFilter(
    '_externalAuths',
    `collectionRef = {:collection} && (${users.join(' || ')}) && (${providers.join(' || ')})`,
    '', 0, 0, params
  );
  return new Set(links.map(link =>
    `${link.getString('recordRef')}:${$security.sha256(link.getString('providerId'))}`
  ));
}

function hasPendingGrant(app, identityHash) {
  return app.findRecordsByFilter(
    'apple_oauth_grants',
    'provider_id_hash = {:identity} && state = "revocation_pending"',
    '', 1, 0, { identity: identityHash }
  ).length > 0;
}

function hasOrphanedGrant(app, identityHash, providerName, response) {
  let cursor = '';
  let checked = 0;
  while (true) {
    const grants = app.findRecordsByFilter(
      'apple_oauth_grants',
      'provider_id_hash = {:identity} && id > {:cursor}',
      'id', 100, 0, { identity: identityHash, cursor }
    );
    if (grants.length === 0) return false;
    const linked = linkedGrantKeys(app, grants, [providerName]);
    if (grants.some(grant => !linked.has(
      `${grant.getString('user_id')}:${identityHash}`
    ))) return true;
    if (grants.length < 100) return false;
    cursor = grants[grants.length - 1].id;
    checked += grants.length;
    if (checked === 500) {
      const remaining = app.findRecordsByFilter(
        'apple_oauth_grants',
        'provider_id_hash = {:identity} && id > {:cursor}',
        'id', 1, 0, { identity: identityHash, cursor }
      );
      if (remaining.length === 0) return false;
      response.header().set('Retry-After', '30');
      throw new ApiError(503, 'Apple sign-in is temporarily unavailable. Please try again.', {
        reason: new ValidationError('apple_grant_check_limit', 'Too many stored authorizations.'),
      });
    }
  }
}

function hasActiveGrant(app, identityHash, clientId) {
  return app.findRecordsByFilter(
    'apple_oauth_grants',
    'provider_id_hash = {:identity} && client_id = {:client} && state = "active"',
    '', 1, 0, { identity: identityHash, client: clientId }
  ).length > 0;
}

function requireActive(
  app,
  identityHash,
  clientId,
  hasNewGrant,
  providerName = 'apple',
  preparationFailed = false,
  response
) {
  if (hasPendingGrant(app, identityHash)) {
    throw new ApiError(503, 'Apple sign-in is temporarily unavailable. Please try again.', {
      reason: new ValidationError('apple_grant_revocation_pending', 'Revocation is pending.'),
    });
  }
  if (hasOrphanedGrant(app, identityHash, providerName, response)) {
    throw new ApiError(503, 'Apple sign-in is temporarily unavailable. Please try again.', {
      reason: new ValidationError('apple_grant_orphaned', 'Stored authorization has no link.'),
    });
  }
  if (!hasNewGrant && !hasActiveGrant(app, identityHash, clientId)) {
    throw new ApiError(503, preparationFailed
      ? 'Apple sign-in is temporarily unavailable. Please try again.'
      : 'Apple authorization needs a fresh grant. Please try again.', {
      reason: preparationFailed
        ? new ValidationError('apple_grant_prepare_failed', 'Grant preparation failed.')
        : new ValidationError('apple_grant_required', 'Fresh authorization is required.'),
    });
  }
}

module.exports = {
  linkedGrantKeys,
  requireActive,
  upsert(app, { userId, identityHash, clientId, ciphertext }) {
    const matches = app.findRecordsByFilter(
      'apple_oauth_grants',
      'provider_id_hash = {:identity} && client_id = {:client}',
      '', 1, 0, { identity: identityHash, client: clientId }
    );
    if (!ciphertext) {
      if (matches.length === 0) {
        throw new BadRequestError('Apple authorization needs a fresh grant.');
      }
      return;
    }
    const grant = matches.length > 0
      ? matches[0]
      : new Record(app.findCollectionByNameOrId('apple_oauth_grants'));
    grant.set('user_id', userId);
    grant.set('provider_id_hash', identityHash);
    grant.set('client_id', clientId);
    grant.set('ciphertext', ciphertext);
    grant.set('key_version', 'v1');
    grant.set('state', 'active');
    app.save(grant);
  },
};
