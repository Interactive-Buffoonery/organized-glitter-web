onRecordCreate(e => {
  const parseVerticalEnabled = function (raw) {
    if (raw === null || raw === undefined || raw === '' || raw === 'null') {
      return null;
    }

    if (Array.isArray(raw)) {
      let text = '';
      for (let i = 0; i < raw.length; i += 1) {
        text += String.fromCharCode(raw[i]);
      }
      return parseVerticalEnabled(text);
    }

    if (typeof raw === 'string') {
      try {
        return parseVerticalEnabled(JSON.parse(raw));
      } catch (_err) {
        return null;
      }
    }

    if (typeof raw !== 'object') {
      return null;
    }

    const diamond = raw.diamond_painting;
    const coloring = raw.coloring_books;
    const hasDiamondBoolean = diamond === true || diamond === false;
    const hasColoringBoolean = coloring === true || coloring === false;

    if (!hasDiamondBoolean && !hasColoringBoolean) {
      return null;
    }

    return {
      diamond_painting: diamond === true,
      coloring_books: coloring === true,
    };
  };

  const current = parseVerticalEnabled(e.record.get('vertical_enabled'));

  if (current === null) {
    e.record.set(
      'vertical_enabled',
      JSON.stringify({ diamond_painting: true, coloring_books: false })
    );
  } else if (current.diamond_painting !== true && current.coloring_books !== true) {
    throw new BadRequestError('At least one hobby vertical must be enabled.', {
      vertical_enabled: 'At least one of diamond_painting or coloring_books must be true.',
    });
  }

  e.next();
}, 'user_dashboard_settings');

onRecordUpdate(e => {
  const parseVerticalEnabled = function (raw) {
    if (raw === null || raw === undefined || raw === '' || raw === 'null') {
      return null;
    }

    if (Array.isArray(raw)) {
      let text = '';
      for (let i = 0; i < raw.length; i += 1) {
        text += String.fromCharCode(raw[i]);
      }
      return parseVerticalEnabled(text);
    }

    if (typeof raw === 'string') {
      try {
        return parseVerticalEnabled(JSON.parse(raw));
      } catch (_err) {
        return null;
      }
    }

    if (typeof raw !== 'object') {
      return null;
    }

    const diamond = raw.diamond_painting;
    const coloring = raw.coloring_books;
    const hasDiamondBoolean = diamond === true || diamond === false;
    const hasColoringBoolean = coloring === true || coloring === false;

    if (!hasDiamondBoolean && !hasColoringBoolean) {
      return null;
    }

    return {
      diamond_painting: diamond === true,
      coloring_books: coloring === true,
    };
  };

  const next = parseVerticalEnabled(e.record.get('vertical_enabled'));

  if (next !== null && next.diamond_painting !== true && next.coloring_books !== true) {
    throw new BadRequestError('At least one hobby vertical must be enabled.', {
      vertical_enabled: 'At least one of diamond_painting or coloring_books must be true.',
    });
  }

  e.next();
}, 'user_dashboard_settings');
