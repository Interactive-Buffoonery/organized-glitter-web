import { getContactEmail, getSupportMailto } from '@/lib/contactConfig';

/** Privacy policy shared by the app route and the static privacy.html. */
export function PrivacyPolicy() {
  const underageReportHref = getSupportMailto('Underage account report') || '#privacy-contact';
  return (
    <div className="relative z-10 px-4 pt-6 pb-16 md:pt-10 md:pb-24">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-foreground mb-2 text-3xl font-semibold md:text-4xl">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10 text-sm">Last updated: October 6, 2026</p>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Overview</h2>
          <p className="text-foreground/90 leading-relaxed">
            Organized Glitter (&quot;we&quot;, &quot;our&quot;, or &quot;the app&quot;) is a
            web-based craft tracker for coloring books and diamond art. We are committed to
            protecting your privacy. This policy explains what data the app handles and how.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Data We Do Not Collect</h2>
          <p className="text-foreground/90 mb-3 leading-relaxed">
            Organized Glitter does not collect, store, or transmit your personal data to any servers
            we control beyond what is necessary to run the service. Specifically:
          </p>
          <ul className="marker:text-primary list-disc space-y-2 pl-5">
            <li className="text-foreground/90 leading-relaxed">
              We do not sell or share any data with third parties for advertising or marketing.
            </li>
            <li className="text-foreground/90 leading-relaxed">We do not track your location.</li>
            <li className="text-foreground/90 leading-relaxed">
              We do not access your contacts, photos, or other device data beyond what you
              explicitly upload.
            </li>
            <li className="text-foreground/90 leading-relaxed">
              We do not use advertising SDKs, ad pixels, or third-party marketing pixels.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Data We Do Collect</h2>
          <p className="text-foreground/90 mb-3 leading-relaxed">
            We collect only the minimum information needed to provide the service:
          </p>
          <ul className="marker:text-primary list-disc space-y-2 pl-5">
            <li className="text-foreground/90 leading-relaxed">
              <strong className="text-foreground">Account information:</strong> your email address
              and username, stored securely in our database.
            </li>
            <li className="text-foreground/90 leading-relaxed">
              <strong className="text-foreground">Project data:</strong> any information you add
              about your crafts, including books, pages, kits, progress notes, and photos you
              upload.
            </li>
            <li className="text-foreground/90 leading-relaxed">
              <strong className="text-foreground">App preferences:</strong> theme and display
              settings stored locally in your browser.
            </li>
            <li className="text-foreground/90 leading-relaxed">
              <strong className="text-foreground">Product analytics:</strong> page views, feature
              usage, and error data collected through PostHog. When you&apos;re signed in, this
              activity is linked to your account ID.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Where Your Data Lives</h2>
          <p className="text-foreground/90 mb-3 leading-relaxed">
            Your data is stored in PocketBase, an open-source backend, hosted on PikaPods. PikaPods
            acts solely as a hosting provider and does not access or process your data.
          </p>
          <p className="text-foreground/90 leading-relaxed">
            We take daily backups of Organized Glitter&apos;s database and store them securely in
            Cloudflare R2. While we make every effort to protect your information and keep full
            backups of Organized Glitter, no online service can guarantee protection against every
            outage, security incident, data loss, or event outside our reasonable control.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Third-Party Services</h2>
          <p className="text-foreground/90 mb-3 leading-relaxed">
            <strong>PostHog Analytics.</strong> We use PostHog to see which parts of Organized
            Glitter are used and to help find problems. When you&apos;re signed in, this activity is
            linked to your account ID. PostHog respects the Do Not Track browser setting. We do not
            use PostHog for advertising, session recording, or automatic click tracking. We only
            send specific product events we have chosen to measure, such as page views and feature
            usage.
          </p>
          <p className="text-foreground/90 leading-relaxed">
            <strong>Error Tracking.</strong> We collect technical information about errors (such as
            error messages and stack traces) through PostHog to identify and fix problems. We make
            every effort possible to ensure Organized Glitter does not send personal data as part of
            error messages, but in rare cases, error reports could potentially contain personal data
            if such information appears in an error message. This data is used solely for debugging.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Your Rights</h2>
          <p className="text-foreground/90 mb-3 leading-relaxed">
            You have full control over your data. You can:
          </p>
          <ul className="marker:text-primary list-disc space-y-2 pl-5">
            <li className="text-foreground/90 leading-relaxed">
              Access and update your personal information through your account settings.
            </li>
            <li className="text-foreground/90 leading-relaxed">
              Export your project data via CSV and zip files of images at any time.
            </li>
            <li className="text-foreground/90 leading-relaxed">
              Delete your account and all associated data from your account settings.
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Children&apos;s Privacy</h2>
          <p className="text-foreground/90 leading-relaxed">
            Organized Glitter is for people age 13 and older. If you believe someone under 13 has an
            account, please{' '}
            <a href={underageReportHref} className="text-link underline underline-offset-4">
              contact us
            </a>
            . If we confirm that an account belongs to someone under 13, we&apos;ll close it and
            delete their personal information.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Data Deletion</h2>
          <p className="text-foreground/90 leading-relaxed">
            You can delete your account and all associated data at any time through your account
            settings. Upon deletion, your data is removed from our database and will not be
            recoverable.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Changes to This Policy</h2>
          <p className="text-foreground/90 leading-relaxed">
            We may update this policy from time to time. Changes will be posted on this page with an
            updated revision date. Continued use of the app after changes constitutes acceptance of
            the revised policy.
          </p>
        </section>

        <section id="privacy-contact">
          <h2 className="text-foreground mb-3 text-xl font-semibold">Contact</h2>
          <p className="text-foreground/90 leading-relaxed">
            If you have questions about this privacy policy, contact your administrator
            {getContactEmail() ? (
              <>
                {' '}
                at{' '}
                <a
                  href={`mailto:${getContactEmail()}`}
                  className="text-link underline underline-offset-4"
                >
                  {getContactEmail()}
                </a>
              </>
            ) : null}
            .
          </p>
        </section>
      </div>
    </div>
  );
}
