import { TAG_COLOR_PALETTE } from '@/utils/ui/tagColors';

const TAG_EXAMPLES = [
  { label: '#drillsandchills', color: 'Orange' },
  { label: '#chrissabug', color: 'Purple' },
  { label: '#26-for-26', color: 'Teal' },
  { label: '#gardens', color: 'Green' },
  { label: '#pastels', color: 'Pink' },
] as const;

function ScribbleUnderline() {
  return (
    <svg className="feat-underline" viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden>
      <path
        d="M2 8 C 40 2, 90 12, 150 5 S 260 10, 298 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ScrapbookFeatures() {
  return (
    <section className="relative z-10 px-4 py-8 pb-14 md:pb-16" id="features">
      <div className="container mx-auto max-w-5xl">
        <article className="features-sheet paper-shadow">
          <div className="feature-spotlight">
            <div>
              <h2 className="feat-title-hand">
                Can't decide what to work on?
                <ScribbleUnderline />
              </h2>
              <p className="feat-body">
                Use the <strong>randomizer wheel</strong>! It knows what kits or coloring books are
                currently being worked on and lets you randomly choose what to work on today.
              </p>
            </div>
            <div>
              <img
                src="/images/marketing/randomizer-screenshot.png"
                alt="Screenshot of the Organized Glitter randomizer with colorful numbered wheel segments"
                width={916}
                height={892}
                className="wheel-preview"
                loading="lazy"
              />
            </div>
          </div>

          <div className="feature-grid">
            <figure className="feature-item feature-photo">
              <div className="feature-photo__frame">
                <img
                  src="/images/marketing/diamond-art-in-progress.webp"
                  alt="A diamond painting in progress, with placed drills, unfinished canvas, and decorative washi tape"
                  width={720}
                  height={960}
                  className="feature-photo__image"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className="feature-photo__caption">
                Progress notes &amp; photos
              </figcaption>
              <p className="feat-body">
                Save photos of your WIPs, add notes, and look back at your notes over time.
              </p>
            </figure>

            <section className="feature-item">
              <h3 className="feat-title-hand">Mystery pages</h3>
              <p className="feat-body">
                Track your coloring book pages, including your in-progress photos. Additionally, if
                you're into mystery coloring books, you can track what each mystery page reveals
                when you're done.
              </p>
              <div className="feature-photo__frame mt-4">
                <img
                  src="/images/marketing/coloring-in-progress.webp"
                  alt="A partially colored portrait with flowers emerging from a mystery coloring page"
                  width={720}
                  height={960}
                  className="feature-photo__image feature-photo__image--mystery"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </section>

            <section className="feature-item">
              <h3 className="feat-title-hand">Organize with tags</h3>
              <ul className="tag-strip">
                {TAG_EXAMPLES.map(tag => (
                  <li
                    key={tag.label}
                    className="tag-chip"
                    style={{
                      backgroundColor: `${TAG_COLOR_PALETTE.find(color => color.name === tag.color)?.hex ?? '#3B82F6'}33`,
                    }}
                  >
                    {tag.label}
                  </li>
                ))}
              </ul>
              <p className="feat-body">
                Organize your projects via tags. This is a great way to track kits by event, theme,
                and anything else you might want to sort by quickly in the future.
              </p>
            </section>
          </div>
        </article>
      </div>
    </section>
  );
}
