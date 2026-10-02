const SOCIAL_IMAGE_URL = 'https://organizedglitter.app/images/social-preview-2026-09-27.jpg';
const SOCIAL_IMAGE_ALT =
  'Organized Glitter: track your coloring books and diamond art, with taped-in photos of a coloring page and a finished diamond painting';

export function publicPageSocialMetadata(title: string, description: string, url: string) {
  return {
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      image: SOCIAL_IMAGE_URL,
      imageAlt: SOCIAL_IMAGE_ALT,
      siteName: 'Organized Glitter',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      image: SOCIAL_IMAGE_URL,
      imageAlt: SOCIAL_IMAGE_ALT,
    },
  };
}
