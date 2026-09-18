import { Image } from 'react-native';

const prefetchedUrls = new Set<string>();

export async function prefetchRemoteImages(urls: Array<string | null | undefined>) {
  const uniqueUrls = urls
    .map(url => (typeof url === 'string' ? url.trim() : ''))
    .filter(url => !!url && /^https?:\/\//i.test(url) && !prefetchedUrls.has(url));

  if (!uniqueUrls.length) return;

  await Promise.all(
    uniqueUrls.map(async url => {
      try {
        await Image.prefetch(url);
        prefetchedUrls.add(url);
      } catch {
        // ignore image prefetch failure
      }
    }),
  );
}
