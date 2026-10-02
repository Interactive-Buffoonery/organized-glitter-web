import type { CSSProperties } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { FavouriteIcon, Tick01Icon } from '@hugeicons/core-free-icons';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

function customProperties(values: Record<string, string>): CSSProperties {
  return values as CSSProperties;
}

export function HomeHero() {
  return (
    <section className="relative z-10 px-5 pt-14 pb-12 md:px-8 md:pt-20 md:pb-16">
      <div className="container mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-12 [@media(min-width:900px)]:grid-cols-[1.02fr_0.98fr] [@media(min-width:900px)]:gap-14">
          <div className="hero-copy max-w-xl">
            <h1 className="font-handwritten text-foreground mb-4 text-4xl leading-[1.03] font-semibold tracking-tight sm:text-5xl md:text-6xl">
              Organize your coloring books and diamond art
            </h1>

            <p className="text-muted-foreground mb-7 max-w-lg text-base leading-relaxed md:text-lg">
              Organized Glitter is designed to allow you to track your coloring books and pages, and
              your diamond art projects, all in the same web app!
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="shimmer h-11 text-base md:h-10">
                <Link to="/register">Start tracking - it's free</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-foreground h-11 text-base md:h-10"
              >
                <a href="#features">See what it does</a>
              </Button>
            </div>

            <ul className="text-muted-foreground mt-7 flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-2">
                <HugeiconsIcon icon={FavouriteIcon} className="text-primary size-4" aria-hidden />
                100% free, made by a fellow crafter
              </li>
              <li className="flex items-center gap-2">
                <HugeiconsIcon icon={Tick01Icon} className="text-primary size-4" aria-hidden />
                Your data is exportable anytime
              </li>
            </ul>
          </div>

          <div className="hero-photo-wrap">
            <figure className="hero-photo paper-shadow">
              <span
                className="tape tape--peach hero-photo__tape hero-photo__tape--tl"
                aria-hidden
                style={customProperties({ '--tape-rot': '-7deg' })}
              />
              <span
                className="tape tape--sky hero-photo__tape hero-photo__tape--tr"
                aria-hidden
                style={customProperties({ '--tape-rot': '5deg' })}
              />
              <div className="hero-photo__frame">
                <img
                  src="/images/marketing/aladdin-coloring-in-progress.webp"
                  alt="An Aladdin coloring page in progress, with purple and blue areas filled in"
                  width={720}
                  height={1053}
                  className="hero-photo__image"
                  fetchPriority="high"
                />
                <img
                  src="/images/marketing/diamond-art-finished.webp"
                  alt="A completed diamond painting of a colorful harbor at sunset"
                  width={720}
                  height={960}
                  className="hero-photo__image"
                />
              </div>
              <figcaption className="hero-photo__caption">
                track your coloring and diamond art together
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
