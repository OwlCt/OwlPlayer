import Hls from "hls.js";

interface ManagedHLSInstance {
  hls: Hls | null;
  sourceUrl: string;
  resolvedSourceUrl: string;
  resolutionId: number;
}

const managedHLSInstances = new WeakMap<
  HTMLMediaElement,
  ManagedHLSInstance
>();
const resolvedHLSSourceUrlCache = new Map<string, string>();
const pendingHLSSourceUrlResolutions = new Map<string, Promise<string | null>>();
const HLS_RESOLVED_VARIANT_HEADER = "x-owl-hls-resolved-variant";

function normalizeResolvedHLSVariant(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "lossless":
      return "lossless";
    case "aac_320":
    case "aac320":
      return "aac_320";
    case "aac_256":
    case "aac256":
    case "aac":
    case "default":
      return "aac_256";
    case "aac_192":
    case "aac192":
      return "aac_192";
    default:
      return null;
  }
}

function normalizeHLSResolutionCacheKey(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl, window.location.origin);
    parsed.searchParams.delete("t");
    parsed.searchParams.delete("_t");
    const query = parsed.searchParams.toString();
    return `${parsed.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return sourceUrl;
  }
}

function buildResolvedHLSSourceUrl(
  sourceUrl: string,
  resolvedVariant: string,
): string {
  const parsed = new URL(sourceUrl, window.location.origin);
  parsed.searchParams.delete("transcode");
  parsed.searchParams.set("quality", resolvedVariant);
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}`;
}

function extractResolvedVariantFromPlaylist(playlistText: string): string | null {
  const match = playlistText.match(/[?&]quality=([^&#"\s]+)/i);
  if (!match) {
    return null;
  }

  try {
    return normalizeResolvedHLSVariant(decodeURIComponent(match[1]));
  } catch {
    return normalizeResolvedHLSVariant(match[1]);
  }
}

async function resolveActualHLSSourceUrl(
  sourceUrl: string,
): Promise<string | null> {
  const cacheKey = normalizeHLSResolutionCacheKey(sourceUrl);
  const cached = resolvedHLSSourceUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = pendingHLSSourceUrlResolutions.get(cacheKey);
  if (pending) {
    return pending;
  }

  const resolution = fetch(sourceUrl)
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }

      const headerVariant = normalizeResolvedHLSVariant(
        response.headers.get(HLS_RESOLVED_VARIANT_HEADER),
      );
      const resolvedVariant =
        headerVariant ??
        extractResolvedVariantFromPlaylist(await response.text());
      if (!resolvedVariant) {
        return null;
      }

      const resolvedSourceUrl = buildResolvedHLSSourceUrl(
        sourceUrl,
        resolvedVariant,
      );
      resolvedHLSSourceUrlCache.set(cacheKey, resolvedSourceUrl);
      return resolvedSourceUrl;
    })
    .catch(() => null)
    .finally(() => {
      pendingHLSSourceUrlResolutions.delete(cacheKey);
    });

  pendingHLSSourceUrlResolutions.set(cacheKey, resolution);
  return resolution;
}

function startResolvingManagedHLSSource(
  element: HTMLMediaElement,
  sourceUrl: string,
): void {
  const current = managedHLSInstances.get(element);
  const resolutionId = (current?.resolutionId ?? 0) + 1;
  managedHLSInstances.set(element, {
    hls: current?.hls ?? null,
    sourceUrl,
    resolvedSourceUrl: sourceUrl,
    resolutionId,
  });

  void resolveActualHLSSourceUrl(sourceUrl).then((resolvedSourceUrl) => {
    if (!resolvedSourceUrl) {
      return;
    }

    const active = managedHLSInstances.get(element);
    if (
      !active ||
      active.sourceUrl !== sourceUrl ||
      active.resolutionId !== resolutionId
    ) {
      return;
    }

    managedHLSInstances.set(element, {
      ...active,
      resolvedSourceUrl,
    });
  });
}

function isHLSPlaylistUrl(url: string): boolean {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.pathname.endsWith(".m3u8") ||
      parsed.pathname.includes("playlist.m3u8")
    );
  } catch {
    return url.includes(".m3u8") || url.includes("playlist.m3u8");
  }
}

function supportsNativeHLS(element: HTMLMediaElement): boolean {
  return element.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function clearManagedHLSInstance(element: HTMLMediaElement): void {
  const current = managedHLSInstances.get(element);
  if (!current) {
    return;
  }

  current.hls?.destroy();
  managedHLSInstances.delete(element);
}

export function clearManagedAudioSource(element: HTMLMediaElement): void {
  clearManagedHLSInstance(element);
  element.removeAttribute("src");
  element.load();
}

export function getManagedAudioSourceUrl(
  element: HTMLMediaElement,
): string | null {
  const managed = managedHLSInstances.get(element);
  return managed?.resolvedSourceUrl ?? managed?.sourceUrl ?? null;
}

export function setManagedAudioSource(
  element: HTMLAudioElement,
  sourceUrl: string,
  options?: {
    load?: boolean;
  },
): void {
  const shouldLoad = options?.load ?? true;

  if (!isHLSPlaylistUrl(sourceUrl)) {
    clearManagedHLSInstance(element);
    if (element.src !== sourceUrl) {
      element.src = sourceUrl;
    }
    if (shouldLoad) {
      element.load();
    }
    return;
  }
  const current = managedHLSInstances.get(element);
  if (current?.sourceUrl === sourceUrl) {
    if (shouldLoad) {
      element.load();
    }
    return;
  }

  if (supportsNativeHLS(element)) {
    clearManagedHLSInstance(element);
    startResolvingManagedHLSSource(element, sourceUrl);
    if (element.src !== sourceUrl) {
      element.src = sourceUrl;
    }
    if (shouldLoad) {
      element.load();
    }
    return;
  }

  if (!Hls.isSupported()) {
    clearManagedHLSInstance(element);
    startResolvingManagedHLSSource(element, sourceUrl);
    if (element.src !== sourceUrl) {
      element.src = sourceUrl;
    }
    if (shouldLoad) {
      element.load();
    }
    return;
  }

  clearManagedHLSInstance(element);
  startResolvingManagedHLSSource(element, sourceUrl);
  const managedResolution = managedHLSInstances.get(element);

  const hls = new Hls({
    enableWorker: true,
    backBufferLength: 90,
  });

  managedHLSInstances.set(element, {
    hls,
    sourceUrl,
    resolvedSourceUrl: managedResolution?.resolvedSourceUrl ?? sourceUrl,
    resolutionId: managedResolution?.resolutionId ?? 0,
  });

  hls.attachMedia(element);
  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    hls.loadSource(sourceUrl);
  });
  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data.fatal) {
      return;
    }

    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        hls.startLoad();
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        hls.recoverMediaError();
        break;
      default:
        clearManagedHLSInstance(element);
        break;
    }
  });

  if (shouldLoad) {
    element.load();
  }
}

export function isManagedHLSUrl(url: string): boolean {
  return isHLSPlaylistUrl(url);
}
