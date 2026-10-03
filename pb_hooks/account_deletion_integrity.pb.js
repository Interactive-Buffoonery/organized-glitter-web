/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(e => {
  // Identity fields must always be server-asserted, so this hook does not
  // bypass for superusers the way the ownership and deletion guards do.
  // Unlike those, a bypass here would let a superuser-authenticated request
  // write arbitrary user_id and user_email values.
  const authId = e.auth ? e.auth.getString('id') : '';
  if (authId === '') {
    throw new ForbiddenError('Authentication is required.');
  }

  const email = e.auth.getString('email').trim();
  const requestedMethod = e.record.getString('signup_method').trim();
  const allowedMethods = ['password', 'apple', 'google', 'discord', 'unknown'];

  e.record.set('user_id', authId);
  e.record.set('user_email', email || 'unknown');
  e.record.set(
    'signup_method',
    allowedMethods.indexOf(requestedMethod) >= 0 ? requestedMethod : 'unknown'
  );
  e.next();
}, 'account_deletions');
