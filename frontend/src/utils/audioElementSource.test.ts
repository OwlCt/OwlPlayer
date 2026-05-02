import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("hls.js", () => {
  class MockHls {
    static Events = {
      MEDIA_ATTACHED: "media_attached",
      ERROR: "error",
    };

    static ErrorTypes = {
      NETWORK_ERROR: "network_error",
      MEDIA_ERROR: "media_error",
    };

    static isSupported() {
      return false;
    }

    attachMedia(): void {}

    loadSource(): void {}

    on(): void {}

    destroy(): void {}

    startLoad(): void {}

    recoverMediaError(): void {}
  }

  return { default: MockHls };
});

import {
  clearManagedAudioSource,
  getManagedAudioSourceUrl,
  setManagedAudioSource,
} from "./audioElementSource";

function createAudioElement(nativeHlsSupport: "" | "maybe" = "maybe") {
  const audio = document.createElement("audio");
  Object.defineProperty(audio, "canPlayType", {
    configurable: true,
    value: vi.fn(() => nativeHlsSupport),
  });
  Object.defineProperty(audio, "load", {
    configurable: true,
    value: vi.fn(),
  });
  return audio;
}

describe("audioElementSource", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks the resolved HLS variant from response headers", async () => {
    const audio = createAudioElement();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers({
        "X-Owl-HLS-Resolved-Variant": "aac_320",
      }),
      text: vi.fn().mockResolvedValue("#EXTM3U"),
    } as unknown as Response);

    setManagedAudioSource(
      audio,
      "/api/stream/12/playlist.m3u8?quality=lossless&token=test-token",
    );

    await vi.waitFor(() => {
      expect(getManagedAudioSourceUrl(audio)).toBe(
        "/api/stream/12/playlist.m3u8?quality=aac_320&token=test-token",
      );
    });

    clearManagedAudioSource(audio);
  });

  it("falls back to parsing playlist URLs when the header is unavailable", async () => {
    const audio = createAudioElement();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue(
        [
          "#EXTM3U",
          '#EXT-X-MAP:URI="/api/stream/77/init.mp4?quality=lossless"',
          "/api/stream/77/segment000.m4s?quality=lossless",
        ].join("\n"),
      ),
    } as unknown as Response);

    setManagedAudioSource(
      audio,
      "/api/stream/77/playlist.m3u8?quality=lossless&token=test-token",
    );

    await vi.waitFor(() => {
      expect(getManagedAudioSourceUrl(audio)).toBe(
        "/api/stream/77/playlist.m3u8?quality=lossless&token=test-token",
      );
    });

    clearManagedAudioSource(audio);
  });

  it("does not let a stale resolution overwrite a newer HLS source", async () => {
    const audio = createAudioElement();
    let resolveFirstFetch: ((value: Response) => void) | null = null;

    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstFetch = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          "X-Owl-HLS-Resolved-Variant": "aac_192",
        }),
        text: vi.fn().mockResolvedValue("#EXTM3U"),
      } as unknown as Response);

    setManagedAudioSource(
      audio,
      "/api/stream/88/playlist.m3u8?quality=lossless&token=test-token",
    );
    setManagedAudioSource(
      audio,
      "/api/stream/88/playlist.m3u8?quality=aac_192&token=test-token",
    );

    resolveFirstFetch?.({
      ok: true,
      headers: new Headers({
        "X-Owl-HLS-Resolved-Variant": "aac_320",
      }),
      text: vi.fn().mockResolvedValue("#EXTM3U"),
    } as unknown as Response);

    await vi.waitFor(() => {
      expect(getManagedAudioSourceUrl(audio)).toBe(
        "/api/stream/88/playlist.m3u8?quality=aac_192&token=test-token",
      );
    });

    clearManagedAudioSource(audio);
  });
});
