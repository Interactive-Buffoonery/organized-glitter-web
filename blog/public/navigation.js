(function () {
  var script = document.currentScript;
  if (!script || !script.dataset.entry) return;
  var loading = false;
  var loaded = false;

  function loadNavigation() {
    if (loading || loaded) return;
    try {
      var session = JSON.parse(window.localStorage.getItem('pocketbase_auth') || 'null');
      if (!session?.token || !(session.record || session.model)?.id) return;
    } catch {
      return;
    }
    loading = true;
    var styles = JSON.parse(script.dataset.styles || '[]').map(function (href) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.append(link);
      return link;
    });
    import(script.dataset.entry)
      .then(function () {
        loaded = true;
        loading = false;
      })
      .catch(function () {
        styles.forEach(function (link) {
          link.remove();
        });
        loading = false;
      });
  }

  loadNavigation();
  window.addEventListener('storage', function (event) {
    if (event.key === 'pocketbase_auth' || event.key === null) loadNavigation();
  });
})();
