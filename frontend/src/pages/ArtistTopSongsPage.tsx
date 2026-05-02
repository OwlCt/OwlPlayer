import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtistDetail } from '../api';
import { ArtistDetail } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import MobileArtistTopSongsPage from '../components/mobile/MobileArtistTopSongsPage';
import MobileHeader from '../components/mobile/MobileHeader';
import ArtistContentPage from '../components/ArtistContentPage';
import OfflineFallback from '../components/OfflineFallback';
import { useGoBack } from '../hooks/useNavigationHistory';
import { getFeaturedSongs, getFeaturedSongsHeading, mergeArtistAlbumGroups } from '../utils/artistPage';

/**
 * ArtistTopSongsPage - Shows all top songs for an artist
 * Mobile uses MobileArtistTopSongsPage with lazy loading
 * Desktop uses ArtistContentPage
 */
export default function ArtistTopSongsPage() {
  const { artistId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only load artist detail on mobile, desktop uses ArtistContentPage which loads its own data
    if (artistId && isMobile) {
      loadArtistDetail(artistId);
    }
  }, [artistId, isMobile]);

  const loadArtistDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArtistDetail(id);
      setArtist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artist');
    } finally {
      setLoading(false);
    }
  };

  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };
  
  const { isOnline } = useOnlineStatus();

  // Desktop uses ArtistContentPage
  if (!isMobile) {
    return <ArtistContentPage contentType="songs" />;
  }

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex flex-col bg-black">
        <MobileHeader opacity={1} onBack={handleBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  // Error state - 离线时显示 OfflineFallback
  if (error || !artist) {
    if (!isOnline) {
      return <OfflineFallback message="离线状态，无法加载艺术家信息" onBack={handleBack} />;
    }
    return (
      <div className="h-full flex flex-col bg-black">
        <MobileHeader opacity={1} onBack={handleBack} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-red-500 mb-4">{error || '未找到艺术家'}</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-white/10 rounded-full text-white"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <MobileArtistTopSongsPage
      artistId={artist.id}
      artistName={artist.name}
      sectionTitle={getFeaturedSongsHeading(artist.featuredSongsSource)}
      topSongs={getFeaturedSongs(artist)}
      albums={mergeArtistAlbumGroups(
        artist.essentialAlbums,
        artist.albums,
        artist.singlesAndEPs,
        artist.liveAlbums,
        artist.compilationAlbums,
        artist.appearsOnAlbums
      )}
    />
  );
}
