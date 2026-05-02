import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getArtistDetail } from '../api';
import { ArtistDetail } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import MobileArtistDiscographyPage from '../components/mobile/MobileArtistDiscographyPage';
import MobileHeader from '../components/mobile/MobileHeader';
import { useGoBack } from '../hooks/useNavigationHistory';

// Simple in-memory cache for artist data to avoid re-fetching on back navigation
const artistCache = new Map<string, { data: ArtistDetail; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedArtist(artistId: string): ArtistDetail | null {
  const cached = artistCache.get(artistId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedArtist(artistId: string, data: ArtistDetail): void {
  artistCache.set(artistId, { data, timestamp: Date.now() });
}

/**
 * ArtistDiscographyPage - Shows all albums for an artist with category filters
 * Mobile-only page that displays discography with filter tabs
 */
export default function ArtistDiscographyPage() {
  const { artistId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Try to get cached data first
  const cachedData = artistId ? getCachedArtist(artistId) : null;
  
  const [artist, setArtist] = useState<ArtistDetail | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (artistId) {
      // If we have cached data, don't reload
      const cached = getCachedArtist(artistId);
      if (cached) {
        setArtist(cached);
        setLoading(false);
        return;
      }
      loadArtistDetail(artistId);
    }
  }, [artistId]);

  const loadArtistDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArtistDetail(id);
      setArtist(data);
      setCachedArtist(id, data);
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

  // Redirect to artist page on desktop
  if (!isMobile) {
    navigate(`/artist/${artistId}`, { replace: true });
    return null;
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

  // Error state
  if (error || !artist) {
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
    <MobileArtistDiscographyPage
      artistId={artist.id}
      artistName={artist.name}
      discography={{
        essentialAlbums: artist.essentialAlbums,
        albums: artist.albums,
        singlesAndEPs: artist.singlesAndEPs,
        liveAlbums: artist.liveAlbums,
        compilationAlbums: artist.compilationAlbums,
      }}
    />
  );
}
