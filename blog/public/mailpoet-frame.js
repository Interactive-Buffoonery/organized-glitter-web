(function () {
  var iframe = document.getElementById('mailpoet-subscribe');
  if (!iframe) return;

  var expectedOrigin = new URL(iframe.src).origin;
  window.addEventListener('message', function (event) {
    if (event.origin !== expectedOrigin || event.source !== iframe.contentWindow) return;
    var value = event.data && event.data.MailPoetIframeHeight;
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?px$/.test(value)) return;
    var height = Number.parseFloat(value);
    if (!Number.isFinite(height) || height < 120 || height > 1600) return;
    iframe.style.height = Math.ceil(height) + 16 + 'px';
  });
})();
