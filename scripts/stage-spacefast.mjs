import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');

if (!existsSync(resolve(output, 'index.html'))) {
  throw new Error('Build the app before staging Spacefast files');
}

mkdirSync(resolve(output, 'spacefast'), { recursive: true });
for (const file of ['handler.js', 'posthog.js']) {
  cpSync(resolve(root, 'spacefast', file), resolve(output, 'spacefast', file));
}
mkdirSync(resolve(output, 'server'), { recursive: true });
for (const file of ['app-route-policy.js', 'deployment-config.js']) {
  cpSync(resolve(root, 'server', file), resolve(output, 'server', file));
}
const shell = readFileSync(resolve(output, 'index.html'), 'utf8');
const notFound = readFileSync(resolve(output, '404.html'), 'utf8');
const headerRules = readFileSync(resolve(output, '_headers'), 'utf8');
const securityHeaders = Object.fromEntries(
  headerRules
    .split('\n')
    .filter(line =>
      /^  (Content-Security-Policy|Permissions-Policy|X-Content-Type-Options|X-Frame-Options): /.test(
        line
      )
    )
    .map(line => {
      const separator = line.indexOf(':');
      return [line.slice(2, separator), line.slice(separator + 2)];
    })
);
for (const name of [
  'Content-Security-Policy',
  'Permissions-Policy',
  'X-Content-Type-Options',
  'X-Frame-Options',
]) {
  if (!securityHeaders[name]) throw new Error(`Missing ${name} in dist/_headers`);
}
writeFileSync(
  resolve(output, 'spacefast/app-pages.js'),
  `export const APP_SHELL_HTML = ${JSON.stringify(shell)};\nexport const NOT_FOUND_HTML = ${JSON.stringify(notFound)};\nexport const HTML_SECURITY_HEADERS = ${JSON.stringify(securityHeaders)};\n`
);
cpSync(resolve(root, 'spacefast/sf.jsonc'), resolve(output, 'sf.jsonc'));
