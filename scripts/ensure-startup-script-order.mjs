/**
 * Keep the pre-React splash/recovery scripts ahead of Vite's type=module
 * bundles. Production builds inject `/assets/*.js` into <head>, while source
 * `index.html` keeps `/js/loading.js` at the end of <body>. That reversal lets
 * React mark ready and fire `app-loaded` before loading.js has listeners.
 */

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

const listScripts = html =>
  [...html.matchAll(SCRIPT_TAG)].map(match => ({
    text: match[0],
    index: match.index ?? 0,
  }));

const isStartupShellScript = text =>
  /src=["'][^"']*\/js\/(?:bootstrap-analytics|loading)\.js(?:\?[^"']*)?["']/.test(text);

const isExecutableModuleScript = text =>
  /type=["']module["']/.test(text) && /src=["'][^"']+["']/.test(text);

export const startupShellScriptsRunBeforeAppModules = html => {
  const scripts = listScripts(html);
  const startup = scripts.filter(script => isStartupShellScript(script.text));
  const firstModule = scripts.find(script => isExecutableModuleScript(script.text));
  if (startup.length === 0 || !firstModule) return false;
  return startup.every(script => script.index < firstModule.index);
};

const trailingMarkupNewline = html => {
  const match = html.match(/^[ \t]*\r?\n/);
  return match ? match[0].length : 0;
};

export const ensureStartupScriptsBeforeAppModules = html => {
  const scripts = listScripts(html);
  const startup = scripts.filter(script => isStartupShellScript(script.text));
  const firstModule = scripts.find(script => isExecutableModuleScript(script.text));
  if (startup.length === 0 || !firstModule) return html;
  if (startup.every(script => script.index < firstModule.index)) return html;

  const startupTexts = startup.map(script => script.text);
  const removeRanges = startup
    .map(script => {
      const end = script.index + script.text.length;
      return { start: script.index, end: end + trailingMarkupNewline(html.slice(end)) };
    })
    .sort((left, right) => right.start - left.start);

  let result = html;
  for (const range of removeRanges) {
    result = result.slice(0, range.start) + result.slice(range.end);
  }

  const insertBefore = listScripts(result).find(script => isExecutableModuleScript(script.text));
  if (!insertBefore) return html;

  const lineStart = result.lastIndexOf('\n', insertBefore.index - 1) + 1;
  const indentMatch = result.slice(lineStart, insertBefore.index).match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const insertion = `${startupTexts.map(text => `${indent}${text}`).join('\n')}\n`;

  return result.slice(0, insertBefore.index) + insertion + result.slice(insertBefore.index);
};
