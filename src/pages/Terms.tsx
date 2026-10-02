import { publicUrl } from '@/lib/publicUrl';
import MainLayout from '@/components/layout/MainLayout';
import { Link } from 'react-router-dom';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { publicPageSocialMetadata } from '@/lib/publicPageSocialMetadata';
import { getContactEmail } from '@/lib/contactConfig';

const sections = [
  {
    id: 'acceptance',
    number: 1,
    title: 'Acceptance of Terms',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        By accessing and using Organized Glitter ("the Service"), you accept and agree to be bound
        by the terms and provision of this agreement. If you do not agree to abide by the above,
        please do not use this service.
      </p>
    ),
  },
  {
    id: 'description',
    number: 2,
    title: 'Description of Service',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          Organized Glitter is a web-based application that helps users organize and track their
          craft projects, including coloring books, coloring pages, and diamond art projects. The
          Service allows you to:
        </p>
        <ul className="marker:text-primary list-disc space-y-2 pl-5">
          <li className="text-foreground/90 leading-relaxed">
            Create and manage a digital inventory of your kits, coloring books, and pages
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Track progress on individual projects and coloring pages
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Add notes, photos, and other project details
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Export project data via CSV or archive supported project photos in a ZIP backup
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'free-service',
    number: 3,
    title: 'Free Service',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        Organized Glitter is currently provided free of charge. There are no subscription fees or
        payment requirements associated with using the Service at this time. Any future monetization
        of the site would be to cover the cost of additional, server-heavy features.
      </p>
    ),
  },
  {
    id: 'user-accounts',
    number: 4,
    title: 'User Accounts',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          To use certain features of the Service, you must create an account. You are responsible
          for:
        </p>
        <ul className="marker:text-primary list-disc space-y-2 pl-5">
          <li className="text-foreground/90 leading-relaxed">
            Maintaining the confidentiality of your account credentials
          </li>
          <li className="text-foreground/90 leading-relaxed">
            All activities that occur under your account
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Notifying us immediately of any unauthorized use of your account
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Providing accurate information when creating your account
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'user-content',
    number: 5,
    title: 'User Content',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          You retain ownership of any content you upload to the Service, including photos, notes,
          and project information. By using the Service, you grant us a limited license to store and
          display your content solely for the purpose of providing the Service to you.
        </p>
        <p className="text-foreground/90 leading-relaxed">
          You are responsible for ensuring that any content you upload does not violate any
          third-party rights or applicable laws. Import and export tools are provided to help you
          move your own records and supported photo files. You are responsible for checking imported
          data before relying on it.
        </p>
      </>
    ),
  },
  {
    id: 'intellectual-property',
    number: 6,
    title: 'Intellectual Property',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          All company names, artist names, kit, book, and brand names referenced in the Service are
          trademarks of their respective owners. We do not claim ownership of these trademarks and
          reference them solely for organizational purposes.
        </p>
        <p className="text-foreground/90 leading-relaxed">
          The Organized Glitter application, including its design, code, and functionality, is owned
          by us and protected by copyright and other intellectual property laws.
        </p>
      </>
    ),
  },
  {
    id: 'prohibited-uses',
    number: 7,
    title: 'Prohibited Uses',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          You agree not to use the Service to:
        </p>
        <ul className="marker:text-primary list-disc space-y-2 pl-5">
          <li className="text-foreground/90 leading-relaxed">
            Violate any applicable laws or regulations
          </li>
          <li className="text-foreground/90 leading-relaxed">Infringe upon the rights of others</li>
          <li className="text-foreground/90 leading-relaxed">
            Upload malicious code or attempt to compromise the Service
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Use automated systems to access the Service without permission
          </li>
          <li className="text-foreground/90 leading-relaxed">
            Share your account credentials with others
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'service-availability',
    number: 8,
    title: 'Service Availability',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        We strive to maintain the Service's availability but do not guarantee uninterrupted access.
        The Service may be temporarily unavailable due to maintenance, updates, or circumstances
        beyond our control.
      </p>
    ),
  },
  {
    id: 'data-privacy',
    number: 9,
    title: 'Data and Privacy',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        Your use of the Service is also governed by our Privacy Policy, which can be found at{' '}
        <Link to="/privacy" className="text-link underline underline-offset-4">
          the privacy policy for this instance
        </Link>
        . The Privacy Policy is incorporated into these Terms by reference.
      </p>
    ),
  },
  {
    id: 'termination',
    number: 10,
    title: 'Termination',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          You may terminate your account at any time through your account settings. We may terminate
          or suspend access to the Service immediately, without prior notice, if you breach these
          Terms.
        </p>
        <p className="text-foreground/90 leading-relaxed">
          Upon termination, your right to use the Service will cease immediately, and we may delete
          your account and associated data.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimer',
    number: 11,
    title: 'Disclaimer of Warranties',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        The Service is provided "as is" without warranties of any kind, either express or implied.
        We use PocketBase as our database and storage system, hosted on PikaPods. PikaPods acts
        solely as a hosting provider and does not access or process your data in any way. We pull
        regular backups of data. While we have made reasonable attempts to protect your data, we do
        not warrant that the Service will be uninterrupted, error-free, or completely secure.
      </p>
    ),
  },
  {
    id: 'limitation',
    number: 12,
    title: 'Limitation of Liability',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        In no event shall Organized Glitter be liable for any indirect, incidental, special,
        consequential, or punitive damages arising out of your use of the Service.
      </p>
    ),
  },
  {
    id: 'changes',
    number: 13,
    title: 'Changes to Terms',
    content: (
      <>
        <p className="text-foreground/90 mb-3 leading-relaxed">
          We reserve the right to modify these Terms at any time. We will notify users of any
          material changes by posting the updated Terms on this page and updating the "Last updated"
          date below.
        </p>
        <p className="text-foreground/90 leading-relaxed">
          Your continued use of the Service after changes are posted constitutes acceptance of the
          updated Terms.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    number: 14,
    title: 'Contact Information',
    content: (
      <p className="text-foreground/90 leading-relaxed">
        If you have any questions about these Terms of Service, please contact your administrator
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
    ),
  },
];

const PAGE_METADATA = {
  title: 'Terms of service | Organized Glitter',
  description:
    'Review the Organized Glitter terms of service for account responsibilities, acceptable use, content ownership, and service availability.',
  canonicalUrl: publicUrl('/terms'),
  ...publicPageSocialMetadata(
    'Terms of service | Organized Glitter',
    'Review the Organized Glitter terms of service for account responsibilities, acceptable use, content ownership, and service availability.',
    publicUrl('/terms')
  ),
};

const Terms = () => {
  useAppReady();
  usePageMetadata(PAGE_METADATA);

  return (
    <MainLayout currentPage="Terms">
      <div className="relative z-10 px-4 pt-6 pb-16 md:pt-10 md:pb-24">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-foreground mb-2 text-3xl font-semibold md:text-4xl">
            Terms of Service
          </h1>
          <p className="text-muted-foreground mb-10 text-sm">Last updated: June 5, 2026</p>

          <div>
            {sections.map(({ id, number, title, content }) => (
              <section key={id} id={id} className="mb-10">
                <h2 className="text-foreground mb-3 text-xl font-semibold">
                  {number}. {title}
                </h2>
                {content}
              </section>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Terms;
