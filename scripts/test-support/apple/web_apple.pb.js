onRecordAuthWithOAuth2Request(e => {
  const key = e.oAuth2User && (e.oAuth2User.id === 'disposable-web-fail' || e.oAuth2User.refreshToken === 'disposable-web-refresh-fail-token')
    ? 'é'.repeat(32)
    : require(`${__hooks}/apple_config.js`).read(e.app).grantEncryptionKey;
  require(`${__hooks}/apple_web_grant.js`).capture(e, 'discord', key);
}, 'users');
