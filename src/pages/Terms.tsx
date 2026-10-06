import { publicUrl } from '@/lib/publicUrl';
import MainLayout from '@/components/layout/MainLayout';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { publicPageSocialMetadata } from '@/lib/publicPageSocialMetadata';
import { TermsOfService } from '@/components/legal/TermsOfService';

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
      <TermsOfService />
    </MainLayout>
  );
};

export default Terms;
