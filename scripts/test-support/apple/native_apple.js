const production = require(`${__hooks}/native_apple.production.js`);

module.exports = {
  getConfiguration: production.getConfiguration,
  createProvider(configuration, context) {
    const provider = production.createProvider(configuration, context);
    return {
      fetchToken(code) {
        if (code.startsWith('provider-')) {
          provider.setTokenURL(
            code === 'provider-network'
              ? 'http://127.0.0.1:1/apple'
              : $os.getenv('TEST_APPLE_OAUTH_URL') + '/apple-' + code.slice(9)
          );
          return provider.fetchToken(code);
        }
        return {
          scenario: code,
          refreshToken: code === 'repeat' ? '' : 'disposable-test-refresh-token',
        };
      },
      fetchAuthUser(token) {
        const code = token.scenario;
        if (code === 'claims-invalid') throw new Error('token has invalid claims');
        if (code === 'jwks-unavailable')
          throw new Error('id_token validation failed: failed to fetch JSON Web Key Set (503)');
        if (code === 'auth-user-unknown')
          throw new Error('future PocketBase Apple verifier failure');
        return {
          id: code === 'repeat' ? 'apple-test-first' : 'apple-test-' + code,
          email: code === 'no-email' || code === 'unverified' ? '' : code + '@localhost.test',
          rawUser: {
            nonce:
              code === 'wrong-nonce'
                ? 'wrong'
                : $security.sha256('disposable_test_nonce_1234567890'),
          },
        };
      },
    };
  },
};
