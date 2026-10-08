(function () {
  function hasCurrentSession() {
    try {
      var session = JSON.parse(window.localStorage.getItem('pocketbase_auth') || 'null');
      var record = session && (session.record || session.model);
      if (!session || !session.token || !record || !record.id) return false;

      var parts = session.token.split('.');
      if (parts.length !== 3) return false;
      var encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      var padding = encoded.length % 4;
      if (padding) encoded += '='.repeat(4 - padding);
      var payload = JSON.parse(window.atob(encoded));
      return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  function updateActions() {
    var isMember = hasCurrentSession();
    document.querySelectorAll('[data-static-auth="guest"]').forEach(function (actions) {
      actions.hidden = isMember;
    });
    document.querySelectorAll('[data-static-auth="member"]').forEach(function (actions) {
      actions.hidden = !isMember;
    });
  }

  updateActions();
  window.addEventListener('pageshow', updateActions);
  window.addEventListener('storage', function (event) {
    if (event.key === 'pocketbase_auth' || event.key === null) updateActions();
  });
})();
