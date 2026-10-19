/// <reference path="../pb_data/types.d.ts" />

const minute = 60 * 1000;
const day = 24 * 60 * minute;
const leaseDuration = 2 * minute;

function date(value) {
  return new DateTime(new Date(value).toISOString()).string();
}

function configFromEnvironment() {
  const host = $os.getenv('POSTHOG_ERASURE_HOST');
  const projectId = $os.getenv('POSTHOG_ERASURE_PROJECT_ID');
  const apiKey = $os.getenv('POSTHOG_ERASURE_API_KEY');
  if (
    !['https://us.posthog.com', 'https://eu.posthog.com'].includes(host) ||
    !/^[1-9][0-9]*$/.test(projectId) ||
    !apiKey ||
    /\s/.test(apiKey)
  )
    return null;
  return { host, projectId, apiKey };
}

const queries = {
  claim: `SELECT id FROM account_deletion_jobs
    WHERE posthog_status != 'completed' AND next_attempt <= {:now} AND lease_until <= {:now}
    ORDER BY next_attempt, created, id LIMIT 1`,
  alerts: `SELECT id FROM account_deletion_jobs
    WHERE posthog_status != 'completed' AND next_alert <= {:now}
    ORDER BY next_alert, created, id LIMIT 100`,
};

function claim(app) {
  let claimed = null;
  app.runInTransaction(tx => {
    const rows = arrayOf(new DynamicModel({ id: '' }));
    tx.db()
      .newQuery(queries.claim)
      .bind({ now: date(Date.now()) })
      .all(rows);
    if (!rows.length) return;
    const job = tx.findRecordById('account_deletion_jobs', rows[0].id);
    job.set('lease_token', $security.randomString(32));
    job.set('lease_until', date(Date.now() + leaseDuration));
    job.set('attempts', job.getInt('attempts') + 1);
    tx.save(job);
    claimed = { id: job.id, token: job.getString('lease_token'), job };
  });
  return claimed;
}

function alertUnresolved(app) {
  const reasons = [
    'configuration',
    'authorization',
    'identity_missing',
    'identity_shared',
    'identity_ambiguous',
    'identity_oversized',
    'identity_changed',
    'target_configuration',
    'vendor_shape',
    'vendor_response',
    'deletion_unconfirmed',
    'verification_pending',
    'verification_attribution',
    'rate_limit',
    'rate_limit_invalid',
    'transport',
    'vendor_unavailable',
  ];
  const counts = {};
  let total = 0;
  app.runInTransaction(tx => {
    const rows = arrayOf(new DynamicModel({ id: '' }));
    tx.db()
      .newQuery(queries.alerts)
      .bind({ now: date(Date.now()) })
      .all(rows);
    const jobs = rows.map(row => tx.findRecordById('account_deletion_jobs', row.id));
    for (const job of jobs) {
      const reason = reasons.includes(job.getString('last_error'))
        ? job.getString('last_error')
        : 'worker_failure';
      counts[reason] = (counts[reason] || 0) + 1;
    }
    total = jobs.length;
    // Emit before suppression commits. A stop or rollback can duplicate the
    // warning, but cannot acknowledge a warning that was never attempted.
    if (total)
      app
        .logger()
        .warn(
          'Account deletion cleanup unresolved.',
          'reason',
          'cleanup_unresolved',
          'count',
          total,
          'categories',
          JSON.stringify(counts)
        );
    for (const job of jobs) {
      job.set('alerted_at', date(Date.now()));
      job.set('next_alert', date(Date.now() + day));
      tx.save(job);
    }
  });
  return total;
}

function identityShared(app, target, owner) {
  const rows = arrayOf(new DynamicModel({ id: '' }));
  app
    .db()
    .newQuery(
      `SELECT id FROM users
    WHERE id != {:owner} AND id IN (SELECT value FROM json_each({:identities})) LIMIT 1`
    )
    .bind({ owner, identities: JSON.stringify(target.distinctIds) })
    .all(rows);
  return rows.length > 0;
}

