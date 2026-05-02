import { cacheImageBlob, isImageBlobCached } from '../services/imageBlobCache';
import { getProxiedImageUrl, getProxiedArtistImageUrl } from './image';

const inFlight = new Set<string>();
const prefetched = new Set<string>();
const queued = new Set<string>();
const queue: string[] = [];
let active = 0;
const MAX_CONCURRENT = 4;
const MAX_QUEUE = 600;

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

async function prefetchUrl(url: string): Promise<void> {
  try {
    if (await isImageBlobCached(url)) {
      prefetched.add(url);
      return;
    }

    const res = await fetch(url, { credentials: 'same-origin', cache: 'default' });
    if (!res.ok) return;
    prefetched.add(url);
    try {
      const blob = await res.blob();
      if (blob.type.startsWith('image/') || blob.size > 0) {
        await cacheImageBlob(url, blob);
      }
    } catch {}
  } catch {}
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    if (isOffline()) return;
    const url = queue.shift();
    if (!url) continue;
    queued.delete(url);
    if (prefetched.has(url) || inFlight.has(url)) continue;
    inFlight.add(url);
    active++;
    prefetchUrl(url)
      .finally(() => {
        inFlight.delete(url);
        active--;
        pump();
      });
  }
}

function enqueue(urls: Iterable<string | undefined | null>): void {
  if (isOffline()) return;
  for (const url of urls) {
    if (!url) continue;
    if (prefetched.has(url) || inFlight.has(url) || queued.has(url)) continue;
    if (queue.length >= MAX_QUEUE) break;
    queue.push(url);
    queued.add(url);
  }
  pump();
}

export function prefetchImageUrls(urls: Iterable<string | undefined | null>): void {
  enqueue(urls);
}

export function prefetchArtworks(
  items: Array<{ artworkUrl?: string | null }> | undefined | null,
  sizes: number[] = [300],
): void {
  if (!items) return;
  const urls: string[] = [];
  for (const it of items) {
    if (!it?.artworkUrl) continue;
    for (const size of sizes) {
      const u = getProxiedImageUrl(it.artworkUrl, size);
      if (u) urls.push(u);
    }
  }
  enqueue(urls);
}

export function prefetchArtistImages(
  items: Array<{ artworkUrl?: string | null }> | undefined | null,
  sizes: number[] = [300],
): void {
  if (!items) return;
  const urls: string[] = [];
  for (const it of items) {
    if (!it?.artworkUrl) continue;
    for (const size of sizes) {
      const u = getProxiedArtistImageUrl(it.artworkUrl, size);
      if (u) urls.push(u);
    }
  }
  enqueue(urls);
}
