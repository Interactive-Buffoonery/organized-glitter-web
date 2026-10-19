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

function claim(app) {
  let claimed = null;
  app.runInTransaction(tx => {
    const now = date(Date.now());
    const jobs = tx.findRecordsByFilter(
      'account_deletion_jobs',
      'posthog_status != "completed" && (next_attempt = "" || next_attempt <= {:now}) && (lease_until = "" || lease_until <= {:now})',
      'next_attempt,created,id',
      1,
      0,
      { now }
    );
    if (!jobs.length) return;
    const job = jobs[0];
    job.set('lease_token', $security.randomString(32));
    job.set('lease_until', date(Date.now() + leaseDuration));
    job.set('attempts', job.getInt('attempts') + 1);
    tx.save(job);
    claimed = { id: job.id, token: job.getString('lease_token'), job };
  });
  return claimed;
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
    mutate(job);
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
  // List/batch hydration may cap distinct IDs. The retrieve endpoint returns
  // the authoritative full set; never persist a truncated identity manifest.
  const person = request(config, 'GET', `${encodeURIComponent(uuid)}/`).json;
  if (!person || (person.uuid || person.id) !== uuid) throw failure('identity_ambiguous', true);
  if (
    typeof uuid !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(uuid) ||
    !Array.isArray(person.distinct_ids) ||
    !person.distinct_ids.includes(job.getString('user_id')) ||
    person.distinct_ids.some(id => typeof id !== 'string' || !id) ||
    JSON.stringify(person.distinct_ids).length > 200000
  )
    throw failure('identity_ambiguous', true);
  return {
    host: config.host,
    projectId: config.projectId,
    personId: uuid,
    distinctIds: person.distinct_ids,
  };
}

function processJob(app, claim, config) {
  if (!config) throw failure('configuration', true);
  let target = JSON.parse(claim.job.getString('posthog_target') || 'null');
  if (target && target.personId) {
    if (target.host !== config.host || target.projectId !== config.projectId) {
      throw failure('target_configuration', true);
    }
    const entries = results(
      request(
        config,
        'GET',
        `deletion_status/?person_uuid=${encodeURIComponent(target.personId)}&status=all`
      )
    );
    if (entries.some(entry => entry.person_uuid !== target.personId))
      throw failure('vendor_shape', true);
    const requested = Date.parse(claim.job.getString('posthog_requested_at'));
    if (entries.length) {
      const verified = entries.every(
        entry =>
          entry.status === 'completed' &&
          Number.isFinite(Date.parse(entry.delete_verified_at)) &&
          Date.parse(entry.delete_verified_at) >= requested &&
          Number.isFinite(Date.parse(entry.created_at)) &&
          Date.parse(entry.created_at) >= requested
      );
      if (verified) {
        updateClaim(app, claim, job => {
          job.set('posthog_status', 'completed');
          job.set(
            'posthog_verified_at',
            date(Math.max(...entries.map(entry => Date.parse(entry.delete_verified_at))))
          );
          job.set('posthog_target', null);
          job.set('last_error', '');
          job.set('next_attempt', '');
          job.set('lease_token', '');
          job.set('lease_until', '');
        });
        return;
      }
      throw failure('verification_pending');
    }
    // An empty status response after a crash is inconclusive. Retry the same
    // durable target, never discover a replacement person or claim completion.
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
  if (!updateClaim(app, claim, job => job.set('lease_until', date(Date.now() + leaseDuration))))
    return;
  request(
    config,
    'DELETE',
    `${encodeURIComponent(target.personId)}/?delete_events=true&delete_recordings=true`
  );
  throw failure('verification_pending');
}

function reschedule(app, claim, outcome) {
  let alert = false;
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
    job.set('lease_token', '');
    job.set('lease_until', '');
    const overdue = Date.parse(job.getString('created')) <= Date.now() - 14 * day;
    if (
      (outcome?.blocked || overdue) &&
      (!job.getString('alerted_at') || Date.parse(job.getString('alerted_at')) <= Date.now() - day)
    ) {
      job.set('alerted_at', date(Date.now()));
      alert = true;
    }
  });
  if (alert)
    app.logger().warn('Account deletion cleanup unresolved.', 'reason', reason, 'job', claim.id);
}

module.exports = {
  processPending(app, config = configFromEnvironment()) {
    const result = { attempted: 0 };
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
    return result;
  },
};
