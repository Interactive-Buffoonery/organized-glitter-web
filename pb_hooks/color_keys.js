function validateKey(record) {
  let tried;
  try {
    tried = JSON.parse(record.getString('tried'));
  } catch {
    throw new BadRequestError('Tried codes must be an array of strings.');
  }
  if (
    !Array.isArray(tried) ||
    tried.length > 20 ||
    tried.some(value => typeof value !== 'string' || Array.from(value).length > 100)
  ) {
    throw new BadRequestError(
      'Tried codes must contain at most 20 strings of at most 100 characters.'
    );
  }
  const swatch = record.getString('swatch');
  if (swatch && !/^#[0-9a-fA-F]{6}$/.test(swatch)) {
    throw new BadRequestError('Swatch must be empty or #RRGGBB.');
  }
}

function prepareKeyCreate(body) {
  if (typeof body.position !== 'number' || !Number.isInteger(body.position) || body.position < 0) {
    throw new BadRequestError('Position must be a non-negative integer.');
  }
  return Object.prototype.hasOwnProperty.call(body, 'tried') ? body.tried : [];
}

function rateLimit(app, user) {
  let limited = false;
  let busy = false;
  const now = Date.now();
  app.store().setFunc('organized_glitter_symbol_request_limits', old => {
    let windows = {};
    try {
      const parsed = typeof old === 'string' ? JSON.parse(old) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) windows = parsed;
    } catch {
      /* Reset a corrupt transient counter. */
    }
    for (const key of Object.keys(windows)) {
      if (!windows[key] || windows[key].expiresAt <= now) delete windows[key];
    }
    const key = `user:${user}`;
    if (!windows[key]) {
      if (Object.keys(windows).length >= 10000) {
        busy = true;
        return JSON.stringify(windows);
      }
      windows[key] = { count: 0, expiresAt: now + 15 * 60 * 1000 };
    }
    if (windows[key].count >= 5) limited = true;
    else windows[key].count++;
    return JSON.stringify(windows);
  });
  if (busy) throw new ApiError(503, 'Symbol requests are temporarily busy.');
  if (limited) throw new ApiError(429, 'Too many symbol requests. Please try again later.');
}

function validateResolution(record) {
  if (!['added', 'matched'].includes(record.getString('status'))) return false;
  const symbol = record.getString('resolved_symbol');
  if (
    symbol.length > 64 ||
    !/^(u:[0-9A-F]{4,6}(-[0-9A-F]{4,6})*|c:[a-z0-9-]{1,48})$/.test(symbol)
  ) {
    throw new BadRequestError('Resolution requires a valid Unicode or custom symbol ID.');
  }
  return true;
}

function resolveRequest(e) {
  const resolving = validateResolution(e.record);
  const originalApp = e.app;
  originalApp.runInTransaction(app => {
    e.app = app;
    try {
      const before = app.findRecordById('coloring_symbol_requests', e.record.id);
      const changed =
        resolving &&
        (before.getString('status') !== e.record.getString('status') ||
          before.getString('resolved_symbol') !== e.record.getString('resolved_symbol'));
      if (resolving) {
        // Fetch from offset zero after each batch because saved rows no longer match.
        for (;;) {
          const rows = app.findRecordsByFilter(
            'coloring_page_color_keys',
            'user = {:user} && symbol = {:symbol}',
            'id',
            200,
            0,
            {
              user: e.record.getString('user'),
              symbol: `r:${e.record.id}`,
            }
          );
          if (!rows.length) break;
          for (const row of rows) {
            row.set('symbol', e.record.getString('resolved_symbol'));
            app.save(row);
          }
        }
      }
      e.record.set('_colorKeyResolutionNotify', changed);
      e.next();
    } finally {
      e.app = originalApp;
    }
  });
}

function notify(app, record, resolved) {
  const recipient = resolved
    ? record.getString('email')
    : String($os.getenv('FEEDBACK_TO_EMAIL') || '').trim();
  if (!recipient) {
    app
      .logger()
      .error(
        'Symbol request recipient not configured',
        'reason',
        'symbol_request_recipient_missing'
      );
    return;
  }
  try {
    const sender = app.settings().meta;
    const text = resolved
      ? `Your symbol request ${record.id} was resolved as ${record.getString('resolved_symbol')}. Your color keys have been updated.`
      : `Symbol request: ${record.id}\nRequester email: ${record.getString('email')}\nBook: ${record.getString('book_label')}\nDescription: ${record.getString('description')}\nPage: ${record.getString('page')}`;
    app.newMailClient().send(
      new MailerMessage({
        from: { address: sender.senderAddress, name: sender.senderName },
        to: [{ address: recipient }],
        subject: resolved
          ? 'Your coloring symbol request is resolved'
          : 'New coloring symbol request',
        text,
      })
    );
  } catch {
    app
      .logger()
      .error('Symbol request delivery failed', 'reason', 'symbol_request_delivery_failed');
  }
}

module.exports = {
  validateKey,
  prepareKeyCreate,
  rateLimit,
  validateResolution,
  resolveRequest,
  notify,
};
