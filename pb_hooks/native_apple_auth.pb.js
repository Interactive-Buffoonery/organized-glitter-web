/// <reference path="../pb_data/types.d.ts" />

routerAdd('GET', '/api/auth/apple/native/readiness', e => {
  let available = false;
  try {
    require(`${__hooks}/native_apple.js`).getConfiguration(e.app);
    available = true;
  } catch (_) {
    available = false;
  }
  return e.json(200, { available });
});

routerAdd(
  'POST',
  '/api/auth/apple/native',
  e => {
    const authorizationFailure = () => {
      const message = 'Apple authorization failed. Start a new sign-in attempt.';
      return new BadRequestError(message, {
        reason: new ValidationError('apple_authorization_failed', message),
      });
    };
    const unavailable = () => {
      const message = 'Apple sign-in is temporarily unavailable.';
      e.response.header().set('Retry-After', '30');
      return new ApiError(503, message, {
        reason: new ValidationError('apple_unavailable', message),
      });
    };

    if (e.auth || e.request.header.get('Authorization')) {
      throw new ForbiddenError('Sign out before starting a new Apple sign-in.');
    }

    const data = e.requestInfo().body;
    const keys = Object.keys(data);
    if (
      keys.some(key => !['code', 'nonce', 'name'].includes(key)) ||
      typeof data.code !== 'string' ||
      data.code.length < 1 ||
      data.code.length > 2048 ||
      typeof data.nonce !== 'string' ||
      data.nonce.length < 16 ||
      data.nonce.length > 256 ||
      !/^[A-Za-z0-9_-]+$/.test(data.nonce)
    ) {
      throw new BadRequestError('Invalid Apple sign-in request.');
    }
    if (
      data.name !== undefined &&
      (typeof data.name !== 'object' ||
        !data.name ||
        Array.isArray(data.name) ||
        Object.keys(data.name).some(key => !['givenName', 'familyName'].includes(key)) ||
        ['givenName', 'familyName'].some(
          key =>
            data.name[key] !== undefined &&
            (typeof data.name[key] !== 'string' || data.name[key].length > 100)
        ))
    ) {
      throw new BadRequestError('Invalid Apple sign-in request.');
    }

    let configuration;
    try {
      configuration = require(`${__hooks}/native_apple.js`).getConfiguration(e.app);
    } catch (_) {
      throw unavailable();
    }
    const { users, nativeClientId, grantKey } = configuration;

    let token;
    let authUser;
    let provider;
    try {
      provider = require(`${__hooks}/native_apple.js`).createProvider(
        configuration,
        e.request.context()
      );
    } catch (_) {
      throw unavailable();
    }
    try {
      token = provider.fetchToken(data.code);
    } catch (error) {
      const failure = error.value || error;
      const status = failure.response && failure.response.statusCode;
      if (status === 400 && ['invalid_grant', 'invalid_request'].includes(failure.errorCode)) {
        throw authorizationFailure();
      }
      throw unavailable();
    }
    try {
      authUser = provider.fetchAuthUser(token);
    } catch (_) {
      throw unavailable();
    }

    const rawClaims = authUser.rawUser || {};
    if (
      !authUser.id ||
      typeof rawClaims.nonce !== 'string' ||
      !$security.equal(rawClaims.nonce, $security.sha256(data.nonce)) ||
      typeof token.refreshToken !== 'string'
    ) {
      throw authorizationFailure();
    }

    const subject = authUser.id;
    const email = authUser.email || '';
    const identityHash = $security.sha256(subject);
    const ciphertext = token.refreshToken ? $security.encrypt(token.refreshToken, grantKey) : '';
    let record;
    let isNew = false;
    let collision = false;
    e.app.runInTransaction(txApp => {
      require(`${__hooks}/apple_grant_store.js`).requireActive(
        txApp,
        identityHash,
        nativeClientId,
        Boolean(ciphertext),
        'apple',
        false,
        e.response
      );
      const links = txApp.findRecordsByFilter(
        '_externalAuths',
        'collectionRef = {:collection} && provider = "apple" && providerId = {:subject}',
        '',
        1,
        0,
        { collection: users.id, subject }
      );
      if (links.length > 0) {
        record = txApp.findRecordById('users', links[0].getString('recordRef'));
        if (!record.getBool('verified')) {
          const storedEmail = record.getString('email');
          if (!email || (storedEmail && storedEmail.toLowerCase() !== email.toLowerCase())) {
            throw new ForbiddenError(
              'Apple cannot verify this account. Use another sign-in method.'
            );
          }
          record.setRandomPassword();
          txApp.deleteAllExternalAuthsByRecord(record);
          if (!storedEmail) record.setEmail(email);
          record.setVerified(true);
          txApp.save(record);
          const link = new Record(txApp.findCollectionByNameOrId('_externalAuths'));
          link.set('collectionRef', users.id);
          link.set('recordRef', record.id);
          link.set('provider', 'apple');
          link.set('providerId', subject);
          txApp.save(link);
        }
      } else {
        if (!email) {
          throw new BadRequestError('Apple did not provide an email for this account.');
        }
        const matches = email
          ? txApp.findRecordsByFilter('users', 'email:lower = {:email}', '', 1, 0, {
              email: email.toLowerCase(),
            })
          : [];
        if (matches.length > 0) {
          collision = true;
          return;
        }
        record = new Record(txApp.findCollectionByNameOrId('users'));
        record.setRandomPassword();
        const suppliedName = data.name
          ? [data.name.givenName || '', data.name.familyName || ''].join(' ').trim()
          : '';
        const username = suppliedName
          ? `${suppliedName.slice(0, 17)} ${$security.randomString(6)}`
          : `apple${$security.randomString(12)}`;
        const form = new RecordUpsertForm(txApp, record);
        form.load({ email, username });
        form.submit();
        if (record.getString('email') === email) {
          record.setVerified(true);
          txApp.save(record);
        }
        const link = new Record(txApp.findCollectionByNameOrId('_externalAuths'));
        link.set('collectionRef', users.id);
        link.set('recordRef', record.id);
        link.set('provider', 'apple');
        link.set('providerId', subject);
        txApp.save(link);
        isNew = true;
      }

      require(`${__hooks}/apple_grant_store.js`).upsert(txApp, {
        userId: record.id,
        identityHash,
        clientId: nativeClientId,
        ciphertext,
      });
    });
    if (collision) {
      throw new ApiError(
        409,
        'An account already uses this email. Sign in first, then connect Apple from Account settings.'
      );
    }
    return $apis.recordAuthResponse(e, record, 'oauth2', { isNew });
  },
  $apis.bodyLimit(4096)
);
