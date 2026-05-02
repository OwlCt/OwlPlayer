import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getArtistDetail } from '../api';
import { ArtistDetail } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import MobileArtistAllSongsPage from '../components/mobile/MobileArtistAllSongsPage';
import MobileHeader from '../components/mobile/MobileHeader';
import ArtistContentPage from '../components/ArtistContentPage';
import OfflineFallback from '../components/OfflineFallback';
import { useGoBack } from '../hooks/useNavigationHistory';
import { getFeaturedSongs, getLibrarySongs } from '../utils/artistPage';

/**
 * ArtistAllSongsPage - Shows all library songs for an artist
 * Mobile uses MobileArtistAllSongsPage with lazy loading
 * Desktop uses ArtistContentPage
 */
export default function ArtistAllSongsPage() {
  const { artistId } = useParams();
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

  if (!isMobile) {
    return <ArtistContentPage contentType="library" />;
  }

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
    <MobileArtistAllSongsPage
      artistId={artist.id}
      artistName={artist.name}
      featuredSongs={getFeaturedSongs(artist)}
      featuredSongsSource={artist.featuredSongsSource}
      librarySongs={getLibrarySongs(artist)}
      albums={[
        ...(artist.albums || []),
        ...(artist.singlesAndEPs || []),
        ...(artist.liveAlbums || []),
        ...(artist.compilationAlbums || []),
      ]}
    />
  );
}
