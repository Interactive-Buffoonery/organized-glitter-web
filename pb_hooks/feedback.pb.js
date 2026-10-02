/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/organized-glitter/feedback',
  e => {
    if (!e.auth.getBool('verified')) {
      throw new ForbiddenError('Email verification is required.');
    }

    const body = e.requestInfo().body;
    const allowedFields = ['feedback', 'email', 'type'];
    if (
      !body ||
      typeof body !== 'object' ||
      Object.keys(body).some(key => !allowedFields.includes(key))
    ) {
      return e.json(400, { error: 'Request body contains unsupported fields' });
    }

    if (typeof body.feedback !== 'string') {
      return e.json(400, { error: 'Feedback must be a string' });
    }
    const feedback = body.feedback.trim();
    if (feedback.length < 10 || feedback.length > 5000) {
      return e.json(400, { error: 'Feedback must be between 10 and 5000 characters' });
    }

    let replyEmail = '';
    if (body.email !== undefined) {
      if (typeof body.email !== 'string') {
        return e.json(400, { error: 'email must be a string' });
      }
      replyEmail = body.email.trim();
      if (
        replyEmail.length > 320 ||
        (replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail))
      ) {
        return e.json(400, { error: 'email must be a valid email address' });
      }
    }

    const type = body.type === undefined ? 'general' : body.type;
    if (!['general', 'bug', 'feature', 'improvement', 'other'].includes(type)) {
      return e.json(400, { error: 'type must be a supported feedback type' });
    }

    // Keep pruning and quota updates in one atomic store operation. Store a
    // string so the value can cross PocketBase's isolated JS runtimes. Like the
    // old Worker limit, this best-effort counter resets when the server restarts.
    const store = e.app.store();
    const key = 'organized_glitter_feedback_limits';
    const accountKey = `user:${e.auth.getString('id')}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    let retryAfter = 0;
    let busy = false;
    store.setFunc(key, old => {
      let windows = {};
      try {
        const parsed = typeof old === 'string' ? JSON.parse(old) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) windows = parsed;
      } catch {
        // A malformed in-memory value must not break feedback for every user.
      }
      for (const storedKey of Object.keys(windows)) {
        const entry = windows[storedKey];
        if (!entry || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now) {
          delete windows[storedKey];
        }
      }
      let window = windows[accountKey];
      if (!window) {
        if (Object.keys(windows).length >= 10000) {
          busy = true;
          return JSON.stringify(windows);
        }
        window = { count: 0, expiresAt: now + windowMs };
        windows[accountKey] = window;
      }
      if (window.count >= 5) {
        retryAfter = Math.max(1, Math.ceil((window.expiresAt - now) / 1000));
      } else {
        window.count += 1;
      }
      return JSON.stringify(windows);
    });
    if (busy) {
      return e.json(503, { error: 'Feedback is temporarily busy. Please try again shortly.' });
    }
    if (retryAfter) {
      return e.json(429, {
        error: 'Too many requests. Please try again later.',
        reason: 'rate_limited',
        retryAfter,
      });
    }

    const escapeHtml = value =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const accountEmail = e.auth.getString('email');
    const sender = e.app.settings().meta;
    const feedbackToEmail = String($os.getenv('FEEDBACK_TO_EMAIL') || '').trim();
    if (!feedbackToEmail) {
      e.app
        .logger()
        .error(
          'Feedback recipient not configured',
          'reason',
          'feedback_recipient_missing'
        );
      return e.json(503, { error: 'Feedback is not configured for this server.' });
    }
    const message = new MailerMessage({
      from: { address: sender.senderAddress, name: sender.senderName },
      to: [{ address: feedbackToEmail }],
      subject: `New ${type} Feedback - Organized Glitter`,
      html: `<!doctype html><html><body><h1>Organized Glitter feedback</h1>
        <p>Type: ${escapeHtml(type)}</p>
        <p>Reply email: ${escapeHtml(replyEmail || 'Not provided')}</p>
        <p>Account email: ${escapeHtml(accountEmail || 'Not provided')}</p>
        <p>User ID: ${escapeHtml(e.auth.getString('id'))}</p>
        <p>Submitted: ${escapeHtml(new Date().toISOString())}</p>
        <p style="white-space:pre-wrap">${escapeHtml(feedback)}</p></body></html>`,
    });

    try {
      e.app.newMailClient().send(message);
    } catch (error) {
      e.app
        .logger()
        .error(
          'Feedback delivery failed',
          'reason',
          'feedback_delivery_failed',
          'error_name',
          error?.name || 'unknown'
        );
      return e.json(503, { error: 'Unable to send feedback. Please try again later.' });
    }
    return e.json(200, { success: true, message: 'Feedback sent successfully' });
  },
  $apis.requireAuth('users'),
  $apis.bodyLimit(32768)
);
