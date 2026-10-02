import MainLayout from '@/components/layout/MainLayout';
import { useAppReady } from '@/hooks/useAppReady';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { cn } from '@/lib/utils';
import { HomeHero } from '@/components/marketing/HomeHero';
import { TwoCraftsSplit } from '@/components/marketing/TwoCraftsSplit';
import { ScrapbookFeatures } from '@/components/marketing/ScrapbookFeatures';
import { SarahSignature } from '@/components/marketing/SarahSignature';
import { usePageMetadata } from '@/hooks/usePageMetadata';
import { publicPageSocialMetadata } from '@/lib/publicPageSocialMetadata';

const PAGE_METADATA = {
  title: 'Organized Glitter | Coloring Book & Diamond Art Tracker',
  description:
    'Track coloring books, coloring pages, diamond art projects, stash status, progress photos, palettes, and mystery reveals in one craft tracker.',
  canonicalUrl: 'https://organizedglitter.app/',
  ...publicPageSocialMetadata(
    'Organized Glitter | Coloring Book & Diamond Art Tracker',
    'Track coloring books, coloring pages, diamond art projects, stash status, progress photos, palettes, and mystery reveals in one craft tracker.',
    'https://organizedglitter.app/'
  ),
};

const Home = () => {
  useAppReady();
  usePageMetadata(PAGE_METADATA);

  const { ref: featRef, isVisible: featVisible } = useScrollReveal({ threshold: 0.15 });
  const { ref: sigRef, isVisible: sigVisible } = useScrollReveal({ threshold: 0.15 });

  return (
    <MainLayout currentPage="Home" rootClassName="home-marketing-bg">
      <HomeHero />

      <TwoCraftsSplit />

      <div
        ref={featRef}
        className={cn(
          'translate-y-6 opacity-0 transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
          featVisible && 'translate-y-0 opacity-100'
        )}
      >
        <ScrapbookFeatures />
      </div>

      <div
        ref={sigRef}
        className={cn(
          'translate-y-6 opacity-0 transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
          sigVisible && 'translate-y-0 opacity-100'
        )}
      >
        <SarahSignature />
      </div>
    </MainLayout>
  );
};

export default Home;
