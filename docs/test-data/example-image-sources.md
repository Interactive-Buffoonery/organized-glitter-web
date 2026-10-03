# Example image and coloring book sources

This catalog records the original sources used for the hosted test account's
sample projects added on October 3, 2026. All listed images are photographs or
original published illustrations, with no AI-generated artwork. This is a source
catalog, not an account export or an automated seed fixture.

## Diamond painting sample covers

These sample projects use real photographs from Unsplash. Project dimensions,
color counts, dates, and statuses are example test data, not actual kit specifications.
Each project stores its photo source in `source_url` and its photographer credit
and license link in `general_notes`.

| Sample project          | Photographer  | Original photograph                                                                                          |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| Summer Garden Blooms    | Annie Spratt  | [Flowers by a fence](https://unsplash.com/photos/a-bunch-of-flowers-that-are-by-a-fence-MRjuroFzfQw)         |
| Misty Mount Rainier     | Dave Hoefler  | [Mountain](https://unsplash.com/photos/mountain-UHFQPFt5-WA)                                                 |
| Monarch in the Garden   | Aaron Burden  | [Butterfly on a green leaf](https://unsplash.com/photos/butterfly-on-green-leaf-XR3uGa4gXgE)                 |
| Golden-Eyed Tabby       | Borna Bevanda | [Tabby cat](https://unsplash.com/photos/black-tabby-cat-in-focus-photography-6CwBxiekWcw)                    |
| Mirror Lake Reflections | Hayden Walker | [Mountain reflecting on water](https://unsplash.com/photos/mountain-reflecting-on-body-of-water-0SzZ5ttDrdE) |
| San Diego Sunset        | Braden Jarvis | [Sunset on the ocean](https://unsplash.com/photos/sunset-on-ocean-ih5Kq0XowwY)                               |

The photographs are free to download and use under the
[Unsplash License](https://unsplash.com/license), including commercial use.
That license is separate from this repository's AGPL license. It does not permit
selling unmodified images or compiling images into a competing service.

The uploaded JPEGs come from each photo's original `images.unsplash.com` image,
resized to a maximum width of 1600 pixels at JPEG quality 85. No watermark,
generative edit, or replacement artwork was added.

## Coloring books

These are actual freely downloadable coloring publications. Each sample book
stores the source page in `source_url` and the download URL, credit, use terms,
and PDF page mapping in `notes`. Page galleries contain the original uncolored
artwork. Book and page statuses are example test data.

PDF page numbers below are one-based. Every cover uses PDF page 1. App coloring
pages map sequentially to the listed PDF pages; covers, explanatory text, and
back matter are excluded unless the page itself is a coloring sheet.

| Book                                            | Credit                                                                          | Coloring pages | PDF pages used for app pages   | Source and download                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Smithsonian Libraries Coloring Pages, Volume 2  | Smithsonian Libraries; original artists and publications credited on each sheet | 11             | 2-12                           | [Source](https://library.si.edu/event/coloring-pages-v-2), [PDF](https://library.si.edu/sites/default/files/Smithsonian%20Libraries%20Coloring%20Pages%20v2.pdf)                                                                                                                                                         |
| Exoplanet Travel Bureau Coloring Book           | NASA/JPL-Caltech                                                                | 6              | 1-6                            | [Source](https://science.nasa.gov/resource/exoplanet-travel-bureau-coloring-book/), [PDF](https://assets.science.nasa.gov/content/dam/science/astro/exo-explore/2023/09/Exoplanet_Travel_Bureau_Coloring_Book.pdf)                                                                                                       |
| Our Very Own Star: The Sun                      | NASA/Goddard Space Flight Center; design and illustrations by Daniel Vong       | 9              | 2, 4, 6, 8, 10, 12, 14, 16, 18 | [Source](https://science.nasa.gov/learn/heat/resource/our-very-own-star-the-sun-coloring-book/), [PDF](https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/o/Our_Very_Own_Star_English.pdf)                                                                                                            |
| NASA's Field Guide to Black Holes Coloring Book | NASA                                                                            | 3              | 1-3                            | [Source](https://science.nasa.gov/universe/fun-exploring-the-universe/universe-coloring-pages/nasas-field-guide-to-black-holes-coloring-pages/), [PDF](https://assets.science.nasa.gov/content/dam/science/astro/universe/coloring-pages/black-hole-field-guide-coloring-pages/NASABlackHoleFieldGuide_ColoringBook.pdf) |

Smithsonian provides Volume 2 as a free coloring booklet. Its sheets identify
historical source publications dated 1496-1914. See the
[Smithsonian Libraries digital book usage guidance](https://library.si.edu/books-online)
for public-domain reuse and any item-specific exceptions. Keep the original
credits on the sheets; this catalog does not assign a new license to the booklet
cover or Smithsonian marks.

NASA provides these books for free coloring and educational use. Its
[images and media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
permit educational and informational reuse of NASA content with acknowledgment.
NASA logos and identifiers have separate protections, and third-party copyrighted
content requires separate permission. The samples identify the original books
and preserve their credits; they do not imply NASA endorsement or grant rights
to use its marks in product branding or merchandise.

## Reproduce the coloring images

Download the original PDFs from the links above, then render with Poppler:

```bash
pdftoppm -scale-to 1400 -jpeg -jpegopt quality=88 source.pdf rendered-page
```

Use the page mappings above for `coloring_pages.photos` and PDF page 1 for
`coloring_books.cover_image`. Rendering preserves the original artwork and
credits without generative processing.

Store credentials, account records, and downloaded working files outside the
repository. Source links and credits belong here; account backups do not.
