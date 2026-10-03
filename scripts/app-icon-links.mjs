export const APP_ICON_VERSION = 'sorted-painted-3';

const appIconLinks = `
<link rel="icon" href="/site-icon.ico?v=${APP_ICON_VERSION}" />
<link rel="icon" type="image/png" sizes="32x32" href="/site-icon-32x32.png?v=${APP_ICON_VERSION}" />
<link rel="icon" type="image/png" sizes="16x16" href="/site-icon-16x16.png?v=${APP_ICON_VERSION}" />
<link rel="apple-touch-icon" href="/site-touch-icon.png?v=${APP_ICON_VERSION}" />
`.trim();

export function injectAppIconLinks(html) {
  return html.replace('<!-- og-app-icons -->', appIconLinks);
}
