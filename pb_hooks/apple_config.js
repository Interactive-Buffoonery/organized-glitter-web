/// <reference path="../pb_data/types.d.ts" />

const PRIVATE_DIRECTORY = 'apple-auth-private';

function unavailable(app, reason) {
  app.logger().warn('Apple configuration is unavailable.', 'reason', reason);
  throw new Error('Apple configuration is unavailable.');
}

module.exports = {
  privateDirectory: PRIVATE_DIRECTORY,
  unavailable,
  read(app) {
    const result = require(`${__hooks}/private_json.js`).read(app, PRIVATE_DIRECTORY);
    if (result.reason) {
      const reason = result.reason === 'missing' ? 'unreadable' : result.reason;
      return unavailable(app, `apple_config_${reason}`);
    }
    const config = result.config;
    if (typeof config.teamId !== 'string' || !/^[A-Z0-9]{10}$/.test(config.teamId)) {
      return unavailable(app, 'apple_config_invalid_team_id');
    }
    if (
      typeof config.nativeClientId !== 'string' ||
      !/^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/.test(config.nativeClientId)
    ) {
      return unavailable(app, 'apple_config_invalid_native_client_id');
    }
    if (typeof config.keyId !== 'string' || !/^[A-Z0-9]{10}$/.test(config.keyId)) {
      return unavailable(app, 'apple_config_invalid_key_id');
    }
    if (typeof config.privateKey !== 'string' || !config.privateKey.includes('BEGIN PRIVATE KEY')) {
      return unavailable(app, 'apple_config_invalid_signing_key');
    }
    if (
      typeof config.grantEncryptionKey !== 'string' ||
      !/^[!-~]{32}$/.test(config.grantEncryptionKey)
    ) {
      return unavailable(app, 'apple_config_invalid_grant_key');
    }
    return config;
  },
};
