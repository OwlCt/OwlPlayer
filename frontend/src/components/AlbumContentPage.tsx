import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import {
  getAlbumDetail,
  getAlbumOtherVersionsPaginated,
  getAlbumYouMightAlsoLikePaginated,
  getAlbumMoreByArtistPaginated,
  getAlbumAppearsOnPaginated,
  AlbumRelatedResult,
} from "../api";
import { AlbumDetail, Album } from "../types";
import { usePlayerStore } from "../store/playerStore";
import { useRecentlyPlayedStore } from "../store/recentlyPlayedStore";
import { getProxiedImageUrl } from "../utils/image";
import {
  getLocalAlbumRelatedShelf,
  isLocalAlbumDetail,
} from "../utils/albumLocalRelatedContent";
import AlbumCard from "./AlbumCard";
import CachedImage from "./CachedImage";

type ContentType =
  | "other-versions"
  | "more-by-artist"
  | "appears-on"
  | "you-might-also-like";

interface AlbumContentPageProps {
  contentType: ContentType;
}

const TITLES: Record<ContentType, string> = {
  "other-versions": "其他版本",
  "more-by-artist": "更多作品",
  "appears-on": "出现在以下内容中",
  "you-might-also-like": "你可能也喜欢",
};

const PAGE_SIZE = 20;

export default function AlbumContentPage({
  contentType,
}: AlbumContentPageProps) {
  const { albumId } = useParams();
  const navigate = useNavigate();
  const { setQueue, isPlaying, queueSource, pause, play } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();

  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [items, setItems] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Fetch function based on content type
  const fetchData = useCallback(
    async (id: string, currentOffset: number): Promise<AlbumRelatedResult> => {
      switch (contentType) {
        case "other-versions":
          return getAlbumOtherVersionsPaginated(id, currentOffset, PAGE_SIZE);
        case "more-by-artist":
          return getAlbumMoreByArtistPaginated(id, currentOffset, PAGE_SIZE);
        case "appears-on":
          return getAlbumAppearsOnPaginated(id, currentOffset, PAGE_SIZE);
        case "you-might-also-like":
          return getAlbumYouMightAlsoLikePaginated(
            id,
            currentOffset,
            PAGE_SIZE,
          );
      }
    },
    [contentType],
  );

  // Initial load
  useEffect(() => {
    if (albumId) {
      loadInitialData(albumId);
    }
  }, [albumId, contentType]);

  const loadInitialData = async (id: string) => {
    setLoading(true);
    setError(null);
    setItems([]);
    setOffset(0);
    setHasMore(false);
    try {
      const albumData = await getAlbumDetail(id);
      setAlbum(albumData);
      if (contentType === "more-by-artist" && isLocalAlbumDetail(albumData)) {
        const localShelf = getLocalAlbumRelatedShelf(
          albumData,
          "more-by-artist",
        );
        const localAlbums =
          localShelf?.kind === "albums" ? localShelf.albums || [] : [];
        setItems(localAlbums);
        setHasMore(false);
        setOffset(localAlbums.length);
      } else {
        const contentData = await fetchData(id, 0);
        const nextItems = contentData.albums.map((item) => ({
          id: item.id,
          name: item.name,
          artistName: item.artistName,
          artworkUrl: item.artworkUrl,
          releaseDate: item.releaseDate,
          trackCount: item.trackCount,
          contentRating: item.contentRating,
        }));
        setItems(nextItems);
        setHasMore(contentData.hasMore);
        setOffset(contentData.albums.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // Load more data
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !albumId) return;
    setLoadingMore(true);
    try {
      const result = await fetchData(albumId, offset);
      setItems((prev) => [
        ...prev,
        ...result.albums.map((item) => ({
          id: item.id,
          name: item.name,
          artistName: item.artistName,
          artworkUrl: item.artworkUrl,
          releaseDate: item.releaseDate,
          trackCount: item.trackCount,
          contentRating: item.contentRating,
        })),
      ]);
      setHasMore(result.hasMore);
      setOffset((prev) => prev + result.albums.length);
    } catch (err) {
      console.error("Failed to load more:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, albumId, offset, fetchData]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const handleRetry = () => {
    if (albumId) {
      loadInitialData(albumId);
    }
  };

  const handleBack = () => {
    // Use browser history to go back instead of navigating to a specific URL
    // This ensures proper back button behavior
    window.history.back();
  };

  const handleAlbumClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  const isAlbumPlaying = (albumId: string) => {
    return (
      isPlaying && queueSource.type === "album" && queueSource.id === albumId
    );
  };

  const isAlbumCurrentSource = (albumId: string) => {
    return queueSource.type === "album" && queueSource.id === albumId;
  };

  const handlePlayAlbum = async (targetAlbum: Album) => {
    recordPlay("album", targetAlbum.id);
    if (isAlbumCurrentSource(targetAlbum.id)) {
      play();
      return;
    }
    try {
      const albumDetail = await getAlbumDetail(targetAlbum.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        setQueue(albumDetail.tracks, 0, {
          type: "album",
          id: targetAlbum.id,
          name: albumDetail.name,
        });
      }
    } catch (err) {
      console.error("Failed to load album tracks:", err);
    }
  };

  const title =
    contentType === "more-by-artist"
      ? getLocalAlbumRelatedShelf(album, "more-by-artist")?.title ||
        (album?.artistName
          ? `更多${album.artistName}的作品`
          : TITLES[contentType])
      : TITLES[contentType];

  if (loading) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-spotify-green text-black rounded-full font-medium hover:bg-spotify-green/90 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <p className="text-white/60">未找到专辑</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={handleBack}
        className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
      >
        <FiArrowLeft size={20} />
        <span>返回</span>
      </button>

      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden">
          {album.artworkUrl ? (
            <CachedImage
              src={getProxiedImageUrl(album.artworkUrl, 128)}
              alt={album.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-spotify-gray flex items-center justify-center text-2xl text-white/20">
              ♪
            </div>
          )}
        </div>
        <div>
          <p className="text-sm text-white/60">{album.name}</p>
          <h1 className="text-3xl font-bold">{title}</h1>
        </div>
      </div>

      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {items.map((item) => {
          return (
            <AlbumCard
              key={item.id}
              album={item}
              isPlaying={isAlbumPlaying(item.id)}
              onPlay={() => handlePlayAlbum(item)}
              onPause={pause}
              onCardClick={handleAlbumClick}
            />
          );
        })}
      </div>

      {hasMore && (
        <div ref={loaderRef} className="py-8 text-center">
          {loadingMore ? (
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-spotify-green border-t-transparent mx-auto" />
          ) : (
            <span className="text-white/40">向下滚动加载更多</span>
          )}
        </div>
      )}

      {items.length > 0 && !hasMore && (
        <div className="py-8 text-center">
          <span className="text-white/40">没有更多了</span>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-white/60 text-center py-8">暂无{title}</p>
      )}
    </div>
  );
}
