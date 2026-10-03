import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = fileURLToPath(new URL('./fixtures/example-library/', import.meta.url));
export const exampleLibrary = JSON.parse(
  readFileSync(path.join(fixtureDirectory, 'library.json'), 'utf8')
);

export function assertLocalExampleTarget(url) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  )
    throw new Error('Example library seeding requires a loopback PocketBase URL.');
}

export async function seedExampleLibrary(client, userId) {
  assertLocalExampleTarget(client.baseURL);
  const upsert = async (collection, id, values) => {
    let existing;
    try {
      existing = await client.collection(collection).getOne(id);
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    if (existing?.user && existing.user !== userId) {
      throw new Error('Example fixture ID belongs to another local user.');
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (value instanceof Blob) form.set(key, value, `${key}.jpg`);
      else form.set(key, String(value));
    }
    if (existing) return client.collection(collection).update(id, form);
    form.set('id', id);
    return client.collection(collection).create(form);
  };
  const image = filename =>
    new Blob([readFileSync(path.join(fixtureDirectory, filename))], { type: 'image/jpeg' });
  for (const [index, project] of exampleLibrary.projects.entries()) {
    await upsert('projects', `exampleproj000${index + 1}`, {
      user: userId,
      title: project.title,
      status: project.status,
      kit_category: 'full',
      drill_shape: index < 4 ? 'square' : 'round',
      width: 40,
      height: 50,
      source_url: project.source_url,
      general_notes: `<p>Example test project. Photo: ${project.credit}. License: https://unsplash.com/license</p>`,
      image: image(project.image),
    });
  }
  for (const [index, book] of exampleLibrary.books.entries()) {
    const record = await upsert('coloring_books', `examplebook000${index + 1}`, {
      user: userId,
      title: book.title,
      status: book.status,
      total_pages: book.total_pages,
      source_url: book.source_url,
      notes: `Example test book. Credit: ${book.credit}. See docs/test-data/example-image-sources.md for original source and use terms.`,
      cover_image: image(book.cover),
    });
    if (index === 0) {
      const pages = await client.collection('coloring_pages').getFullList({
        filter: client.filter('book = {:book}', { book: record.id }),
        sort: 'page_number',
      });
      if (pages.length !== 11) throw new Error('Expected all eleven Smithsonian pages.');
      for (const page of pages) {
        const form = new FormData();
        form.set(
          'photos',
          image(`design-page-${page.page_number}.jpg`),
          `page-${page.page_number}.jpg`
        );
        form.set(
          'status',
          page.page_number === 1
            ? 'in_progress'
            : page.page_number === 2
              ? 'completed'
              : 'not_started'
        );
        await client.collection('coloring_pages').update(page.id, form);
      }
    }
  }
  return { projects: exampleLibrary.projects.length, books: exampleLibrary.books.length };
}
