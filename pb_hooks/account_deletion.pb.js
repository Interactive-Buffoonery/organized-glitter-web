/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/account/delete',
  e => {
    const body = e.requestInfo().body;
    if (
      Object.keys(body).some(key => !['proof', 'confirmed'].includes(key)) ||
      typeof body.proof !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(body.proof) ||
      body.confirmed !== true
    ) {
      throw new BadRequestError('Confirm deletion and provide a valid deletion authorization.');
    }
    const hash = $security.sha256(body.proof);
    let cleanup = 'pending';
    e.app.runInTransaction(app => {
      const receipts = app.findRecordsByFilter(
        'account_deletion_jobs',
        'proof_hash = {:hash}',
        '',
        1,
        0,
        { hash }
      );
      // The proof also serves as a private retry credential after the session is deleted.
      if (receipts.length > 0) {
        cleanup = require(`${__hooks}/account_deletion.js`).cleanupStatus(app, receipts[0]);
        return;
      }
      if (!e.auth || e.auth.collection().name !== 'users') {
        throw new UnauthorizedError('Authentication is required.');
      }
      const user = app.findRecordById('users', e.auth.id);
      if (!user.getBool('verified')) {
        throw new ForbiddenError('Email verification is required.');
      }
      require(`${__hooks}/account_deletion.js`).requireProof(app, user, hash);
      const job = new Record(app.findCollectionByNameOrId('account_deletion_jobs'));
      job.set('user_id', user.id);
      job.set('proof_hash', hash);
      job.set('posthog_status', 'pending');
      job.set('revenuecat_status', 'pending');
      app.save(job);
      app.delete(user);
    });
    return e.json(200, { status: 'deleted', cleanup });
  },
  $apis.bodyLimit(4096)
);

cronAdd('completed_account_deletion_retention', '15 * * * *', () => {
  require(`${__hooks}/account_deletion.js`).maintainRetention($app);
});
