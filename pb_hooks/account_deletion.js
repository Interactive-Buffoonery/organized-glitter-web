/// <reference path="../pb_data/types.d.ts" />

module.exports = {
  cleanupStatus(app, job) {
    const grants = app.countRecords(
      'apple_oauth_grants',
      $dbx.exp('user_id = {:user}', {
        user: job.getString('user_id'),
      })
    );
    return job.getString('posthog_status') === 'completed' &&
      job.getString('revenuecat_status') === 'completed' &&
      grants === 0
      ? 'completed'
      : 'pending';
  },
  maintainRetention(app) {
    app.runInTransaction(txApp => {
      const ready = arrayOf(new DynamicModel({ id: '' }));
      txApp
        .db()
        .newQuery(
          `
        SELECT jobs.id FROM account_deletion_jobs jobs
        WHERE jobs.posthog_status = 'completed' AND jobs.revenuecat_status = 'completed'
          AND NOT EXISTS (SELECT 1 FROM apple_oauth_grants grants WHERE grants.user_id = jobs.user_id)
          AND jobs.cleanup_completed = ''
        LIMIT 100
      `
        )
        .all(ready);
      for (const row of ready) {
        const job = txApp.findRecordById('account_deletion_jobs', row.id);
        job.set('cleanup_completed', new DateTime());
        txApp.save(job);
      }
      const expired = arrayOf(new DynamicModel({ id: '' }));
      const cutoff = new DateTime(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      txApp
        .db()
        .newQuery(
          `
        SELECT jobs.id FROM account_deletion_jobs jobs
        WHERE jobs.posthog_status = 'completed' AND jobs.revenuecat_status = 'completed'
          AND NOT EXISTS (SELECT 1 FROM apple_oauth_grants grants WHERE grants.user_id = jobs.user_id)
          AND jobs.cleanup_completed != '' AND jobs.cleanup_completed <= {:cutoff}
        ORDER BY jobs.cleanup_completed
        LIMIT 100
      `
        )
        .bind({ cutoff: cutoff.string() })
        .all(expired);
      for (const row of expired)
        txApp.delete(txApp.findRecordById('account_deletion_jobs', row.id));
    });
  },
  issueProof(app, userId, value, method, provider = '', identityHash = '') {
    const previous = app.findRecordsByFilter(
      'auth_step_up_proofs',
      'user = {:user} && action = "delete_account"',
      '',
      0,
      0,
      { user: userId }
    );
    for (const record of previous) app.delete(record);
    const proof = new Record(app.findCollectionByNameOrId('auth_step_up_proofs'));
    proof.set('user', userId);
    proof.set('action', 'delete_account');
    proof.set('target_provider', 'account');
    proof.set('verification_method', method);
    proof.set('verification_provider', provider);
    proof.set('verification_identity_hash', identityHash);
    proof.set('proof_hash', $security.sha256(value));
    proof.set('expires', new DateTime(new Date(Date.now() + 5 * 60 * 1000).toISOString()));
    app.save(proof);
  },
  requireProof(app, user, hash) {
    const proofs = app.findRecordsByFilter(
      'auth_step_up_proofs',
      'user = {:user} && action = "delete_account" && target_provider = "account" && proof_hash = {:hash}',
      '',
      1,
      0,
      { user: user.id, hash }
    );
    const proof = proofs.length > 0 ? proofs[0] : null;
    if (!proof || !proof.getDateTime('expires').after(new DateTime())) {
      throw new ForbiddenError('Verify your identity again before deleting your account.');
    }
    if (proof.getString('verification_method') === 'oauth') {
      const linked = app
        .findAllExternalAuthsByRecord(user)
        .some(
          link =>
            link.provider() === proof.getString('verification_provider') &&
            $security.equal(
              $security.sha256(link.providerId()),
              proof.getString('verification_identity_hash')
            )
        );
      if (!linked) throw new ForbiddenError('This sign-in method no longer verifies your account.');
    } else if (!app.findCollectionByNameOrId('users').passwordAuth.enabled) {
      throw new ForbiddenError('Password authentication is unavailable.');
    }
  },
};
