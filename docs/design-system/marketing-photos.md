# Homepage photography

The homepage uses Sarah's supplied craft photos as real hobby examples. They are
not screenshots of Organized Glitter.

| Asset                               | Source                     | Placement                           |
| ----------------------------------- | -------------------------- | ----------------------------------- |
| `coloring-in-progress.webp`         | Supplied Image 1           | Below the Mystery pages description |
| `aladdin-coloring-in-progress.webp` | Supplied Image 4           | Hero, coloring book photo           |
| `diamond-art-finished.webp`         | Supplied Image 3           | Hero, completed diamond art photo   |
| `diamond-art-in-progress.webp`      | Replacement progress photo | Progress notes and photos feature   |

Assets live in `public/images/marketing/`. The original attachments remain
untouched. The web copies are 720px wide WebP images, encoded at quality 80 with
metadata removed. Layout cropping uses `object-fit: cover`; the progress photo
uses `object-position: center 80%` to show the transition from unfinished canvas
to placed drills. The mystery-page crop centers on the floral portrait at `center 35%`. Hero photos load immediately; feature photos load lazily.

The hero diamond art photo shows Sunset Harbor Haven by Chuck Pinson / Diamond
Art Club, as credited on the photographed canvas. Do not present the depicted artwork
as artwork created by Organized Glitter.

A small italic note in the About sidebar below the feedback link, under "Photos & attribution", states:

> Organized Glitter is an independent app that isn't affiliated or endorsed by any diamond painting or coloring companies. Pictures on the homepage were taken by me from my own collection. Product names, artworks, and likenesses belong to their respective owners.

The note is scoped to the photographed products. It does not replace affiliate
link disclosures on other pages. Keep the shipped homepage and
`docs/design-previews/home-prototype.html` aligned when photography changes.

The Aladdin photo has an additional source crop to remove the carpet: x=230,
y=124, width=1190, height=1740 on the original 1536x2048 image, before resizing
to 720px wide. The original attachment remains unchanged.

## Randomizer screenshot

The randomizer spotlight uses Sarah's supplied screenshot of the actual app,
`public/images/marketing/randomizer-screenshot.png`. It preserves the original
916 by 892 proportions and numbered wheel segments. A CSS ellipse clips the
screenshot's rectangular background just outside the wheel rim, so it fits both
themes without an added shadow.
