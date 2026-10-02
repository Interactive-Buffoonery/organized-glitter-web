/// <reference path="../pb_data/types.d.ts" />

onRecordAuthWithOAuth2Request(e => {
  const supportedProviders = ['apple', 'google', 'discord'];
  const provider = e.providerName.toLowerCase();
  const isSupportedProvider = supportedProviders.indexOf(provider) !== -1;
  const createData = e.createData || {};
  const stepUpProof = String(createData.og_step_up_proof || '');
  const stepUpAction = String(createData.og_step_up_action || '');
  const stepUpTargetProvider = String(createData.og_step_up_target_provider || '').toLowerCase();
  const stepUpUserId = String(createData.og_step_up_user_id || '');
  const isStepUpRequest = stepUpAction !== '' || stepUpTargetProvider !== '' || stepUpUserId !== '';
  let matchesExistingIdentity = false;

  if (e.record && e.oAuth2User) {
    const externalAuths = e.app.findAllExternalAuthsByRecord(e.record);
    for (const externalAuth of externalAuths) {
      if (externalAuth.provider() === provider && externalAuth.providerId() === e.oAuth2User.id) {
        matchesExistingIdentity = true;
        break;
      }
    }
  }

  if (e.auth) {
    if (isStepUpRequest) {
      throw new BadRequestError('Invalid sign-in method verification request.');
    }
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Verify your email before connecting a sign-in method.');
    }
    if (!isSupportedProvider) {
      throw new ForbiddenError('This sign-in provider cannot be connected.');
    }
    if (!e.record || e.record.id !== e.auth.id) {
      throw new ApiError(
        409,
        'This sign-in method is already linked to another Organized Glitter account.'
      );
    }

    let proofAccepted = false;
    if (/^[A-Za-z0-9_-]{43}$/.test(stepUpProof)) {
      const consumeProof = txApp => {
        const matches = txApp.findRecordsByFilter(
          'auth_step_up_proofs',
          'proof_hash = {:proof} && user = {:user} && action = "link" && target_provider = {:provider}',
          '',
          1,
          0,
          {
            proof: $security.sha256(stepUpProof),
            user: e.auth.id,
            provider,
          }
        );
        const proof = matches.length > 0 ? matches[0] : null;

        if (!proof) return;

        txApp.delete(proof);
        if (proof.getDateTime('expires').after(new DateTime())) {
          proofAccepted = true;
        }
      };
      if (e.app.isTransactional()) consumeProof(e.app);
      else e.app.runInTransaction(consumeProof);
    }

    if (!proofAccepted) {
      throw new ApiError(403, 'Verify your identity again before connecting this provider.', {
        reason: 'fresh_proof_required',
      });
    }
  } else if (isStepUpRequest) {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(stepUpProof) ||
      (stepUpAction !== 'link' && stepUpAction !== 'unlink') ||
      supportedProviders.indexOf(stepUpTargetProvider) === -1 ||
      !/^[a-z0-9]{15}$/.test(stepUpUserId) ||
      !isSupportedProvider ||
      !e.record ||
      e.record.id !== stepUpUserId ||
      !e.record.getBool('verified') ||
      !e.oAuth2User ||
      !matchesExistingIdentity
    ) {
      throw new ForbiddenError('This sign-in method cannot verify the current account.');
    }

    const verifiedUserId = e.record.id;
    const verifiedProviderId = e.oAuth2User.id;
    e.next();

    e.app.runInTransaction(txApp => {
      const now = new DateTime();
      const expired = txApp.findRecordsByFilter(
        'auth_step_up_proofs',
        'expires <= {:now}',
        '+expires',
        100,
        0,
        { now: now.string() }
      );
      for (const record of expired) txApp.delete(record);

      const previous = txApp.findRecordsByFilter(
        'auth_step_up_proofs',
        'user = {:user} && action = {:action} && target_provider = {:provider}',
        '',
        10,
        0,
        {
          user: verifiedUserId,
          action: stepUpAction,
          provider: stepUpTargetProvider,
        }
      );
      for (const record of previous) txApp.delete(record);

      const collection = txApp.findCollectionByNameOrId('auth_step_up_proofs');
      const proof = new Record(collection);
      proof.set('user', verifiedUserId);
      proof.set('action', stepUpAction);
      proof.set('target_provider', stepUpTargetProvider);
      proof.set('verification_method', 'oauth');
      proof.set('verification_provider', provider);
      proof.set('verification_identity_hash', $security.sha256(verifiedProviderId));
      proof.set('proof_hash', $security.sha256(stepUpProof));
      proof.set('expires', new DateTime(new Date(Date.now() + 5 * 60 * 1000).toISOString()));
      txApp.save(proof);
    });
    return;
  } else {
    if (e.record && !matchesExistingIdentity) {
      throw new ApiError(
        409,
        'An account already uses this email. Sign in first, then connect this provider from Account settings.'
      );
    }
    if (!e.record && !isSupportedProvider) {
      throw new ForbiddenError('This sign-in provider is not supported.');
    }
  }

  e.next();
}, 'users');

onRecordDeleteRequest(e => {
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }

  throw new ForbiddenError('Use the guarded sign-in method route to unlink a provider.');
}, '_externalAuths');

