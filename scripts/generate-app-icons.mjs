import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Preserve the approved tile's corner shape at every output size.
const CORNER_RADIUS_RATIO = 0.225;
// A 10% inset scales the artwork to 80%, keeping it inside the maskable safe circle.
const MASKABLE_INSET_RATIO = 0.1;
// Specific to this supplied PNG's gray fringe; revisit when replacing the master.
const SOURCE_EDGE_TRIM_PX = 7;
const TILE_BACKGROUND = '#05051A';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('docs/icons/app-icon-source.png', root));
const exports = [
  { path: 'docs/icons/app-icon-1024.png', size: 1024, rounded: false },
  { path: 'public/images/logo.png', size: 512 },
  { path: 'public/android-chrome-192x192.png', size: 192 },
  { path: 'public/android-chrome-512x512.png', size: 512 },
  { path: 'public/android-maskable-512x512.png', size: 512, rounded: false, maskable: true },
  { path: 'public/apple-touch-icon.png', size: 180, rounded: false },
  { path: 'public/favicon-32x32.png', size: 32 },
  { path: 'public/favicon-16x16.png', size: 16 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(
    '<style>body { margin: 0; } canvas { display: block; }</style><canvas></canvas>'
  );

  for (const { path, size, rounded = true, maskable = false } of exports) {
    await page.setViewportSize({ width: size, height: size });
    await page.locator('canvas').evaluate(
      async (canvas, options) => {
        const image = new Image();
        image.src = `data:image/png;base64,${options.source}`;
        await image.decode();
        canvas.width = options.size;
        canvas.height = options.size;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        if (options.rounded) {
          context.beginPath();
          context.roundRect(
            0,
            0,
            options.size,
            options.size,
            options.size * options.cornerRadiusRatio
          );
          context.clip();
        }
        context.fillStyle = options.background;
        context.fillRect(0, 0, options.size, options.size);
        const inset = options.maskable ? options.size * options.maskableInsetRatio : 0;
        const trim = options.sourceEdgeTrimPx;
        context.drawImage(
          image,
          trim,
          trim,
          image.width - trim * 2,
          image.height - trim * 2,
          inset,
          inset,
          options.size - inset * 2,
          options.size - inset * 2
        );
      },
      {
        size,
        rounded,
        maskable,
        cornerRadiusRatio: CORNER_RADIUS_RATIO,
        maskableInsetRatio: MASKABLE_INSET_RATIO,
        sourceEdgeTrimPx: SOURCE_EDGE_TRIM_PX,
        background: TILE_BACKGROUND,
        source: source.toString('base64'),
      }
    );
    const output = new URL(path, root);
    await mkdir(new URL('.', output), { recursive: true });
    await page.locator('canvas').screenshot({ path: fileURLToPath(output), omitBackground: true });
    console.info(`Exported ${path} (${size}x${size})`);
  }
} finally {
  await browser.close();
}

// ICO supports PNG entries, so the favicon keeps the exact 16px and 32px renders.
const sizes = [16, 32];
const images = await Promise.all(
  sizes.map(size => readFile(new URL(`public/favicon-${size}x${size}.png`, root)))
);
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL('public/favicon.ico', root), Buffer.concat([header, ...images]));
console.info('Exported public/favicon.ico (16px and 32px)');

for (const [source, destination] of [
  ['public/apple-touch-icon.png', 'public/site-touch-icon.png'],
  ['public/favicon-32x32.png', 'public/site-icon-32x32.png'],
  ['public/favicon-16x16.png', 'public/site-icon-16x16.png'],
  ['public/favicon.ico', 'public/site-icon.ico'],
]) {
  await copyFile(new URL(source, root), new URL(destination, root));
  console.info(`Copied ${source} to ${destination}`);
}
