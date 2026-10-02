import { readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';

const root = new URL('../', import.meta.url);
const content = JSON.parse(await readFile(new URL('src/content/not-found.json', root), 'utf8'));
const template = await readFile(new URL('scripts/templates/404.html', root), 'utf8');
const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, character => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
const output = new URL('public/404.html', root);
const options = await resolveConfig(output.pathname);
const html = await format(
  template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const value = key.split('.').reduce((entry, part) => entry?.[part], content);
    if (typeof value !== 'string') throw new Error(`Unknown recovery content key: ${key}`);
    return escapeHtml(value);
  }),
  { ...options, parser: 'html' }
);
if (process.argv.includes('--check')) {
  if ((await readFile(output, 'utf8')) !== html) {
    throw new Error('Run node scripts/generate-not-found.mjs to update public/404.html');
  }
} else {
  await writeFile(output, html);
}
