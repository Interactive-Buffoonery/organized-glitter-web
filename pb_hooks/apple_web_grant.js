/// <reference path="../pb_data/types.d.ts" />

module.exports = {
  capture(e, providerName, key) {
    if (e.providerName !== providerName) {
      e.next();
      return;
    }

    let ciphertext = '';
    let clientId = '';
    let identityHash = '';
    let preparationFailed = false;
    try {
      for (const provider of e.collection.oauth2.providers) {
        if (provider.name === providerName) clientId = provider.clientId;
      }
      if (clientId && e.oAuth2User && e.oAuth2User.id) {
        identityHash = $security.sha256(e.oAuth2User.id);
        if (e.oAuth2User.refreshToken) {
          if (key.length === 32) {
            ciphertext = $security.encrypt(e.oAuth2User.refreshToken, key);
          } else {
            preparationFailed = true;
          }
        }
      }
    } catch (_) {
      preparationFailed = true;
      e.app.logger().warn('Apple grant capture failed.', 'reason', 'apple_grant_prepare_failed');
    }

    const app = e.app;
    let grantFailure = false;
    try {
      app.runInTransaction(txApp => {
        e.app = txApp;
        if (!identityHash || !clientId || (e.oAuth2User && e.oAuth2User.refreshToken && !ciphertext)) {
          throw new ApiError(503, 'Apple sign-in is temporarily unavailable. Please try again.', {
            reason: new ValidationError('apple_grant_prepare_failed', 'Grant preparation failed.'),
          });
        }
        const grantStore = require(`${__hooks}/apple_grant_store.js`);
        grantStore.requireActive(
          txApp,
          identityHash,
          clientId,
          Boolean(ciphertext),
          providerName,
          preparationFailed,
          e.response
        );
        e.next();
        if (ciphertext) {
          try {
            grantStore.upsert(txApp, {
              userId: e.record.id, identityHash, clientId, ciphertext,
            });
          } catch (_) {
            grantFailure = true;
            throw new ApiError(503, 'Apple sign-in is temporarily unavailable. Please try again.', {
              reason: new ValidationError('apple_grant_storage_failed', 'Grant storage failed.'),
            });
          }
        }
      });
    } catch (error) {
      if (grantFailure) {
        app.logger().warn('Apple grant capture failed.', 'reason', 'apple_grant_storage_failed');
      }
      throw error;
    } finally {
      e.app = app;
    }
  },
};
