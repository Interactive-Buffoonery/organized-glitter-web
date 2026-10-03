/// <reference path="../pb_data/types.d.ts" />

onRecordAuthWithOAuth2Request(e => {
  if (e.providerName !== 'apple') {
    e.next();
    return;
  }
  let key = '';
  try {
    key = require(`${__hooks}/apple_config.js`).read(e.app).grantEncryptionKey;
  } catch (_) {
    // Existing links with a stored grant can still sign in.
  }
  require(`${__hooks}/apple_web_grant.js`).capture(e, 'apple', key);
}, 'users');

onRecordDelete(e => {
  const app = e.app;
  try {
    app.runInTransaction(txApp => {
      e.app = txApp;
      require(`${__hooks}/apple_revocation.js`).queueForUser(txApp, e.record.id);
      e.next();
    });
  } finally {
    e.app = app;
  }
}, 'users');

onRecordDelete(e => {
  if (e.record.getString('provider') !== 'apple') {
    e.next();
    return;
  }
  let user;
  try {
    user = e.app.findRecordById('users', e.record.getString('recordRef'));
  } catch (_) {
    e.next();
    return;
  }
  if (!user.getBool('verified')) {
    e.next();
    return;
  }
  const app = e.app;
  try {
    app.runInTransaction(txApp => {
      e.app = txApp;
      require(`${__hooks}/apple_revocation.js`).queueForIdentity(
        txApp,
        $security.sha256(e.record.getString('providerId')),
        e.record.getString('recordRef')
      );
      e.next();
    });
  } finally {
    e.app = app;
  }
}, '_externalAuths');

onRecordDeleteRequest(e => {
  if (!e.hasSuperuserAuth() || e.record.getString('provider') !== 'apple') {
    e.next();
    return;
  }
  const app = e.app;
  try {
    app.runInTransaction(txApp => {
      e.app = txApp;
      require(`${__hooks}/apple_revocation.js`).queueForIdentity(
        txApp,
        $security.sha256(e.record.getString('providerId')),
        e.record.getString('recordRef')
      );
      e.next();
    });
  } finally {
    e.app = app;
  }
}, '_externalAuths');

cronAdd('apple_grant_revocation', '*/5 * * * *', () => {
  try {
    require(`${__hooks}/apple_revocation.js`).processPending($app);
  } catch (_) {
    $app
      .logger()
      .warn('Apple revocation worker failed.', 'reason', 'apple_revocation_worker_failed');
  }
});