function updateClaim(app, claim, mutate) {
  let updated = false;
  app.runInTransaction(tx => {
    const job = tx.findRecordById('account_deletion_jobs', claim.id);
    if (
      job.getString('lease_token') !== claim.token ||
      !job.getDateTime('lease_until').after(new DateTime()) ||
      job.getString('posthog_status') === 'completed'
    )
      return;
    mutate(job, tx);
    tx.save(job);
    claim.job = job;
    updated = true;
  });
  return updated;
}

function failure(reason, blocked = false, retryAfter = 0) {
  // Only internal reason codes cross the worker boundary, never vendor bodies.
  return { reason, blocked, retryAfter };
}

function request(config, method, suffix) {
  let response;
  try {
    response = $http.send({
      method,
      url: `${config.host}/api/projects/${config.projectId}/persons/${suffix}`,
      headers: { Authorization: `Bearer ${config.apiKey}` },
      timeout: 10,
    });
  } catch (_) {
    throw failure('transport');
  }
  const code = response.statusCode;
  if (code === 429) {
    const header = response.headers['Retry-After'];
    const value = header && header[0];
    const delay = /^\d+$/.test(value || '')
      ? Number(value) * 1000
      : Date.parse(value || '') - Date.now();
    const timestamp = Date.now() + delay;
    if (
      value &&
      (!Number.isFinite(delay) ||
        !Number.isFinite(new Date(timestamp).getTime()) ||
        timestamp > Date.parse('9999-12-31T23:59:59.999Z'))
    ) {
      throw failure('rate_limit_invalid', true, day);
    }
    throw failure('rate_limit', false, Number.isFinite(delay) ? Math.max(0, delay) : 0);
  }
  if (code === 401 || code === 403) throw failure('authorization', true);
  if (code >= 500) throw failure('vendor_unavailable');
  if (method === 'DELETE' && code === 404) throw failure('deletion_unconfirmed', true);
  if (code < 200 || code >= 300) throw failure('vendor_response', true);
  return response;
}

function results(response) {
  const body = response.json;
  if (!body || !Array.isArray(body.results) || body.next) throw failure('vendor_shape', true);
  return body.results;
}

function targetFor(config, job) {
  const people = results(
    request(config, 'GET', `?distinct_id=${encodeURIComponent(job.getString('user_id'))}&limit=2`)
  );
  if (!people.length) throw failure('identity_missing', true);
  if (people.length !== 1) throw failure('identity_ambiguous', true);
  const uuid = people[0].uuid || people[0].id;
  if (
    typeof uuid !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid)
  ) {
    throw failure('identity_ambiguous', true);
  }
  return personTarget(config, uuid, job.getString('user_id'));
}

function personTarget(config, uuid, userId) {
  // List/batch hydration may cap distinct IDs. The retrieve endpoint returns
  // the authoritative full set; never persist a truncated identity manifest.
  const person = request(config, 'GET', `${encodeURIComponent(uuid)}/`).json;
  if (!person || (person.uuid || person.id) !== uuid) throw failure('identity_ambiguous', true);
  if (
    !Array.isArray(person.distinct_ids) ||
    !person.distinct_ids.includes(userId) ||
    person.distinct_ids.some(id => typeof id !== 'string' || !id)
  )
    throw failure('identity_ambiguous', true);
  const target = {
    host: config.host,
    projectId: config.projectId,
    personId: uuid,
    distinctIds: person.distinct_ids,
  };
  // Encode the entire value as PocketBase stores it, leaving 10 KB headroom
  // below the JSON field's 250,000-byte limit. Never truncate identities.
  if (toBytes(target).length > 240000) throw failure('identity_oversized', true);
  return target;
}