routerAdd(
  'POST',
  '/api/auth/step-up/password',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = new DynamicModel({ action: '', password: '', proof: '', targetProvider: '' });
    e.bindBody(body);
    const action = typeof body.action === 'string' ? body.action : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const proofValue = typeof body.proof === 'string' ? body.proof : '';
    const targetProvider =
      typeof body.targetProvider === 'string' ? body.targetProvider.toLowerCase() : '';

    if (
      (action !== 'link' && action !== 'unlink') ||
      ['apple', 'google', 'discord'].indexOf(targetProvider) === -1 ||
      !/^[A-Za-z0-9_-]{43}$/.test(proofValue) ||
      password === ''
    ) {
      throw new BadRequestError('Invalid sign-in method verification request.');
    }

    let result = 'invalid';
    e.app.runInTransaction(txApp => {
      const now = new DateTime();
      const windowCutoff = new DateTime(new Date(Date.now() - 10 * 60 * 1000).toISOString());
      const user = txApp.findRecordById('users', e.auth.id);
      const users = txApp.findCollectionByNameOrId('users');
      const attempts = txApp.findRecordsByFilter(
        'auth_step_up_attempts',
        'user = {:user}',
        '',
        1,
        0,
        { user: user.id }
      );
      let attempt = attempts.length > 0 ? attempts[0] : null;

      if (attempt && attempt.getDateTime('window_started').before(windowCutoff)) {
        attempt.set('window_started', now);
        attempt.set('failure_count', 0);
      }

      if (attempt && attempt.getInt('failure_count') >= 5) {
        result = 'limited';
        return;
      }

      const passwordAccepted =
        users.passwordAuth.enabled && user.getBool('verified') && user.validatePassword(password);
      if (!passwordAccepted) {
        if (!attempt) {
          attempt = new Record(txApp.findCollectionByNameOrId('auth_step_up_attempts'));
          attempt.set('user', user.id);
          attempt.set('window_started', now);
          attempt.set('failure_count', 0);
        }
        attempt.set('failure_count', attempt.getInt('failure_count') + 1);
        txApp.save(attempt);
        result = 'invalid';
        return;
      }

      if (attempt) txApp.delete(attempt);

      const expired = txApp.findRecordsByFilter(
        'auth_step_up_proofs',
        'expires <= {:now}',
        '+expires',
        100,
        0,
        { now: now.string() }
      );
      for (const record of expired) txApp.delete(record);

      const previous = txApp.findRecordsByFilter(
        'auth_step_up_proofs',
        'user = {:user} && action = {:action} && target_provider = {:provider}',
        '',
        10,
        0,
        { user: user.id, action, provider: targetProvider }
      );
      for (const record of previous) txApp.delete(record);

      const proof = new Record(txApp.findCollectionByNameOrId('auth_step_up_proofs'));
      proof.set('user', user.id);
      proof.set('action', action);
      proof.set('target_provider', targetProvider);
      proof.set('verification_method', 'password');
      proof.set('proof_hash', $security.sha256(proofValue));
      proof.set('expires', new DateTime(new Date(Date.now() + 5 * 60 * 1000).toISOString()));
      txApp.save(proof);
      result = 'accepted';
    });

    if (result === 'limited') {
      throw new TooManyRequestsError('Too many verification attempts. Try again in 10 minutes.');
    }
    if (result !== 'accepted') {
      throw new ApiError(400, 'The current password is incorrect.', {
        reason: 'password_invalid',
      });
    }

    return e.noContent(204);
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096)
);

routerAdd(
  'DELETE',
  '/api/auth/external-auths/{provider}',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const provider = e.request.pathValue('provider').toLowerCase();
    if (['apple', 'google', 'discord'].indexOf(provider) === -1) {
      throw new BadRequestError('This sign-in provider is not supported.');
    }

    const body = new DynamicModel({ proof: '' });
    e.bindBody(body);
    const proofValue = typeof body.proof === 'string' ? body.proof : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(proofValue)) {
      throw new ApiError(403, 'Verify your identity again before unlinking this provider.', {
        reason: 'fresh_proof_required',
      });
    }

    let result = 'missing';
    e.app.runInTransaction(txApp => {
      const user = txApp.findRecordById('users', e.auth.id);
      const users = txApp.findCollectionByNameOrId('users');
      const externalAuths = txApp.findAllExternalAuthsByRecord(user);
      const configuredProviders = [];
      if (users.oauth2.enabled) {
        for (const config of users.oauth2.providers) configuredProviders.push(config.name);
      }

      let target = null;
      let remainingConfiguredProviders = 0;
      for (const externalAuth of externalAuths) {
        if (externalAuth.provider() === provider) {
          target = externalAuth;
        } else if (configuredProviders.indexOf(externalAuth.provider()) !== -1) {
          remainingConfiguredProviders += 1;
        }
      }

      if (!target) return;

      const matches = txApp.findRecordsByFilter(
        'auth_step_up_proofs',
        'proof_hash = {:proof} && user = {:user} && action = "unlink" && target_provider = {:provider}',
        '',
        1,
        0,
        { proof: $security.sha256(proofValue), user: user.id, provider }
      );
      const proof = matches.length > 0 ? matches[0] : null;

      if (!proof) {
        result = 'proof_required';
        return;
      }

      txApp.delete(proof);
      if (!proof.getDateTime('expires').after(new DateTime())) {
        result = 'proof_required';
        return;
      }

      const hasPasswordContinuity =
        proof.getString('verification_method') === 'password' && users.passwordAuth.enabled;
      if (remainingConfiguredProviders === 0 && !hasPasswordContinuity) {
        result = 'continuity_changed';
        return;
      }

      txApp.delete(target);
      result = 'accepted';
    });

    if (result === 'missing') {
      throw new NotFoundError('This sign-in method is not linked to your account.');
    }
    if (result === 'proof_required') {
      throw new ApiError(403, 'Verify your identity again before unlinking this provider.', {
        reason: 'fresh_proof_required',
      });
    }
    if (result === 'continuity_changed') {
      throw new ApiError(
        409,
        'Your available sign-in methods changed. Refresh and verify with your password or another connected provider.',
        { reason: 'continuity_changed' }
      );
    }

    return e.noContent(204);
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(4096)
);
