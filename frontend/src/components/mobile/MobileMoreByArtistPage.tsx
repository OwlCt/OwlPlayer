import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePlayerStore } from "../../store/playerStore";
import { getProxiedImageUrl } from "../../utils/image";
import { getAlbumDetail, getAlbumMoreByArtistPaginated } from "../../api";
import { Album } from "../../types";
import CachedImage from "../CachedImage";
import MobileHeader from "./MobileHeader";
import MobileAlbumMenu from "./MobileAlbumMenu";
import { useTouchClick } from "../../hooks/useTouchClick";
import { useGoBack } from "../../hooks/useNavigationHistory";
import {
  getLocalAlbumRelatedShelf,
  isLocalAlbumDetail,
} from "../../utils/albumLocalRelatedContent";

// Initial load count and increment for lazy loading
const INITIAL_LOAD_COUNT = 20;
const LOAD_INCREMENT = 20;

// Album type labels
const ALBUM_TYPE_LABELS: Record<string, string> = {
  album: "专辑",
  single: "单曲",
  ep: "EP",
  live: "现场",
  compilation: "合辑",
};

// Album list item component
interface AlbumItemProps {
  album: Album;
  artistName: string;
  onClick: () => void;
  onLongPress: () => void;
  isPlaying?: boolean;
}

function AlbumItem({
  album,
  artistName,
  onClick,
  onLongPress,
  isPlaying = false,
}: AlbumItemProps) {
  const touchHandlers = useTouchClick(onClick, {
    onLongPress,
    longPressDelay: 500,
  });
  const year = album.releaseDate
    ? new Date(album.releaseDate).getFullYear()
    : "";

  return (
    <div
      {...touchHandlers}
      className="flex items-center gap-3 w-full p-3 rounded-lg active:bg-white/10 transition-colors text-left min-h-[64px] cursor-pointer select-none"
      data-testid="more-by-artist-item"
    >
      {/* Album artwork */}
      <div
        className={`w-14 h-14 flex-shrink-0 bg-neutral-800 rounded overflow-hidden ${isPlaying ? "ring-2 ring-spotify-green" : ""}`}
      >
        {album.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(album.artworkUrl, 112)}
            alt={album.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            ♪
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div
          className={`font-medium truncate ${isPlaying ? "text-spotify-green" : "text-white"}`}
        >
          {album.name}
        </div>
        <div className="text-sm text-white/60 truncate">
          {year && `${year} · `}
          {artistName}
        </div>
      </div>
    </div>
  );
}

interface MobileMoreByArtistPageProps {
  albumId?: string;
  artistName?: string;
}

export default function MobileMoreByArtistPage({
  albumId: propAlbumId,
  artistName: propArtistName,
}: MobileMoreByArtistPageProps) {
  const navigate = useNavigate();
  const params = useParams<{ albumId: string; artistName: string }>();
  const { queueSource, isPlaying } = usePlayerStore();

  // Use props or URL params
  const albumId = propAlbumId || params.albumId || "";
  const artistName =
    propArtistName || decodeURIComponent(params.artistName || "");

  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [pageTitle, setPageTitle] = useState(`更多来自 ${artistName} 的内容`);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);

  // Initial load
  useEffect(() => {
    if (!albumId) return;

    setIsLoading(true);
    (async () => {
      try {
        const albumDetail = await getAlbumDetail(albumId);
        if (isLocalAlbumDetail(albumDetail)) {
          const localShelf = getLocalAlbumRelatedShelf(
            albumDetail,
            "more-by-artist",
          );
          const localAlbums =
            localShelf?.kind === "albums" ? localShelf.albums || [] : [];
          setAlbums(localAlbums);
          setHasMore(false);
          offsetRef.current = localAlbums.length;
          if (localShelf?.title) {
            setPageTitle(localShelf.title);
          }
          return;
        }

        const result = await getAlbumMoreByArtistPaginated(
          albumId,
          0,
          INITIAL_LOAD_COUNT,
        );
        setAlbums(
          result.albums.map((item) => ({
            id: item.id,
            name: item.name,
            artistName: item.artistName,
            artworkUrl: item.artworkUrl,
            releaseDate: item.releaseDate,
            trackCount: item.trackCount,
            contentRating: item.contentRating,
          })),
        );
        setHasMore(result.hasMore);
        offsetRef.current = result.albums.length;
        setPageTitle(`更多来自 ${artistName} 的内容`);
      } catch (err) {
        console.error("Failed to load more by artist:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [albumId]);

  // Check if album is playing
  const isAlbumPlaying = (id: string) => {
    return isPlaying && queueSource.type === "album" && queueSource.id === id;
  };

  // Handle album click
  const handleAlbumClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  // Handle long press
  const handleLongPress = (album: Album) => {
    setSelectedAlbum(album);
    setMenuOpen(true);
  };

  // Handle back
  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  // Load more callback
  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || !albumId) return;

    setIsLoading(true);
    getAlbumMoreByArtistPaginated(albumId, offsetRef.current, LOAD_INCREMENT)
      .then((result) => {
        setAlbums((prev) => [
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
        offsetRef.current += result.albums.length;
      })
      .catch((err) => {
        console.error("Failed to load more:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [hasMore, isLoading, albumId]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoading, loadMore]);

  return (
    <div className="flex flex-col h-full bg-black pt-14">
      {/* Header */}
      <MobileHeader title={pageTitle} opacity={1} onBack={handleBack} />

      {/* Album list */}
      <div className="flex-1 overflow-y-auto px-1 pb-52">
        {albums.length === 0 && !isLoading ? (
          <div className="text-center py-12 text-white/40">暂无更多内容</div>
        ) : (
          <div className="space-y-1">
            {albums.map((album) => (
              <AlbumItem
                key={album.id}
                album={album}
                artistName={artistName}
                onClick={() => handleAlbumClick(album)}
                onLongPress={() => handleLongPress(album)}
                isPlaying={isAlbumPlaying(album.id)}
              />
            ))}
            {/* Load more trigger */}
            {hasMore && (
              <div
                ref={loadMoreRef}
                className="py-4 text-center text-white/40 text-sm"
              >
                加载中...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Album context menu */}
      {selectedAlbum && (
        <MobileAlbumMenu
          album={{
            id: selectedAlbum.id,
            name: selectedAlbum.name,
            artistName: selectedAlbum.artistName,
            artworkUrl: selectedAlbum.artworkUrl || "",
            trackCount: selectedAlbum.trackCount || 0,
          }}
          isOpen={menuOpen}
          onClose={() => {
            setMenuOpen(false);
            setSelectedAlbum(null);
          }}
        />
      )}
    </div>
  );
}