function processJob(app, claim, config) {
  if (!config) throw failure('configuration', true);
  let target = JSON.parse(claim.job.getString('posthog_target') || 'null');
  if (target && target.personId) {
    if (target.host !== config.host || target.projectId !== config.projectId) {
      throw failure('target_configuration', true);
    }
    if (identityShared(app, target, claim.job.getString('user_id')))
      throw failure('identity_shared', true);
    const entries = results(
      request(
        config,
        'GET',
        `deletion_status/?person_uuid=${encodeURIComponent(target.personId)}&status=all`
      )
    );
    if (entries.length > 1 || entries.some(entry => entry.person_uuid !== target.personId))
      throw failure('vendor_shape', true);
    if (entries.length) {
      // The vendor deduplicates AsyncDeletion by person UUID and DELETE returns
      // no operation ID. This adapter establishes no fresh event coverage,
      // profile absence or recording verification. Keep the target unresolved.
      if (
        entries.some(
          entry =>
            entry.status === 'completed' && Number.isFinite(Date.parse(entry.delete_verified_at))
        )
      ) {
        throw failure('verification_attribution', true);
      }
      throw failure('verification_pending');
    }
    // A retry must not erase identities merged since the saved snapshot.
    // Refresh the same UUID, preserve every earlier ID, and reject unsafe changes.
    let fresh;
    try {
      fresh = personTarget(config, target.personId, claim.job.getString('user_id'));
    } catch (outcome) {
      throw failure(outcome?.reason || 'identity_ambiguous', true, outcome?.retryAfter || 0);
    }
    const freshIds = new Set(fresh.distinctIds);
    if (target.distinctIds.some(id => !freshIds.has(id))) throw failure('identity_changed', true);
    if (identityShared(app, fresh, claim.job.getString('user_id')))
      throw failure('identity_shared', true);
    if (!updateClaim(app, claim, job => job.set('posthog_target', fresh))) return;
    target = fresh;
  } else {
    target = targetFor(config, claim.job);
    if (
      !updateClaim(app, claim, job => {
        job.set('posthog_target', target);
        job.set('posthog_requested_at', date(Date.now()));
        job.set('posthog_status', 'requested');
      })
    )
      return;
  }
  // Renew ownership immediately before the external side effect. The timeout is
  // far shorter than the lease; every subsequent write checks the same token.
  let shared = false;
  if (
    !updateClaim(app, claim, (job, tx) => {
      shared = identityShared(tx, target, job.getString('user_id'));
      job.set('lease_until', date(Date.now() + leaseDuration));
    })
  )
    return;
  if (shared) throw failure('identity_shared', true);
  request(
    config,
    'DELETE',
    `${encodeURIComponent(target.personId)}/?delete_events=true&delete_recordings=true`
  );
  throw failure('verification_pending');
}

function reschedule(app, claim, outcome) {
  const reason = outcome && typeof outcome.reason === 'string' ? outcome.reason : 'worker_failure';
  updateClaim(app, claim, job => {
    const delay = Math.max(
      Math.min(15 * minute * Math.pow(2, Math.min(job.getInt('attempts') - 1, 7)), day),
      outcome?.retryAfter || 0
    );
    job.set(
      'posthog_status',
      outcome?.blocked ? 'blocked' : job.getString('posthog_requested_at') ? 'requested' : 'pending'
    );
    job.set('next_attempt', date(Date.now() + delay));
    job.set('last_error', reason);
    if (outcome?.blocked) {
      job.set(
        'next_alert',
        date(Math.max(Date.now(), (Date.parse(job.getString('alerted_at')) || 0) + day))
      );
    }
    job.set('lease_token', '');
    job.set('lease_until', '');
  });
}

module.exports = {
  queries,
  processPending(app, config = configFromEnvironment()) {
    const result = { attempted: 0 };
    try {
      // Ten jobs, at most three ten-second HTTP requests per job, per cron run.
      for (let index = 0; index < 10; index++) {
        const current = claim(app);
        if (!current) break;
        result.attempted++;
        try {
          processJob(app, current, config);
        } catch (outcome) {
          try {
            reschedule(app, current, outcome);
          } catch (_) {
            app.logger().warn('Account deletion worker write failed.', 'reason', 'worker_write');
          }
        }
      }
    } finally {
      // Operational visibility is independent of the vendor's Retry-After.
      result.alerted = alertUnresolved(app);
    }
    return result;
  },
};
