import { publicUrl } from '@/lib/publicUrl';
import MainLayout from '@/components/layout/MainLayout';
import { useAppReady } from '@/hooks/useAppReady';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { publicPageSocialMetadata } from '@/lib/publicPageSocialMetadata';
import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy';

const PAGE_METADATA = {
  title: 'Privacy policy | Organized Glitter',
  description:
    'Organized Glitter does not sell your data. Learn what information is collected, how it is used, and what controls you have over your crafting project data.',
  canonicalUrl: publicUrl('/privacy'),
  ...publicPageSocialMetadata(
    'Privacy policy | Organized Glitter',
    'Organized Glitter does not sell your data. Learn what information is collected, how it is used, and what controls you have over your crafting project data.',
    publicUrl('/privacy')
  ),
};

const Privacy = () => {
  useAppReady();
  usePageMetadata(PAGE_METADATA);

  return (
    <MainLayout currentPage="Privacy">
      <PrivacyPolicy />
    </MainLayout>
  );
};

export default Privacy;
