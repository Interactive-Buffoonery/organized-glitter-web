onBootstrap(e => {
  e.next();
  cronRemove('apple_grant_revocation');
});

routerAdd(
  'GET',
  '/api/test/apple/revocation-cron',
  e => {
    return e.json(200, {
      registered: e.app
        .cron()
        .jobs()
        .some(job => job.id() === 'apple_grant_revocation'),
    });
  },
  $apis.requireSuperuserAuth()
);

routerAdd(
  'POST',
  '/api/test/apple/revoke-pending',
  e => {
    return e.json(
      200,
      require(`${__hooks}/apple_revocation.js`).processPending(
        e.app,
        `${$os.getenv('TEST_APPLE_OAUTH_URL')}/revoke`,
        ['apple', 'discord']
      )
    );
  },
  $apis.requireSuperuserAuth()
);

routerAdd(
  'DELETE',
  '/api/test/apple/link/{userId}',
  e => {
    const links = e.app.findRecordsByFilter(
      '_externalAuths',
      'recordRef = {:user} && provider = "apple"',
      '',
      1,
      0,
      { user: e.request.pathValue('userId') }
    );
    if (links.length === 0) throw new NotFoundError('Apple link is missing.');
    e.app.delete(links[0]);
    return e.noContent(204);
  },
  $apis.requireSuperuserAuth()
);
