/// <reference path="../pb_data/types.d.ts" />

module.exports = {
  createProvider(configuration, context) {
    const provider = configuration.appleConfig.initProvider();
    provider.setClientId(configuration.nativeClientId);
    provider.setClientSecret(configuration.clientSecret);
    provider.setTokenURL('https://appleid.apple.com/auth/token');
    provider.setRedirectURL('');
    provider.setContext(context);
    return provider;
  },
  getConfiguration(app) {
    const configReader = require(`${__hooks}/apple_config.js`);
    const config = configReader.read(app);
    const users = app.findCollectionByNameOrId('users');
    const appleConfig = users.oauth2.providers.find(
      provider => provider.name === 'apple' && provider.clientId && provider.clientSecret
    );
    const limits = app.settings().rateLimits;
    const hasRateRule = (label, audience) =>
      limits.rules.some(
        rule =>
          rule.label === label &&
          rule.audience === audience &&
          rule.maxRequests > 0 &&
          rule.duration > 0
      );
    const nativeClientId = config.nativeClientId;
    const grantKey = config.grantEncryptionKey;
    if (!users.oauth2.enabled || !appleConfig) {
      return configReader.unavailable(app, 'apple_provider_unavailable');
    }
    if (
      !limits.enabled ||
      !hasRateRule('POST /api/auth/apple/native', '@guest') ||
      !hasRateRule('GET /api/auth/apple/native/readiness', '')
    ) {
      return configReader.unavailable(app, 'apple_rate_limits_unavailable');
    }
    try {
      app.findCollectionByNameOrId('apple_oauth_grants');
    } catch (_) {
      return configReader.unavailable(app, 'apple_grant_collection_unavailable');
    }
    const form = new AppleClientSecretCreateForm(app);
    form.clientId = nativeClientId;
    form.teamId = config.teamId;
    form.keyId = config.keyId;
    form.privateKey = config.privateKey;
    form.duration = 300;
    let clientSecret;
    try {
      clientSecret = form.submit();
    } catch (_) {
      return configReader.unavailable(app, 'apple_config_invalid_signing_key');
    }
    try {
      $security.encrypt('readiness', grantKey);
    } catch (_) {
      return configReader.unavailable(app, 'apple_config_invalid_grant_key');
    }
    return { users, appleConfig, nativeClientId, grantKey, clientSecret };
  },
};
