// Helper function to get artwork URL with proper size
export const getArtworkUrl = (url: string | undefined, size: number = 300): string => {
  if (!url) return '';
  // Handle various Apple Music artwork URL formats
  // Standard format: {w}x{h}
  // Artist format may use: {w}, {h}, {c} (crop mode), {f} (format)
  // Some URLs have bb suffix: {w}x{h}bb.{f}
  let result = url
    .replace('{w}x{h}bb', `${size}x${size}bb`)  // Handle bb suffix format first
    .replace('{w}x{h}', `${size}x${size}`)
    .replace('{w}', String(size))
    .replace('{h}', String(size))
    .replace('{c}', 'cc')  // cc = center crop
    .replace('{f}', 'jpg'); // format - use jpg for better compatibility
  return result;
};

// Helper function to get artist artwork URL with optimal size
// Apple Music artist images support: 300, 500, 1000, and original size (2400/3000)
// Intermediate sizes (1500, 2000, etc.) return 403 Forbidden
// We prefer 1000x1000 for high quality, backend will fallback if needed
export const getArtistArtworkUrl = (url: string | undefined, preferredSize: number = 1000): string => {
  if (!url) return '';
  
  // For artist images, use 1000 as the optimal high-quality size
  // If requested size is larger than 1000, use 1000 (backend will handle fallback)
  // If requested size is smaller, use the requested size
  const size = preferredSize > 1000 ? 1000 : preferredSize;
  
  return getArtworkUrl(url, size);
};

// Helper function to get proxied image URL (through our server)
// This avoids CORS issues and caches images on the server
export const getProxiedImageUrl = (url: string | undefined, size: number = 300): string => {
  if (!url) return '';
  
  // Blob URLs (from offline cache) should be returned as-is
  if (url.startsWith('blob:')) {
    return url;
  }
  
  // Local API paths (like playlist covers) don't need proxy
  if (url.startsWith('/api/')) {
    return url;
  }
  
  const processedUrl = getArtworkUrl(url, size);
  // Use our image proxy API
  return `/api/image?url=${encodeURIComponent(processedUrl)}`;
};

// Helper function to get proxied artist image URL with optimal size
// Uses 1000x1000 by default for high quality artist images
// Backend will handle fallback to smaller sizes if 403 is returned
export const getProxiedArtistImageUrl = (url: string | undefined, size: number = 1000): string => {
  if (!url) return '';
  
  // Blob URLs (from offline cache) should be returned as-is
  if (url.startsWith('blob:')) {
    return url;
  }
  
  // Local API paths don't need proxy
  if (url.startsWith('/api/')) {
    return url;
  }
  
  const processedUrl = getArtistArtworkUrl(url, size);
  return `/api/image?url=${encodeURIComponent(processedUrl)}`;
};
