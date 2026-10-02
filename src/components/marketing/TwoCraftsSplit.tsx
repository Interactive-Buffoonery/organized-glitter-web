export function TwoCraftsSplit() {
  return (
    <section className="relative z-10 px-4 pt-2 pb-10 md:pb-14" id="crafts">
      <div className="container mx-auto max-w-5xl">
        <article className="craft-sheet paper-shadow">
          <div className="craft-sheet__grid">
            <div className="craft-sheet__col">
              <div className="craft-head">
                <h2 className="tape-label tape--sage" style={{ transform: 'rotate(-2deg)' }}>
                  Diamond painting
                </h2>
              </div>
              <ul className="craft-list">
                <li>
                  <span className="tick" aria-hidden />
                  Drill shape (round / square), size &amp; count
                </li>
                <li>
                  <span className="tick" aria-hidden />
                  Kit dimensions, canvas type, full vs mini
                </li>
                <li>
                  <span className="tick" aria-hidden />
                  Artist, company, &amp; links to where you purchased
                </li>
              </ul>
            </div>

            <div className="craft-sheet__col">
              <div className="craft-head">
                <h2 className="tape-label tape--butter" style={{ transform: 'rotate(1.5deg)' }}>
                  Coloring books
                </h2>
              </div>
              <ul className="craft-list">
                <li>
                  <span className="tick" aria-hidden />
                  Book title, publisher, artist
                </li>
                <li>
                  <span className="tick" aria-hidden />
                  Track your coloring tools / mediums, too
                </li>
                <li>
                  <span className="tick" aria-hidden />
                  Mystery pages? Track the before &amp; afters
                </li>
              </ul>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
