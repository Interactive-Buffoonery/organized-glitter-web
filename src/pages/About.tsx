import { getSupportUrl, getSupportMailto } from '@/lib/contactConfig';
import { publicUrl } from '@/lib/publicUrl';
import { Mail } from 'lucide-react';

import MainLayout from '@/components/layout/MainLayout';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { publicPageSocialMetadata } from '@/lib/publicPageSocialMetadata';

const PAGE_METADATA = {
  title: 'About | Organized Glitter',
  description:
    "Organized Glitter is a craft tracker built from Sarah's love of diamond painting, mystery coloring books, and programming.",
  canonicalUrl: publicUrl('/about'),
  ...publicPageSocialMetadata(
    'About | Organized Glitter',
    "Organized Glitter is a craft tracker built from Sarah's love of diamond painting, mystery coloring books, and programming.",
    publicUrl('/about')
  ),
};

const About = () => {
  useAppReady();
  usePageMetadata(PAGE_METADATA);

  return (
    <MainLayout currentPage="About">
      <div className="relative z-10 px-4 pt-6 pb-16 md:pt-10 md:pb-24">
        <section className="px-4 py-12">
          <div className="container mx-auto max-w-5xl">
            <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[1.35fr_0.85fr]">
              <div>
                <h1 className="font-handwritten text-foreground mb-4 text-4xl leading-tight tracking-tight md:text-5xl">
                  About Sarah (&amp; Organized Glitter)
                </h1>
              </div>

              <figure className="flex justify-start gap-4 md:flex-col md:items-center md:justify-center">
                <div className="bg-primary/15 border-card size-24 overflow-hidden rounded-2xl border-[3px] shadow-md md:size-36">
                  <img
                    src="/images/chibi-wave.png"
                    alt="Chibi version of Sarah waving"
                    className="size-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <figcaption className="text-muted-foreground max-w-40 text-xs leading-relaxed md:text-center">
                  Chibi by{' '}
                  <a
                    href="https://www.youtube.com/@DPandDP"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link focus-visible:outline-primary underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    DP&amp;DP
                  </a>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="px-4 pb-24">
          <div className="container mx-auto max-w-5xl">
            <div className="grid grid-cols-1 gap-10 [@media(min-width:800px)]:grid-cols-[3fr_7fr] [@media(min-width:800px)]:items-start [@media(min-width:800px)]:gap-14">
              <aside
                className="border-border/60 space-y-4 border-t pt-6"
                aria-label="Feedback and attribution"
              >
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Have feedback, questions, or ideas for Organized Glitter? I would love to hear
                  from you.
                </p>

                <div className="space-y-2">
                  <a
                    href={getSupportUrl() || getSupportMailto() || '/profile?tab=support'}
                    className="text-foreground hover:text-link focus-visible:outline-primary flex min-h-11 items-center gap-3 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Mail className="text-primary size-4" aria-hidden="true" />
                    Send feedback
                  </a>
                </div>
                <section
                  className="border-border/60 border-t pt-6"
                  aria-labelledby="photos-attribution-heading"
                >
                  <h2
                    id="photos-attribution-heading"
                    className="text-foreground mb-3 text-sm font-semibold"
                  >
                    Photos &amp; attribution
                  </h2>
                  <p className="text-muted-foreground text-xs leading-relaxed italic">
                    Organized Glitter is an independent app that isn't affiliated or endorsed by any
                    diamond painting or coloring companies. Pictures on the homepage were taken by
                    me from my own collection. Product names, artworks, and likenesses belong to
                    their respective owners.
                  </p>
                </section>
              </aside>

              <div>
                <p className="text-foreground/90 text-base leading-relaxed md:text-lg">
                  When I started diamond painting, I quickly fell in love with the craft. Then I was
                  introduced to the Disney mystery coloring books and acrylic paint markers, and I
                  fell in love with coloring. I tried every tracker I could find for both crafts,
                  and none of them felt quite right for me.
                </p>
                <p className="text-foreground/90 mt-4 text-base leading-relaxed md:text-lg">
                  I also really enjoy tech and programming. I decided to build my own tracker, and
                  I&apos;ve learned a lot in the process! Organized Glitter is the result of me
                  combining tech with my love of crafts, and I&apos;m so excited to share it with
                  everyone else.
                </p>
                <p className="text-foreground/90 mt-4 text-base leading-relaxed md:text-lg">
                  Whether you&apos;re tracking your diamond painting works in progress, trying to
                  color through a specific coloring book, planning your next projects out, or
                  looking back on what you&apos;ve done so far this year - I hope Organized Glitter
                  makes your creative experience just a little easier and more fun.
                </p>

                <div className="mt-10 text-right">
                  <p className="font-handwritten text-primary inline-block text-2xl leading-tight">
                    thanks for being here,
                    <br />
                    sarah
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
};

export default About;
