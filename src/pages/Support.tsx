import { usePostHog } from '@posthog/react';
import { CornerLeftDown, Mail, Star, Users } from 'lucide-react';

import MainLayout from '@/components/layout/MainLayout';
import { Section, SectionHeading } from '@/components/shared/Section';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { getTipLinks } from '@/constants/tips';
import { useAppReady } from '@/hooks/useAppReady';
import { getSupportMailto, getSupportUrl } from '@/lib/contactConfig';
import { AnalyticsEvent } from '@/services/analytics-events';

// Each link leaves the page, so the event goes out by beacon instead of the batch queue.
const BEACON = { send_instantly: true, transport: 'sendBeacon' } as const;

const Support = () => {
  useAppReady();
  const posthog = usePostHog();
  const { fixed, custom } = getTipLinks();
  const hasTips = fixed.length > 0 || custom !== null;
  const feedbackHref = getSupportUrl() || getSupportMailto() || '/profile?tab=support';
  const appStoreUrl = import.meta.env.VITE_APP_STORE_URL?.trim();
  const trackTip = (amount: number | 'custom') =>
    posthog?.capture(AnalyticsEvent.TIP_LINK_CLICKED, { amount }, BEACON);
  const trackAlternative = (action: 'feedback' | 'app_store_review') =>
    posthog?.capture(AnalyticsEvent.SUPPORT_ALTERNATIVE_CLICKED, { action }, BEACON);

  return (
    <MainLayout currentPage="Support">
      <div className="container mx-auto max-w-2xl space-y-8 px-4 py-8 md:py-12">
        <header className="space-y-3">
          <h1 className="font-handwritten text-foreground text-4xl leading-tight tracking-tight md:text-5xl">
            Support Organized Glitter
          </h1>
          <p className="text-muted-foreground leading-relaxed">
            Thank you so much for being interested in supporting the app!
          </p>
        </header>

        <GlassPanel className="space-y-5 p-6">
          <SectionHeading>Leave a tip</SectionHeading>
          {hasTips ? (
            <>
              {fixed.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-4 sm:pt-5">
                  {fixed.map(({ amount, href }) => (
                    <Button
                      key={amount}
                      asChild
                      variant="glass"
                      size="touch"
                      className="relative text-base font-semibold"
                    >
                      <a href={href} onClick={() => trackTip(amount)}>
                        <span className="sr-only">Tip </span>${amount}
                        {amount === 5 && (
                          <>
                            <span className="sr-only"> (most popular)</span>
                            <span
                              aria-hidden
                              className="font-handwritten text-primary pointer-events-none absolute bottom-full left-1/2 mb-0.5 flex -translate-x-1/2 -rotate-3 items-end gap-0.5 text-xl leading-none font-normal whitespace-nowrap"
                            >
                              most popular
                              <CornerLeftDown className="size-4" />
                            </span>
                          </>
                        )}
                      </a>
                    </Button>
                  ))}
                </div>
              )}
              {custom && (
                <Button asChild variant="outline" size="touch" className="w-full">
                  <a href={custom} onClick={() => trackTip('custom')}>
                    Choose your own amount
                  </a>
                </Button>
              )}
              <p className="text-muted-foreground text-sm leading-relaxed">
                Payments are handled securely by Stripe. Tips are never expected, but always
                appreciated!
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Tips are not available on this site.</p>
          )}
        </GlassPanel>

        <Section variant="bordered">
          <SectionHeading>Other ways to help</SectionHeading>
          <ul className="text-muted-foreground space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="text-primary size-4 shrink-0" aria-hidden />
              <a
                href={feedbackHref}
                onClick={() => trackAlternative('feedback')}
                className="text-link underline hover:decoration-2"
              >
                Send feedback
              </a>
            </li>
            <li className="flex items-center gap-2">
              <Users className="text-primary size-4 shrink-0" aria-hidden />
              Tell a crafting friend about Organized Glitter
            </li>
            {appStoreUrl && (
              <li className="flex items-center gap-2">
                <Star className="text-primary size-4 shrink-0" aria-hidden />
                <a
                  href={appStoreUrl}
                  onClick={() => trackAlternative('app_store_review')}
                  className="text-link underline hover:decoration-2"
                >
                  Leave a review on the App Store
                </a>
              </li>
            )}
          </ul>
        </Section>

        <Section variant="bordered">
          <SectionHeading>Where tips go</SectionHeading>
          <p className="text-muted-foreground text-sm leading-relaxed">
            I build and run Organized Glitter as a personal side project. Tips help cover the cost
            of hosting, the database, the domain, and other incidentals. The app is free for
            everyone, whether or not you tip.
          </p>
          <div className="flex items-center justify-end gap-3">
            <p className="font-handwritten text-primary text-right text-2xl leading-tight">
              thanks for being here,
              <br />
              sarah
            </p>
            <img
              src="/images/chibi-wave.png"
              alt=""
              className="bg-primary/15 border-card size-14 rounded-xl border-2 object-cover object-top shadow-sm"
              loading="lazy"
            />
          </div>
        </Section>
      </div>
    </MainLayout>
  );
};

export default Support;
